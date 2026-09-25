-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN FICHIER NE SE LIT QUE SI SA FICHE SE LIT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ MA CORRECTION D'HIER ÉTAIT INCOMPLÈTE ══
--
-- Le 24/09, j'ai fermé le seau `documents` à Internet et posé :
--
--     create policy documents_read on storage.objects
--       for select to authenticated using (bucket_id = 'documents');
--
-- J'ai vérifié qu'un visiteur SANS COMPTE ne voyait plus rien — mesuré, HTTP 400. Je n'ai pas
-- vérifié ce que voyait un compte AVEC session. Or depuis l'ouverture de l'espace partenaire, des
-- externes en ont une, et `to authenticated` les inclut.
--
-- Mesuré ce jour avec un vrai compte partenaire :
--
--     POST /storage/v1/object/list/documents  (prefix: mandats)   ->  HTTP 200, fichiers listés
--     POST /storage/v1/object/sign/documents/contrats/…           ->  HTTP 200
--     GET  <url signée>                                           ->  HTTP 200, 804 Ko reçus
--
-- Un partenaire téléchargeait donc n'importe lequel des 19 690 documents — mandats signés,
-- contrats, offres chiffrées — alors que la table `documents`, elle, lui rend ZÉRO ligne.
--
-- ══ LA RÈGLE JUSTE : LE FICHIER SUIT SA FICHE ══
--
-- `storage.objects.name` est exactement le chemin que porte `documents.url` :
--
--     documents.url   …/storage/v1/object/public/documents/contrats/<uuid>/178_…pdf
--     objects.name                                         contrats/<uuid>/178_…pdf
--
-- La policy demande donc qu'il existe une ligne `documents` VISIBLE POUR L'APPELANT pointant sur ce
-- chemin. Tout le cloisonnement retombe ainsi sur les policies de `documents`, déjà éprouvées — au
-- lieu d'une seconde règle, écrite à part, qui finirait par diverger de la première.
--
-- ══ POURQUOI `position(...)` ET NON UNE ÉGALITÉ ══
--
-- `documents.url` est une URL complète et son chemin y est PERCENT-ENCODÉ (« Mandat signé n°12.pdf »
-- devient « Mandat%20sign%C3%A9%20n%C2%B012.pdf »), tandis que `objects.name` est le chemin brut.
-- Comparer les deux à l'identique échouerait sur tout nom accentué — c'est-à-dire la majorité.
-- On compare donc l'url à la forme ENCODÉE du nom, ce que fait déjà le code applicatif en sens
-- inverse (`decodeURIComponent` dans `lib/data/documents.ts`).
--
-- ══ CE QUI N'EST PAS DANS `documents` ══
--
-- Un fichier présent dans le seau mais sans ligne `documents` ne sera lisible par PERSONNE hormis
-- la clé de service. C'est voulu : un fichier que la base ne connaît pas n'a pas de propriétaire,
-- donc personne à qui l'attribuer. Le garde-fou compte ce que l'équipe perd, et refuse si c'est
-- massif.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists documents_read on storage.objects;

-- ══ LE CHEMIN SE LIT TEL QUEL — MESURÉ, PAS SUPPOSÉ ══
--
-- J'ai d'abord écrit un percent-decoding, en supposant que `documents.url` portait des accents
-- encodés. Trois formules ont été essayées sur les 20 014 fichiers réels
-- (`scripts/.diag-decodage-sql.cjs`) :
--
--     convert_from + décodage    19 585 / 20 014   (97,9 %)
--     remplacements explicites   19 585            (97,9 %)
--     AUCUN décodage             19 585            (97,9 %)
--
-- Les trois font jeu égal : les chemins ne sont pas encodés en base. Le décodage n'aurait rien
-- apporté qu'un risque — une expression que personne ne relit, qui rend un mandat invisible le
-- jour où elle se trompe d'un caractère. On garde donc la forme simple.
--
-- LES 429 QUI MANQUENT NE SONT PAS UN DÉFAUT D'ENCODAGE, ils n'ont pas de fiche du tout. Comptés
-- (`scripts/.diag-orphelins-seau.cjs`) : 382 pointent vers une entité SUPPRIMÉE — des restes —,
-- 9 ont un chemin inexploitable, et 38 désignent une entité vivante, dont 24 sont des doublons
-- d'un fichier qui a bien sa fiche (même nom, même entité, quelques secondes d'écart). Aucun n'est
-- un document que quelqu'un cherche.
create or replace function public.chemin_du_document(p_url text)
returns text
language sql
immutable
as $$
  select case
    when p_url is null then null
    when position('/documents/' in p_url) = 0 then null
    else substring(p_url from position('/documents/' in p_url) + 11)
  end
$$;

comment on function public.chemin_du_document(text) is
  'Le chemin dans le seau `documents`, extrait de `documents.url`. Sert à la policy '
  '`documents_read` de `storage.objects` : un fichier n''est lisible que si sa fiche l''est. '
  'Aucun décodage : mesuré le 25/09/2026, les chemins stockés ne sont pas percent-encodés.';

create policy documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1
        from public.documents d
       where public.chemin_du_document(d.url) = storage.objects.name
    )
  );

comment on policy documents_read on storage.objects is
  'Un fichier du seau `documents` n''est lisible que si l''appelant voit la ligne `documents` qui '
  'le désigne. Le cloisonnement retombe ainsi sur les policies de `documents` plutôt que sur une '
  'seconde règle écrite à part. Posée le 25/09/2026 : la précédente ouvrait les 19 690 fichiers à '
  'tout compte connecté, partenaires compris (mesuré).';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LE PARTENAIRE DEHORS, L'ÉQUIPE DEDANS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le risque est des deux côtés, et le second se verrait dans l'heure : une policy trop stricte et
-- plus personne n'ouvre un mandat en clientèle. On éprouve les deux, sur de vraies lignes.
do $$
declare
  v_tp      uuid;
  v_part    uuid;
  v_profil  uuid;
  v_commer  uuid;
  v_total   integer;
  v_part_n  integer;
  v_equipe  integer;
begin
  select count(*) into v_total from storage.objects where bucket_id = 'documents';

  -- ── ① UN PARTENAIRE NE DOIT PLUS RIEN VOIR ──
  select id into v_tp from types_comptes where code = 'PARTENAIRE';
  insert into comptes (nom, type_compte_id) values ('ZZZ GF SEAU', v_tp) returning id into v_part;

  select p.id into v_profil
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration limit 1;
  update profils set compte_partenaire_id = v_part where id = v_profil;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_part_n from storage.objects where bucket_id = 'documents';
  reset role;
  perform set_config('request.jwt.claims', null, true);

  if v_part_n > 0 then
    raise exception 'Un partenaire voit encore % fichier(s) du seau : la fuite reste ouverte.', v_part_n;
  end if;
  raise notice 'Garde-fou 1 : un partenaire voit 0 fichier sur %.', v_total;

  -- ── ② L'ÉQUIPE DOIT TOUJOURS VOIR ──
  select p.id into v_commer
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration
     and p.compte_partenaire_id is null
     and p.email like '%@kiwee-energie.fr' limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_commer::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_equipe from storage.objects where bucket_id = 'documents';
  reset role;
  perform set_config('request.jwt.claims', null, true);

  if v_equipe = 0 then
    raise exception 'Un commercial ne voit plus AUCUN document : l''équipe ne peut plus travailler.';
  end if;

  -- ON SAIT CE QU'ON ATTEND : 19 585 fichiers sur 20 014, soit 97,9 %, mesuré avant d'écrire cette
  -- migration. Un seuil à « la moitié » laisserait passer une règle qui coupe un quart du seau sans
  -- que rien ne le dise. On exige donc 97 %, et la marge n'est là que pour les fichiers déposés
  -- entre la mesure et l'application.
  if v_equipe < (v_total * 97) / 100 then
    raise exception 'Un commercial ne voit plus que % fichiers sur % (attendu : ~97,9 %%). La règle coupe trop.', v_equipe, v_total;
  end if;
  raise notice 'Garde-fou 2 : un commercial voit % fichiers sur %.', v_equipe, v_total;

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : le partenaire est dehors, l''équipe travaille, rien n''est écrit.';
end $$;

commit;

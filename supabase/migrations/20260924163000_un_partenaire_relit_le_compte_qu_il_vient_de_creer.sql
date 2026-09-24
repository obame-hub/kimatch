-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN PARTENAIRE RELIT LE COMPTE QU'IL VIENT DE CRÉER
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 24/09/2026 : « il créera lui-même ses comptes et objets, c'est pas à nous de rattacher ».
--
-- ══ CE QUE L'ESSAI A TROUVÉ ══
--
-- Le partenaire ne pouvait créer AUCUN compte. L'erreur ne venait pas de la policy d'insertion —
-- celle-là passait — mais de `comptes_lecture_cloisonnee` :
--
--     new row violates row-level security policy "comptes_lecture_cloisonnee" for table "comptes"
--
-- ══ POURQUOI LA POLICY DE LECTURE BLOQUE UNE ÉCRITURE ══
--
-- Un `insert ... returning` RELIT la ligne qu'il vient d'écrire, et cette relecture passe par la
-- policy de SELECT. Or celle-ci demande à `comptes_du_partenaire()` la liste des comptes visibles —
-- une fonction `security definer` qui interroge la table. La ligne n'y est pas encore : la fonction
-- s'exécute dans son propre contexte et ne voit pas l'insertion en cours.
--
-- Le partenaire se voyait donc refuser la relecture de sa propre création. Et comme l'application
-- utilise `returning` partout (c'est ce qui rend l'identifiant du nouvel objet), il ne pouvait rien
-- créer du tout.
--
-- ══ LA CORRECTION ══
--
-- La policy de lecture ne passe plus par la fonction : elle compare les colonnes DE LA LIGNE
-- directement. Une ligne sait à quel partenaire elle appartient sans qu'on aille la rechercher —
-- c'est plus simple, plus rapide, et ça marche sur la ligne en cours d'insertion.
--
-- `comptes_du_partenaire()` reste : les tables filles s'en servent pour savoir quels comptes suivre,
-- et là il n'y a pas de relecture d'une ligne en cours d'écriture.
--
-- ══ CE QUI NE CHANGE PAS ══
--
-- Le périmètre est identique, au compte près : son propre compte partenaire, ceux dont il est
-- apporteur, ceux dont il est intermédiaire. Le garde-fou le vérifie.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists comptes_lecture_cloisonnee on public.comptes;
create policy comptes_lecture_cloisonnee on public.comptes
  as restrictive
  for select to authenticated
  using (
    not public.est_partenaire()
    /* ON COMPARE LES COLONNES DE LA LIGNE, sans repasser par une fonction qui relirait la table :
       c'est ce qui permet de relire une ligne qu'on vient d'insérer. */
    or id = (select compte_partenaire_id from public.profils where id = auth.uid())
    or apporteur_partenaire_id = (select compte_partenaire_id from public.profils where id = auth.uid())
    or intermediaire_partenaire_id = (select compte_partenaire_id from public.profils where id = auth.uid())
  );

-- Même correction pour la modification, qui relit aussi ce qu'elle écrit.
drop policy if exists comptes_ecriture_cloisonnee on public.comptes;
create policy comptes_ecriture_cloisonnee on public.comptes
  as restrictive
  for update to authenticated
  using (
    not public.est_partenaire()
    or id = (select compte_partenaire_id from public.profils where id = auth.uid())
    or apporteur_partenaire_id = (select compte_partenaire_id from public.profils where id = auth.uid())
    or intermediaire_partenaire_id = (select compte_partenaire_id from public.profils where id = auth.uid())
  )
  with check (
    not public.est_partenaire()
    or apporteur_partenaire_id = (select compte_partenaire_id from public.profils where id = auth.uid())
    or intermediaire_partenaire_id = (select compte_partenaire_id from public.profils where id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : IL CRÉE, IL RELIT, ET IL NE VOIT TOUJOURS QUE LE SIEN
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible : créer un compte et le retrouver. Le RISQUE, en assouplissant
-- une policy de lecture, est d'en ouvrir plus qu'il ne faut. On éprouve donc les deux : qu'il puisse
-- créer ET qu'il ne voie rien d'autre.
--
do $$
declare
  v_partenaire uuid;
  v_profil     uuid;
  v_client     uuid;
  v_type_p     uuid;
  v_type_c     uuid;
  v_n          integer;
  v_total      integer;
begin
  select id into v_type_p from public.types_comptes where code = 'PARTENAIRE';
  select id into v_type_c from public.types_comptes where code = 'CLIENT';
  select id into v_profil from public.profils where actif limit 1;
  if v_type_p is null or v_type_c is null or v_profil is null then
    raise notice 'Garde-fou ignoré : types de compte ou profil actif manquants.';
    return;
  end if;

  insert into public.comptes (nom, type_compte_id)
  values ('zzz garde-fou partenaire', v_type_p) returning id into v_partenaire;

  select count(*) into v_total from public.comptes;

  update public.profils set compte_partenaire_id = v_partenaire where id = v_profil;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ① IL CRÉE ET IL RELIT. C'est ce qui échouait.
  insert into public.comptes (nom, type_compte_id, apporteur_partenaire_id)
  values ('zzz client du partenaire', v_type_c, v_partenaire)
  returning id into v_client;

  if v_client is null then
    raise exception 'Le partenaire ne peut pas relire le compte qu''il vient de créer : il ne peut donc rien créer.';
  end if;

  -- ② IL NE VOIT QUE LE SIEN. Le cas qui compte pour la sécurité.
  select count(*) into v_n from public.comptes;
  if v_n <> 2 then
    raise exception 'Le partenaire voit % comptes sur % : il devrait n''en voir que 2 (le sien et celui qu''il a créé).', v_n, v_total;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  update public.profils set compte_partenaire_id = null where id = v_profil;
  delete from public.comptes where id in (v_client, v_partenaire);

  raise notice 'Garde-fou : le partenaire crée un compte, le relit, et n''en voit toujours que 2 sur %.', v_total;
end $$;

commit;

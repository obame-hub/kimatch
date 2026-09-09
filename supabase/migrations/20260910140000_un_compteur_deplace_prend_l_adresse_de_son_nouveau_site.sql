-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTEUR DÉPLACÉ PREND L'ADRESSE DE SON NOUVEAU SITE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUE LE DÉCLENCHEUR DE LA MIGRATION PRÉCÉDENTE NE FAISAIT PAS ═══════════════════════════
--
-- `fn_compteur_herite_de_son_site` (20260910120000) remplissait par `coalesce` : ne jamais écraser
-- une valeur fournie. C'est la bonne règle À L'INSERTION. C'est la MAUVAISE règle sur un
-- déplacement, où toutes les valeurs sont déjà là — celles de l'ANCIEN site.
--
-- Vérifié en transaction annulée, une minute après avoir posé le déclencheur :
--
--   AVANT : libelle_site = SDC LE VAL VERT
--   update compteurs set site_id = <un autre site>
--   APRES : libelle_site = SDC LE VAL VERT        ← inchangé
--           groupe_site_id suit le nouveau site ? f
--
-- Le compteur changeait d'adresse en gardant l'ancienne. Et comme `groupe_site_id` est ce dont
-- dérivent `v_groupes_de_site`, `v_recommandations_liste` et la colonne `sites` de
-- `v_contrats_liste`, il restait affiché à l'adresse qu'il venait de quitter.
--
-- ══ ET LE MÊME TROU DANS `fn_deplacer_compteur` ════════════════════════════════════════════════
--
-- La fonction de déplacement de l'application ne fait qu'une chose sur le compteur :
--
--   update compteurs set site_id = p_site_destination_id where id = p_compteur_id;
--
-- Elle ne touche ni `compte_id`, ni `groupe_site_id`, ni le libellé, ni l'adresse. Déplacer un
-- compteur vers le site d'un AUTRE client le laissait donc rattaché à l'ancien client — un compteur
-- qui figure chez deux comptes selon le chemin par lequel on le regarde. Ce n'est pas une faute de
-- cette fonction : elle a été écrite le 09/09 avant que `compteurs` porte ces colonnes. Corriger le
-- déclencheur la corrige aussi, et corrige du même coup tout `update` fait à la main ou par script.
--
-- ══ LA RÈGLE, ET CE QU'ELLE PROTÈGE ════════════════════════════════════════════════════════════
--
-- Deux comportements distincts, parce que les deux situations sont distinctes :
--
--   À L'INSERTION       on remplit les trous. `coalesce`, inchangé.
--   AU CHANGEMENT DE SITE  ce qui venait de l'ANCIEN site suit vers le nouveau ; ce que quelqu'un
--                       avait saisi À LA MAIN reste.
--
-- La distinction se fait en comparant la valeur actuelle à celle de l'ancien site. Si elles sont
-- égales, la valeur était héritée : elle suit. Si elles diffèrent, quelqu'un l'a voulue ainsi :
-- elle reste. C'est ce qui permet de corriger une adresse au niveau du compteur — un bâtiment B
-- dans une résidence — sans qu'un déplacement l'efface.
--
-- DEUX EXCEPTIONS À CETTE PRUDENCE, et elles sont justifiées :
--
--   · `groupe_site_id` SUIT TOUJOURS. Ce n'est pas une donnée saisie, c'est l'identité du
--     regroupement d'adresse — l'« id de regroupement » que Naoëlle a demandé de garder le 09/09.
--     Un compteur rattaché au site X dont le groupe dit Y est simplement incohérent.
--   · `compte_id` SUIT TOUJOURS AUSSI. La table `sites` impose déjà qu'un site appartienne à un
--     seul compte ; un compteur sur le site de Dupont mais rattaché au compte de Martin est une
--     contradiction, pas une personnalisation. C'est le cas que `fn_deplacer_compteur` laissait
--     passer.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function fn_compteur_herite_de_son_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s      record;  -- le site d'arrivée
  ancien record;  -- le site de départ, sur un déplacement seulement
begin
  /* PAS DE SITE, RIEN À HÉRITER. C'est le cas du futur : quand `compteurs.site_id` deviendra
     facultatif puis disparaîtra, ce déclencheur s'effacera de lui-même sans rien casser. */
  if new.site_id is null then
    return new;
  end if;

  select compte_id, nom, adresse, ville, code_postal, latitude, longitude,
         departement_code, departement_nom
    into s
    from sites
   where id = new.site_id;

  /* Site introuvable : la clé étrangère va refuser l'écriture juste après. On laisse PostgreSQL
     produire son erreur, qui nomme la contrainte, plutôt que d'en inventer une moins claire. */
  if not found then
    return new;
  end if;

  -- ══ CAS 1 : UNE CRÉATION — ON REMPLIT LES TROUS ═════════════════════════════════════════════
  if tg_op = 'INSERT' then
    new.compte_id      := coalesce(new.compte_id, s.compte_id);
    new.groupe_site_id := coalesce(new.groupe_site_id, new.site_id);

    /* `adresse_site` et `adresse_site_recherche` sont GENERATED : elles se calculent d'elles-mêmes
       à partir des colonnes ci-dessous, il n'y a rien à leur écrire. */
    new.libelle_site     := coalesce(nullif(trim(new.libelle_site), ''), nullif(trim(s.nom), ''));
    new.adresse          := coalesce(nullif(trim(new.adresse), ''), nullif(trim(s.adresse), ''));
    new.code_postal      := coalesce(nullif(trim(new.code_postal), ''), nullif(trim(s.code_postal), ''));
    new.ville            := coalesce(nullif(trim(new.ville), ''), nullif(trim(s.ville), ''));
    new.latitude         := coalesce(new.latitude, s.latitude);
    new.longitude        := coalesce(new.longitude, s.longitude);
    new.departement_code := coalesce(nullif(trim(new.departement_code), ''), nullif(trim(s.departement_code), ''));
    new.departement_nom  := coalesce(nullif(trim(new.departement_nom), ''), nullif(trim(s.departement_nom), ''));
    return new;
  end if;

  -- ══ CAS 2 : UN DÉPLACEMENT — CE QUI ÉTAIT HÉRITÉ SUIT ═══════════════════════════════════════

  /* Le déclencheur est déclaré `update of site_id` : il se rallume dès qu'un UPDATE MENTIONNE la
     colonne, même pour y remettre la même valeur. On sort ici si le site n'a pas réellement
     changé, sinon un `update ... set site_id = site_id` réécrirait les champs personnalisés. */
  if new.site_id is not distinct from old.site_id then
    return new;
  end if;

  select compte_id, nom, adresse, ville, code_postal, latitude, longitude,
         departement_code, departement_nom
    into ancien
    from sites
   where id = old.site_id;

  /* LES DEUX QUI SUIVENT TOUJOURS : l'identité du regroupement, et le client. Voir l'en-tête. */
  new.groupe_site_id := new.site_id;
  new.compte_id      := s.compte_id;

  /* LES AUTRES SUIVENT SI ELLES ÉTAIENT HÉRITÉES. `ancien` peut être introuvable (site déjà
     supprimé) : dans ce doute, on considère la valeur comme personnalisée et on n'y touche pas —
     ne rien perdre passe avant tout rafraîchir. */
  if found then
    if nullif(trim(coalesce(old.libelle_site, '')), '') is not distinct from nullif(trim(coalesce(ancien.nom, '')), '') then
      new.libelle_site := nullif(trim(s.nom), '');
    end if;
    if nullif(trim(coalesce(old.adresse, '')), '') is not distinct from nullif(trim(coalesce(ancien.adresse, '')), '') then
      new.adresse := nullif(trim(s.adresse), '');
    end if;
    if nullif(trim(coalesce(old.code_postal, '')), '') is not distinct from nullif(trim(coalesce(ancien.code_postal, '')), '') then
      new.code_postal := nullif(trim(s.code_postal), '');
    end if;
    if nullif(trim(coalesce(old.ville, '')), '') is not distinct from nullif(trim(coalesce(ancien.ville, '')), '') then
      new.ville := nullif(trim(s.ville), '');
    end if;
    if old.latitude is not distinct from ancien.latitude and old.longitude is not distinct from ancien.longitude then
      new.latitude  := s.latitude;
      new.longitude := s.longitude;
    end if;
    if nullif(trim(coalesce(old.departement_code, '')), '') is not distinct from nullif(trim(coalesce(ancien.departement_code, '')), '') then
      new.departement_code := nullif(trim(s.departement_code), '');
      new.departement_nom  := nullif(trim(s.departement_nom), '');
    end if;
  end if;

  return new;
end
$fn$;

comment on function fn_compteur_herite_de_son_site() is
  'Le compteur tient son compte, son groupe d''adresse et son adresse de site de son site. À '
  'l''insertion il remplit les trous ; au changement de site, ce qui venait de l''ancien site suit '
  'vers le nouveau et ce qui a été saisi à la main reste. `groupe_site_id` et `compte_id` suivent '
  'toujours : ce sont des identites, pas des donnees saisies.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS — quatre scénarios joués pour de vrai, puis effacés
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_compte_a uuid;
  v_compte_b uuid;
  v_site_a   uuid;
  v_site_b   uuid;
  v_energie  uuid;
  v_c        uuid;
  v_lib      text;
  v_grp      uuid;
  v_cpte     uuid;
  v_adr      text;
  v_avant    integer;
  v_apres    integer;
begin
  select count(*) into v_avant from compteurs;
  select id into v_energie from types_energies limit 1;

  /* DEUX COMPTES DIFFÉRENTS : c'est ce qui permet de tester que le client suit le déplacement,
     le cas que `fn_deplacer_compteur` laissait passer. */
  select id into v_compte_a from comptes order by date_creation limit 1;
  select id into v_compte_b from comptes where id <> v_compte_a order by date_creation limit 1;

  insert into sites (nom, compte_id, adresse, ville, code_postal, actif)
  values ('GARDE-FOU SITE A', v_compte_a, '1 RUE A', 'PARIS', '75001', true) returning id into v_site_a;
  insert into sites (nom, compte_id, adresse, ville, code_postal, actif)
  values ('GARDE-FOU SITE B', v_compte_b, '2 RUE B', 'LYON', '69002', true) returning id into v_site_b;

  -- ① CRÉATION comme le fait l'application : ni compte, ni libellé, ni adresse fournis.
  insert into compteurs (site_id, numero_point, libelle, actif, type_energie_id)
  values (v_site_a, 'GARDEFOU00001', 'Garde-fou', true, v_energie)
  returning id, compte_id, groupe_site_id, libelle_site into v_c, v_cpte, v_grp, v_lib;

  if v_cpte is distinct from v_compte_a or v_grp is distinct from v_site_a or v_lib <> 'GARDE-FOU SITE A' then
    raise exception 'Garde-fou 1 : creation — compte %, groupe %, libelle %', v_cpte, v_grp, v_lib;
  end if;
  raise notice 'Garde-fou 1 : creation OK — le compteur herite du compte, du groupe et du libelle';

  -- ② DÉPLACEMENT vers le site B, qui appartient à un AUTRE compte. Tout doit suivre.
  update compteurs set site_id = v_site_b where id = v_c;
  select compte_id, groupe_site_id, libelle_site, ville, adresse_site
    into v_cpte, v_grp, v_lib, v_adr, v_adr from compteurs where id = v_c;
  select adresse_site into v_adr from compteurs where id = v_c;

  if v_grp is distinct from v_site_b then
    raise exception 'Garde-fou 2 : le groupe n a pas suivi le deplacement (% au lieu de %)', v_grp, v_site_b;
  end if;
  if v_cpte is distinct from v_compte_b then
    raise exception 'Garde-fou 2 : le compte n a pas suivi le deplacement (% au lieu de %)', v_cpte, v_compte_b;
  end if;
  if v_lib <> 'GARDE-FOU SITE B' then
    raise exception 'Garde-fou 2 : le libelle n a pas suivi (%)', v_lib;
  end if;
  if v_adr is null or v_adr not like '%69002%' then
    raise exception 'Garde-fou 2 : l adresse de site n a pas suivi (%)', coalesce(v_adr, 'null');
  end if;
  raise notice 'Garde-fou 2 : deplacement OK — compte, groupe, libelle et adresse (%) ont suivi', v_adr;

  -- ③ UNE VALEUR SAISIE À LA MAIN NE DOIT PAS ÊTRE EFFACÉE par un déplacement.
  update compteurs set libelle_site = 'BATIMENT C SAISI A LA MAIN' where id = v_c;
  update compteurs set site_id = v_site_a where id = v_c;
  select libelle_site, groupe_site_id into v_lib, v_grp from compteurs where id = v_c;
  if v_lib <> 'BATIMENT C SAISI A LA MAIN' then
    raise exception 'Garde-fou 3 : un libelle saisi a la main a ete ecrase par le deplacement (%)', v_lib;
  end if;
  if v_grp is distinct from v_site_a then
    raise exception 'Garde-fou 3 : le groupe devait suivre malgre le libelle personnalise (%)', v_grp;
  end if;
  raise notice 'Garde-fou 3 : un libelle personnalise survit au deplacement, et le groupe suit quand meme';

  -- ④ UN UPDATE QUI REMET LE MÊME SITE NE DOIT RIEN RÉÉCRIRE.
  update compteurs set site_id = v_site_a where id = v_c;
  select libelle_site into v_lib from compteurs where id = v_c;
  if v_lib <> 'BATIMENT C SAISI A LA MAIN' then
    raise exception 'Garde-fou 4 : un update sans changement de site a reecrit le libelle (%)', v_lib;
  end if;
  raise notice 'Garde-fou 4 : un update sans changement reel de site ne reecrit rien';

  -- ON EFFACE TOUT LE MONTAGE.
  delete from compteurs where id = v_c;
  delete from sites where id in (v_site_a, v_site_b);

  select count(*) into v_apres from compteurs;
  if v_apres <> v_avant then
    raise exception 'Garde-fou : % compteurs apres contre % avant — le montage de test n a pas ete efface', v_apres, v_avant;
  end if;

  raise notice 'Garde-fou passe : les 4 scenarios joues et effaces, % compteurs inchanges', v_apres;
end $$;

commit;

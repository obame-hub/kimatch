-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTEUR NOUVEAU HÉRITE DE SON SITE — RÉPARATION D'URGENCE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUI EST CASSÉ, ET DEPUIS QUAND ══════════════════════════════════════════════════════════
--
-- Naoëlle, 09/09/2026 : « est-ce que les tables de l'objet site qui existent encore ne seront pas
-- bloquantes ? » La question a trouvé bien pire que ce qu'elle visait.
--
-- DEPUIS HIER SOIR, PERSONNE NE PEUT CRÉER DE COMPTEUR. La migration 20260909160000 a posé
-- `compteurs.compte_id not null` ; or l'insertion de l'application (`useCreateCompteur`, dans
-- `src/lib/data/compteurs.ts`) n'écrit pas cette colonne — elle ne le pouvait pas, la colonne
-- n'existait pas quand elle a été écrite. Reproduit à l'identique en transaction annulée :
--
--   23502 / null value in column "compte_id" of relation "compteurs" violates not-null constraint
--
-- C'est ma faute, et le garde-fou de cette migration-là ne pouvait pas la voir : il vérifiait que
-- les 7 919 compteurs EXISTANTS avaient bien leur compte. Il ne testait pas la création d'un
-- 7 920ᵉ. Une contrainte qui se vérifie sur le passé ne dit rien de l'avenir.
--
-- ══ ET UN SECOND TROU, PLUS SILENCIEUX ═════════════════════════════════════════════════════════
--
-- La migration 20260909100000 a RECOPIÉ `groupe_site_id`, `libelle_site`, `ville`, `code_postal`,
-- `adresse`, la géolocalisation et le département depuis `sites` vers les 7 919 compteurs. Une
-- recopie, pas un mécanisme : rien ne remplit ces colonnes pour un compteur créé APRÈS.
--
-- Vérifié en transaction annulée : un compteur inséré aujourd'hui naît avec
-- `groupe_site_id = null`, `libelle_site = null`, et donc `adresse_site = null` (colonne générée
-- à partir des précédentes).
--
-- Ce trou-là n'aurait rien fait planter. Il aurait fait DISPARAÎTRE le compteur sans un mot :
--
--   · La recherche par adresse ne l'aurait pas trouvé — et depuis ce matin c'est la SEULE façon de
--     retrouver une adresse, la famille « site » ayant quitté la recherche.
--   · `v_groupes_de_site`, `v_recommandations_liste` et la colonne `sites` de `v_contrats_liste`
--     dérivent toutes de `groupe_site_id` : le compteur n'y aurait pas figuré.
--   · Le contrat, la recommandation et le mandat qui le couvrent auraient affiché une adresse vide.
--
-- Autrement dit : on aurait vendu à l'équipe une recherche par adresse qui marche sur l'historique
-- et pas sur ce qu'ils saisissent. C'est exactement le genre de panne qu'on ne découvre que trois
-- semaines plus tard, en cherchant pourquoi « il manque des compteurs ».
--
-- ══ POURQUOI UN DÉCLENCHEUR ET PAS UNE CORRECTION DU CODE ══════════════════════════════════════
--
-- Le code est corrigé aussi, dans le même commit. Mais un déclencheur vaut mieux, pour trois
-- raisons :
--
--   ① IL RÉPARE L'APPLICATION DÉJÀ EN LIGNE. La création de compteurs remarche à la seconde où
--     cette migration passe, sans attendre le déploiement Vercel.
--   ② IL COUVRE TOUS LES CHEMINS. L'application n'est pas le seul écrivain : les scripts d'import
--     Salesforce et la reprise de données insèrent aussi des compteurs.
--   ③ IL SURVIVRA AU RETRAIT DE `sites`. Le jour où la table part, ce déclencheur devient inerte
--     tout seul — sa première ligne sort si `site_id` est nul — au lieu de laisser un trou.
--
-- Il n'écrase JAMAIS une valeur fournie : `coalesce` partout, exactement comme la recopie du 09/09.
-- Un import qui connaît mieux l'adresse que le site garde la sienne.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function fn_compteur_herite_de_son_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s record;
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

  /* LE RATTACHEMENT AU CLIENT — c'est cette ligne qui débloque la création de compteurs. */
  new.compte_id := coalesce(new.compte_id, s.compte_id);

  /* LE GROUPE D'ADRESSE reprend l'identifiant du site, comme la recopie du 09/09 : c'est ce qui
     fait que tout `site_id` hérité de l'ancien modèle retrouve encore son groupe. */
  new.groupe_site_id := coalesce(new.groupe_site_id, new.site_id);

  /* L'ADRESSE DE SITE, colonne par colonne et dans le même ordre de préférence que la recopie du
     09/09 : ce que le compteur porte déjà d'abord, le site ensuite. `adresse_site` et
     `adresse_site_recherche` sont GENERATED — elles se calculent d'elles-mêmes à partir d'ici. */
  new.libelle_site     := coalesce(nullif(trim(new.libelle_site), ''), nullif(trim(s.nom), ''));
  new.adresse          := coalesce(nullif(trim(new.adresse), ''), nullif(trim(s.adresse), ''));
  new.code_postal      := coalesce(nullif(trim(new.code_postal), ''), nullif(trim(s.code_postal), ''));
  new.ville            := coalesce(nullif(trim(new.ville), ''), nullif(trim(s.ville), ''));
  new.latitude         := coalesce(new.latitude, s.latitude);
  new.longitude        := coalesce(new.longitude, s.longitude);
  new.departement_code := coalesce(nullif(trim(new.departement_code), ''), nullif(trim(s.departement_code), ''));
  new.departement_nom  := coalesce(nullif(trim(new.departement_nom), ''), nullif(trim(s.departement_nom), ''));

  return new;
end
$fn$;

comment on function fn_compteur_herite_de_son_site() is
  'Remplit le compte, le groupe d''adresse et l''adresse de site d''un compteur depuis son site, à '
  'l''insertion et au déplacement. Ne remplace jamais une valeur fournie. Répare le blocage du '
  '09/09/2026 (compte_id not null jamais écrit par l''application) et le trou silencieux qui '
  'laissait un compteur neuf sans adresse de site, donc introuvable par la recherche.';

/* `of site_id` SUR L'UPDATE, et non sur toute la ligne : le déclencheur ne doit se rallumer que
   quand le compteur CHANGE de site — un déplacement — et pas à chaque modification de sa
   consommation ou de son échéance. Sinon il rejouerait 7 919 fois pour rien, et surtout il
   remplirait à nouveau un champ que quelqu'un vient délibérément de vider. */
drop trigger if exists trg_compteur_herite_de_son_site on compteurs;
create trigger trg_compteur_herite_de_son_site
  before insert or update of site_id on compteurs
  for each row execute function fn_compteur_herite_de_son_site();

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS — cette fois ils testent L'AVENIR, pas seulement le passé
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_compte    uuid;
  v_site      uuid;
  v_energie   uuid;
  v_id        uuid;
  v_grp       uuid;
  v_lib       text;
  v_adr       text;
  v_cpte      uuid;
  v_avant     integer;
  v_apres     integer;
  v_orphelins integer;
begin
  select count(*) into v_avant from compteurs;

  select id into v_compte from comptes where actif is not false limit 1;
  select id into v_energie from types_energies limit 1;

  -- ① UN COMPTEUR CRÉÉ COMME L'APPLICATION LE FAIT DOIT PASSER. Les colonnes ci-dessous sont
  --   EXACTEMENT celles de `useCreateCompteur` — pas de `compte_id`, pas de `libelle_site`. C'est
  --   la reproduction du blocage, et sa preuve de réparation. Le tout dans un point de sauvegarde
  --   annulé juste après : cette migration ne doit laisser aucune ligne de test derrière elle.
  begin
    insert into sites (nom, compte_id, adresse, ville, code_postal, actif)
    values ('GARDE-FOU MIGRATION 20260910120000', v_compte, '1 RUE DU TEST', 'PARIS', '75001', true)
    returning id into v_site;

    insert into compteurs (site_id, numero_point, libelle, actif, type_energie_id)
    values (v_site, 'GARDEFOU00000', 'Garde-fou', true, v_energie)
    returning id, compte_id, groupe_site_id, libelle_site, adresse_site
         into v_id, v_cpte, v_grp, v_lib, v_adr;

    -- ② IL DOIT AVOIR SON CLIENT, hérité du site.
    if v_cpte is distinct from v_compte then
      raise exception 'Garde-fou : le compteur cree n a pas herite du bon compte (% au lieu de %)', v_cpte, v_compte;
    end if;

    -- ③ IL DOIT AVOIR SON GROUPE D'ADRESSE, sans quoi il serait absent des vues.
    if v_grp is distinct from v_site then
      raise exception 'Garde-fou : groupe_site_id vaut % au lieu du site %', coalesce(v_grp::text, 'null'), v_site;
    end if;

    -- ④ IL DOIT ÊTRE TROUVABLE PAR SON ADRESSE, sans quoi la recherche mentirait.
    if v_lib is distinct from 'GARDE-FOU MIGRATION 20260910120000' then
      raise exception 'Garde-fou : libelle_site vaut % au lieu du nom du site', coalesce(v_lib, 'null');
    end if;
    if v_adr is null or v_adr not like '%75001%' then
      raise exception 'Garde-fou : adresse_site vaut % — le compteur serait introuvable par adresse', coalesce(v_adr, 'null');
    end if;

    raise notice 'Garde-fou : creation d un compteur REPAREE — compte, groupe et adresse (%) herites du site', v_adr;

    -- ON EFFACE LE TEST. `delete` du compteur d'abord : le site le referme ensuite.
    delete from compteurs where id = v_id;
    delete from sites where id = v_site;
  end;

  -- ⑤ RIEN N'A BOUGÉ. Le compte doit être exactement celui d'avant : le test s'est effacé, et
  --   cette migration ne touche à aucune donnée existante.
  select count(*) into v_apres from compteurs;
  if v_apres <> v_avant then
    raise exception 'Garde-fou : % compteurs apres contre % avant — le test n a pas ete efface', v_apres, v_avant;
  end if;

  select count(*) into v_orphelins from compteurs
   where compte_id is null or site_id is null or groupe_site_id is null or libelle_site is null;
  if v_orphelins > 0 then
    raise exception 'Garde-fou : % compteur(s) sans compte, sans site, sans groupe ou sans libelle de site', v_orphelins;
  end if;

  raise notice 'Garde-fou passe : % compteurs, tous avec compte, site, groupe et libelle de site', v_apres;
end $$;

commit;

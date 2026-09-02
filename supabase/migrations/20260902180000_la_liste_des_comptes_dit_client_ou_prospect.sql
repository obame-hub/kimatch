-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA LISTE DES COMPTES DIT CLIENT OU PROSPECT
--
-- Naoëlle, 02/09/2026 : « mets une option pour voir la synthèse des comptes client et prospect,
-- comme ça j'arrive à voir la différence de chiffres. »
--
-- Le statut existe depuis la migration 20260902170000, mais seulement sur la FICHE d'un compte
-- (`v_qualite_compte.est_client`) : pour compter, il fallait ouvrir les 2 706 fiches. La liste est
-- l'endroit où l'on compare — elle sait déjà filtrer, trier et totaliser en base.
--
-- ══ POURQUOI UNE COLONNE DANS LA VUE, ET PAS UN CALCUL DANS L'ÉCRAN ══
--
-- `v_comptes_liste` est servie par PostgREST, qui filtre et pagine EN BASE : c'est ce qui permet au
-- total du pied de liste de dire la vérité. Un statut calculé dans le navigateur ne porterait que
-- sur les cent lignes déjà chargées — « 392 clients » deviendrait « 14 clients sur cette page »,
-- c'est-à-dire exactement le genre de chiffre qui fait douter de tous les autres.
--
-- ══ LA DÉFINITION NE BOUGE PAS ══
--
-- Celle de Michel, déjà posée : au moins un compteur du compte rattaché à un contrat en cours.
-- Écrite ici en jointure sur un ensemble distinct plutôt qu'en sous-requête corrélée — la vue est
-- balayée en entier à chaque tri, et un `exists` par ligne sur 2 765 comptes se paierait sur
-- chaque frappe de la recherche.
--
-- La colonne est ajoutée EN QUEUE : `create or replace view` refuse tout renommage ou réordon-
-- nancement (42P16, rencontré la veille sur `v_qualite_compte`). Les treize colonnes existantes
-- sont donc reprises dans l'ordre exact de `pg_get_viewdef`.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view public.v_comptes_liste
with (security_invoker = true) as
select
  c.id,
  c.nom,
  c.ville,
  c.segment,
  c.siren,
  c.siret,
  c.code_postal,
  c.score_ellipro,
  c.type_compte,
  c.proprietaire_id,
  c.date_creation,
  tc.libelle as type_compte_libelle,
  coalesce(s.nb, 0) as nb_sites,
  -- ── Le statut commercial, règle de Michel du 02/09/2026 ──
  (cl.compte_id is not null) as est_client
from public.comptes c
  left join public.types_comptes tc on tc.id = c.type_compte_id
  left join (
    select sites.compte_id, count(*)::integer as nb
      from public.sites
     group by sites.compte_id
  ) s on s.compte_id = c.id
  left join (
    -- Les comptes qui ont au moins un compteur actif couvert par un contrat en cours.
    select distinct si.compte_id
      from public.compteurs cm
      join public.sites si on si.id = cm.site_id
      join public.contrats_compteurs cc on cc.compteur_id = cm.id
      join public.contrats ct on ct.id = cc.contrat_id
     where cm.actif
       and ct.actif
       and (ct.date_fin is null or ct.date_fin >= current_date)
  ) cl on cl.compte_id = c.id;

comment on view public.v_comptes_liste is
  'La liste des comptes, aplatie pour PostgREST. `est_client` suit la règle de Michel du 02/09/2026 : Client dès qu''au moins un compteur du compte est sous contrat en cours, Prospect sinon.';

-- ── Le garde-fou : la liste et la fiche doivent compter pareil ──
do $$
declare
  v_liste integer;
  v_fiche integer;
begin
  -- Sur le même périmètre que `v_qualite_compte` : comptes actifs de type consommateur.
  select count(*) into v_liste
    from public.v_comptes_liste l
    join public.comptes c on c.id = l.id
    join public.types_comptes tc on tc.id = c.type_compte_id
   where l.est_client and c.actif and tc.code = 'CLIENT';

  select count(*) into v_fiche from public.v_qualite_compte where est_client;

  if v_liste <> v_fiche then
    raise exception 'La liste compte % clients, la fiche en compte % — les deux vues se contredisent',
      v_liste, v_fiche;
  end if;

  raise notice 'Liste des comptes : % clients (accord avec la fiche compte)', v_liste;
end;
$$;

commit;

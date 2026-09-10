-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES TABLES DE TRAVAIL DE L'IMPORT SALESFORCE S'EFFACENT
--
-- William, 10/09/2026, après contrôle des chiffres à l'écran : « on passe à la suite, ménage ».
--
-- ── QUATRE TABLES, DEUX RÔLES ──
--
--   import_sf_montants                       transit — 459 lignes, Closed Won 2025
--   import_sf_montants_2026                  transit — 266 lignes, Closed Won 2026
--   sauvegarde_montants_avant_import_sf      état d'avant — 459 lignes
--   sauvegarde_montants_avant_import_sf_2026 état d'avant — 266 lignes
--
-- Les deux TRANSITS ne sont que la copie des CSV exportés par William, qui les a toujours. Les
-- supprimer ne perd rien : le fichier est la source, la table n'en était qu'un véhicule.
--
-- ── LES DEUX SAUVEGARDES, ELLES, RENDENT L'IMPORT IRRÉVERSIBLE EN PARTANT ──
--
-- Elles portaient le seul état d'avant. Trois raisons de les laisser partir malgré tout :
--
--   1. VÉRIFIÉ AVANT SUPPRESSION : les 725 recommandations correspondent au centime à leurs
--      fichiers d'origine, sur les neuf champs. Zéro divergence — rien n'a dérivé depuis l'import.
--   2. L'ÉTAT D'AVANT ÉTAIT DÉMONTRABLEMENT FAUX. Le montant brut y portait le chiffre d'affaires,
--      434 fois sur 434 en 2025. Garder un filet pour revenir à des données erronées n'a pas de sens.
--   3. LES DEUX CSV SONT CHEZ WILLIAM. Le chemin de reprise n'est pas « restaurer l'avant », c'est
--      « rejouer l'import », et il reste ouvert : les migrations 20260910230000 et 20260910250000
--      décrivent la procédure complète, contrôles compris.
--
-- ── CE QUI RESTE, ET QUI SUFFIT À TOUT RETRACER ──
--
-- `recommandations.id_salesforce` porte l'origine de chaque ligne, et les deux migrations d'import
-- documentent les totaux attendus au centime. Un contrôle futur se refait sans ces tables.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare n_2025 int; n_2026 int; divergences int;
begin
  -- On ne supprime pas un filet sans avoir vérifié une dernière fois qu'on n'en a plus besoin.
  select count(*) into n_2025 from import_sf_montants;
  select count(*) into n_2026 from import_sf_montants_2026;
  if n_2025 <> 459 or n_2026 <> 266 then
    raise exception 'Transits inattendus : % et % lignes. Rien n''est supprimé.', n_2025, n_2026;
  end if;

  select
    (select count(*) from import_sf_montants i
       join recommandations r on left(r.id_salesforce,15) = i.id15 and r.actif
      where r.marge_nette_coeff is distinct from i.commission_interne
         or r.marge_nette is distinct from i.commission_nette_kiwee)
  + (select count(*) from import_sf_montants_2026 i
       join recommandations r on left(r.id_salesforce,15) = i.id15 and r.actif
      where r.marge_nette_coeff is distinct from i.commission_interne
         or r.marge_nette is distinct from i.commission_nette_kiwee)
  into divergences;

  if divergences > 0 then
    raise exception '% recommandation(s) ne correspondent plus à leur fichier. Rien n''est supprimé.', divergences;
  end if;
end $$;

drop table if exists import_sf_montants;
drop table if exists import_sf_montants_2026;
drop table if exists sauvegarde_montants_avant_import_sf;
drop table if exists sauvegarde_montants_avant_import_sf_2026;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Les montants restent ceux des fichiers : 2025 → 1 038 667,57 € ; 2026 → 697 152,65 €.
--   select extract(year from date_cloture)::int as annee, count(*),
--          round(sum(marge_nette_coeff), 2) as montant
--   from recommandations where actif and finalite_cloture = 'ACCEPTEE' and date_cloture is not null
--   group by 1 order by 1;
-- ════════════════════════════════════════════════════════════════════════════════════════════════

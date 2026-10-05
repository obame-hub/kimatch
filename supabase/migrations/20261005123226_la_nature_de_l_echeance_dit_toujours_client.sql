-- ══ « PROUVÉE » DIT TOUJOURS « CLIENT SOUS CONTRAT » — 05/10/2026 ══
-- Une quinzaine d'écrans et de vues lisent `nature_echeance = 'PROUVEE'` comme « un contrat client
-- couvre ce compteur » (statut client, couverture, cockpit). Quand le dernier contrat connu est un
-- contrat prospect, la date retenue est la sienne — mais le compteur reste couvert par son contrat en
-- cours : la nature reste PROUVÉE. Seules la date et l'indétermination suivent le contrat prospect.
create or replace view public.v_echeance_compteur with (security_invoker = true) as
 SELECT c.id AS compteur_id,
    CASE WHEN e.prospect THEN e.fin_dernier WHEN e.date_preuve IS NOT NULL THEN e.date_preuve ELSE c.date_echeance END AS date_echeance,
    CASE WHEN e.date_preuve IS NOT NULL THEN 'PROUVEE' WHEN e.prospect OR c.date_echeance IS NOT NULL THEN 'ESTIMEE' ELSE 'ABSENTE' END AS nature,
    COALESCE(e.prospect AND e.fin_dernier IS NULL, false) AS indeterminee,
    e.date_preuve
   FROM compteurs c
     LEFT JOIN LATERAL (
       WITH tous AS (
         SELECT ct.date_debut, ct.date_fin, ct.date_creation, false AS prospect
           FROM contrats_compteurs cc JOIN contrats ct ON ct.id = cc.contrat_id
          WHERE cc.compteur_id = c.id AND COALESCE(cc.actif, true) AND fn_contrat_compte(ct.*)
         UNION ALL
         SELECT p.date_debut, p.date_fin, p.date_creation, true FROM contrats_prospects p WHERE p.compteur_id = c.id
       )
       SELECT (SELECT max(t.date_fin) FROM tous t WHERE NOT t.prospect AND t.date_fin >= CURRENT_DATE) AS date_preuve,
              d.prospect, d.date_fin AS fin_dernier
         FROM (SELECT 1) un
         LEFT JOIN LATERAL (
           SELECT t.prospect, t.date_fin FROM tous t
            WHERE t.date_fin IS NOT NULL
               OR NOT EXISTS (SELECT 1 FROM tous o WHERE o.date_fin IS NOT NULL AND o.date_debut IS NOT NULL AND t.date_debut IS NOT NULL AND o.date_debut >= t.date_debut)
            ORDER BY (t.date_fin IS NULL) DESC, t.date_fin DESC NULLS LAST, t.date_creation DESC
            LIMIT 1) d ON true
     ) e ON true;

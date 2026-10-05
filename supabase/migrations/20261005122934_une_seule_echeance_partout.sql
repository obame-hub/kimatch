-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE SEULE ÉCHÉANCE, PARTOUT — William, 05/10/2026
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- « Tous les endroits doivent lire l'échéance, en tout cas le champ qui peut mentionner
-- "Indéterminée". » Jusqu'ici, seule la fiche compteur tenait compte des contrats prospects
-- (`echeanceDuCompteur`, src/lib/echeance.ts) ; les listes, le cockpit, les échéances à traiter, la
-- qualité et le score des contacts lisaient la date déclarée.
--
-- `v_echeance_compteur` est la règle de la fiche, en base, compteur par compteur :
--   · le dernier contrat connu — client (signé ET validé, `fn_contrat_compte`) ou prospect — est
--     celui qui finit le plus tard ; une fin indéterminée finit après tout, sauf face à un contrat
--     qui commence en même temps ou après lui ; à égalité, le plus récemment saisi ;
--   · si c'est un contrat prospect : sa fin, ou INDÉTERMINÉE s'il n'en a pas (date nulle,
--     `indeterminee` vrai) ;
--   · sinon : la fin du contrat client en cours ou à venir (PROUVEE), à défaut la date déclarée
--     (ESTIMEE), à défaut rien (ABSENTE).
-- La date déclarée (`compteurs.date_echeance`) n'est ni effacée ni réécrite.
--
-- Écrite en sous-requête latérale et non en fonction : 7 954 compteurs se lisent en 0,4 à 0,5 s
-- (0,3 s avant), un compte en 8 ms ; la même règle en fonction prenait 3,7 s.

create or replace view public.v_echeance_compteur with (security_invoker = true) as
 SELECT c.id AS compteur_id,
    CASE WHEN e.prospect THEN e.fin_dernier WHEN e.date_preuve IS NOT NULL THEN e.date_preuve ELSE c.date_echeance END AS date_echeance,
    CASE WHEN e.prospect THEN 'ESTIMEE' WHEN e.date_preuve IS NOT NULL THEN 'PROUVEE' WHEN c.date_echeance IS NOT NULL THEN 'ESTIMEE' ELSE 'ABSENTE' END AS nature,
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
revoke all on public.v_echeance_compteur from anon;
grant select on public.v_echeance_compteur to authenticated;

-- Le calcul réglementaire (début de fourniture) lit la même règle.
create or replace function public.fn_echeance_compteur(p_compteur uuid)
returns date language sql stable set search_path = public
as $$ select e.date_echeance from public.v_echeance_compteur e where e.compteur_id = p_compteur $$;

-- ══ LA LISTE DES COMPTEURS — et ce qui la lit : cockpit, échéances à traiter, vivier, pipe du jour,
--    synthèse du patrimoine, charge des échéances. Seule colonne ajoutée, en fin :
--    `echeance_indeterminee`.
create or replace view public.v_compteurs_liste with (security_invoker = true) as
 SELECT c.id, c.numero_point, c.site_id, c.actif, c.consommation_annuelle_mwh, c.localisation_site, c.date_echeance AS date_declaree,
    te.code AS type_energie_code, c.libelle_site AS site_nom, c.compte_id, e.date_preuve, e.date_echeance, e.nature AS nature_echeance,
    e.date_preuve IS NOT NULL AND c.date_echeance IS NOT NULL AND abs(e.date_preuve - c.date_echeance) > 31 AS contredit,
    c.responsable_contact_id, c.contact_conseil_syndical_id, c.adresse_site, e.indeterminee AS echeance_indeterminee
   FROM compteurs c
     LEFT JOIN types_energies te ON te.id = c.type_energie_id
     LEFT JOIN v_echeance_compteur e ON e.compteur_id = c.id;

-- ══ LES TROIS VUES QUI LISAIENT LA DATE DÉCLARÉE EN DIRECT : la qualité du compteur, le score des
--    contacts (signaux), le périmètre d'un contrat. Seule la source de `date_echeance` change ; le
--    reste de chaque vue est repris tel quel de sa définition en place. Chaque remplacement est
--    vérifié : s'il ne s'applique pas, la migration s'arrête.
do $$
declare
  v_def text;
  v_neuf text;
begin
  v_def := pg_get_viewdef('public.v_qualite_compteur'::regclass, true);
  v_neuf := replace(replace(v_def, 'cm.date_echeance', 'ec.date_echeance'),
    'LEFT JOIN contacts ct ON ct.id = cm.responsable_contact_id',
    'LEFT JOIN contacts ct ON ct.id = cm.responsable_contact_id' || chr(10) || '     LEFT JOIN v_echeance_compteur ec ON ec.compteur_id = cm.id');
  if v_neuf = v_def or position('v_echeance_compteur' in v_neuf) = 0 then raise exception 'v_qualite_compteur : remplacement impossible'; end if;
  execute 'create or replace view public.v_qualite_compteur with (security_invoker = true) as ' || v_neuf;

  v_def := pg_get_viewdef('public.v_signal_score_contact'::regclass, true);
  v_neuf := replace(replace(v_def, 'k.date_echeance,', 'ec.date_echeance,'),
    'FROM compteurs k' || chr(10) || '          WHERE k.actif',
    'FROM compteurs k' || chr(10) || '             LEFT JOIN v_echeance_compteur ec ON ec.compteur_id = k.id' || chr(10) || '          WHERE k.actif');
  if v_neuf = v_def or position('v_echeance_compteur' in v_neuf) = 0 then raise exception 'v_signal_score_contact : remplacement impossible'; end if;
  execute 'create or replace view public.v_signal_score_contact with (security_invoker = true) as ' || v_neuf;

  v_def := pg_get_viewdef('public.v_perimetre_contrat'::regclass, true);
  v_neuf := replace(replace(v_def, 'm.date_echeance,', 'ec.date_echeance,'),
    'LEFT JOIN comptes f ON f.id = m.fournisseur_actuel_compte_id',
    'LEFT JOIN comptes f ON f.id = m.fournisseur_actuel_compte_id' || chr(10) || '     LEFT JOIN v_echeance_compteur ec ON ec.compteur_id = m.id');
  if v_neuf = v_def or position('v_echeance_compteur' in v_neuf) = 0 then raise exception 'v_perimetre_contrat : remplacement impossible'; end if;
  execute 'create or replace view public.v_perimetre_contrat with (security_invoker = true) as ' || v_neuf;
end $$;

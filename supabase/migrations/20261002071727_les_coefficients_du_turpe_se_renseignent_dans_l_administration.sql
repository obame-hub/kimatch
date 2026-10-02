-- ══ LES COEFFICIENTS DU TURPE SE RENSEIGNENT DANS L'ADMINISTRATION — William, 02/10/2026 ══
-- « Existe-t-il une table me permettant de renseigner les coefficients du TURPE, utile pour le calcul
-- de ce dernier ? Si oui, il faudrait créer un accès depuis la page Administration. »
--
-- Le modèle existait, vide : `versions_turpe` (une ligne, TURPE 7 HTA-BT au 01/08/2025),
-- `formules_tarifaires_turpe`, `composantes_tarifaires`, `coefficients_turpe`, `postes_tarifaires`.
-- On y pose la GRILLE, jamais les valeurs : les coefficients se saisissent depuis la délibération de
-- la CRE, à l'écran. Rien n'est inventé ici.
--
--   TURPE annuel = CG + CC + Σ b(poste) × puissance souscrite pondérée + Σ c(poste) × énergie du poste

-- 1. Les quatre composantes qui font le TURPE d'un point de soutirage.
insert into public.composantes_tarifaires (type_energie_id, code, libelle, description, categorie, unite, est_reglementee, est_calculable, ordre, actif)
select e.id, c.code, c.libelle, c.description, 'ACHEMINEMENT', c.unite, true, true, c.ordre, true
from public.types_energies e
cross join (values
  ('TURPE_CG', 'Composante de gestion', 'CG : forfait annuel de gestion du contrat (contrat unique).', '€/an', 1),
  ('TURPE_CC', 'Composante de comptage', 'CC : forfait annuel de comptage.', '€/an', 2),
  ('TURPE_CS_PUISSANCE', 'Soutirage · puissance', 'CS, part fixe : coefficient b par poste, appliqué à la puissance souscrite pondérée.', '€/kVA/an', 3),
  ('TURPE_CS_ENERGIE', 'Soutirage · énergie', 'CS, part variable : coefficient c par poste, appliqué à l''énergie soutirée sur le poste.', '€/MWh', 4)
) as c(code, libelle, description, unite, ordre)
where upper(e.code) = 'ELECTRICITE'
on conflict (type_energie_id, code) do nothing;

-- 2. Les formules tarifaires d'acheminement (FTA) du TURPE 7 HTA-BT, telles qu'Enedis les code.
insert into public.formules_tarifaires_turpe (version_turpe_id, code, libelle, domaine_tension, segment_compteur, type_utilisation, nombre_postes_tarifaires, puissance_min_kva, puissance_max_kva, est_selectionnable, actif, ordre)
select v.id, f.code, f.libelle, f.domaine, f.segment, f.utilisation, f.postes, f.pmin, f.pmax, true, true, f.ordre
from public.versions_turpe v
cross join (values
  ('BTINFCUST', 'BT ≤ 36 kVA · Courte utilisation, sans différenciation temporelle', 'BT_INF_36', 'C5', 'COURTE', 1, 0, 36, 1),
  ('BTINFMUDT', 'BT ≤ 36 kVA · Moyenne utilisation, heures pleines / creuses', 'BT_INF_36', 'C5', 'MOYENNE', 2, 0, 36, 2),
  ('BTINFLU', 'BT ≤ 36 kVA · Longue utilisation', 'BT_INF_36', 'C5', 'LONGUE', 1, 0, 36, 3),
  ('BTINFCU4', 'BT ≤ 36 kVA · Courte utilisation, quatre postes', 'BT_INF_36', 'C5', 'COURTE', 4, 0, 36, 4),
  ('BTINFMU4', 'BT ≤ 36 kVA · Moyenne utilisation, quatre postes', 'BT_INF_36', 'C5', 'MOYENNE', 4, 0, 36, 5),
  ('BTSUPCU4', 'BT > 36 kVA · Courte utilisation, quatre postes', 'BT_SUP_36', 'C4', 'COURTE', 4, 36, 250, 6),
  ('BTSUPLU4', 'BT > 36 kVA · Longue utilisation, quatre postes', 'BT_SUP_36', 'C4', 'LONGUE', 4, 36, 250, 7),
  ('HTACU5', 'HTA · Courte utilisation, pointe fixe, cinq postes', 'HTA', 'C2 / C3', 'COURTE', 5, null, null, 8),
  ('HTACUPM5', 'HTA · Courte utilisation, pointe mobile, cinq postes', 'HTA', 'C2 / C3', 'COURTE', 5, null, null, 9),
  ('HTALU5', 'HTA · Longue utilisation, pointe fixe, cinq postes', 'HTA', 'C2 / C3', 'LONGUE', 5, null, null, 10),
  ('HTALUPM5', 'HTA · Longue utilisation, pointe mobile, cinq postes', 'HTA', 'C2 / C3', 'LONGUE', 5, null, null, 11)
) as f(code, libelle, domaine, segment, utilisation, postes, pmin, pmax, ordre)
where v.code = 'TURPE_7_HTA_BT'
on conflict (version_turpe_id, code) do nothing;

-- 3. Un coefficient par formule × composante × poste : la case de l'écran, et rien en double.
create unique index if not exists uq_coefficients_turpe_case
  on public.coefficients_turpe (formule_tarifaire_id, composante_tarifaire_id, poste_tarifaire_id) nulls not distinct;

-- 4. Tout le monde lit ; seuls l'administration et le pricing écrivent (la suppression reste aux
--    administrateurs). Une valeur réglementaire changée par erreur fausserait tous les budgets.
do $$
declare t text;
begin
  foreach t in array array['versions_turpe', 'formules_tarifaires_turpe', 'composantes_tarifaires', 'coefficients_turpe'] loop
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format('drop policy if exists %I on public.%I', t || '_ecriture', t);
    execute format('drop policy if exists %I on public.%I', t || '_modification', t);
    execute format('drop policy if exists %I on public.%I', t || '_suppression', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_lecture', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (has_role_acces(auth.uid(), array[''SUPER_ADMIN'', ''ADMIN'', ''PRICING'']))', t || '_ecriture', t);
    execute format('create policy %I on public.%I for update to authenticated using (has_role_acces(auth.uid(), array[''SUPER_ADMIN'', ''ADMIN'', ''PRICING''])) with check (has_role_acces(auth.uid(), array[''SUPER_ADMIN'', ''ADMIN'', ''PRICING'']))', t || '_modification', t);
    execute format('create policy %I on public.%I for delete to authenticated using (has_role_acces(auth.uid(), array[''SUPER_ADMIN'', ''ADMIN'']))', t || '_suppression', t);
  end loop;
end $$;

-- 5. LES COMMUNS SAISIS À LA MAIN DISPARAISSENT — William, 01/10/2026 : « supprime complètement le
--    concept du bloc communs ». Ces cinq colonnes, ajoutées le même jour par `le_moteur_du_pricing`,
--    n'ont jamais été remplies (0 ligne) et ne sont plus lues : le TURPE vient désormais de la grille
--    ci-dessus, les taxes viendront des tables réglementées.
alter table public.versions_recommandation_compteurs
  drop column if exists prix_atrd_mwh,
  drop column if exists prix_agn_mwh,
  drop column if exists cta_annuel_ht,
  drop column if exists prix_turpe_annuel_ht,
  drop column if exists accise_mwh;

-- ══ LES INDICATEURS « CLIENT » SUIVENT LA MÊME RÈGLE — 02/10/2026 ══
-- Suite de `un_contrat_client_ne_compte_que_signe_et_valide` (William : « oui aligne ») : le score
-- qualité du compteur (`a_contrat`), la synthèse du patrimoine et le statut client de la liste des
-- comptes ne comptaient un contrat que par `actif` et ses dates. Ils passent par `fn_contrat_compte`.
-- Les vues sont réécrites depuis leur définition en place : seule la condition change, les colonnes
-- et les options (security_invoker) restent.
do $$
declare
  v record; d text; nd text; opts text;
begin
  for v in select * from (values
    ('v_comptes_liste', 'ct.actif AND (ct.date_fin IS NULL OR ct.date_fin >= CURRENT_DATE)', 'fn_contrat_compte(ct.*) AND (ct.date_fin IS NULL OR ct.date_fin >= CURRENT_DATE)'),
    ('v_patrimoine_synthese', 'c.actif AND (c.date_fin IS NULL OR c.date_fin >= CURRENT_DATE)', 'fn_contrat_compte(c.*) AND (c.date_fin IS NULL OR c.date_fin >= CURRENT_DATE)'),
    ('v_qualite_compteur', 'c.actif AND (c.date_fin IS NULL OR c.date_fin >= CURRENT_DATE)', 'fn_contrat_compte(c.*) AND (c.date_fin IS NULL OR c.date_fin >= CURRENT_DATE)')
  ) as t(nom, avant, apres)
  loop
    select pg_get_viewdef(c.oid, true), coalesce(' with (' || array_to_string(c.reloptions, ', ') || ')', '')
      into d, opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v.nom and c.relkind = 'v';
    if d is null then raise exception 'Vue % introuvable', v.nom; end if;
    nd := replace(d, v.avant, v.apres);
    if nd = d then raise exception 'Condition introuvable dans %', v.nom; end if;
    execute format('create or replace view public.%I%s as %s', v.nom, opts, nd);
  end loop;
end $$;

-- LE MANDAT OUVRE LES FOURNISSEURS — William, 06/10/2026 : « périmètre couvert par un mandat Kiwee
-- (donne accès à tous les fournisseurs Kiwee) et par un mandat ENERGIX (optionnel — donne accès à
-- tous les fournisseurs ENERGIX) ». Une règle de plus, paramétrable comme les autres
-- (`src/lib/eligibility.ts`, clé `mandat`).
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_operator, value_operator, sort_order)
select 'mandat', 'Mandat du périmètre',
       'Fournisseur KiWee : un mandat KiWee actif doit couvrir les compteurs. Fournisseur Energix : un mandat Energix actif.',
       'account', true, 'eq', 'OU', 13
where not exists (select 1 from public.eligibility_rules where rule_key = 'mandat');

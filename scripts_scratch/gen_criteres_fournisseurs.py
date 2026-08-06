# Genere UNE migration auto-suffisante pour le moteur d'eligibilite, a partir de l'export Tools
# du 04/08/2026 (tools_data/*.csv) : DDL + 12 regles + 21 mappings + 19 fournisseurs.
import csv, io

ALIAS = {'ALTERNA ENERGIE': 'ALTERNA'}  # noms differents entre Tools et Kimatch

def arr(v):
    v = (v or '').strip()
    if not v or v == '{}':
        return "'{}'"
    inner, parts, cur, q = v[1:-1], [], '', False
    for ch in inner:
        if ch == '"':
            q = not q
        elif ch == ',' and not q:
            parts.append(cur); cur = ''
        else:
            cur += ch
    if cur:
        parts.append(cur)
    return "'{" + ','.join('"' + p.replace('\\', '\\\\').replace('"', '\\"') + '"' for p in parts if p) + "}'"

def num(v):
    v = (v or '').strip()
    return v if v else 'null'

def txt(v):
    v = (v or '').strip()
    return "'" + v.replace("'", "''") + "'" if v else 'null'

def boo(v, default='true'):
    v = (v or '').strip()
    return default if not v else ('true' if v == 't' else 'false')

sup = list(csv.DictReader(io.open('tools_data/suppliers.csv', encoding='utf-8')))
rules = list(csv.DictReader(io.open('tools_data/eligibility_rules.csv', encoding='utf-8')))
maps = list(csv.DictReader(io.open('tools_data/mapping_rules.csv', encoding='utf-8')))

out = [f"""-- ============================================================
-- Moteur d'eligibilite fournisseur : schema + donnees reelles de Tools
-- ({len(sup)} fournisseurs, {len(rules)} regles, {len(maps)} mappings, export du 04/08/2026)
--
-- Remplace 20260804240000_eligibility_engine.sql, qui n'a JAMAIS ete appliquee en production :
-- verifie le 06/08, la colonne comptes_fournisseurs.partnership n'existe meme pas
-- (ERROR 42703). Consequence : dans le wizard Cotation les 52 fournisseurs sont grises
-- « Partenariat non reconnu », aucune cotation n'est possible, le circuit s'arrete a l'opportunite.
--
-- Cette version est AUTO-SUFFISANTE (cree tables et colonnes avant d'inserer) et corrige un piege
-- de l'originale : elle matche les comptes par nom exact, or « ALTERNA ENERGIE » cote Tools
-- s'appelle « ALTERNA » cote Kimatch. Le select ne renvoyant rien, l'insert etait saute SANS
-- ERREUR. Verifie nom par nom contre les 52 fournisseurs reels : c'est le seul ecart.
--
-- Entierement idempotente : rejouable sans risque.
-- ============================================================

-- ---------- 1. Schema ----------
create table if not exists public.eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  name text not null,
  description text,
  level text not null default 'opportunity',
  is_active boolean not null default true,
  condition_field text,
  condition_operator text not null default 'eq',
  condition_value text,
  value_operator text not null default 'OU',
  sort_order int not null default 0,
  date_creation timestamptz not null default now()
);
alter table public.eligibility_rules enable row level security;
drop policy if exists "authenticated_all" on public.eligibility_rules;
create policy "authenticated_all" on public.eligibility_rules for all to authenticated using (true) with check (true);

create table if not exists public.mapping_rules (
  id uuid primary key default gen_random_uuid(),
  field_name text not null,
  salesforce_value text not null,
  supplier_value text not null,
  condition_field text,
  condition_value text,
  operator text not null default 'OU',
  date_creation timestamptz not null default now()
);
alter table public.mapping_rules enable row level security;
drop policy if exists "authenticated_all" on public.mapping_rules;
create policy "authenticated_all" on public.mapping_rules for all to authenticated using (true) with check (true);

alter table public.comptes_fournisseurs
  add column if not exists partnership text,
  add column if not exists intermediary text,
  add column if not exists targets text[] not null default '{{}}',
  add column if not exists energy_types text[] not null default '{{}}',
  add column if not exists segments text[] not null default '{{}}',
  add column if not exists tariffs text[] not null default '{{}}',
  add column if not exists profiles text[] not null default '{{}}',
  add column if not exists min_consumption numeric,
  add column if not exists max_consumption numeric,
  add column if not exists min_ellipro_score numeric,
  add column if not exists max_ddf date,
  add column if not exists max_dff date,
  add column if not exists response_delay_days int,
  add column if not exists update_delay_days int,
  add column if not exists notice_days int,
  add column if not exists partner_category text,
  add column if not exists is_active boolean not null default true;

-- ---------- 2. Regles d'eligibilite ({len(rules)}) ----------"""]

for r in rules:
    out.append(f"""insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ({txt(r['rule_key'])}, {txt(r['name'])}, {txt(r['description'])}, {txt(r['level'])}, {boo(r['is_active'])}, {txt(r['condition_field'])}, {txt(r['condition_operator']) if (r['condition_operator'] or '').strip() else "'eq'"}, {txt(r['condition_value'])}, {txt(r['value_operator']) if (r['value_operator'] or '').strip() else "'OU'"}, {num(r['sort_order']) if (r['sort_order'] or '').strip() else 0})
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;""")

out.append(f"\n-- ---------- 3. Regles de mapping ({len(maps)}) ----------")
for m in maps:
    cf, cv = (m['condition_field'] or '').strip(), (m['condition_value'] or '').strip()
    out.append(f"""insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select {txt(m['field_name'])}, {txt(m['salesforce_value'])}, {txt(m['supplier_value'])}, {txt(cf)}, {txt(cv)}, {txt(m['operator']) if (m['operator'] or '').strip() else "'OU'"}
where not exists (
  select 1 from public.mapping_rules
  where field_name = {txt(m['field_name'])} and salesforce_value = {txt(m['salesforce_value'])}
    and supplier_value = {txt(m['supplier_value'])}
    and condition_field is not distinct from {txt(cf)}
    and condition_value is not distinct from {txt(cv)});""")

out.append(f"\n-- ---------- 4. Criteres des {len(sup)} fournisseurs ----------")
for r in sup:
    nom_tools = r['name'].strip()
    nom_kimatch = ALIAS.get(nom_tools.upper(), nom_tools)
    energies = r['energy_types'] or ''
    note = f"  (nomme « {nom_kimatch} » dans Kimatch)" if nom_kimatch != nom_tools else ""
    out.append(f"""-- {nom_tools}{note}
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, {'true' if 'lectricit' in energies else 'false'}, {'true' if 'Gaz' in energies else 'false'}, 'ACTIF',
  {txt(r['partnership'])}, {txt(r['intermediary'])}, {arr(r['targets'])}, {arr(r['energy_types'])},
  {arr(r['segments'])}, {arr(r['tariffs'])}, {arr(r['profiles'])},
  {num(r['min_consumption'])}, {num(r['max_consumption'])}, {num(r['min_ellipro_score'])},
  {txt(r['max_ddf'])}::date, {txt(r['max_dff'])}::date,
  {num(r['response_delay_days'])}, {num(r['update_delay_days'])}, {num(r['notice_days'])},
  {txt(r['partner_category'])}, {boo(r['is_active'])}
from public.comptes where upper(nom) = upper({txt(nom_kimatch)}) and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;""")

out.append(f"""
-- ---------- Controle ----------
-- Doit renvoyer {len(sup)}. Moins = un fournisseur non retrouve par nom (ajouter un alias).
--   select count(*) from public.comptes_fournisseurs where partnership is not null;
--   select count(*) from public.eligibility_rules;   -- {len(rules)}
--   select count(*) from public.mapping_rules;       -- {len(maps)}
--   select c.nom, cf.partnership, cf.intermediary
--   from public.comptes_fournisseurs cf join public.comptes c on c.id = cf.compte_id
--   where cf.partnership is not null order by c.nom;
""")

io.open('out.sql', 'w', encoding='utf-8').write('\n'.join(out))
print(f'{len(sup)} fournisseurs, {len(rules)} regles, {len(maps)} mappings')

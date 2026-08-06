# Genere la migration qui applique les criteres d'eligibilite des 19 fournisseurs de Tools
# aux comptes_fournisseurs de Kimatch, a partir de l'export suppliers.csv fourni le 04/08/2026.
import csv, io

# Noms differents entre Tools et Kimatch. Sans cette table, le SELECT ne matche rien et l'INSERT
# est saute EN SILENCE -- c'est ce qui serait arrive a ALTERNA en rejouant la migration d'origine.
ALIAS = {'ALTERNA ENERGIE': 'ALTERNA'}

def arr(v):
    """Convertit un tableau Postgres exporte ({a,b}) en litteral SQL."""
    v = (v or '').strip()
    if not v or v == '{}':
        return "'{}'"
    inner = v[1:-1]
    parts, cur, q = [], '', False
    for ch in inner:
        if ch == '"':
            q = not q
        elif ch == ',' and not q:
            parts.append(cur); cur = ''
        else:
            cur += ch
    if cur:
        parts.append(cur)
    esc = ','.join('"' + p.replace('\\', '\\\\').replace('"', '\\"') + '"' for p in parts if p)
    return "'{" + esc + "}'"

def num(v):
    v = (v or '').strip()
    return v if v else 'null'

def txt(v):
    v = (v or '').strip()
    return "'" + v.replace("'", "''") + "'" if v else 'null'

rows = list(csv.DictReader(io.open('tools_data/suppliers.csv', encoding='utf-8')))

out = ["""-- ============================================================
-- Criteres d'eligibilite des 19 fournisseurs, portes depuis l'export Tools du 04/08/2026
-- (suppliers.csv fourni par Naoelle).
--
-- Pourquoi cette migration alors que 20260804240000_eligibility_engine.sql fait deja ce travail :
-- elle n'a jamais ete appliquee en production. Constat du 06/08 dans le wizard Cotation : les 52
-- fournisseurs sont grises avec « Partenariat non reconnu », donc aucune cotation n'est possible
-- et le circuit s'arrete a l'opportunite.
--
-- Et la rejouer telle quelle aurait laisse un trou : elle matche les comptes par nom exact, or
-- « ALTERNA ENERGIE » cote Tools s'appelle « ALTERNA » cote Kimatch. Le SELECT ne renvoyant rien,
-- l'INSERT est saute SANS ERREUR. Cette version corrige l'alias et compte les lignes traitees.
--
-- Idempotent : ON CONFLICT (compte_id) DO UPDATE. Les 33 autres comptes fournisseurs restent
-- sans partenariat, ce qui est conforme a Tools (ils ne sont pas consultables).
-- ============================================================
"""]

for r in rows:
    nom_tools = r['name'].strip()
    nom_kimatch = ALIAS.get(nom_tools.upper(), nom_tools)
    energies = r['energy_types'] or ''
    elec = 'true' if 'lectricit' in energies else 'false'
    gaz = 'true' if 'Gaz' in energies else 'false'
    actif = 'true' if (r['is_active'] or 't') == 't' else 'false'
    commentaire = f"-- {nom_tools}" + (f"  (nomme « {nom_kimatch} » dans Kimatch)" if nom_kimatch != nom_tools else "")
    out.append(f"""{commentaire}
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, {elec}, {gaz}, 'ACTIF',
  {txt(r['partnership'])}, {txt(r['intermediary'])}, {arr(r['targets'])}, {arr(r['energy_types'])},
  {arr(r['segments'])}, {arr(r['tariffs'])}, {arr(r['profiles'])},
  {num(r['min_consumption'])}, {num(r['max_consumption'])}, {num(r['min_ellipro_score'])},
  {txt(r['max_ddf'])}::date, {txt(r['max_dff'])}::date,
  {num(r['response_delay_days'])}, {num(r['update_delay_days'])}, {num(r['notice_days'])},
  {txt(r['partner_category'])}, {actif}
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
  is_active = excluded.is_active;
""")

out.append("""
-- Controle : doit renvoyer 19. Toute valeur inferieure signale un fournisseur non retrouve par nom.
--   select count(*) from public.comptes_fournisseurs where partnership is not null and partnership <> 'aucun';
--   select c.nom, cf.partnership, cf.intermediary
--   from public.comptes_fournisseurs cf join public.comptes c on c.id = cf.compte_id
--   where cf.partnership is not null order by c.nom;
""")

path = '../../../../../kiwee-os/supabase/migrations/20260806170000_criteres_eligibilite_fournisseurs.sql'
io.open('out.sql', 'w', encoding='utf-8').write('\n'.join(out))
print(f'{len(rows)} fournisseurs generes')
print('alias appliques :', [n for n in ALIAS])

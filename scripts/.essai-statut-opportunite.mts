/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA RÈGLE DE L'ÉCRAN ET CELLE DE LA BASE DONNENT-ELLES LE MÊME PALIER ?
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Depuis le 28/09/2026 c'est la base qui écrit le statut d'une opportunité
 * (`fn_statut_opportunite_calcule`). L'écran garde sa propre transcription (`statutDerive`), qui
 * explique en une phrase ce qu'il reste à faire. Si les deux divergent, l'écran et le pipe du jour
 * se contredisent à nouveau — exactement la panne que William a relevée.
 *
 * Ce script les confronte sur TOUTE la production et nomme chaque désaccord.
 *
 *     npx tsx scripts/.essai-statut-opportunite.mts
 *
 * IL N'ÉCRIT RIEN : la transaction est ouverte en lecture seule, la base refuserait toute écriture.
 */
import fs from 'node:fs'
import pg from 'pg'
import { statutDerive, type MandatPourCouverture } from '../src/lib/statutOpportunite.ts'
import type { Opportunite } from '../src/types/domain.ts'

const url = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]
if (!url) throw new Error('SUPABASE_DB_URL absent de .env.local')

const db = new pg.Client({ connectionString: url.trim().replace(/^["']|["']$/g, ''), ssl: { rejectUnauthorized: false } })
await db.connect()

try {
  await db.query('begin read only')

  /* Les mêmes faits que `fetchOpportunites`, à deux écarts voulus près — ceux de la fonction SQL :
     une recommandation ou un mandat supprimés (`actif = false`) ne comptent pas. */
  const { rows: opps } = await db.query(`
    select o.id, o.reference, o.origine, o.compte_id, o.contact_id, o.signal_id, o.signal_libelle,
           o.qualification_fin, o.motif_cloture, coalesce(o.accord_client, false) as accord_client,
           coalesce((select array_agg(os.site_id) from opportunites_sites os where os.opportunite_id = o.id), '{}') as site_ids,
           coalesce((select array_agg(oc.compteur_id) from opportunites_compteurs oc
                      where oc.opportunite_id = o.id and oc.compteur_id is not null), '{}') as compteur_ids,
           coalesce((select array_agg(oc.compteur_id) from opportunites_compteurs oc
                      where oc.opportunite_id = o.id and oc.ecarte), '{}') as compteurs_ecartes,
           coalesce((select array_agg(r.id) from recommandations r
                      where r.opportunite_id = o.id and r.actif), '{}') as recommandation_ids,
           coalesce((select array_agg(distinct rc.compteur_id) from recommandations_compteurs rc
                      join recommandations r on r.id = rc.recommandation_id
                     where r.opportunite_id = o.id and r.actif), '{}') as compteurs_places,
           public.fn_statut_opportunite_calcule(o.id) as statut_base
      from opportunites o
     where o.actif`)

  const { rows: mandats } = await db.query(`
    select sm.code as statut, m.compte_id,
           coalesce((select array_agg(mc.compteur_id) from mandats_compteurs mc
                      where mc.mandat_id = m.id and mc.caduc_depuis is null), '{}') as compteur_ids
      from mandats m join statuts_mandats sm on sm.id = m.statut_id
     where m.actif`) as { rows: MandatPourCouverture[] }

  const desaccords: string[] = []
  const tally = new Map<string, number>()
  for (const o of opps) {
    const ecran = statutDerive(o as unknown as Opportunite, mandats).code
    tally.set(ecran, (tally.get(ecran) ?? 0) + 1)
    if (ecran !== o.statut_base) desaccords.push(`${o.reference ?? o.id} : écran ${ecran} ≠ base ${o.statut_base}`)
  }

  console.log(`${opps.length} opportunités comparées.`)
  console.log('Répartition :', Object.fromEntries([...tally].sort((a, b) => b[1] - a[1])))
  if (desaccords.length === 0) {
    console.log('✓ Aucun désaccord : la base et l’écran donnent le même palier partout.')
  } else {
    console.log(`✗ ${desaccords.length} désaccord(s) :`)
    for (const d of desaccords) console.log('  ' + d)
    process.exitCode = 1
  }
} finally {
  await db.query('rollback').catch(() => {})
  await db.end()
}

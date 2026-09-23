/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES APPELS CAPTÉS QUI NE SONT ARRIVÉS SUR AUCUNE FICHE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Matthieu, 23/09/2026, sur la piste de florian COSTAL : « il a reçu un appel entrant, je le vois
 * sur Allô mais ce call n'est pas indiqué dans la piste ».
 *
 * ══ CE QU'ON RATTRAPE, ET POURQUOI IL MANQUE ══
 *
 * 365 appels portent leur identifiant Allô dans `appels_en_cours` — avec leur enregistrement, leur
 * transcription et leur résumé — et n'ont AUCUNE interaction sur une fiche. Deux causes, corrigées
 * ce jour dans `api/allo/webhook.ts` :
 *
 *   142 ENTRANTS  le webhook lisait `to_number` quel que soit le sens. Sur un entrant, c'est NOTRE
 *                 ligne : il cherchait donc la fiche derrière le numéro du commercial, ne trouvait
 *                 rien, et l'écriture partait en violation de `interactions_contexte_check`.
 *   223 SORTANTS  numéro composé qui ne correspond à aucune fiche. Même violation, même 500.
 *
 * ══ POURQUOI ALLÔ ET NON LA BASE ══
 *
 * La carte d'un entrant porte notre propre ligne, justement à cause du défaut. Le seul endroit qui
 * sache qui a appelé, c'est Allô. Un appariement par fenêtre de temps entre les deux cartes d'un
 * même appel a été essayé : il ne recouvre que 76 des 130 cas. On ne rattrape pas une donnée à
 * 58 %.
 *
 * ══ CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS ══
 *
 * IL N'ÉCRIT QUE CE QUI MANQUE. Une interaction déjà présente n'est jamais touchée, et le script
 * est rejouable : l'appariement se fait sur `source_externe_id`.
 *
 * IL CORRIGE AUSSI LE NUMÉRO DE LA CARTE quand elle porte notre ligne — sans quoi l'écran des
 * appels non rattachés continuerait d'afficher le numéro du commercial à la place de l'appelant.
 *
 * IL LAISSE DE CÔTÉ CE QU'IL NE SAIT PAS RANGER. Un appelant qu'aucune fiche ne reconnaît reste
 * dans `appels_en_cours`, d'où l'écran « Appels non rattachés » le reprend. C'est sa place.
 *
 *     ALLO_API_KEY="ak_live_…" node scripts/rattraper-appels-sans-interaction.cjs [--essai]
 */
const fs = require('fs')
const { Client } = require('/Users/williamgoupil/Desktop/Kimatch/node_modules/pg')

const CLE = process.env.ALLO_API_KEY
if (!CLE) {
  console.error('\n  Clé manquante. Lancez :\n')
  console.error('    ALLO_API_KEY="ak_live_…" node scripts/rattraper-appels-sans-interaction.cjs\n')
  process.exit(1)
}
const ESSAI = process.argv.includes('--essai')

const urlBase = fs.readFileSync(`${__dirname}/../.env.local`, 'utf8')
  .split('\n').find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '')

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

/** Un lot d'appels chez Allô, par identifiants. Cent au maximum, c'est leur limite. */
async function lot(ids) {
  for (let essai = 0; essai < 3; essai++) {
    const res = await fetch('https://api.withallo.com/v2/api/conversations/items/batch', {
      method: 'POST',
      headers: { Authorization: `Api-Key ${CLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (res.status === 429) {
      const pause = Number(res.headers.get('X-RateLimit-Reset') || 2) * 1000
      console.log(`    429 — pause de ${Math.round(pause / 1000)} s`)
      await attendre(pause)
      continue
    }
    if (!res.ok) throw new Error(`lot : HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    return json.data ?? []
  }
  throw new Error('trois 429 d’affilée, on s’arrête')
}

;(async () => {
  const db = new Client({ connectionString: urlBase, ssl: { rejectUnauthorized: false } })
  await db.connect()

  const { rows: cartes } = await db.query(`
    select a.id, a.source_externe_id, a.sens, a.numero, a.user_email, a.demarre_le
      from appels_en_cours a
     where a.source_externe_id is not null
       and not exists (select 1 from interactions i where i.source_externe_id = a.source_externe_id)
     order by a.demarre_le desc
  `)
  console.log(`\n  ${cartes.length} appels captés sans interaction${ESSAI ? ' (essai, aucune écriture)' : ''}\n`)
  if (cartes.length === 0) { await db.end(); return }

  const { rows: [typeAppel] } = await db.query(`select id from types_interactions where code = 'APPEL'`)
  if (!typeAppel) throw new Error('Le type d’interaction APPEL est absent des tables de référence.')

  let lus = 0, ecrits = 0, numerosCorriges = 0, inconnus = 0
  for (let i = 0; i < cartes.length; i += 100) {
    const tranche = cartes.slice(i, i + 100)
    const parId = new Map((await lot(tranche.map((c) => c.source_externe_id))).map((a) => [a.id, a]))

    for (const carte of tranche) {
      const appel = parId.get(carte.source_externe_id)
      if (!appel) continue
      lus++

      /* LE NUMÉRO DE L'AUTRE, quel que soit le sens : c'est `contact_number` chez Allô, et il est
         juste des deux côtés — c'est précisément ce que le webhook ne savait pas lire. */
      const numero = appel.contact_number
      if (!numero) continue

      const neufDerniers = String(numero).replace(/\D/g, '').slice(-9)
      const { rows: [qui] } = await db.query('select * from qui_appelle($1)', [neufDerniers])
      if (!qui || (!qui.contact_id && !qui.compte_id && !qui.piste_id)) { inconnus++; continue }

      if (ESSAI) { ecrits++; continue }

      /* LA CARTE PORTE NOTRE PROPRE LIGNE sur un entrant : on la remet d'aplomb, sinon l'écran des
         appels non rattachés continue d'afficher le numéro du commercial à la place de l'appelant. */
      if (carte.numero !== numero) {
        await db.query(
          `update appels_en_cours set numero = $1, numero_normalise = $2,
                  contact_id = coalesce(contact_id, $3), compte_id = coalesce(compte_id, $4),
                  piste_id = coalesce(piste_id, $5)
            where id = $6`,
          [numero, neufDerniers, qui.contact_id, qui.compte_id, qui.piste_id, carte.id],
        )
        numerosCorriges++
      }

      const duree = typeof appel.duration === 'number' ? appel.duration : null
      const etiquettes = Array.isArray(appel.tags)
        ? appel.tags.filter((t) => typeof t === 'string' && t.trim())
        : null

      await db.query(
        `insert into interactions (
           type_interaction_id, source_externe_id, date_interaction, objet, resume_ia,
           enregistrement_url, sens, resultat, duree_appel_secondes, duree_minutes,
           appel_manque, messagerie_vocale, numero_correspondant, etiquettes_allo,
           contact_id, compte_id, piste_id, actif
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true)
         on conflict do nothing`,
        [
          typeAppel.id, appel.id, appel.date,
          (appel.summary ? String(appel.summary).slice(0, 200)
            : `Appel ${appel.direction === 'INBOUND' ? 'entrant' : 'sortant'}`),
          appel.summary ?? null, appel.recording_url ?? null,
          appel.direction === 'INBOUND' ? 'ENTRANT' : 'SORTANT',
          appel.result ?? null, duree, duree != null ? Math.round(duree / 60) : null,
          appel.result !== 'ANSWERED', appel.result === 'VOICEMAIL', numero,
          etiquettes && etiquettes.length > 0 ? etiquettes : null,
          qui.contact_id, qui.compte_id, qui.piste_id,
        ],
      )
      ecrits++
    }
    console.log(`  ${Math.min(i + 100, cartes.length)}/${cartes.length} — ${ecrits} écrits, ${inconnus} sans fiche`)
    await attendre(150)
  }

  await db.end()
  console.log(`\n  Terminé.`)
  console.log(`    ${lus} appels relus chez Allô`)
  console.log(`    ${ecrits} interactions ${ESSAI ? 'à écrire' : 'écrites'}`)
  console.log(`    ${numerosCorriges} numéros de carte corrigés`)
  console.log(`    ${inconnus} appelants qu'aucune fiche ne reconnaît — ils restent dans « Appels non rattachés »\n`)
})().catch((e) => { console.error('\n  ' + e.message + '\n'); process.exit(1) })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// QUE PEUT FAIRE LA CLÉ ALLO ?
//
// Allo répond lui-même la liste des portées de la clé sur `GET /v2/api/me`. C'est la seule source
// fiable : l'interface d'Allo peut afficher une case cochée sans que la clé l'ait vraiment, et
// l'inverse. On demande donc au service, pas à l'écran.
//
// LECTURE SEULE, ET RIEN N'EST ÉCRIT dans la file d'appel de personne. La clé n'est jamais affichée.
//
//   node scripts/verifier-cle-allo.cjs
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')

const RACINE = path.resolve(__dirname, '..')

/** Ce dont Kimatch a besoin, et à quoi ça sert. */
const ATTENDUES = [
  ['CONVERSATIONS_READ', 'lire les appels, leurs résumés et leurs transcriptions'],
  ['DIALING_QUEUE_READ_WRITE', 'déposer un numéro dans la file d’appel — le bouton « Appeler »'],
  ['WEBHOOKS_READ_WRITE', 'recevoir les nouveaux appels au fil de l’eau'],
]

;(async () => {
  const chemin = path.join(RACINE, '.env.local')
  if (!fs.existsSync(chemin)) throw new Error('.env.local introuvable : ' + chemin)
  const cle = fs.readFileSync(chemin, 'utf8').match(/^ALLO_API_KEY=(.+)$/m)?.[1].trim()
  if (!cle) throw new Error('ALLO_API_KEY absent de .env.local.')

  const res = await fetch('https://api.withallo.com/v2/api/me', {
    headers: { Authorization: `Api-Key ${cle}` },
  })
  const texte = (await res.text()).replace(/ak_(live|test)_[A-Za-z0-9_-]+/g, 'ak_***')
  if (!res.ok) {
    console.error(`Allo répond ${res.status} : ${texte.slice(0, 200)}`)
    process.exit(1)
  }

  const data = JSON.parse(texte).data ?? {}
  const portees = data.scopes ?? []
  console.log(`\nCompte Allo : ${data.team?.name ?? '—'}`)
  console.log(`Portées de la clé : ${portees.length}\n`)

  let manque = 0
  for (const [nom, aQuoi] of ATTENDUES) {
    const a = portees.includes(nom)
    if (!a) manque += 1
    console.log(`  ${a ? '✓' : '✗'} ${nom.padEnd(26)} ${aQuoi}`)
  }

  const enPlus = portees.filter((p) => !ATTENDUES.some(([n]) => n === p))
  if (enPlus.length > 0) console.log(`\n  autres portées présentes : ${enPlus.join(', ')}`)

  if (manque === 0) {
    console.log('\n✓ La clé a tout ce qu’il faut.')
  } else {
    console.log(`\n✗ ${manque} portée(s) manquante(s). Dans Allo : réglages du workspace → API,`)
    console.log('  ouvrir la clé, cocher les portées ci-dessus marquées ✗, enregistrer.')
    process.exit(1)
  }
})().catch((e) => { console.error(e.message); process.exit(1) })

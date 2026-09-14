// ════════════════════════════════════════════════════════════════════════════════════════════════
// UN LIEN DE CONNEXION, QUAND LE COURRIEL NE PEUT PLUS PARTIR
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ══ LA JOURNÉE QUI A RENDU CE SCRIPT NÉCESSAIRE ══
//
// Le 14/09/2026, la bascule des clés d'accès Supabase a invalidé toutes les sessions d'un coup.
// Treize personnes se sont reconnectées en même temps — et le service de courriel intégré de
// Supabase n'en envoie que DEUX par heure, limite partagée et non modifiable tant qu'on n'a pas
// son propre fournisseur SMTP.
//
// Résultat : les deux premiers liens sont partis en dix secondes, et toute l'équipe est restée
// dehors. Le formulaire de connexion ne servait plus à rien, puisqu'il ne sait faire qu'une chose —
// demander un courriel.
//
// ══ CE QUE FAIT CE SCRIPT ══
//
// `admin/generate_link` FABRIQUE le lien et le RETOURNE, au lieu de l'expédier. La limite porte sur
// l'envoi : ne rien envoyer ne consomme rien. C'est la seule porte quand le quota est épuisé.
//
// Réservé à la clé de service, et c'est normal : ce lien ouvre une session au nom de quelqu'un.
// Il vaut une heure et ne sert qu'une fois.
//
// ══ CE QU'IL FAUT DIRE À LA PERSONNE ══
//
// DE L'OUVRIR EN NAVIGATION PRIVÉE. Le 14/09, Matthieu a cliqué sur un lien valide, a été redirigé,
// et l'application lui a redemandé son adresse : son onglet faisait tourner le code d'avant la
// bascule, incapable d'échanger le jeton contre une session. Une fenêtre privée n'a pas de cache,
// donc pas de vieux code — c'est la seule façon de ne pas dépendre de ce qu'il a dans son
// navigateur.
//
// (Depuis, l'application se recharge d'elle-même quand sa clé est refusée — voir `src/lib/
// supabase.ts`. Mais ça ne protège que ceux qui ont déjà chargé la version corrigée.)
//
// Usage : npm run lien -- prenom.nom@kiwee-energie.fr
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

const adresse = process.argv[2]
if (!adresse) { console.error('Donne une adresse : npm run lien -- prenom.nom@kiwee-energie.fr'); process.exit(1) }

;(async () => {
  const url = env('VITE_SUPABASE_URL')
  const cle = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')

  const r = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'magiclink',
      email: adresse,
      /* OÙ LE LIEN RAMÈNE. Sans cette adresse, Supabase renvoie vers son URL par défaut et la
         session se pose sur le mauvais domaine — on se retrouve connecté nulle part. */
      options: { redirect_to: 'https://kimatch.fr' },
    }),
    signal: AbortSignal.timeout(25000),
  })

  const corps = await r.json().catch(() => null)
  if (!r.ok) {
    console.error(`\n✗ HTTP ${r.status} — ${JSON.stringify(corps).slice(0, 200)}\n`)
    process.exit(1)
  }

  const lien = corps?.properties?.action_link ?? corps?.action_link
  if (!lien) {
    console.error('\n✗ Le lien n’est pas dans la réponse :', JSON.stringify(corps).slice(0, 300), '\n')
    process.exit(1)
  }

  console.log(`\n══ LIEN DE CONNEXION POUR ${adresse} ══\n`)
  console.log(lien)
  console.log('\nÀ coller dans le navigateur. Valable une heure, utilisable UNE fois.')
  console.log('Aucun courriel n’a été envoyé : le quota n’a pas bougé.\n')
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1) })

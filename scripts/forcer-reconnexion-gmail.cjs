// ════════════════════════════════════════════════════════════════════════════════════════════════
// FORCER LA RECONNEXION GMAIL
//
// Naoëlle, 15/09/2026 : « déconnecte-les pour que ce soit obligatoire de se connecter ».
//
// Depuis le 14/09, Kimatch va chercher dans Gmail les réponses des clients. Ce droit de LECTURE
// n'existait pas dans les connexions antérieures, et un jeton ne gagne pas un droit après coup :
// il faut refaire la connexion. Un rappel, même sur le tableau de bord, se remet à plus tard —
// supprimer le jeton rend le geste inévitable, puisque l'envoi de mail passe par lui.
//
// ── CE QUE ÇA COÛTE, ET QUI LE PAIE ──
//
// Entre l'exécution de ce script et sa reconnexion, la personne NE PEUT PLUS ENVOYER DE MAIL depuis
// Kimatch. C'est le prix voulu : le bandeau du tableau de bord explique quoi faire, et le geste
// prend une trentaine de secondes. Rien n'est perdu — un jeton supprimé se refait, il ne se répare
// pas.
//
// ── DEUX EXCLUSIONS, ET POURQUOI ──
//
//   w.goupil  IL L'A DÉJÀ FAIT, le 15/09 à 9 h 35, et sa lecture fonctionne (vérifié : un
//             rapatriement a tourné sans erreur à 16 h 20). Le déconnecter défferait son travail
//             et lui redemanderait ce qu'il vient de donner.
//   obame     DISPENSÉ à la demande de Naoëlle. Même exclusion que dans `BandeauGmail.tsx` —
//             les deux listes disent la même chose et doivent le dire pareil.
//
//   node scripts/forcer-reconnexion-gmail.cjs --simulation   montre qui serait déconnecté
//   node scripts/forcer-reconnexion-gmail.cjs                déconnecte
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.join(__dirname, '..')
const DISPENSES = ['obame@kiwee-energie.fr']

for (const l of fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const simulation = process.argv.includes('--simulation')

;(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL })
  await c.connect()

  /* LA LECTURE DÉJÀ ACCORDÉE EST LA SEULE DISPENSE AUTOMATIQUE. `null` ne compte pas : il veut dire
     « jamais vérifié », pas « en règle ». */
  const { rows: cibles } = await c.query(
    `select p.id, p.email, t.email_gmail, t.lecture_autorisee, t.date_connexion
       from public.profils p
       join public.profils_gmail_tokens t on t.profil_id = p.id
      where t.lecture_autorisee is distinct from true
        and p.email <> all($1::text[])
      order by p.email`,
    [DISPENSES],
  )

  const { rows: gardes } = await c.query(
    `select p.email, t.lecture_autorisee
       from public.profils p
       join public.profils_gmail_tokens t on t.profil_id = p.id
      where t.lecture_autorisee is not distinct from true
         or p.email = any($1::text[])
      order by p.email`,
    [DISPENSES],
  )

  console.log('À DÉCONNECTER :')
  for (const r of cibles) {
    console.log(`  ${r.email.padEnd(32)} connecté le ${new Date(r.date_connexion).toLocaleDateString('fr-FR')}`
      + `  lecture=${r.lecture_autorisee}`)
  }
  console.log('CONSERVÉS :')
  for (const r of gardes) console.log(`  ${r.email.padEnd(32)} lecture=${r.lecture_autorisee}`)

  if (simulation) {
    console.log('\n--simulation : rien n’a été supprimé.')
    await c.end()
    return
  }

  const ids = cibles.map((r) => r.id)
  const { rowCount } = await c.query('delete from public.profils_gmail_tokens where profil_id = any($1::uuid[])', [ids])

  /* LE GARDE-FOU PORTE SUR LES LIGNES QUE CE SCRIPT ÉCRIT, pas sur la table entière : il vérifie
     que les comptes conservés le sont toujours, et que les cibles sont bien parties. */
  const { rows: apres } = await c.query(
    `select count(*)::int as n from public.profils_gmail_tokens where profil_id = any($1::uuid[])`, [ids])
  const { rows: intacts } = await c.query(
    `select count(*)::int as n from public.profils_gmail_tokens t
       join public.profils p on p.id = t.profil_id
      where t.lecture_autorisee is not distinct from true or p.email = any($1::text[])`, [DISPENSES])

  console.log(`\n${rowCount} connexion(s) supprimée(s).`)
  if (apres[0].n !== 0) throw new Error(`${apres[0].n} cible(s) subsistent.`)
  if (intacts[0].n !== gardes.length) {
    throw new Error(`Les comptes à conserver sont passés de ${gardes.length} à ${intacts[0].n}.`)
  }
  console.log(`${intacts[0].n} connexion(s) conservée(s), intactes.`)
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })

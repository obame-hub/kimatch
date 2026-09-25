/**
 * SUIVRE UN VRAI APPEL, EN DIRECT, PENDANT QU'IL SE PASSE
 *
 * Naoelle, 23/09/2026 : « est-ce que tu as teste l'appel et la modale, essaie avec le 0782455786,
 * tout est connecte : l'app, Allo desktop, Kimatch ».
 *
 * Je ne peux pas passer l'appel moi-meme. Ce script fait l'autre moitie : il regarde la base
 * pendant qu'elle appelle, et dit ce qui arrive vraiment, evenement par evenement.
 *
 * CE QU'IL SURVEILLE, et pourquoi ces trois choses precisement :
 *   1. `appels_en_cours` sur son compte Allo  -> le webhook recoit-il call.triggered / answered ?
 *   2. `termine_le`                           -> Allo envoie-t-il call.completed cette fois-ci ?
 *   3. l'interaction non rattachee            -> c'est CE QUE LA MODALE GUETTE. Si elle apparait,
 *                                                la modale doit s'ouvrir dans les 10 secondes.
 */
const fs = require('fs')
const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const URL = env('VITE_SUPABASE_URL')
const CLE = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const ALLO = 'w.goupil@kiwee-energie.fr'      // le compte Allo que Naoelle opere
const WILLIAM = '14483439-27d3-4e48-b0db-b074b4fe2f4a'
const MINUTES = Number(process.argv[2] || 5)

const q = async (c) => {
  const r = await fetch(URL + '/rest/v1/' + c, { headers: { apikey: CLE, Authorization: 'Bearer ' + CLE } })
  return r.ok ? JSON.parse(await r.text()) : []
}
const heure = () => new Date().toLocaleTimeString('fr-FR')

;(async () => {
  console.log('Je regarde la base pendant ' + MINUTES + ' minutes. Passe l appel maintenant.')
  console.log('Compte Allo suivi : ' + ALLO)
  console.log('')

  const vus = new Set()
  const etats = new Map()
  const fin = Date.now() + MINUTES * 60000

  // On note ce qui existe DEJA, pour ne signaler que le nouveau.
  for (const i of await q('interactions?select=id&auteur_profil_id=eq.' + WILLIAM + '&order=date_interaction.desc&limit=50')) vus.add(i.id)
  for (const a of await q('appels_en_cours?select=id,termine_le&user_email=eq.' + ALLO + '&order=demarre_le.desc&limit=20')) etats.set(a.id, a.termine_le)

  while (Date.now() < fin) {
    for (const a of await q('appels_en_cours?select=id,numero,demarre_le,decroche_le,termine_le,termine_par,contact_id&user_email=eq.' + ALLO + '&order=demarre_le.desc&limit=5')) {
      if (!etats.has(a.id)) {
        console.log(heure() + '  APPEL OUVERT   ' + a.numero + (a.decroche_le ? '  (deja decroche)' : '  (ca sonne)'))
        etats.set(a.id, a.termine_le)
      } else if (etats.get(a.id) !== a.termine_le && a.termine_le) {
        console.log(heure() + '  APPEL TERMINE  ' + a.numero + '  par ' + a.termine_par + '  <- Allo a bien envoye call.completed')
        etats.set(a.id, a.termine_le)
      }
    }

    const sel = 'id,date_interaction,contact_id,compte_id,type:types_interactions!inner(code)'
    for (const i of await q('interactions?select=' + sel + '&type.code=eq.APPEL&auteur_profil_id=eq.' + WILLIAM + '&opportunite_id=is.null&recommandation_id=is.null&requete_id=is.null&piste_id=is.null&order=date_interaction.desc&limit=3')) {
      if (!vus.has(i.id)) {
        vus.add(i.id)
        console.log(heure() + '  INTERACTION NON RATTACHEE  ' + i.id.slice(0, 8) + '  datee ' + i.date_interaction)
        console.log('            -> c est ce que la modale guette. Elle doit s ouvrir dans les 10 s sur Kimatch.')
      }
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  console.log('')
  console.log('Fin de la surveillance.')
})()

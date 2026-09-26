import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomBytes } from 'crypto'
import { lire } from './_cle.js'
import { envoyer, messageDeLien } from './_mail.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POST /api/partenaire/demander-acces — IL DEMANDE SON LIEN LUI-MÊME
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « je préfère qu'ils reçoivent ou un code ou un lien ou quelque chose dans
 * leur boîte mail afin qu'ils soient indépendants et n'attendent pas notre clé de notre part ».
 *
 * ══ LA RÉPONSE EST TOUJOURS LA MÊME ══
 *
 * Adresse connue ou inconnue, contact actif ou non, compte partenaire ou client : la réponse est
 * « si cette adresse nous est connue, vous allez recevoir un lien ». Distinguer les cas
 * permettrait d'éprouver des adresses une par une pour savoir qui travaille avec KiWee — et cette
 * page est ouverte sur Internet.
 *
 * LE TEMPS DE RÉPONSE AUSSI DOIT SE RESSEMBLER : on répond avant d'envoyer le mail. Une réponse
 * lente pour une adresse connue et rapide pour une inconnue dirait la même chose que deux messages
 * différents.
 *
 * ══ CE QUI OUVRE DROIT À UN LIEN ══
 *
 *   · un contact ACTIF
 *   · dont le compte est de type PARTENAIRE
 *
 * C'est exactement la règle de `verifie_acces_partenaire` pour l'accès Kimatch. On ne la recopie
 * pas au hasard : on interroge les mêmes tables, pour que les deux chemins ne divergent jamais.
 *
 * ══ ON NE LAISSE PAS DEMANDER EN BOUCLE ══
 *
 * Un lien déjà envoyé il y a moins de deux minutes n'est pas réémis : on répond la même chose, sans
 * rien faire. Sans cela, une boucle remplirait la boîte d'un partenaire et la table de jetons.
 */

const VALIDITE_LIEN_HEURES = 24

function empreinte(x: string): string {
  return createHash('sha256').update(x).digest('hex')
}

/** L'adresse publique, déduite de la requête — pas codée en dur : le même code sert en local et en
 *  production, et un lien qui pointe vers le mauvais domaine dans un mail ne se rattrape pas. */
function base(req: VercelRequest): string {
  const hote = (req.headers['x-forwarded-host'] ?? req.headers.host) as string | undefined
  const protocole = (req.headers['x-forwarded-proto'] as string | undefined)
    ?? (hote?.startsWith('localhost') ? 'http' : 'https')
  return `${protocole}://${hote ?? 'kimatch.fr'}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ erreur: 'Méthode non autorisée.' })
    return
  }

  const brut = (req.body ?? {}) as { email?: string }
  const email = typeof brut.email === 'string' ? brut.email.trim().toLowerCase() : ''

  /* UNE SEULE RÉPONSE, quoi qu'il arrive ensuite. On la prépare ici pour n'avoir aucune chance de
     la faire varier par inadvertance dans une branche. */
  const reponse = {
    ok: true,
    message: 'Si cette adresse nous est connue, vous allez recevoir un lien d’accès dans quelques instants.',
  }

  if (!email || !email.includes('@')) {
    res.status(200).json(reponse)
    return
  }

  const url = process.env.VITE_SUPABASE_URL
  const cle = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) {
    console.error('[partenaire/demander-acces] Supabase non configuré côté serveur.')
    res.status(200).json(reponse)
    return
  }

  /* ══ LE CONTACT DOIT ÊTRE ACTIF, CHEZ UN COMPTE PARTENAIRE ══
     Même règle que `verifie_acces_partenaire` pour l'accès Kimatch. */
  const contacts = await lire<{
    id: string
    prenom: string | null
    compte_id: string
    compte: { type_compte: string | null } | null
  }>(
    `contacts?email=eq.${encodeURIComponent(email)}&actif=eq.true` +
    /* LA RELATION EST NOMMÉE. Depuis que `comptes.contact_partenaire_id` existe (25/09), deux clés
       étrangères relient `contacts` et `comptes` : PostgREST répond 300 « PGRST201 » et refuse de
       choisir. On vise donc celle qui dit « le compte de ce contact ». */
    '&select=id,prenom,compte_id,compte:comptes!contacts_compte_id_fkey(type_compte)&limit=1',
  )

  const contact = contacts && contacts.length > 0 ? contacts[0] : null
  const estPartenaire = contact?.compte?.type_compte === 'partenaire'

  if (!contact || !estPartenaire) {
    /* On répond comme si tout allait bien. Le journal du serveur, lui, garde la trace — c'est là
       qu'on regardera si un partenaire dit ne rien recevoir. */
    console.log(`[partenaire/demander-acces] ${email} : aucun contact partenaire actif.`)
    res.status(200).json(reponse)
    return
  }

  // ── PAS DEUX LIENS EN DEUX MINUTES ──
  const recentes = await lire<{ id: string }>(
    `sessions_partenaires?contact_id=eq.${contact.id}` +
    `&demandee_le=gte.${new Date(Date.now() - 2 * 60 * 1000).toISOString()}` +
    '&select=id&limit=1',
  )
  if (recentes && recentes.length > 0) {
    console.log(`[partenaire/demander-acces] ${email} : un lien vient d’être envoyé, on n’en renvoie pas.`)
    res.status(200).json(reponse)
    return
  }

  // ── LE JETON ──
  const jeton = randomBytes(32).toString('base64url')
  const expire = new Date(Date.now() + VALIDITE_LIEN_HEURES * 3600 * 1000).toISOString()

  const ecriture = await fetch(`${url}/rest/v1/sessions_partenaires`, {
    method: 'POST',
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact_id: contact.id,
      compte_id: contact.compte_id,
      empreinte_lien: empreinte(jeton),
      lien_expire_le: expire,
      ip_demande: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? null,
    }),
  })

  if (!ecriture.ok) {
    console.error(`[partenaire/demander-acces] écriture refusée : ${ecriture.status} ${(await ecriture.text()).slice(0, 200)}`)
    res.status(200).json(reponse)
    return
  }

  /* ON RÉPOND AVANT D'ENVOYER. Le temps de réponse ne doit pas dire si l'adresse est connue, et le
     partenaire n'a aucune raison d'attendre que notre fournisseur de mail ait fini. */
  res.status(200).json(reponse)

  const message = messageDeLien(`${base(req)}/partenaire?acces=${jeton}`, contact.prenom)
  const envoi = await envoyer({ ...message, destinataire: email })
  if (!envoi.envoye) {
    console.error(`[partenaire/demander-acces] ${email} : ${envoi.detail}`)
  }
}

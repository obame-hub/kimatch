import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomBytes } from 'crypto'
import { lire } from './_cle.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POST /api/partenaire/ouvrir-acces — LE LIEN DEVIENT UNE SESSION
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le lien reçu par mail vaut 24 heures et NE SERT QU'UNE FOIS : il s'échange ici contre un jeton de
 * session, que le navigateur garde 30 jours.
 *
 * ══ POURQUOI DEUX JETONS PLUTÔT QU'UN ══
 *
 * Le lien voyage : il est dans un mail, donc dans une boîte, peut-être transféré, peut-être
 * sauvegardé par un antivirus qui l'ouvre pour le vérifier. Le faire valoir 30 jours ferait durer
 * tout cela 30 jours.
 *
 * Le jeton de session, lui, ne voyage pas : il naît ici, part une fois dans la réponse, et vit dans
 * le navigateur. C'est le même partage des rôles que Kimatch, où le lien de connexion vaut quelques
 * minutes et la session plusieurs jours.
 *
 * LE LIEN EST CONSOMMÉ À LA PREMIÈRE OUVERTURE. Un antivirus qui le déplie avant le destinataire
 * grillerait le jeton — d'où le message qui invite simplement à en redemander un, plutôt que de
 * laisser quelqu'un devant une erreur qu'il ne comprend pas.
 */

const VALIDITE_SESSION_JOURS = 30

function empreinte(x: string): string {
  return createHash('sha256').update(x).digest('hex')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ erreur: 'Méthode non autorisée.' })
    return
  }

  const brut = (req.body ?? {}) as { jeton?: string }
  const jeton = typeof brut.jeton === 'string' ? brut.jeton.trim() : ''
  if (!jeton) {
    res.status(400).json({ erreur: 'Lien incomplet.' })
    return
  }

  const url = process.env.VITE_SUPABASE_URL
  const cle = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) {
    res.status(503).json({ erreur: 'Service indisponible.' })
    return
  }

  const lignes = await lire<{
    id: string
    contact_id: string
    compte_id: string
    lien_expire_le: string
    ouverte_le: string | null
    revoquee_le: string | null
    compte: { nom: string } | null
  }>(
    `sessions_partenaires?empreinte_lien=eq.${empreinte(jeton)}` +
    '&select=id,contact_id,compte_id,lien_expire_le,ouverte_le,revoquee_le,compte:comptes(nom)&limit=1',
  )

  const ligne = lignes && lignes.length > 0 ? lignes[0] : null

  /* LES REFUS SE DISTINGUENT, parce qu'ils n'appellent pas la même réaction. Ici, contrairement à
     la demande d'accès, il n'y a rien à protéger : celui qui présente un jeton l'a forcément reçu
     ou inventé, et lui dire « ce lien a expiré » ne renseigne sur personne. Le confondre avec
     « lien inconnu » ferait renoncer quelqu'un à qui il suffisait d'en redemander un. */
  if (!ligne) {
    res.status(401).json({
      erreur: 'Ce lien n’est pas reconnu. Demandez-en un nouveau avec votre adresse e-mail.',
      motif: 'INCONNU',
    })
    return
  }
  if (ligne.revoquee_le) {
    res.status(401).json({
      erreur: 'Cet accès a été retiré. Rapprochez-vous de votre interlocuteur KiWee.',
      motif: 'REVOQUE',
    })
    return
  }
  if (ligne.ouverte_le) {
    res.status(401).json({
      erreur: 'Ce lien a déjà servi. Demandez-en un nouveau avec votre adresse e-mail.',
      motif: 'DEJA_SERVI',
    })
    return
  }
  if (new Date(ligne.lien_expire_le).getTime() < Date.now()) {
    res.status(401).json({
      erreur: 'Ce lien a expiré — ils ne valent que 24 heures. Demandez-en un nouveau.',
      motif: 'EXPIRE',
    })
    return
  }

  // ── LA SESSION ──
  const jetonSession = randomBytes(32).toString('base64url')
  const expire = new Date(Date.now() + VALIDITE_SESSION_JOURS * 86400 * 1000).toISOString()

  const maj = await fetch(`${url}/rest/v1/sessions_partenaires?id=eq.${ligne.id}`, {
    method: 'PATCH',
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      empreinte_sess: empreinte(jetonSession),
      ouverte_le: new Date().toISOString(),
      sess_expire_le: expire,
    }),
  })

  /* UNE ÉCRITURE QUI NE TOUCHE AUCUNE LIGNE REND 200 AVEC UN TABLEAU VIDE, sans erreur. Sans ce
     contrôle, on rendrait un jeton de session que la base ne connaît pas — et le partenaire
     tomberait sur « clé invalide » à la requête suivante, sans rien comprendre. */
  const touchees = maj.ok ? await maj.json() : null
  if (!maj.ok || !Array.isArray(touchees) || touchees.length === 0) {
    console.error(`[partenaire/ouvrir-acces] session non enregistrée : ${maj.status}`)
    res.status(503).json({ erreur: 'Votre accès n’a pas pu être ouvert. Réessayez dans un instant.' })
    return
  }

  res.status(200).json({
    session: jetonSession,
    expire_le: expire,
    partenaire: ligne.compte?.nom ?? null,
  })
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { poserDansLaFileDAppel } from './_client.js'

/**
 * ══ APPELER DEPUIS KIMATCH ══
 *
 * Michel, 26/08/2026 : « quand les commerciaux cliquent sur appeler, ça leur ouvre l'app de leur
 * ordi, alors qu'il veut que ça ouvre l'application Allo directement sur Kimatch. »
 *
 * ══ CE QU'ON CROYAIT IMPOSSIBLE, ET QUI NE L'EST PAS ══
 *
 * La réponse retenue jusqu'ici venait de Lovable, qui a construit Tools : « ce n'est ni un SDK ni une
 * API. C'est l'extension Chrome Allo qui détecte les numéros affichés. Son API REST ne sait
 * qu'ajouter un numéro à la file du Power Dialer, pas lancer un appel. » Conclusion inscrite dans
 * `src/lib/telephonie.tsx` : aucun code ne peut déclencher un appel, le bouton se contente de copier
 * le numéro.
 *
 * La première moitié est vraie : vérifié dans la documentation le 07/09/2026, Allo n'expose AUCUN
 * endpoint de composition. La seconde moitié — « ajouter à la file, ce n'est pas lancer un appel » —
 * passait à côté de l'essentiel : la file du Power Dialer est précisément l'outil avec lequel un
 * commercial passe ses appels. Y déposer le numéro depuis la fiche du client, c'est lui éviter de le
 * recopier, et c'est ce qui manquait.
 *
 * ══ LA FILE DE LA BONNE PERSONNE ══
 *
 * `POST /v2/api/dialing-queues/append-numbers` accepte un `email` pour viser « la file d'un
 * coéquipier ». On y met donc l'adresse de l'utilisateur connecté à Kimatch : le numéro atterrit
 * chez LUI, et non dans la file du propriétaire de la clé. Sans ce champ, les dix commerciaux
 * pousseraient leurs numéros dans la même file.
 *
 * ══ ON ENVOIE AUSSI QUI ON APPELLE ══
 *
 * L'endpoint accepte nom, société et fonction. Les transmettre coûte un champ et rapporte deux
 * choses : le commercial voit qui il appelle dans Allo avant de décrocher, et l'IA d'Allo — qui
 * extrait déjà la fiche du correspondant depuis la conversation — part avec la bonne identité au lieu
 * de la déduire.
 */

interface CorpsAppel {
  /** Le numéro, déjà en E.164 : la normalisation vit côté navigateur, dans `numeroInternational`. */
  numero?: string
  nom?: string
  prenom?: string
  societe?: string
  fonction?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }

  const corps = req.body as CorpsAppel
  const numero = (corps?.numero ?? '').trim()
  if (!/^\+\d{8,15}$/.test(numero)) {
    res.status(400).json({ error: 'Numéro attendu au format international, par exemple +33612345678.' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return
  }

  const supabaseAuthed = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabaseAuthed.auth.getUser()
  if (userError || !userData.user?.email) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  try {
    const resultat = await poserDansLaFileDAppel({
      // L'ADRESSE DE L'UTILISATEUR CONNECTÉ, prise de sa session et non du corps de la requête :
      // sinon on pourrait remplir la file d'un collègue.
      emailUtilisateur: userData.user.email,
      numero,
      nom: corps.nom ?? null,
      prenom: corps.prenom ?? null,
      societe: corps.societe ?? null,
      fonction: corps.fonction ?? null,
    })

    if (resultat.ignore) {
      res.status(200).json({ ok: false, ignore: resultat.ignore })
      return
    }
    res.status(200).json({ ok: true, position: resultat.position })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur Allo inconnue'
    // LA PORTÉE MANQUANTE EST LE CAS ATTENDU au premier essai, et elle se dit en clair : sinon on
    // cherche un bug dans le code alors qu'il suffit de cocher une case dans les réglages d'Allo.
    if (/DIALING_QUEUE_READ_WRITE|INSUFFICIENT_SCOPE/i.test(message)) {
      res.status(502).json({
        error: 'La clé Allo n’a pas le droit d’écrire dans la file d’appel.',
        code: 'portee_manquante',
        detail: 'Ajoutez la portée « DIALING_QUEUE_READ_WRITE » à la clé API, dans les réglages du workspace Allo.',
      })
      return
    }
    res.status(502).json({ error: message })
  }
}

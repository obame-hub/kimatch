import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * LA GARDE D'AUTHENTIFICATION DES FONCTIONS SERVEUR.
 *
 * Écrite le 28/08/2026 après un audit qui a trouvé SIX fonctions ouvertes à Internet. La preuve
 * n'était pas théorique : `GET https://kimatch.fr/api/slack/channels` répondait 200 à un appel
 * anonyme et renvoyait la liste des canaux Slack de KiWee, dont un canal privé. Et
 * `/api/ellisphere/search` répondait « 400 paramètre requis » au lieu de 401 — donc la requête
 * franchissait la fonction.
 *
 * CE QUE CHAQUE FONCTION OUVERTE COÛTAIT, et c'est différent selon le service :
 *   · Ellisphere et l'OCR (API Anthropic) sont facturés à l'usage — un tiers consommait le budget.
 *   · Enedis acceptait N'IMPORTE QUEL PDL et renvoyait ses données de comptage, en utilisant le
 *     certificat et le contrat Enedis de KiWee. Le contrôle d'accès aux données d'un tiers ne
 *     reposait que sur le fait que l'URL soit inconnue.
 *
 * POURQUOI UNE FONCTION PARTAGÉE plutôt que dix lignes recopiées dans chaque fichier : le motif
 * était déjà présent trois fois (gmail/connect, gmail/send, slack/notify) avec trois formulations
 * légèrement différentes. Une seule barrière, c'est une seule chose à relire — et une seule à
 * corriger le jour où la vérification change.
 *
 * ELLE VÉRIFIE VRAIMENT LA SESSION. Contrôler la seule présence d'un en-tête `Bearer` ne serait
 * pas une barrière : n'importe qui peut en poser un. `auth.getUser()` fait valider le jeton par
 * Supabase, avec la clé anonyme — celle du navigateur, jamais la clé de service.
 */
export interface UtilisateurAuthentifie {
  id: string
  email: string | null
  /** L'en-tête tel quel, à retransmettre quand la fonction doit lire la base au nom de l'appelant. */
  authHeader: string
}

/**
 * Renvoie l'utilisateur si la requête porte une session valide. Sinon répond elle-même (401 ou 500)
 * et renvoie `null` : l'appelant n'a plus qu'à sortir.
 *
 *   const user = await exigerSession(req, res)
 *   if (!user) return
 */
export async function exigerSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<UtilisateurAuthentifie | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return null
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return null
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    res.status(401).json({ error: 'Session invalide' })
    return null
  }

  return { id: data.user.id, email: data.user.email ?? null, authHeader }
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UNE SESSION VALIDE N'EST PAS UN DROIT D'ACCÈS — 25/09/2026
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `exigerSession` répond à UNE question : « la session est-elle valide ? ». Depuis l'ouverture de
 * l'espace partenaire, des externes en ont une. Elle les laisse donc passer exactement comme un
 * commercial — mesuré ce jour, avec un vrai compte partenaire : ACCEPTÉ.
 *
 * Tant que la fonction lisait ensuite la base au nom de l'appelant, les policies répondaient à sa
 * place. SIX N'INTERROGENT JAMAIS LA BASE : elles appellent un service externe avec les
 * identifiants de KiWee, et rien ne les retenait.
 *
 *     enedis/fetch-elec      les données de comptage de N'IMPORTE QUEL PDL de France, avec le
 *     grd/fetch-gaz          certificat et le contrat Enedis / GRD de KiWee
 *     ellisphere/search      les données d'entreprise, facturées à KiWee à chaque appel
 *     ellisphere/score
 *     ocr/extract-document   l'API Anthropic, facturée à l'usage
 *     slack/channels         la liste des canaux Slack de KiWee, dont les canaux privés
 *
 * C'est la même faille qu'en août 2026 — six fonctions ouvertes à Internet — déplacée d'un cran :
 * elles ne sont plus ouvertes à tous, elles sont ouvertes à tous les CONNECTÉS.
 *
 * ON NE FERME PAS AUX ADMINISTRATEURS ni aux comptes de service : seuls les profils rattachés à un
 * compte partenaire sont écartés, par la même fonction que la base (`est_partenaire()`), pour
 * qu'il n'y ait qu'une définition du mot « partenaire » dans tout Kimatch.
 */
export async function refuserLesPartenaires(
  utilisateur: UtilisateurAuthentifie,
  res: VercelResponse,
): Promise<boolean> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return true
  }

  /* ON DEMANDE À LA BASE, PAS À UNE COPIE DE LA RÈGLE. `est_partenaire()` est ce qui gouverne déjà
     les policies : une seconde définition ici finirait par diverger de la première. */
  const reponse = await fetch(`${supabaseUrl}/rest/v1/rpc/est_partenaire`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: utilisateur.authHeader,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  if (!reponse.ok) {
    /* EN CAS DE DOUTE, ON REFUSE. Laisser passer sur une panne de la base rouvrirait exactement ce
       que ce garde ferme, et le service externe, lui, serait bien appelé. */
    res.status(503).json({ error: 'Vérification des droits indisponible. Réessayez dans un instant.' })
    return true
  }

  if ((await reponse.text()).trim() === 'true') {
    res.status(403).json({ error: 'Cette fonctionnalité n’est pas accessible depuis un espace partenaire.' })
    return true
  }

  return false
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'OBJET DEMANDÉ EST-IL LE SIEN ? — 25/09/2026
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ LE MOTIF QUI REVIENT ══
 *
 * Plusieurs fonctions suivent la même forme : elles vérifient la SESSION, prennent ensuite la CLÉ
 * DE SERVICE, et travaillent sur un identifiant venu du CORPS DE LA REQUÊTE. Les trois pas sont
 * justifiés séparément — et ensemble ils annulent tout contrôle d'accès, parce que la clé de
 * service désactive les policies une ligne après que la session a été vérifiée.
 *
 * Mesuré ce jour :
 *
 *     depot/ouvrir      un `pisteId` quelconque ouvre une boîte de dépôt sur la fiche d'autrui —
 *                       et si une boîte est déjà ouverte, il REND LE JETON EXISTANT
 *     cockpit/conseil   des `interactions` arbitraires reçoivent un `sentiment` écrit par l'IA
 *     docusign/send     un `mandatId` ou `contratId` quelconque part en signature
 *
 * Ce n'est pas une faille partenaire : un commercial de KiWee agit de même sur le dossier d'un
 * collègue. `refuserLesPartenaires` n'y suffit donc pas — c'est un contrôle D'APPARTENANCE qui
 * manque, pas un garde de périmètre.
 *
 * ══ COMMENT ON RÉPOND SANS RECOPIER LA RÈGLE ══
 *
 * On relit la ligne AVEC LE JETON DE L'APPELANT, jamais avec la clé de service. Les policies
 * répondent alors comme elles le feraient dans l'application : si elles ne montrent pas la ligne,
 * `PostgREST` ne rend rien, et l'on refuse. Aucune règle d'accès n'est réécrite ici — c'est
 * précisément ce qui évite qu'une seconde version diverge de la première.
 *
 * ══ CE QUE CE GARDE FERME, ET CE QU'IL NE FERME PAS ══
 *
 * Il vaut exactement ce que valent les policies, ni plus ni moins. Mesuré le 25/09/2026 :
 *
 *     un partenaire   -> mandat, contrat, piste, interaction de KiWee   REFUSÉ
 *     un commercial   -> les mêmes                                      PASSE
 *
 * Chez KiWee, les policies laissent tout commercial voir les dossiers de ses collègues : c'est un
 * choix d'organisation, une petite équipe où chacun reprend les affaires des autres. Ce garde ferme
 * donc la porte aux EXTERNES, pas entre collègues.
 *
 * Le jour où l'on voudra cloisonner l'équipe par portefeuille, il n'y aura RIEN à changer ici : il
 * suffira de resserrer les policies, et ces trois points d'entrée suivront d'eux-mêmes. C'est la
 * raison d'être de cette forme.
 */
export async function exigerAcces(
  utilisateur: UtilisateurAuthentifie,
  table: string,
  id: string,
  res: VercelResponse,
): Promise<boolean> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return false
  }

  const reponse = await fetch(
    `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id&limit=1`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: utilisateur.authHeader,
      },
    },
  )

  if (!reponse.ok) {
    /* EN CAS DE DOUTE, ON REFUSE. Laisser passer sur une panne rouvrirait exactement ce que ce
       contrôle ferme, et l'écriture, elle, se ferait bien. */
    res.status(503).json({ error: 'Vérification des droits indisponible. Réessayez dans un instant.' })
    return false
  }

  const lignes = (await reponse.json()) as unknown[]
  if (!Array.isArray(lignes) || lignes.length === 0) {
    /* 404 ET NON 403 : dire « interdit » confirmerait que cet identifiant existe. On ne renseigne
       pas sur ce qu'on protège. */
    res.status(404).json({ error: 'Introuvable.' })
    return false
  }

  return true
}

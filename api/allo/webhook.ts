import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cleService } from '../_cleService.js'
import { createClient } from '@supabase/supabase-js'
/* L'EXTENSION `.js` EST OBLIGATOIRE : le projet est en `"type": "module"`, et Node resout les
   imports relatifs en ESM strict. Son absence a coupe DocuSign pendant des heures -- la fonction ne
   demarrait pas du tout, et rien dans le build, le lint ni les tests ne l'avait vu. */
import { signatureValide } from './_signature.js'

/**
 * ══ CE QUI SE PASSE PENDANT UN APPEL, SU PAR KIMATCH ══
 *
 * Naoëlle, 08/09/2026 : « il faut qu'on puisse appeler depuis Kimatch, raccrocher etc. sans devoir
 * ouvrir Allo en externe. » Et William, dans la réunion du matin : « il faut qu'on trouve une
 * solution pour pouvoir raccrocher depuis Kimatch, c'est important. »
 *
 * ══ RACCROCHER EST IMPOSSIBLE. SAVOIR NE L'EST PAS ══
 *
 * Relevé le 08/09/2026 sur la table complète portée-par-endpoint de la documentation d'Allo : une
 * soixantaine d'endpoints, et AUCUN contrôle d'appel. Le Power Dialer sait ajouter, configurer,
 * vider et réinitialiser une file ; il ne sait ni décrocher ni raccrocher. Cockpit ne le faisait pas
 * non plus — son propre document d'architecture n'en parle nulle part.
 *
 * Ce fichier fait la seule chose qui rende le détour par Allo inutile : il écoute les trois
 * événements de l'appel, si bien que la carte à l'écran s'ouvre, se remplit et se ferme d'elle-même.
 *
 *   call.triggered / call.received   l'appel part, ou arrive    → la carte s'ouvre
 *   call.answered                    le correspondant décroche  → on sait qu'il y a quelqu'un
 *   call.completed                   fini                       → durée, résultat, enregistrement
 *
 * ══ TROIS CONTRAINTES QUI EXPLIQUENT LA FORME DE CE CODE ══
 *
 * ① `call.triggered` NE PORTE PAS D'IDENTIFIANT D'APPEL. Il donne `user_email`, `to_number` et
 *    `started_at`. L'identifiant `cll_…` n'arrive qu'avec `call.completed`. On ouvre donc la ligne
 *    sans identifiant, et on la retrouve à la fin sur ce triplet.
 *
 * ② `call.completed` ARRIVE ~30 SECONDES APRÈS LE RACCROCHAGE — leur documentation le dit. La carte
 *    reste donc « en cours » une demi-minute de trop. Ce n'est pas réparable ici.
 *
 * ③ ALLO LIVRE « AU MOINS UNE FOIS » et demande de dédupliquer sur l'en-tête `webhook-id`. Sans
 *    cela, un événement rejoué rouvrirait une carte déjà classée.
 *
 * ══ L'IDENTIFIANT EST CELUI DE L'IMPORT ══
 *
 * `data.id` est au format `cll_…` — exactement ce que l'import du 07/09/2026 a écrit dans
 * `interactions.source_externe_id` pour 2 550 appels. Le webhook et l'import ne peuvent donc pas se
 * dupliquer : c'est la même clé, et l'index unique partiel la garde unique.
 */

/**
 * VERCEL ANALYSE LE CORPS JSON PAR DÉFAUT, ET IL FAUT L'EN EMPÊCHER.
 *
 * La signature porte sur les OCTETS EXACTS envoyés. Ré-sérialiser l'objet analysé ne les redonne pas
 * — espaces, échappements, ordre des clés diffèrent — et toute notification serait rejetée. C'est
 * exactement le bug qui a bloqué DocuSign le 14/08/2026 : chaque enveloppe repartait en 401, donc
 * aucun mandat ne passait à « Signé ». Leur documentation le dit aussi, en gras.
 */
export const config = { api: { bodyParser: false } }

/** Le corps tel qu'il est arrivé, sans transformation. */
async function lireCorpsBrut(req: VercelRequest): Promise<string> {
  const morceaux: Buffer[] = []
  for await (const m of req) morceaux.push(typeof m === 'string' ? Buffer.from(m) : (m as Buffer))
  return Buffer.concat(morceaux).toString('utf8')
}

/** Les chiffres seuls, pour comparer deux écritures d'un même numéro. */
function chiffres(numero: string | null | undefined): string {
  return (numero ?? '').replace(/\D/g, '')
}

/**
 * Le même numéro, écrit comme la France l'écrit.
 *
 * Les fiches portent cinq formats mesurés sur 3 399 lignes le 07/09/2026 : `+33…`, `0033…`, `06 12…`,
 * `0612…`, et quelques `33…`. Allo envoie toujours du E.164. On compare donc les DIX derniers
 * chiffres, ce qui fait tomber l'indicatif et le zéro initial sans avoir à deviner lequel manque.
 */
function dixDerniers(numero: string | null | undefined): string {
  const d = chiffres(numero)
  return d.length >= 9 ? d.slice(-9) : d
}

interface Personne { id?: string; name?: string; last_name?: string }
interface DonneesAppel {
  id?: string
  from_number?: string
  to_number?: string
  to?: string
  started_at?: string
  start_date?: string
  answered_at?: string
  direction?: string
  type?: string
  user_email?: string
  result?: string
  length_in_minutes?: number
  recording_url?: string | null
  summary?: string | null
  concatenated_transcript?: string | null
  /* Les étiquettes de contenu produites par leur modèle. `unknown` et non `string[]` : c'est une
     charge utile distante, et le message peut très bien nous envoyer autre chose qu'un tableau. */
  tags?: unknown
  ivr_result?: unknown
  person?: Personne | null
}
interface EnveloppeAllo { topic?: string; version?: string; timestamp?: string; data?: DonneesAppel }

const TOPICS_TRAITES = new Set(['call.received', 'call.triggered', 'call.answered', 'call.completed'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const secret = process.env.ALLO_WEBHOOK_SECRET
  const url = process.env.VITE_SUPABASE_URL
  const cle = cleService()
  if (!secret || !url || !cle) {
    // 500 ET NON 200 : Allo réessaiera, et une configuration manquante ne doit pas faire perdre des
    // appels en silence pendant qu'on s'en aperçoit.
    res.status(500).json({ error: 'Webhook Allo non configuré côté serveur' })
    return
  }

  const corps = await lireCorpsBrut(req)
  if (!signatureValide(corps, req.headers, secret)) {
    res.status(401).json({ error: 'Signature invalide' })
    return
  }

  let enveloppe: EnveloppeAllo
  try {
    enveloppe = JSON.parse(corps) as EnveloppeAllo
  } catch {
    res.status(400).json({ error: 'Corps illisible' })
    return
  }

  const topic = enveloppe.topic ?? ''
  const d = enveloppe.data ?? {}
  const admin = createClient(url, cle, { auth: { persistSession: false } })

  // ── LA DÉDUPLICATION, AVANT TOUT TRAITEMENT ─────────────────────────────────────────────────
  //
  // L'insertion elle-même est le verrou : la clé primaire refuse le second passage. Plus sûr qu'un
  // `select` suivi d'un `insert`, qui laisserait passer deux livraisons simultanées.
  const idEvenement = req.headers['webhook-id']
  if (typeof idEvenement === 'string') {
    const { error } = await admin
      .from('webhooks_allo_recus')
      .insert({ webhook_id: idEvenement, topic })
    if (error) {
      // 23505 = doublon : on l'a déjà traité. On répond 200, sinon Allo réessaie indéfiniment.
      if (error.code === '23505') {
        res.status(200).json({ recu: true, deja_traite: true })
        return
      }
      res.status(500).json({ error: 'Déduplication impossible' })
      return
    }
  }

  if (!TOPICS_TRAITES.has(topic)) {
    // ON ACQUITTE CE QU'ON N'UTILISE PAS. Répondre en erreur ferait réessayer Allo pour un SMS ou
    // un tag qui ne nous intéresse pas, et son taux d'erreur nous accuserait à raison.
    res.status(200).json({ recu: true, ignore: topic })
    return
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     LE NUMÉRO DISTANT DÉPEND DU SENS, PAS DU SUJET DU MESSAGE
     ══════════════════════════════════════════════════════════════════════════════════════════

     Matthieu, 23/09/2026, sur la piste de florian COSTAL : « il a reçu un appel entrant, je le vois
     sur Allô mais ce call n'est pas indiqué dans la piste ».

     ══ CE QUI SE PASSAIT, ET DEPUIS QUAND ══

     La ligne lisait `to_number` dès que le sujet n'était pas `call.received`. Sur un appel ENTRANT,
     `to_number` est NOTRE ligne — celle du commercial. Le `call.completed` d'un entrant partait donc
     chercher « +33644647431 » au lieu du numéro du client, et trois choses s'enchaînaient :

       1. `appelDejaConnu` ne retrouvait pas la carte ouverte par `call.received`, qui portait le
          vrai numéro. Il en créait une SECONDE, avec notre propre ligne.
       2. `reconnaitre` ne trouvait évidemment aucune fiche derrière notre propre numéro :
          `contact_id`, `compte_id` et `piste_id` repartaient tous les trois à `null`.
       3. `interactions_contexte_check` exige au moins un rattachement. L'écriture était donc
          REFUSÉE par la base, la fonction levait, et Allô recevait un 500 — sur un appel qui, lui,
          avait été parfaitement capté.

     MESURÉ AVANT CORRECTION : 130 appels entrants enregistrés avec leur identifiant Allô, leur
     enregistrement, leur transcription et leur résumé — et ZÉRO interaction sur les fiches. Aucun
     appel entrant n'est arrivé dans un historique depuis la mise en service du webhook le 08/09.
     Les 698 entrants présents en base datent tous de l'import du 07/09.

     ══ POURQUOI LE SENS SE LIT D'ABORD ══

     `call.received` n'existe que pour un entrant, mais `call.completed` sert LES DEUX : c'est son
     `direction` qui tranche, et lui seul. On calcule donc le sens en premier, et le numéro distant
     s'en déduit — `from_number` quand ça vient de chez eux, `to_number` quand ça part de chez nous.
     C'est la seule lecture qui reste juste quel que soit le sujet du message. */
  const sens = topic === 'call.received' || (d.direction ?? d.type) === 'INBOUND' ? 'ENTRANT' : 'SORTANT'
  const numeroDistant = sens === 'ENTRANT' ? (d.from_number ?? d.to_number) : (d.to_number ?? d.to)
  const demarre = d.started_at ?? d.start_date ?? enveloppe.timestamp ?? new Date().toISOString()
  const email = (d.user_email ?? '').trim().toLowerCase()

  try {
    if (topic === 'call.completed') {
      await terminer(admin, d, email, numeroDistant, demarre, sens)
    } else if (topic === 'call.answered') {
      await marquerDecroche(admin, email, numeroDistant, d.answered_at ?? enveloppe.timestamp)
    } else {
      await ouvrir(admin, email, numeroDistant, demarre, sens)
    }
  } catch (e) {
    // On répond 500 pour qu'Allo réessaie : la déduplication a déjà consommé l'identifiant, mais
    // une seconde livraison portera un `webhook-id` différent et repassera ici.
    res.status(500).json({ error: e instanceof Error ? e.message : 'Traitement impossible' })
    return
  }

  /* ══ ON REFERME LES APPELS QU'ALLO N'A JAMAIS REFERMÉS ══
   *
   * Mesuré le 23/09/2026 : 20 lignes de `appels_en_cours` sur 827 ont `termine_le` à NULL pour
   * toujours, dont une vieille de quatorze jours. Allo n'envoie pas `call.completed` à tous les
   * coups, et rien ici ne peut l'y forcer.
   *
   * CE N'EST PAS UNE INEXACTITUDE SANS CONSÉQUENCE : un appel « en cours » commande des écrans.
   * La modale de rattachement se taisait tant qu'un appel était ouvert — un seul fantôme la faisait
   * taire pour tous les appels suivants, et c'est la panne que Naoëlle a signalée trois fois.
   *
   * ON S'ACCROCHE AU TRAFIC D'ALLO plutôt qu'à une tâche planifiée : c'est le battement le plus
   * fiable dont on dispose, il ne coûte pas une infrastructure de plus, et il bat précisément
   * pendant les heures où les fantômes naissent.
   *
   * ══ AVANT `res`, JAMAIS APRÈS ══
   *
   * Sur Vercel, tout ce qui suit `res.send()` peut ne jamais s'exécuter : la fonction est gelée dès
   * la réponse partie. Un balayage placé après aurait l'air correct et ne tournerait jamais.
   *
   * ══ ET IL N'A PAS LE DROIT DE FAIRE ÉCHOUER LE WEBHOOK ══
   *
   * C'est de l'entretien, pas le traitement de l'événement. S'il échoue, l'appel a quand même été
   * enregistré : répondre 500 ferait rejouer à Allo un message déjà traité pour une raison qui ne
   * le regarde pas. On avale donc l'erreur — c'est le seul `catch` muet du fichier, et il l'est
   * pour cette raison précise. */
  try {
    await admin.rpc('fermer_appels_fantomes', { p_heures: 2 })
  } catch {
    // Volontairement muet : voir ci-dessus.
  }

  res.status(200).json({ recu: true, topic })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = ReturnType<typeof createClient<any, any, any>>

/** Le profil Kimatch du commercial, d'après son adresse Allo. */
async function profilPour(admin: Admin, email: string): Promise<string | null> {
  if (!email) return null
  const { data } = await admin.from('profils').select('id').ilike('email', email).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/**
 * Qui est au bout du fil : un contact, une piste, et le compte qui va avec.
 *
 * On compare les neuf derniers chiffres — voir `dixDerniers`. La recherche se fait en base sur un
 * `like` de fin, ce qui laisse l'index de côté ; c'est acceptable ici parce qu'un webhook d'appel
 * arrive quelques fois par minute au plus, jamais en rafale.
 */
/* UN SEUL TYPE DE RETOUR, ANNOTÉ. Sans annotation, TypeScript déduit l'UNION des trois formes
   rendues plus bas — contact, piste, ou rien — et refuse ensuite de la passer à `insert`, qui attend
   une forme unique. L'annotation dit ce que la fonction rend vraiment : trois champs, toujours les
   mêmes, dont certains nuls. */
interface Reconnu {
  contact_id: string | null
  compte_id: string | null
  piste_id: string | null
}

/**
 * ══ QUI APPELLE ? LA COMPARAISON SE FAIT SUR LES CHIFFRES, PAS SUR LA CHAÎNE ══
 *
 * Thomas, 21/09/2026 : « comme ça m'affiche que le numéro de téléphone, je sais même pas à qui ça
 * correspond ». Sur 262 appels non qualifiés, 199 ne portaient que le numéro.
 *
 * L'INTENTION ÉTAIT BONNE, LE MOYEN NON. Cette fonction comparait déjà les neuf derniers chiffres —
 * mais par `telephone like '%612345678'`, donc sur la CHAÎNE BRUTE. Or 1 319 numéros sont écrits
 * avec des espaces ou des points : « 06 12 34 56 78 » ne finit pas par « 612345678 », il finit par
 * « 56 78 ». Le motif ne pouvait pas les atteindre.
 *
 * Mesuré sur les 85 numéros orphelins : l'ancienne méthode en reconnaissait 3, celle-ci 18.
 *
 * `fin_numero` vit en base (migration 20260921160000) et porte un index : la reconnaissance reste
 * instantanée pendant que le téléphone sonne, et la règle est la même ici, sur la carte d'appel et
 * au clic-pour-appeler — trois endroits qui divergeraient s'ils l'écrivaient chacun.
 */
async function reconnaitre(admin: Admin, numero: string | null | undefined): Promise<Reconnu> {
  const fin = dixDerniers(numero)
  if (fin.length < 9) return { contact_id: null, compte_id: null, piste_id: null }

  const { data: trouve } = await admin.rpc('qui_appelle', { p_numero: fin })
  const ligne = (trouve as { contact_id: string | null; compte_id: string | null; piste_id: string | null }[] | null)?.[0]
  if (ligne) {
    return {
      contact_id: ligne.contact_id ?? null,
      compte_id: ligne.compte_id ?? null,
      piste_id: ligne.piste_id ?? null,
    }
  }

  return { contact_id: null, compte_id: null, piste_id: null }
}

/**
 * Fenêtre de rapprochement : deux appels du même commercial vers le même numéro à moins de dix
 * minutes d'écart sont considérés comme le même appel.
 *
 * Faute d'identifiant avant `call.completed`, c'est la seule façon de recoudre les événements. Dix
 * minutes parce que `started_at` diffère d'un événement à l'autre — mesuré le 08/09/2026, deux
 * secondes entre le `started_at` de `call.triggered` et le `start_date` de `call.completed` du même
 * appel — et parce que rappeler le même numéro dans les dix minutes est plus rare que de recevoir
 * deux événements du même appel.
 */
const FENETRE_MS = 10 * 60 * 1000

/** L'appel déjà connu qui correspond à cet événement, terminé ou non. */
async function appelDejaConnu(
  admin: Admin, email: string, numero: string | null | undefined, quand: string,
): Promise<{ id: string; termine: boolean } | null> {
  const fin = dixDerniers(numero)
  if (!fin) return null
  const t = new Date(quand).getTime()
  const { data } = await admin
    .from('appels_en_cours')
    .select('id, demarre_le, termine_le')
    .eq('user_email', email || 'inconnu')
    .eq('numero_normalise', fin)
    .gte('demarre_le', new Date(t - FENETRE_MS).toISOString())
    .lte('demarre_le', new Date(t + FENETRE_MS).toISOString())
    .order('demarre_le', { ascending: false })
    .limit(1)
  const ligne = data?.[0]
  if (!ligne) return null
  return { id: ligne.id as string, termine: Boolean(ligne.termine_le) }
}

/**
 * La carte s'ouvre — ou ne s'ouvre pas, si l'appel est déjà connu.
 *
 * ══ LES ÉVÉNEMENTS N'ARRIVENT PAS DANS L'ORDRE, ET C'EST MESURÉ ══
 *
 * Relevé le 08/09/2026 sur les premiers appels réels : un `call.triggered` reçu à 12:42:15 pour un
 * appel dont le `call.completed` était arrivé à 12:20:51 — VINGT-DEUX MINUTES PLUS TÔT. Un autre
 * `call.completed` livré 42 minutes après l'appel.
 *
 * C'étaient des réessais accumulés pendant que l'endpoint répondait 500, faute de secret. Mais la
 * leçon vaut au-delà de cet incident : Allo livre « au moins une fois », sans garantir l'ordre.
 *
 * Ma première version insérait sans regarder, et créait donc une seconde ligne « en cours » pour un
 * appel déjà terminé — une carte fantôme qui se serait ouverte à l'écran d'un commercial pour un
 * appel raccroché depuis vingt minutes. C'est le genre de défaut qu'aucun test ne trouve et que le
 * premier trafic réel révèle.
 */
async function ouvrir(
  admin: Admin, email: string, numero: string | null | undefined, demarre: string, sens: string,
) {
  const connu = await appelDejaConnu(admin, email, numero, demarre)
  // DÉJÀ TERMINÉ : l'événement de départ arrive en retard, il n'a plus rien à ouvrir.
  if (connu?.termine) return
  // DÉJÀ OUVERT : un doublon de livraison que la déduplication n'a pas vu (identifiants d'événement
  // différents pour le même appel). On ne rouvre pas.
  if (connu) return

  const reconnu = await reconnaitre(admin, numero)
  const { error } = await admin.from('appels_en_cours').insert({
    user_email: email || 'inconnu',
    profil_id: await profilPour(admin, email),
    numero: numero ?? 'inconnu',
    numero_normalise: dixDerniers(numero) || null,
    sens,
    demarre_le: demarre,
    ...reconnu,
  })
  if (error) throw new Error(`ouverture : ${error.message}`)
}

/**
 * Le correspondant a décroché.
 *
 * On vise la carte ouverte la plus récente de ce commercial vers ce numéro. `call.answered` ne porte
 * pas plus d'identifiant que `call.triggered` : le triplet est tout ce qu'on a.
 */
async function marquerDecroche(
  admin: Admin, email: string, numero: string | null | undefined, quand: string | undefined,
) {
  const fin = dixDerniers(numero)
  const { data } = await admin
    .from('appels_en_cours')
    .select('id')
    .eq('user_email', email || 'inconnu')
    .eq('numero_normalise', fin || null)
    .is('termine_le', null)
    .order('demarre_le', { ascending: false })
    .limit(1)
  if (!data || data.length === 0) return // Rien à décrocher : l'ouverture a pu être perdue.
  await admin
    .from('appels_en_cours')
    .update({ decroche_le: quand ?? new Date().toISOString() })
    .eq('id', data[0].id as string)
}

/**
 * L'appel est fini : on clôt la carte et on consigne l'échange.
 *
 * DEUX ÉCRITURES, ET LA SECONDE EST CELLE QUI COMPTE. La carte se ferme pour l'écran ; l'interaction
 * reste dans l'historique de la fiche, avec la même clé que l'import — donc sans risque de doublon.
 */
async function terminer(
  admin: Admin, d: DonneesAppel, email: string,
  numero: string | null | undefined, demarre: string, sens: string,
) {
  const fin = dixDerniers(numero)
  const duree = typeof d.length_in_minutes === 'number' ? Math.round(d.length_in_minutes * 60) : null

  // Le serveur vocal qu'Allo compte comme un décroché : `ivr_result` non vide le trahit.
  const ivr = Array.isArray(d.ivr_result) && d.ivr_result.length > 0 ? d.ivr_result : null

  /* ══ LES ÉTIQUETTES DE CONTENU — CE QU'ALLÔ A COMPRIS DE L'ÉCHANGE ══
   *
   * `interested`, `not_interested`, `to_call_back`, `follow_up_later`, `meeting_booked` : leur
   * modèle les tire de la transcription, et c'est la SEULE donnée de tout le message qui dise si
   * l'appel s'est bien ou mal passé. On les jetait.
   *
   * ON NE FILTRE PAS SUR UNE LISTE CONNUE. Allô peut en ajouter demain ; refuser une étiquette
   * inconnue reviendrait à perdre en silence exactement l'information qu'on vient de décider de
   * garder. On ne retient que la forme — des chaînes non vides. */
  const etiquettes = Array.isArray(d.tags)
    ? d.tags.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
    : null

  /* ON CHERCHE L'APPEL DANS LA FENÊTRE, TERMINÉ OU NON, et non « celui qui n'est pas terminé ».
     Ma première version filtrait sur `termine_le is null` : un `call.completed` rejoué — ou reçu
     après qu'un premier ait déjà clos la ligne — ne trouvait rien et créait un DOUBLON. Mesuré sur
     le premier trafic réel : deux lignes pour le même appel vers ...1402. */
  const connu = await appelDejaConnu(admin, email, numero, demarre)

  const fermeture = {
    termine_le: new Date().toISOString(),
    termine_par: 'ALLO' as const,
    source_externe_id: d.id ?? null,
    resultat: d.result ?? null,
    duree_secondes: duree,
    enregistrement_url: d.recording_url ?? null,
    transcription: d.concatenated_transcript ?? null,
    resume_allo: d.summary ?? null,
    ivr_touches: ivr,
    etiquettes_allo: etiquettes && etiquettes.length > 0 ? etiquettes : null,
  }

  if (connu) {
    const { error } = await admin.from('appels_en_cours').update(fermeture).eq('id', connu.id)
    if (error) throw new Error(`fermeture : ${error.message}`)
  } else {
    // AUCUNE CARTE À FERMER. Le `call.triggered` a été perdu, ou l'appel a commencé avant la mise en
    // service du webhook. On écrit la ligne complète plutôt que de laisser tomber l'appel.
    const reconnu = await reconnaitre(admin, numero)
    const { error } = await admin.from('appels_en_cours').insert({
      user_email: email || 'inconnu',
      profil_id: await profilPour(admin, email),
      numero: numero ?? 'inconnu',
      numero_normalise: fin || null,
      sens,
      demarre_le: demarre,
      ...reconnu,
      ...fermeture,
    })
    if (error) throw new Error(`création à la fermeture : ${error.message}`)
  }

  // ── L'INTERACTION, dans l'historique de la fiche ────────────────────────────────────────────
  if (!d.id) return
  const reconnu = await reconnaitre(admin, numero)

  /* ══ SANS RATTACHEMENT, PAS D'INTERACTION — ET SURTOUT PAS DE 500 ══
   *
   * `interactions_contexte_check` exige au moins un lien : compte, contact, piste… Un appelant que
   * Kimatch ne connaît pas — un numéro masqué, un prospect qui n'est dans aucune fiche — n'en a
   * aucun, et l'écriture partait en violation de contrainte. La fonction levait, Allô recevait un
   * 500, et réessayait un appel qu'on ne saurait de toute façon pas ranger.
   *
   * L'APPEL N'EST PAS PERDU POUR AUTANT : sa carte reste dans `appels_en_cours`, d'où l'écran
   * « Appels non rattachés » le reprend pour qu'on lui donne une fiche. C'est exactement le rôle de
   * cet écran, et c'est la bonne place pour un appel dont on ignore de qui il vient.
   *
   * C'est le second défaut de la même famille que celui du numéro entrant : une donnée manquante
   * qui faisait échouer toute l'écriture au lieu de la faire dévier. */
  if (!reconnu.contact_id && !reconnu.compte_id && !reconnu.piste_id) return
  const { data: type } = await admin
    .from('types_interactions')
    .select('id')
    .eq('code', 'APPEL')
    .maybeSingle()
  if (!type?.id) return

  const ligne = {
    type_interaction_id: type.id as string,
    source_externe_id: d.id,
    date_interaction: demarre,
    objet: (d.summary ? d.summary.slice(0, 200) : `Appel ${sens === 'ENTRANT' ? 'entrant' : 'sortant'}`),
    resume_ia: d.summary ?? null,
    transcription: d.concatenated_transcript ?? null,
    enregistrement_url: d.recording_url ?? null,
    sens,
    resultat: d.result ?? null,
    duree_appel_secondes: duree,
    duree_minutes: duree != null ? Math.round(duree / 60) : null,
    appel_manque: d.result !== 'ANSWERED',
    messagerie_vocale: d.result === 'VOICEMAIL',
    numero_correspondant: numero ?? null,
    auteur_profil_id: await profilPour(admin, email),
    ...reconnu,
  }

  /* ══ PAS D'`upsert` ICI, ET C'EST UNE ERREUR QUE J'AVAIS DÉJÀ FAITE ══
   *
   * `interactions_source_externe_id_idx` est un index unique PARTIEL — `where source_externe_id is
   * not null`. Postgres refuse alors `on conflict (source_externe_id)` avec 42P10, « there is no
   * unique or exclusion constraint matching the ON CONFLICT specification », parce que la clause
   * `where` de l'index doit être répétée dans le `on conflict` — ce que PostgREST ne sait pas
   * exprimer.
   *
   * C'est exactement le piège qui a fait échouer la relance de l'import Allo le 07/09/2026. Je l'ai
   * répété ici, et il était SILENCIEUX : je ne vérifiais pas l'erreur de l'`upsert`. Résultat mesuré
   * sur les quatre premiers appels réels — quatre appels captés, avec enregistrement, transcription
   * et résumé, et ZÉRO interaction écrite sur les fiches.
   *
   * On lit donc, puis on écrit. La table de déduplication garantit qu'un même événement n'est traité
   * qu'une fois, donc la fenêtre entre les deux ne peut pas produire de doublon. */
  const { data: existante, error: erreurLecture } = await admin
    .from('interactions')
    .select('id')
    .eq('source_externe_id', d.id)
    .limit(1)
  if (erreurLecture) throw new Error(`lecture interaction : ${erreurLecture.message}`)

  /* ══ L'INTERACTION QUE KIMATCH A DÉJÀ ÉCRITE AU CLIC — 23/09/2026 ══
   *
   * Depuis la migration 20260923173000, Kimatch n'attend plus `call.completed` pour faire paraître
   * l'appel : il écrit la ligne dès le clic sur « Appeler ». La raison est mesurée sur 60 appels —
   * Allo livre ses fins avec 11 à 43 minutes de retard, un retard qui croît d'heure en heure et ne
   * se rattrape pas.
   *
   * CETTE INTERACTION-LÀ N'A PAS DE `source_externe_id` : elle est née avant qu'Allo ne nomme
   * l'appel. La recherche ci-dessus ne peut donc pas la trouver, et sans ce second rapprochement on
   * en écrirait une SECONDE — chaque appel apparaîtrait EN DOUBLE dans le fil de la fiche, l'une
   * avec la durée et l'enregistrement, l'autre sans. Personne ne saurait laquelle croire.
   *
   * ON RAPPROCHE PAR CE QUI EXISTAIT DÉJÀ AU MOMENT DU CLIC : le numéro, l'auteur, et une fenêtre
   * de temps autour du départ de l'appel. `FENETRE_MS` est la même que pour les cartes — dix
   * minutes, éprouvée depuis le 08/09 sur le décalage des `started_at` d'Allo.
   *
   * ON NE PREND QUE LES LIGNES `ouverte_par_kimatch` : une interaction d'appel ordinaire, saisie à
   * la main ou importée, ne doit jamais être écrasée par un webhook. */
  let aCompleter = existante && existante.length > 0 ? (existante[0].id as string) : null

  if (!aCompleter && numero) {
    const t = new Date(demarre).getTime()
    const { data: anticipee } = await admin
      .from('interactions')
      .select('id, numero_correspondant')
      .eq('ouverte_par_kimatch', true)
      .is('source_externe_id', null)
      .eq('auteur_profil_id', ligne.auteur_profil_id as string)
      .gte('date_interaction', new Date(t - FENETRE_MS).toISOString())
      .lte('date_interaction', new Date(t + FENETRE_MS).toISOString())
      .order('date_interaction', { ascending: false })
      .limit(10)

    /* LE NUMÉRO SE COMPARE SUR SES CHIFFRES, JAMAIS SUR LA CHAÎNE : c'est la leçon des 1 319 fiches
       dont le téléphone porte des espaces (migration 20260921160000). `dixDerniers` fait ici ce que
       `fin_numero` fait en base.
       
       ET IL SE COMPARE VRAIMENT. Prendre la première ligne de la fenêtre sans vérifier le numéro
       rattacherait l'enregistrement et la transcription d'un appel À LA FICHE D'UN AUTRE CLIENT —
       pendant une prospection, plusieurs appels partent dans la même fenêtre de dix minutes. */
    const fin = dixDerniers(numero)
    for (const c of (anticipee ?? []) as { id: string; numero_correspondant: string | null }[]) {
      if (fin && dixDerniers(c.numero_correspondant) === fin) {
        aCompleter = c.id
        break
      }
    }
  }

  if (aCompleter) {
    /* ON COMPLÈTE SANS DÉMENTIR LE RATTACHEMENT DÉJÀ FAIT. Si quelqu'un a rattaché cet appel à une
       opportunité pendant les quarante-cinq minutes d'attente, `ligne` ne porte pas ces liens et les
       remettrait à null : le travail de rattachement serait effacé par l'arrivée tardive d'Allo.
       On ne verse donc que ce qu'Allo est seul à savoir. */
    const apport = {
      source_externe_id: ligne.source_externe_id,
      objet: ligne.objet,
      resume_ia: ligne.resume_ia,
      transcription: ligne.transcription,
      enregistrement_url: ligne.enregistrement_url,
      resultat: ligne.resultat,
      duree_appel_secondes: ligne.duree_appel_secondes,
      duree_minutes: ligne.duree_minutes,
      appel_manque: ligne.appel_manque,
      messagerie_vocale: ligne.messagerie_vocale,
      ouverte_par_kimatch: false,
    }
    const { error } = await admin.from('interactions').update(apport).eq('id', aCompleter)
    if (error) throw new Error(`complément interaction : ${error.message}`)
    return
  }

  if (existante && existante.length > 0) {
    const { error } = await admin.from('interactions').update(ligne).eq('id', existante[0].id as string)
    if (error) throw new Error(`mise à jour interaction : ${error.message}`)
  } else {
    const { error } = await admin.from('interactions').insert(ligne)
    if (error) throw new Error(`écriture interaction : ${error.message}`)
  }
}

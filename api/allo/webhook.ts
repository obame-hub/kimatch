import type { VercelRequest, VercelResponse } from '@vercel/node'
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
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || !url || !cleService) {
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
  const admin = createClient(url, cleService, { auth: { persistSession: false } })

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

  const numeroDistant = topic === 'call.received' ? d.from_number : (d.to_number ?? d.to)
  const sens = topic === 'call.received' || (d.direction ?? d.type) === 'INBOUND' ? 'ENTRANT' : 'SORTANT'
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
async function reconnaitre(admin: Admin, numero: string | null | undefined) {
  const fin = dixDerniers(numero)
  if (fin.length < 9) return { contact_id: null, compte_id: null, piste_id: null }

  const { data: contacts } = await admin
    .from('contacts')
    .select('id, compte_id, telephone, telephone_mobile')
    .or(`telephone.like.%${fin},telephone_mobile.like.%${fin}`)
    .limit(1)
  if (contacts && contacts.length > 0) {
    return {
      contact_id: contacts[0].id as string,
      compte_id: (contacts[0].compte_id as string | null) ?? null,
      piste_id: null,
    }
  }

  const { data: pistes } = await admin
    .from('pistes')
    .select('id, telephone')
    .like('telephone', `%${fin}`)
    .limit(1)
  if (pistes && pistes.length > 0) {
    return { contact_id: null, compte_id: null, piste_id: pistes[0].id as string }
  }

  return { contact_id: null, compte_id: null, piste_id: null }
}

/** La carte s'ouvre. */
async function ouvrir(
  admin: Admin, email: string, numero: string | null | undefined, demarre: string, sens: string,
) {
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

  const { data } = await admin
    .from('appels_en_cours')
    .select('id')
    .eq('user_email', email || 'inconnu')
    .eq('numero_normalise', fin || null)
    .is('termine_le', null)
    .order('demarre_le', { ascending: false })
    .limit(1)

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
  }

  if (data && data.length > 0) {
    await admin.from('appels_en_cours').update(fermeture).eq('id', data[0].id as string)
  } else {
    // AUCUNE CARTE À FERMER. Le `call.triggered` a été perdu, ou l'appel a commencé avant la mise en
    // service du webhook. On écrit la ligne complète plutôt que de laisser tomber l'appel.
    const reconnu = await reconnaitre(admin, numero)
    await admin.from('appels_en_cours').insert({
      user_email: email || 'inconnu',
      profil_id: await profilPour(admin, email),
      numero: numero ?? 'inconnu',
      numero_normalise: fin || null,
      sens,
      demarre_le: demarre,
      ...reconnu,
      ...fermeture,
    })
  }

  // ── L'INTERACTION, dans l'historique de la fiche ────────────────────────────────────────────
  if (!d.id) return
  const reconnu = await reconnaitre(admin, numero)
  const { data: type } = await admin
    .from('types_interactions')
    .select('id')
    .eq('code', 'APPEL')
    .maybeSingle()
  if (!type?.id) return

  // `upsert` sur `source_externe_id` : la même clé que l'import du 07/09/2026, donc un appel déjà
  // importé ne se dédouble pas, et un appel déjà reçu par webhook se met simplement à jour.
  await admin.from('interactions').upsert(
    {
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
    },
    { onConflict: 'source_externe_id', ignoreDuplicates: false },
  )
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { analyseLeadSlack, estUnLead } from './_analyseLeadSlack.js'

/**
 * ══ UN LEAD ANNONCÉ DANS SLACK DEVIENT UNE PISTE ══
 *
 * Naoëlle, 15/09/2026 : « quand un lead arrive sur ce canal, il faut une automatisation qui crée
 * une piste sur Kimatch ».
 *
 * Le workflow Slack (Workflow Builder → « quand un message est posté dans #leads » → « envoyer une
 * requête web ») appelle ce point d'entrée avec le texte du message. On le lit, et on crée la piste.
 *
 * ══ POURQUOI UN SECRET ET PAS UNE SESSION ════════════════════════════════════════════════════
 *
 * Slack n'a pas de compte Kimatch : il ne peut pas se connecter. Sans protection, n'importe qui
 * connaissant l'adresse créerait des pistes dans le CRM. Le secret partagé (`SLACK_WORKFLOW_SECRET`)
 * est le minimum, et il se compare en TEMPS CONSTANT — une comparaison ordinaire s'arrête au
 * premier caractère faux et laisse deviner le secret lettre par lettre.
 *
 * Il s'accepte dans un en-tête OU dans l'adresse : le Workflow Builder sait poser des en-têtes
 * personnalisés, mais pas dans toutes ses versions. Autant ne pas se retrouver bloqué par une
 * limite d'interface.
 *
 * ══ CE QU'ON REFUSE, ET CE QU'ON NE REFUSE PAS ═══════════════════════════════════════════════
 *
 * UN MESSAGE QUI N'ANNONCE PAS UN LEAD rend 200 avec `ignore: true`. Le canal reçoit aussi des
 * arrivées de membres et ce que les gens y écrivent ; répondre en erreur ferait clignoter le
 * workflow en rouge pour un fonctionnement normal, et on finirait par ne plus le regarder.
 *
 * UN LEAD INCOMPLET REND 422 AVEC LA LISTE DES CHAMPS MANQUANTS. C'est le seul cas où l'on veut
 * que ça crie : il signifie que le format du message a changé et que l'analyse ne suit plus. Créer
 * une piste à moitié remplie serait pire — personne ne saurait qu'il lui manque quelque chose.
 *
 * ══ REJOUER NE DUPLIQUE PAS ══════════════════════════════════════════════════════════════════
 *
 * `pistes.source_externe_id` porte l'horodatage du message Slack, et il est unique (migration
 * 20260915120000). Un workflow qui réessaie, ou quelqu'un qui relance le même message, retombe sur
 * la piste existante et reçoit `deja: true`.
 */

/** Le propriétaire des leads du formulaire : 74 des 77 pistes de cette source sont à lui. */
const PROPRIETAIRE_PAR_DEFAUT_EMAIL = 'f.dubarry@kiwee-energie.fr'

/** La même valeur que les 77 pistes déjà en base, pour qu'un rapport n'ait pas deux lignes. */
const SOURCE = 'Google Ads sans facture (Inbound)'

function clientService() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non configurées')
  return createClient(url, cle, { auth: { persistSession: false } })
}

/** Comparaison à durée constante : une comparaison ordinaire laisse deviner le secret lettre à lettre. */
function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let different = 0
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return different === 0
}

/**
 * Le texte du message, quel que soit le nom que le workflow lui donne.
 *
 * Workflow Builder nomme ses variables comme l'utilisateur les a nommées, et la forme du corps
 * dépend de la version. Plutôt que d'imposer un nom et de découvrir l'erreur en production, on
 * accepte les noms plausibles — et à défaut, le corps entier s'il est du texte.
 */
function texteDuMessage(corps: unknown): string | null {
  if (typeof corps === 'string') return corps
  if (!corps || typeof corps !== 'object') return null
  const o = corps as Record<string, unknown>
  for (const cle of ['texte', 'text', 'message', 'message_text', 'contenu', 'body']) {
    const v = o[cle]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

/** L'horodatage Slack du message : c'est lui qui rend la création idempotente. */
function horodatageDuMessage(corps: Record<string, unknown>): string | null {
  for (const cle of ['ts', 'message_ts', 'event_ts', 'horodatage', 'timestamp']) {
    const v = corps[cle]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  /* Le lien permanent porte l'horodatage : .../p1757950861123456 → 1757950861.123456. C'est la
     variable que Workflow Builder propose le plus souvent, sous le nom « lien du message ». */
  for (const cle of ['lien', 'link', 'permalink', 'message_link', 'url']) {
    const v = corps[cle]
    if (typeof v === 'string') {
      const m = v.match(/\/p(\d{10})(\d{6})/)
      if (m) return `${m[1]}.${m[2]}`
    }
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const attendu = process.env.SLACK_WORKFLOW_SECRET
  if (!attendu) {
    /* On refuse plutôt que d'ouvrir : un point d'entrée qui crée des pistes sans protection parce
       qu'une variable manque est pire qu'un point d'entrée en panne. */
    res.status(500).json({ error: 'SLACK_WORKFLOW_SECRET non configurée' })
    return
  }
  const fourni = (req.headers['x-kimatch-secret'] as string | undefined)
    || (typeof req.query.cle === 'string' ? req.query.cle : '')
  if (!fourni || !memeSecret(fourni, attendu)) {
    res.status(401).json({ error: 'Secret absent ou invalide' })
    return
  }

  const corps = (typeof req.body === 'object' && req.body ? req.body : {}) as Record<string, unknown>
  const texte = texteDuMessage(req.body)
  if (!texte) {
    res.status(400).json({ error: 'Aucun texte de message trouvé dans la requête' })
    return
  }

  if (!estUnLead(texte)) {
    res.status(200).json({ ok: true, ignore: true, raison: "Ce message n'annonce pas un lead" })
    return
  }

  const lead = analyseLeadSlack(texte)
  if (lead.manques.length > 0) {
    console.error('[depuis-slack] lead illisible, champs manquants :', lead.manques.join(', '))
    res.status(422).json({
      error: 'Lead incomplet — le format du message a peut-être changé',
      manques: lead.manques,
    })
    return
  }

  const admin = clientService()

  const ts = horodatageDuMessage(corps)
  if (!ts) {
    /* SANS HORODATAGE ON CRÉE QUAND MÊME, mais sans protection contre le rejeu — et on le dit dans
       la réponse. Refuser ferait perdre un vrai lead parce que le workflow n'a pas transmis une
       variable ; créer en silence laisserait croire à une idempotence qui n'existe pas. */
    console.warn('[depuis-slack] aucun horodatage Slack : la création ne sera pas idempotente')
  }

  try {
    if (ts) {
      const { data: deja } = await admin
        .from('pistes').select('id, reference').eq('source_externe_id', ts).maybeSingle()
      if (deja) {
        res.status(200).json({ ok: true, deja: true, id: deja.id, reference: deja.reference })
        return
      }
    }

    const [{ data: proprietaire }, { data: statut }] = await Promise.all([
      admin.from('profils').select('id').eq('email', PROPRIETAIRE_PAR_DEFAUT_EMAIL).maybeSingle(),
      admin.from('statuts_pistes').select('id').eq('code', 'NOUVELLE').maybeSingle(),
    ])

    /* LE LOT DU PROPRIÉTAIRE, CELUI DE SON SEGMENT. Une piste sans lot n'est pas invisible, mais
       elle est hors plan de travail : personne ne la rencontre en déroulant sa liste. On vise le
       moins rempli, comme le fait le rattrapage des pistes Salesforce. */
    let lotId: string | null = null
    if (proprietaire) {
      const court = lead.segment === 'Syndic professionnel' ? 'Syndics' : 'Entreprises'
      const { data: lots } = await admin
        .from('lots_prospection').select('id, nom').eq('proprietaire_id', proprietaire.id)
      const candidat = (lots ?? []).find((l) => String(l.nom).includes(`· ${court}`))
      lotId = candidat ? (candidat.id as string) : null
    }

    const { data: creee, error } = await admin
      .from('pistes')
      .insert({
        societe: lead.societe,
        contact_nom: lead.contactNom,
        prenom: lead.prenom,
        nom: lead.nom,
        email: lead.email,
        telephone: lead.telephone,
        segment: lead.segment,
        commentaire: lead.commentaire,
        source: SOURCE,
        statut_salesforce: 'Nouvelle',
        statut_id: statut?.id ?? null,
        proprietaire_id: proprietaire?.id ?? null,
        lot_id: lotId,
        actif: true,
        source_externe_id: ts,
      })
      .select('id, reference')
      .single()

    if (error) {
      // L'unicité a joué entre notre lecture et notre écriture : deux appels simultanés, pas une panne.
      if (/duplicate key|unique/i.test(error.message) && ts) {
        const { data: existante } = await admin
          .from('pistes').select('id, reference').eq('source_externe_id', ts).maybeSingle()
        if (existante) {
          res.status(200).json({ ok: true, deja: true, id: existante.id, reference: existante.reference })
          return
        }
      }
      throw new Error(error.message)
    }

    console.log(`[depuis-slack] piste ${creee.reference} créée — ${lead.societe} / ${lead.contactNom}`)
    res.status(200).json({
      ok: true,
      id: creee.id,
      reference: creee.reference,
      idempotent: Boolean(ts),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    console.error('[depuis-slack] création impossible :', message)
    res.status(500).json({ error: message })
  }
}

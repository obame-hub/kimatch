import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cleService } from '../_cleService.js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { creerPisteDepuisLead } from '../pistes/_creerPisteDepuisLead.js'

/**
 * ══ SLACK PRÉVIENT KIMATCH À LA SECONDE OÙ UN LEAD ARRIVE ══
 *
 * Naoëlle, 15/09/2026 : « je veux que ça se déclenche quand on reçoit un nouveau lead, pas toutes
 * les dix minutes ».
 *
 * ══ POURQUOI PAS LE WORKFLOW SLACK ═══════════════════════════════════════════════════════════
 *
 * C'était le plan A : Workflow Builder → « envoyer une requête web ». Cette étape n'existe pas dans
 * le forfait Pro de KiWee — la recherche ne rend rien, et les étapes voisines portent une pastille
 * BUSINESS+. On ne paie pas un forfait supérieur pour ça : l'API d'événements fait la même chose,
 * en mieux, et elle est comprise dans toutes les formules.
 *
 * ══ CE QUE SLACK EXIGE, ET POURQUOI CHAQUE POINT COMPTE ══════════════════════════════════════
 *
 * IL VÉRIFIE L'ADRESSE AVANT DE S'ABONNER. À la configuration, il envoie `{type:'url_verification',
 * challenge}` et attend le `challenge` en retour. Sans cette réponse, l'abonnement ne s'active pas.
 *
 * IL SIGNE CHAQUE REQUÊTE. Ce point d'entrée est public — il n'a pas le choix, Slack n'a pas de
 * compte Kimatch. La signature est donc la seule chose qui distingue Slack de n'importe qui : sans
 * elle, un inconnu créerait des pistes en connaissant l'adresse.
 *
 * L'HORODATAGE DE LA REQUÊTE EST VÉRIFIÉ AUSSI, à cinq minutes près. Une signature valide reste
 * valide pour toujours : sans cette fenêtre, une requête interceptée pourrait être rejouée des mois
 * plus tard.
 *
 * IL VEUT UNE RÉPONSE EN MOINS DE TROIS SECONDES, sinon il considère l'envoi échoué et le rejoue
 * jusqu'à trois fois. D'où l'ordre ci-dessous : on répond `200` d'abord, on travaille ensuite. Un
 * rejeu ne duplique rien de toute façon — `pistes.source_externe_id` porte l'horodatage du message.
 */

const CANAL_LEADS = process.env.SLACK_CANAL_LEADS || 'C0AKN64MPFY'

function clientService() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const cle = cleService()
  if (!url || !cle) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY non configurées')
  return createClient(url, cle, { auth: { persistSession: false } })
}

/**
 * La requête vient-elle vraiment de Slack ? Rend `null` si oui, sinon la raison du refus.
 *
 * Signature `v0=HMAC-SHA256("v0:<horodatage>:<corps brut>")` avec le Signing Secret de l'app. On
 * compare en temps constant : une comparaison ordinaire s'arrête au premier caractère faux et
 * laisse deviner la signature attendue octet par octet.
 */
function signatureValide(req: VercelRequest, corpsBrut: string): string | null {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) return 'SLACK_SIGNING_SECRET absente de Vercel'

  const horodatage = req.headers['x-slack-request-timestamp'] as string | undefined
  const signature = req.headers['x-slack-signature'] as string | undefined
  if (!horodatage || !signature) return 'en-têtes de signature absents'

  // Cinq minutes : au-delà, on refuse même une signature juste — c'est un rejeu.
  const age = Date.now() / 1000 - Number(horodatage)
  if (Math.abs(age) > 300) return `requête vieille de ${Math.round(age)} s`

  const attendue = 'v0=' + createHmac('sha256', secret)
    .update(`v0:${horodatage}:${corpsBrut}`)
    .digest('hex')

  const a = Buffer.from(attendue)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return `empreinte différente (corps de ${corpsBrut.length} octets)`
  }
  return null
}

/**
 * ══ ON COUPE L'ANALYSE AUTOMATIQUE DU CORPS ══
 *
 * LA SIGNATURE PORTE SUR LES OCTETS EXACTS que Slack a envoyés, pas sur l'objet qu'ils décrivent.
 * Vercel analyse le JSON avant de nous le remettre et n'expose pas l'original ; le ré-encoder avec
 * `JSON.stringify` change l'ordre des clés et les espaces, et l'empreinte ne correspond plus.
 *
 * LA PREMIÈRE VERSION FAISAIT EXACTEMENT ÇA, avec en commentaire « ce cas échouera à la
 * vérification, ce qui est le bon comportement ». C'était une rationalisation : le point d'entrée
 * répondait 401 à TOUS les événements, et le test de Naoëlle du 15/09 n'a rien créé. Refuser tout
 * n'est pas « sûr », c'est en panne.
 *
 * On lit donc le flux nous-mêmes, et on analyse le JSON après avoir signé sur les vrais octets.
 */
export const config = { api: { bodyParser: false } }

async function corpsBrutDe(req: VercelRequest): Promise<string> {
  const morceaux: Buffer[] = []
  for await (const m of req as unknown as AsyncIterable<Buffer | string>) {
    morceaux.push(typeof m === 'string' ? Buffer.from(m) : m)
  }
  return Buffer.concat(morceaux).toString('utf8')
}

interface EvenementSlack {
  type?: string
  challenge?: string
  event?: {
    type?: string
    subtype?: string
    channel?: string
    ts?: string
    text?: string
    bot_id?: string
    app_id?: string
    blocks?: unknown[]
  }
}

/** Le texte d'un message d'app peut vivre dans ses blocs plutôt que dans `text`. */
function texteDesBlocs(blocs: unknown): string {
  if (!Array.isArray(blocs)) return ''
  const morceaux: string[] = []
  const parcourir = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    if (typeof o.text === 'string') morceaux.push(o.text)
    else if (o.text) parcourir(o.text)
    for (const cle of ['elements', 'fields']) {
      const v = o[cle]
      if (Array.isArray(v)) v.forEach(parcourir)
    }
  }
  blocs.forEach(parcourir)
  return morceaux.join('\n').trim()
}

/**
 * ══ LE TRACEUR : SAVOIR SI SLACK APPELLE, TOUT COURT ══
 *
 * 15/09, 14 h 38 : Naoëlle poste un lead, aucune piste. Deux causes possibles et indiscernables de
 * l'extérieur — Slack appelle et on refuse, ou Slack n'appelle pas. Sans les journaux Vercel, rien
 * ne les sépare, et chaque hypothèse coûte un message de plus dans un canal que toute l'équipe lit.
 *
 * On garde donc en mémoire les dix derniers appels reçus, que le GET rend. Ça survit tant que
 * l'instance reste chaude — quelques minutes, ce qui suffit à regarder juste après un test.
 *
 * ON N'Y MET AUCUN CONTENU : ni le texte du message, ni un nom, ni un e-mail. Ce point d'entrée est
 * public. Seulement de quoi répondre à « est-ce que Slack a appelé, et qu'a-t-on répondu ».
 */
interface Trace { a: string; issue: string; type?: string; canal?: string; slack: boolean }
const traces: Trace[] = []
function tracer(t: Omit<Trace, 'a'>): void {
  traces.unshift({ a: new Date().toISOString(), ...t })
  if (traces.length > 10) traces.pop()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* ══ UN GET DIT SI LE POINT D'ENTRÉE EST PRÊT ══
     Naoëlle, 15/09 : « je peux pas envoyer des messages indéfiniment, c'est chiant pour les
     autres ». Chaque test lui coûte une notification à toute l'équipe. Ceci permet de vérifier la
     configuration SANS rien poster : si une variable manque, on le sait avant, pas après.
     ON NE REND QUE DES OUI/NON — jamais la valeur d'un secret, ce point d'entrée est public. */
  if (req.method === 'GET') {
    const secret = Boolean(process.env.SLACK_SIGNING_SECRET)
    const base = Boolean(
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
      cleService(),
    )

    /* LE JETON DU BOT SE VÉRIFIE EN L'UTILISANT, pas en constatant qu'il est renseigné. Réinstaller
       l'app Slack en émet un neuf et révoque l'ancien ; une variable pleine d'un jeton mort a
       exactement l'air d'une variable correcte. Ce jeton ne sert pas au temps réel mais au filet de
       nuit (`rattraper-leads`), dont on ne verrait l'échec qu'au petit matin. */
    let jeton = 'absent'
    if (process.env.SLACK_BOT_TOKEN) {
      try {
        const r = await fetch('https://slack.com/api/auth.test', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
        })
        const j = (await r.json()) as { ok?: boolean; error?: string; team?: string; user?: string }
        jeton = j.ok ? `valide (${j.team} / ${j.user})` : `refusé : ${j.error}`
      } catch {
        jeton = 'Slack injoignable'
      }
    }
    /* LE COMMIT DÉPLOYÉ. Vercel le pose lui-même dans l'environnement. Sans lui, « est-ce que ma
       correction est en ligne ? » ne se répond que par déduction — et on l'a fait trois fois
       aujourd'hui. */
    res.status(200).json({
      pret: secret && base,
      signature: secret,
      base,
      canal: CANAL_LEADS,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'inconnue',
      jeton,
      traces,
    })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const signeParSlack = Boolean(req.headers['x-slack-signature'])
  const brut = await corpsBrutDe(req)
  let corps: EvenementSlack
  try {
    corps = JSON.parse(brut || '{}') as EvenementSlack
  } catch {
    tracer({ issue: 'corps illisible', slack: signeParSlack })
    res.status(400).json({ error: 'Corps illisible' })
    return
  }

  /* LA VÉRIFICATION D'ADRESSE SE RÉPOND AVANT TOUT CONTRÔLE DE SIGNATURE — Slack l'envoie
     justement pour établir la confiance, et elle ne porte aucune donnée. */
  if (corps?.type === 'url_verification' && corps.challenge) {
    tracer({ issue: 'vérification d’adresse', slack: signeParSlack })
    res.status(200).send(corps.challenge)
    return
  }

  const refus = signatureValide(req, brut)
  if (refus) {
    /* ON DIT LEQUEL DES QUATRE CONTRÔLES A CÉDÉ. Sans ça, un secret mal collé dans Vercel et des
       octets mal lus donnent le même 401 muet, et on cherche du mauvais côté pendant une journée —
       ce qui est exactement ce qui vient d'arriver. */
    tracer({ issue: `refusé : ${refus}`, slack: signeParSlack })
    console.warn(`[slack/evenements] signature refusée : ${refus}`)
    res.status(401).json({ error: 'Signature Slack invalide' })
    return
  }

  /* ══ ON TRAVAILLE AVANT DE RÉPONDRE ══
     La version précédente répondait `200` d'abord « pour ne pas faire patienter Slack ». Sur Vercel,
     une fonction peut être gelée À L'INSTANT où elle répond : tout ce qui suit ne s'exécute pas. La
     piste n'était donc jamais créée — et comme Slack recevait un `200`, il ne rejouait rien, ce qui
     rendait la panne parfaitement silencieuse.

     C'EST LA MÊME ERREUR QUE `api/gmail/ouvert.ts`, où elle avait déjà été corrigée de cette façon :
     on écrit d'abord, on répond dans le `finally`. Elle n'avait pas été reportée ici.

     Slack veut une réponse en moins de trois secondes ; la création tourne autour de la
     demi-seconde, on tient largement. Et si un jour elle traînait, Slack rejouerait — sans créer de
     doublon, `source_externe_id` étant unique. Un rejeu coûte moins cher qu'un lead perdu. */
  try {
    const e = corps?.event
    tracer({ issue: 'accepté', type: e?.type, canal: e?.channel, slack: signeParSlack })
    if (!e || e.type !== 'message') return
    if (e.channel !== CANAL_LEADS) return
    /* Les modifications, suppressions et arrivées de membres passent par le même événement, avec un
       `subtype`. Seul `bot_message` nous intéresse en plus du message nu : c'est celui de l'app. */
    if (e.subtype && e.subtype !== 'bot_message') return

    const texte = (e.text && e.text.trim()) || texteDesBlocs(e.blocks)
    if (!texte || !e.ts) return

    const resultat = await creerPisteDepuisLead(clientService(), texte, e.ts)
    tracer({ issue: `lead ${resultat.etat}`, type: e.type, canal: e.channel, slack: signeParSlack })
    switch (resultat.etat) {
      case 'cree':
        console.log(`[slack/evenements] piste ${resultat.reference} créée`)
        break
      case 'deja':
        console.log(`[slack/evenements] déjà connue : ${resultat.reference}`)
        break
      case 'illisible':
        /* LE SEUL CAS QUI DOIT CRIER : le format du message a changé et l'analyse ne suit plus.
           Sans cette ligne, les leads cesseraient d'arriver en silence. */
        console.error(
          `[slack/evenements] LEAD ILLISIBLE — champs manquants : ${resultat.manques.join(', ')}
` +
          `message : ${texte.slice(0, 400)}`,
        )
        break
      case 'ignore':
        break
    }
  } catch (err) {
    tracer({ issue: 'erreur de création', slack: signeParSlack })
    console.error('[slack/evenements] création impossible :',
      err instanceof Error ? err.message : err)
  } finally {
    /* DANS LE `finally` : quoi qu'il arrive au-dessus, Slack reçoit sa réponse. Sans elle il rejoue
       trois fois puis considère notre point d'entrée en panne. */
    res.status(200).json({ ok: true })
  }
}

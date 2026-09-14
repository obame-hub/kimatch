import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { refreshAccessToken, lireFilGmail, ErreurLectureGmail } from './_client.js'

/**
 * ══ LES RÉPONSES DES CLIENTS REVIENNENT DANS KIMATCH ══
 *
 * William, 14/09/2026 : « il faut un tracking sur les mails qu'on envoie et reçoit, tracker toutes
 * les activités, et avoir le fil de la conversation de mail dans Kimatch ».
 *
 * Kimatch envoie avec le Gmail de chacun, et consigne l'envoi. La réponse, elle, arrive dans la
 * boîte de l'expéditeur : la fiche du client restait muette sur la moitié de la conversation — et
 * c'est la moitié la plus intéressante, celle où le client dit oui, non, ou rappelez-moi en mars.
 *
 * ══ ON NE LIT QUE LES FILS QUE KIMATCH A OUVERTS ═════════════════════════════════════════════
 *
 * `gmail.readonly` donne accès à TOUTE la boîte — Google n'offre pas plus fin, il n'existe pas de
 * droit « les conversations de cette application seulement ». La restriction est donc ici, et elle
 * est simple à vérifier : la liste des fils vient de `interactions.fil_discussion`, c'est-à-dire
 * des conversations que Kimatch a lui-même commencées en envoyant un mail. On ne demande jamais la
 * liste des messages d'une boîte, jamais une recherche, jamais un fil qu'on ne connaît pas déjà.
 *
 * ══ POURQUOI PAS LES NOTIFICATIONS GMAIL (watch + Pub/Sub) ═══════════════════════════════════
 *
 * Elles préviendraient en temps réel au lieu de passer toutes les heures. Elles demandent un projet
 * Google Cloud, un sujet Pub/Sub, un abonnement, et un `watch` à renouveler tous les sept jours par
 * personne — sans quoi le flux s'arrête en silence. Pour un CRM où l'on relit un échange à la demi-
 * journée près, la tâche périodique répond au besoin et n'a rien à renouveler.
 *
 * ══ IDEMPOTENT PAR CONSTRUCTION ══════════════════════════════════════════════════════════════
 *
 * `interactions.source_externe_id` porte l'identifiant Gmail du message et il est UNIQUE. Repasser
 * sur un fil déjà lu n'écrit rien. C'est ce qui permet de relire large sans compter les doublons.
 */

const FILS_PAR_PASSAGE = 200

function clientService() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non configurées')
  return createClient(url, cle, { auth: { persistSession: false } })
}

interface Jeton {
  profil_id: string
  email_gmail: string
  refresh_token: string
  access_token: string | null
  access_token_expires_at: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* LA GARDE, reprise à l'identique des autres tâches. `x-vercel-cron` n'est pas une barrière :
     n'importe qui peut poser cet en-tête. La barrière réelle est `CRON_SECRET`. */
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Réservé à la tâche planifiée' })
      return
    }
  } else if (!req.headers['x-vercel-cron']) {
    res.status(401).json({ error: 'Réservé à la tâche planifiée' })
    return
  }

  const admin = clientService()

  const { data: jetons, error: erreurJetons } = await admin
    .from('profils_gmail_tokens')
    .select('profil_id, email_gmail, refresh_token, access_token, access_token_expires_at')
  if (erreurJetons) {
    res.status(500).json({ error: erreurJetons.message })
    return
  }

  const { data: typeEmail } = await admin
    .from('types_interactions').select('id').eq('code', 'EMAIL').maybeSingle()
  if (!typeEmail) {
    res.status(500).json({ error: "Le type d'interaction EMAIL est absent du référentiel" })
    return
  }

  const bilan = {
    personnes: 0,
    sansDroitDeLecture: 0,
    filsRelus: 0,
    reponsesEcrites: 0,
    filsDisparus: 0,
    erreurs: [] as string[],
  }

  for (const jeton of (jetons ?? []) as Jeton[]) {
    bilan.personnes++

    /* LES FILS DE CETTE PERSONNE, ET D'ELLE SEULE. Deux commerciaux peuvent écrire au même client ;
       chacun ne peut lire que les conversations parties de SA boîte, et son jeton ne donnerait
       rien sur celles de l'autre. */
    const { data: fils } = await admin
      .from('interactions')
      .select('fil_discussion, piste_id, contact_id, compte_id')
      .eq('auteur_profil_id', jeton.profil_id)
      .not('fil_discussion', 'is', null)
      /* ══ SEULS LES FILS GMAIL, ET C'EST UN PIÈGE QU'IL A FALLU VOIR ══
         `fil_discussion` porte deux choses de forme différente. Les 1 593 mails repris de
         Salesforce y ont un `Message-ID` RFC — `<CAGtyFLx...@mail.gmail.com>` — tandis qu'un mail
         parti de Kimatch y a un identifiant de conversation Gmail, une suite hexadécimale sans
         chevrons ni arobase.

         Sans ce filtre, la tâche demandait à Gmail 1 082 conversations qui n'existent pas sous ce
         nom : 1 082 réponses 404 par personne et par heure, pour rien. Le chevron initial suffit à
         les séparer, et il est stable — un identifiant Gmail n'en porte jamais.

         CONSÉQUENCE À CONNAÎTRE : les conversations reprises de Salesforce ne rapatrient donc pas
         leurs réponses. Seules celles ouvertes DEPUIS Kimatch le font. Retrouver le fil Gmail d'un
         Message-ID est possible (`rfc822msgid:` dans la recherche Gmail) et ferait un rattrapage
         unique des 1 082 ; c'est un second mécanisme, il se décide à part. */
      .not('fil_discussion', 'like', '<%')
      .order('date_interaction', { ascending: false })
      .limit(2000)

    /* Un fil peut porter plusieurs interactions ; on garde le rattachement de la plus récente,
       c'est celui qui décrit le mieux où en est la conversation. */
    const parFil = new Map<string, { piste_id: string | null; contact_id: string | null; compte_id: string | null }>()
    for (const l of fils ?? []) {
      const f = l.fil_discussion as string
      if (!parFil.has(f)) {
        parFil.set(f, {
          piste_id: l.piste_id as string | null,
          contact_id: l.contact_id as string | null,
          compte_id: l.compte_id as string | null,
        })
      }
    }
    if (parFil.size === 0) continue

    // ── Le jeton d'accès, rafraîchi si besoin ──
    let accessToken = jeton.access_token
    const expire = jeton.access_token_expires_at
      ? new Date(jeton.access_token_expires_at).getTime()
      : 0
    if (!accessToken || expire < Date.now() + 60_000) {
      try {
        const frais = await refreshAccessToken(jeton.refresh_token)
        accessToken = frais.access_token
        await admin.from('profils_gmail_tokens').update({
          access_token: accessToken,
          access_token_expires_at: new Date(Date.now() + frais.expires_in * 1000).toISOString(),
        }).eq('profil_id', jeton.profil_id)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'jeton non rafraîchissable'
        bilan.erreurs.push(`${jeton.email_gmail} : ${message}`)
        await admin.from('profils_gmail_tokens')
          .update({ dernier_echec_rapatriement: message }).eq('profil_id', jeton.profil_id)
        continue
      }
    }

    const dejaVus = new Set<string>()
    {
      const { data } = await admin
        .from('interactions').select('source_externe_id')
        .not('source_externe_id', 'is', null)
        .in('fil_discussion', [...parFil.keys()].slice(0, FILS_PAR_PASSAGE))
      for (const l of data ?? []) dejaVus.add(l.source_externe_id as string)
    }

    let droitRefuse = false
    let ecritesPourCettePersonne = 0

    for (const [fil, contexte] of [...parFil.entries()].slice(0, FILS_PAR_PASSAGE)) {
      if (droitRefuse) break
      let messages
      try {
        messages = await lireFilGmail(accessToken!, fil, jeton.email_gmail)
        bilan.filsRelus++
      } catch (e) {
        if (e instanceof ErreurLectureGmail) {
          /* 403 : le droit de lecture n'a pas été accordé. Inutile d'essayer les 199 fils suivants —
             ils échoueront tous pareil, et on aurait 200 lignes d'erreur pour un seul fait. */
          if (e.statut === 403 || e.statut === 401) { droitRefuse = true; continue }
          // 404 : le fil a été supprimé dans la boîte. Ce n'est pas une panne, c'est une vie de mail.
          if (e.statut === 404) { bilan.filsDisparus++; continue }
        }
        bilan.erreurs.push(`${jeton.email_gmail} / ${fil} : ${e instanceof Error ? e.message : 'erreur'}`)
        continue
      }

      for (const m of messages) {
        /* ON N'ÉCRIT QUE CE QUI ARRIVE. Nos propres envois sont déjà consignés par `send.ts` au
           moment où ils partent — les réécrire ici les dupliquerait sous un autre identifiant si
           jamais l'unicité venait à sauter, et surtout n'apprendrait rien. */
        if (!m.entrant) continue
        if (dejaVus.has(m.id)) continue

        const { error } = await admin.from('interactions').insert({
          type_interaction_id: typeEmail.id,
          date_interaction: m.date,
          sens: 'ENTRANT',
          objet: (m.objet || '(sans objet)').slice(0, 500),
          resume: m.texte.slice(0, 8000),
          fil_discussion: fil,
          source_externe_id: m.id,
          numero_correspondant: m.de.slice(0, 255) || null,
          piste_id: contexte.piste_id,
          contact_id: contexte.contact_id,
          compte_id: contexte.compte_id,
          /* PAS D'AUTEUR : personne chez KiWee n'a écrit ce message. Y mettre le commercial ferait
             dire à l'historique qu'il a envoyé ce que le client a écrit. Le propriétaire, lui, dit
             qui suit l'échange — et ça, c'est vrai. */
          proprietaire_id: jeton.profil_id,
        })
        if (error) {
          // L'unicité de `source_externe_id` : une course entre deux passages, pas une panne.
          if (!/duplicate key|unique/i.test(error.message)) {
            bilan.erreurs.push(`${jeton.email_gmail} / ${m.id} : ${error.message}`)
          }
          continue
        }
        dejaVus.add(m.id)
        ecritesPourCettePersonne++
        bilan.reponsesEcrites++
      }
    }

    if (droitRefuse) bilan.sansDroitDeLecture++
    await admin.from('profils_gmail_tokens').update({
      lecture_autorisee: !droitRefuse,
      date_dernier_rapatriement: new Date().toISOString(),
      dernier_echec_rapatriement: droitRefuse
        ? 'Lecture non autorisée : la connexion Gmail doit être refaite pour accorder le droit de lire les réponses.'
        : null,
    }).eq('profil_id', jeton.profil_id)

    console.log(
      `[rapatrier] ${jeton.email_gmail} — ${ecritesPourCettePersonne} réponse(s)` +
      (droitRefuse ? ' — LECTURE REFUSÉE, reconnexion nécessaire' : ''),
    )
  }

  res.status(200).json({ ok: true, ...bilan })
}

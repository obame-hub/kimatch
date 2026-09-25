import type { VercelRequest, VercelResponse } from '@vercel/node'
import { messageAnthropicLisible } from '../_anthropic.js'
import { createClient } from '@supabase/supabase-js'
import { exigerSession } from '../_auth.js'
import { cleService, urlSupabase } from '../_cleService.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'AVIS DE KIMATCH SUR UNE FICHE — LIRE LES ÉCHANGES, PUIS DIRE QUOI FAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026, sur le troisième héros du fil d'activité : « un agent IA qui conseille quoi
 * faire ». Et, sur le second : « c'est l'analyse des réponses et des conversations qui doivent être
 * positifs ou négatifs et faire évoluer le score en ce sens ».
 *
 * ══ UN SEUL APPEL FAIT LES DEUX ══
 *
 * Le conseil et la valence viennent de la même lecture : on ne peut pas dire quoi faire sans avoir
 * compris ce qui s'est dit. Les séparer aurait fait payer deux fois la même analyse.
 *
 * ══ LA VALENCE EST ÉCRITE EN BASE, LE CONSEIL NON ══
 *
 * La valence est un FAIT sur un échange passé : elle ne changera plus, elle se stocke, et elle sert
 * au score à chaque ouverture de fiche sans rien coûter. Le conseil, lui, dépend du jour où on le
 * demande — le stocker reviendrait à afficher demain l'avis d'hier.
 *
 * UNE VALENCE POSÉE À LA MAIN N'EST JAMAIS RÉÉCRITE (`sentiment_source = 'HUMAIN'`). C'est la règle
 * de la migration 20260922140000, et elle vaut ici : sinon l'analyse effacerait chaque nuit les
 * corrections de la veille.
 *
 * ══ CE QUI EST ENVOYÉ À ANTHROPIC ══
 *
 * Des résumés d'échanges et le nom de la société — jamais un numéro de téléphone, jamais une
 * adresse e-mail, jamais un enregistrement. Le modèle n'a pas besoin des coordonnées pour dire s'il
 * faut relancer, et ce qu'on n'envoie pas ne peut pas fuiter.
 */

const CONTEXTE_METIER = `Tu conseilles un commercial de Kiwee Énergie, courtier en énergie pour les copropriétés et les entreprises en France. Il travaille dans Kimatch, leur CRM, et il est sur le point d'appeler ce contact.

Ce qu'il faut savoir du métier :
- Une PISTE est un simple contact : on ne connaît pas encore son parc. Le but unique de l'appel est d'OBTENIR UNE FACTURE. C'est elle qui permet de créer un périmètre, puis de convertir la piste en opportunité. Tant qu'il n'y a pas de facture, il n'y a rien à vendre.
- Une OPPORTUNITÉ a le plus souvent un périmètre connu (des compteurs). Le but est d'abord de le COUVRIR ENTIÈREMENT (obtenir les factures manquantes), puis d'obtenir un MANDAT, puis un GO pour lancer l'appel d'offres auprès des fournisseurs.
- La piste précède toujours l'opportunité. L'historique d'une opportunité contient donc souvent le travail fait quand ce n'était encore qu'une piste.
- Les interlocuteurs sont surtout des syndics de copropriété : gestionnaires, présidents de conseil syndical, responsables d'agence.`

const CONSIGNE = `Tu reçois l'historique des échanges avec ce contact, du plus récent au plus ancien. Réponds UNIQUEMENT par un objet JSON, sans texte autour, sans balises markdown, de cette forme :

{
  "valences": [
    { "id": "<l'id de l'échange>", "valence": "POSITIF" | "NEUTRE" | "NEGATIF", "motif": "<une demi-phrase en français, 10 mots maximum>" }
  ],
  "conseil": {
    "titre": "<l'action à faire, 6 mots maximum, à l'impératif>",
    "texte": "<deux phrases maximum : pourquoi cette action maintenant, et l'angle à prendre>",
    "risque": "<un seul point de vigilance en une demi-phrase, ou null s'il n'y en a pas>"
  }
}

Règles impératives pour les valences :
- Ne valence QUE les échanges qui viennent du contact : une réponse reçue, une conversation aboutie. Un mail que nous avons envoyé et un appel sans réponse ne portent aucun signal — ne les inclus pas.
- La valence dit CE QUE LE CONTACT A EXPRIMÉ, pas le fait qu'il ait répondu. Une réponse agacée, un refus, une demande de ne plus être contacté sont NEGATIF, même si répondre est en soi un signe d'attention.
- NEUTRE est pour un échange réel mais sans orientation : une prise de rendez-vous technique, une redirection vers un collègue, un accusé de réception.
- Si le résumé ne permet pas de trancher, n'inclus pas cet échange dans la liste plutôt que de deviner.
- N'invente jamais un id : reprends exactement ceux qui te sont donnés.

Règles impératives pour le conseil :
- Une seule action, la plus utile aujourd'hui, en tenant compte de ce qui a déjà été tenté.
- Si le contact a exprimé un refus clair, dis-le et propose de lever le pied ou de clore, pas de relancer.
- Écris en français, au vouvoiement, sans jargon, sans superlatif.`

interface Echange {
  id: string
  nature: string
  sens: string | null
  quand: string
  objet: string | null
  resume: string | null
  etiquettes?: string[]
  aura?: number | null
  issue?: string | null
}

export interface ConseilFiche {
  success: boolean
  error?: string
  valences?: { id: string; valence: string; motif: string }[]
  conseil?: { titre: string; texte: string; risque: string | null }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  /* MÊME GARDE QUE L'EXTRACTION DE DOCUMENTS : cet appel est facturé à l'usage, et sans session un
     tiers consommerait le budget de Kiwee en postant ses propres textes. */
  const utilisateur = await exigerSession(req, res)
  if (!utilisateur) return

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(200).json({ success: false, error: 'Avis indisponible : clé ANTHROPIC_API_KEY manquante sur le serveur.' })
    return
  }

  const { fiche, echanges } = (req.body ?? {}) as {
    fiche?: { type?: string; nom?: string; societe?: string; statut?: string; perimetre?: string; tache?: string }
    echanges?: Echange[]
  }
  if (!fiche || !Array.isArray(echanges)) {
    res.status(400).json({ error: 'Fiche et échanges requis.' })
    return
  }

  /* ON N'ENVOIE QUE CE QUI SE LIT. Un échange sans résumé ni objet n'apprend rien au modèle et
     coûte des jetons ; les quarante plus récents suffisent à juger d'une relation. */
  const utiles = echanges
    .filter((e) => (e.resume && e.resume.trim()) || (e.objet && e.objet.trim()))
    .slice(0, 40)

  const recit = utiles.map((e) => {
    const quand = new Date(e.quand).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const qui = e.sens === 'ENTRANT' ? 'DU CONTACT' : e.sens === 'INTERNE' ? 'NOTE INTERNE' : 'DE NOUS'
    const details = [
      e.etiquettes?.length ? `étiquettes Allô : ${e.etiquettes.join(', ')}` : null,
      e.aura ? `aura ${e.aura}/5` : null,
      e.issue ? `issue : ${e.issue}` : null,
    ].filter(Boolean).join(' · ')
    return `[id: ${e.id}] ${quand} — ${e.nature} ${qui}${details ? ` (${details})` : ''}\n${e.objet ? `Objet : ${e.objet}\n` : ''}${e.resume ?? ''}`
  }).join('\n\n')

  const entete = [
    `Type de fiche : ${fiche.type === 'PISTE' ? 'PISTE' : 'OPPORTUNITÉ'}`,
    fiche.nom ? `Contact : ${fiche.nom}` : null,
    fiche.societe ? `Société : ${fiche.societe}` : null,
    fiche.statut ? `Statut : ${fiche.statut}` : null,
    fiche.perimetre ? `Périmètre : ${fiche.perimetre}` : null,
    fiche.tache ? `Tâche du jour : ${fiche.tache}` : null,
  ].filter(Boolean).join('\n')

  const invite = `${CONTEXTE_METIER}\n\n---\n\n${entete}\n\n---\n\nHISTORIQUE DES ÉCHANGES (du plus récent au plus ancien) :\n\n${recit || '(aucun échange enregistré)'}\n\n---\n\n${CONSIGNE}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [{ type: 'text', text: invite }] }],
      }),
    })

    const data = (await resp.json()) as { error?: { message?: string }; content?: { text?: string }[] }
    if (!resp.ok) {
      res.status(200).json({ success: false, error: messageAnthropicLisible(resp.status, data?.error?.message) })
      return
    }

    const texte = Array.isArray(data.content) ? data.content.map((c) => c.text ?? '').join('') : ''
    const bloc = texte.match(/```json\s*([\s\S]*?)```/) || texte.match(/\{[\s\S]*\}/)
    let lu: { valences?: { id: string; valence: string; motif: string }[]; conseil?: ConseilFiche['conseil'] }
    try {
      lu = JSON.parse((bloc ? (bloc[1] ?? bloc[0]) : texte).trim())
    } catch {
      res.status(200).json({ success: false, error: 'Impossible de lire la réponse de l’IA.' })
      return
    }

    /* ── ON N'ÉCRIT QUE CE QUI EST RECEVABLE ──
       Les identifiants doivent venir de la liste qu'on a envoyée, et la valence doit appartenir au
       vocabulaire de la contrainte. Un modèle qui invente doit se heurter à notre garde, pas à
       celle de Postgres. */
    const connus = new Set(utiles.map((e) => e.id))
    const VALENCES = ['POSITIF', 'NEUTRE', 'NEGATIF']
    const valences = (lu.valences ?? []).filter(
      (v) => v && connus.has(v.id) && VALENCES.includes(v.valence),
    )

    /* ══ LES INTERACTIONS DOIVENT ÊTRE LES SIENNES — 25/09/2026 ══
       Le filtre ci-dessus garde contre l'IA qui inventerait un identifiant. Il ne garde RIEN contre
       l'appelant : `utiles` vient de `echanges`, c'est-à-dire du corps de la requête. N'importe quel
       utilisateur connecté faisait donc écrire un `sentiment` sur les interactions d'un collègue —
       en clé de service, donc sans qu'aucune policy n'intervienne.
       On demande à la base lesquelles il voit VRAIMENT, avec son propre jeton, et l'on n'écrit que
       sur celles-là. */
    /* Ce qui a RÉELLEMENT été écrit. Sans session valide en base, rien ne l'est — et la réponse
       doit le dire plutôt que de renvoyer ce que l'IA a proposé. */
    let ecrites: { id: string; valence: string; motif: string }[] = []
    const url = urlSupabase()
    const cle = cleService()
    if (url && cle && valences.length > 0) {
      const siennes = await interactionsVisibles(
        utilisateur.authHeader, valences.map((v) => v.id))
      const retenues = valences.filter((v) => siennes.has(v.id))
      ecrites = retenues
      const admin = createClient(url, cle)
      for (const v of retenues) {
        await admin
          .from('interactions')
          .update({
            sentiment: v.valence,
            sentiment_source: 'IA',
            sentiment_motif: typeof v.motif === 'string' ? v.motif.slice(0, 200) : null,
          })
          .eq('id', v.id)
          /* LA CORRECTION HUMAINE EST INTOUCHABLE. `neq` seul laisserait passer les lignes dont la
             source est nulle, d'où le `or`. */
          .or('sentiment_source.is.null,sentiment_source.eq.IA')
      }
    }

    /* ON REND CE QUI A ETE ECRIT, pas ce que l IA a propose : afficher un sentiment qui n a pas
       ete enregistre ferait croire a une sauvegarde qui n a pas eu lieu. */
    res.status(200).json({ success: true, valences: ecrites, conseil: lu.conseil })
  } catch (err) {
    res.status(200).json({ success: false, error: err instanceof Error ? err.message : 'Erreur inconnue.' })
  }
}

/**
 * LES INTERACTIONS QUE CET APPELANT VOIT VRAIMENT.
 *
 * On interroge avec SON jeton, jamais avec la clé de service : ce sont les policies qui répondent,
 * et l'on n'a donc aucune règle d'accès à réécrire ici — c'est ce qui évite qu'une seconde version
 * de la règle diverge de la première.
 *
 * EN UNE SEULE REQUÊTE pour toute la liste : quarante allers-retours pour quarante échanges
 * rendraient l'avis si lent que personne ne l'attendrait.
 *
 * EN CAS DE PANNE, ON NE REND RIEN, donc rien ne s'écrit. Laisser passer sur une erreur rouvrirait
 * exactement ce que ce contrôle ferme.
 */
async function interactionsVisibles(authHeader: string, ids: string[]): Promise<Set<string>> {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || ids.length === 0) return new Set()

  const liste = ids.map((i) => `"${i}"`).join(',')
  const rep = await fetch(
    `${url}/rest/v1/interactions?id=in.(${encodeURIComponent(liste)})&select=id`,
    { headers: { apikey: anon, Authorization: authHeader } },
  )
  if (!rep.ok) return new Set()

  const lignes = (await rep.json()) as { id: string }[]
  return new Set(Array.isArray(lignes) ? lignes.map((l) => l.id) : [])
}

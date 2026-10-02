import type { VercelRequest, VercelResponse } from '@vercel/node'
import { messageAnthropicLisible } from '../_anthropic.js'
import { exigerSession, refuserLesPartenaires } from '../_auth.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA LECTURE D'UNE PROPOSITION FOURNISSEUR — le dépôt du Pricer
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 02/10/2026, sur l'offre Gaz Européen de CAPTA – 21-23 rue Lalande :
 *   « Il faut lire en haut la durée — ici "36 mois" (permet d'identifier la ligne à remplir).
 *     Il faut lire le P0 — ici 55,01 (mais avec 6 €/MWh de marge incluse).
 *     Il faut lire l'abonnement — ici 4 487,96 €/an (donc à transformer en €/mois).
 *     Il faut lire les CEE — ici l'addition des "CEE CLASSIQUES" + "CEE PRECARITES" (7,03 + 4,52). »
 *
 * CE POINT D'ENTRÉE NE FAIT QUE LIRE : il rend ce qui est imprimé, tel quel. Retirer la marge incluse,
 * passer l'abonnement au mois et choisir la ligne, c'est le Pricer (`src/lib/pricing/lectureOffre.ts`),
 * sous les yeux du pricing qui confirme.
 *
 * CE QUI N'EST PAS LU : TQD, ATRD, CTA, accise, CPB, TURPE. Ils sont décrétés et viennent de la base
 * (Administration › Pricing), datés comme il faut — le chiffre du fournisseur, lui, est celui du jour
 * où il a émis son offre.
 *
 * Ne jamais importer ce fichier depuis le code du navigateur : la clé API n'existe que côté serveur.
 */

const CONSIGNE = `Tu lis une PROPOSITION DE PRIX envoyée par un fournisseur d'énergie (gaz ou électricité) à un courtier français, KiWee. Le document peut porter une ou plusieurs offres (plusieurs durées, plusieurs points de livraison).

Retourne UNIQUEMENT un objet JSON, sans texte autour ni balise markdown, de la forme :
{
  "fournisseur_nom": texte — le fournisseur qui fait l'offre (ex. "Gaz Européen"), pas le client ni le syndic,
  "type_energie": "gaz" ou "electricite",
  "reference_offre": texte — l'identifiant de l'offre s'il est imprimé,
  "client": texte — le client ou le site tel qu'il est nommé,
  "date_prise_effet": "YYYY-MM-DD" — le début de fourniture,
  "date_validite": "YYYY-MM-DDTHH:MM" — jusqu'à quand les prix sont valables (heure 00:00 si absente),
  "offres": [
    {
      "numero_point": texte — le PCE (gaz) ou le PDL/PRM (électricité), sans espaces, jamais tronqué ni reformaté (un PCE peut s'écrire "GI" suivi de 6 chiffres),
      "duree_mois": entier — la durée de l'offre, le plus souvent écrite en tête (« PRIX FIXE - 36 MOIS ») ; « 3 ans » vaut 36,
      "type_prix": "Fixe" ou "Indexé",
      "car_mwh": nombre — la consommation annuelle de référence (CAR) ou prévisionnelle en MWh,
      "profil": texte — le profil gaz (P011 à P019, toujours sur trois chiffres) ou la FTA en électricité,
      "p0_mwh": nombre — GAZ : le prix de la molécule (souvent noté P0), en €/MWh, tel qu'il est imprimé,
      "prix_postes_mwh": { "POINTE", "HPH", "HCH", "HPE", "HCE", "BASE", "HP", "HC" } — ÉLECTRICITÉ : le prix de l'énergie de chaque poste horaire en €/MWh, seulement les postes imprimés,
      "capacite_mwh": nombre — ÉLECTRICITÉ : le coût des garanties de capacité en €/MWh,
      "abonnement_montant": nombre — l'abonnement du fournisseur (souvent « Ab », « abonnement » ou « part fixe »),
      "abonnement_periode": "an" ou "mois" — la période dans laquelle cet abonnement est exprimé,
      "cee_classiques_mwh": nombre — les CEE classiques en €/MWh,
      "cee_precarite_mwh": nombre — les CEE précarité en €/MWh,
      "cee_total_mwh": nombre — seulement si le document donne les CEE en un seul montant
    }
  ],
  "remarques": texte court — ce qui t'a semblé ambigu, sinon null
}

Règles impératives :
- Recopie les prix TELS QU'ILS SONT IMPRIMÉS. Ne retire aucune marge, ne fais aucun calcul : si le P0 vaut 55,01, retourne 55.01.
- Si un prix est exprimé en c€/kWh, convertis-le en €/MWh (multiplie par 10). Un prix en €/kWh se multiplie par 1000.
- N'extrais PAS le TQD/ATRD, la CTA, l'accise (TICGN, TICFE), le CPB ni le TURPE : ils ne servent pas.
- Les nombres sont des nombres JSON, sans unité, sans espace de milliers, avec un point décimal (4 487,96 devient 4487.96).
- Une information absente ou ambiguë vaut null. N'invente JAMAIS une valeur.`

export interface OffreLue {
  numero_point: string | null
  duree_mois: number | null
  type_prix: 'Fixe' | 'Indexé' | null
  car_mwh: number | null
  profil: string | null
  p0_mwh: number | null
  prix_postes_mwh: Record<string, number>
  capacite_mwh: number | null
  /** L'abonnement ramené à l'année, au centime — c'est ainsi que la base le range. */
  abonnement_annuel: number | null
  /** Tel qu'imprimé, pour que l'écran dise d'où vient le chiffre. */
  abonnement_imprime: { montant: number; periode: 'an' | 'mois' } | null
  cee_classiques_mwh: number | null
  cee_precarite_mwh: number | null
  /** Classiques + précarité, ou le montant unique du document. */
  cee_mwh: number | null
}

export interface PropositionLue {
  fournisseur_nom: string | null
  type_energie: 'gaz' | 'electricite' | null
  reference_offre: string | null
  client: string | null
  date_prise_effet: string | null
  date_validite: string | null
  offres: OffreLue[]
  remarques: string | null
}

export interface ResultatLectureOffre {
  success: boolean
  error?: string
  fileName?: string
  proposition?: PropositionLue
}

/* ══ CE QUE LE MODÈLE REND, REMIS EN FORME ══
   Un nombre peut revenir en texte (« 4 487,96 ») : on le relit à la française plutôt que de le
   perdre. Les sommes se font ici, au dix-millième, jamais par le modèle. */
const nombre = (x: unknown): number | null => {
  if (x == null || x === '') return null
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  const t = String(x).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const n = Number(t)
  return t && Number.isFinite(n) ? n : null
}
const texte = (x: unknown): string | null => (x == null || String(x).trim() === '' ? null : String(x).trim())
const auDixMillieme = (n: number) => Math.round(n * 10000) / 10000
const auCentime = (n: number) => Math.round(n * 100) / 100
const POSTES = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE', 'BASE', 'HP', 'HC']

function profilSurTroisChiffres(p: string | null): string | null {
  if (!p) return null
  const m = p.toUpperCase().replace(/\s+/g, '').match(/^P0?(\d{2})$/)
  return m ? `P0${m[1]}` : p
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function lireOffre(o: any): OffreLue {
  const montant = nombre(o?.abonnement_montant)
  const periode: 'an' | 'mois' = String(o?.abonnement_periode ?? '').toLowerCase().startsWith('m') ? 'mois' : 'an'
  const classiques = nombre(o?.cee_classiques_mwh)
  const precarite = nombre(o?.cee_precarite_mwh)
  const total = nombre(o?.cee_total_mwh)
  const postes: Record<string, number> = {}
  for (const p of POSTES) {
    const v = nombre(o?.prix_postes_mwh?.[p] ?? o?.prix_postes_mwh?.[p.toLowerCase()])
    if (v != null) postes[p] = v
  }
  const type = texte(o?.type_prix)
  return {
    numero_point: texte(o?.numero_point)?.replace(/\s+/g, '').toUpperCase() ?? null,
    duree_mois: nombre(o?.duree_mois) == null ? null : Math.round(nombre(o?.duree_mois) as number),
    type_prix: type == null ? null : /^index/i.test(type) ? 'Indexé' : 'Fixe',
    car_mwh: nombre(o?.car_mwh),
    profil: profilSurTroisChiffres(texte(o?.profil)),
    p0_mwh: nombre(o?.p0_mwh),
    prix_postes_mwh: postes,
    capacite_mwh: nombre(o?.capacite_mwh),
    abonnement_annuel: montant == null ? null : auCentime(periode === 'mois' ? montant * 12 : montant),
    abonnement_imprime: montant == null ? null : { montant, periode },
    cee_classiques_mwh: classiques,
    cee_precarite_mwh: precarite,
    cee_mwh: classiques != null || precarite != null ? auDixMillieme((classiques ?? 0) + (precarite ?? 0)) : total,
  }
}

export function lireProposition(j: any): PropositionLue {
  const energie = texte(j?.type_energie)?.toLowerCase() ?? null
  return {
    fournisseur_nom: texte(j?.fournisseur_nom),
    type_energie: energie == null ? null : energie.startsWith('g') ? 'gaz' : 'electricite',
    reference_offre: texte(j?.reference_offre),
    client: texte(j?.client),
    date_prise_effet: texte(j?.date_prise_effet),
    date_validite: texte(j?.date_validite),
    offres: Array.isArray(j?.offres) ? j.offres.map(lireOffre) : [],
    remarques: texte(j?.remarques),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  /* L'API Anthropic est facturée à l'usage : une session, et pas celle d'un partenaire. */
  const utilisateur = await exigerSession(req, res)
  if (!utilisateur) return
  if (await refuserLesPartenaires(utilisateur, res)) return

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(200).json({ success: false, error: 'Lecture indisponible : clé ANTHROPIC_API_KEY manquante sur le serveur.' } satisfies ResultatLectureOffre)
    return
  }

  const { fileBase64, fileName, mediaType } = req.body ?? {}
  if (typeof fileBase64 !== 'string' || typeof mediaType !== 'string') {
    res.status(400).json({ error: 'Fichier requis (fileBase64 + mediaType).' })
    return
  }
  if (mediaType !== 'application/pdf' && !mediaType.startsWith('image/')) {
    res.status(200).json({ success: false, error: 'Seuls les PDF et les images se lisent pour le moment.', fileName } satisfies ResultatLectureOffre)
    return
  }

  const document =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 3000,
        messages: [{ role: 'user', content: [document, { type: 'text', text: CONSIGNE }] }],
      }),
    })
    const data = (await resp.json()) as { error?: { message?: string }; content?: { text?: string }[] }
    if (!resp.ok) {
      res.status(200).json({ success: false, error: messageAnthropicLisible(resp.status, data?.error?.message), fileName } satisfies ResultatLectureOffre)
      return
    }

    const brut = Array.isArray(data.content) ? data.content.map((c) => c.text ?? '').join('') : ''
    const trouve = brut.match(/```json\s*([\s\S]*?)```/) || brut.match(/\{[\s\S]*\}/)
    let json: unknown
    try {
      json = JSON.parse((trouve ? (trouve[1] ?? trouve[0]) : brut).trim())
    } catch {
      res.status(200).json({ success: false, error: "Impossible d'analyser la réponse de l'IA.", fileName } satisfies ResultatLectureOffre)
      return
    }
    res.status(200).json({ success: true, fileName, proposition: lireProposition(json) } satisfies ResultatLectureOffre)
  } catch (err) {
    res.status(200).json({ success: false, error: err instanceof Error ? err.message : 'Erreur inconnue lors de la lecture.', fileName } satisfies ResultatLectureOffre)
  }
}

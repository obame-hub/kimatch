import type { VercelRequest, VercelResponse } from '@vercel/node'

// Client serveur pour l'extraction de contrats/mandats scannés via l'API
// Anthropic (Claude, vision native PDF/image). Ne jamais importer ce fichier
// depuis le code front — la clé API ne doit exister que côté serveur.

const EXTRACTION_PROMPT = `Tu es un expert en extraction de données de documents français du secteur de l'énergie : factures de fourniture d'électricité/gaz, contrats de fourniture, et mandats de représentation signés par un client pour le compte d'un courtier/syndic.

Analyse le document fourni et retourne UNIQUEMENT un objet JSON avec les champs suivants. Pour chaque champ, retourne { "value": ..., "confidence": <0-1> } — ou { "value": null, "confidence": 0 } si tu ne trouves pas l'information ou si tu n'es pas sûr. N'invente JAMAIS une valeur.

Champs communs :
- type_document: "facture" (facture d'énergie), "contrat" (contrat de fourniture) ou "mandat" (mandat de représentation/gestion), selon la nature du document
- reference_fournisseur: numéro de contrat, de référence, de facture ou d'offre mentionné sur le document (texte)
- fournisseur_nom: nom du fournisseur d'énergie (facture/contrat) ou du prestataire/cabinet mandataire (mandat)
- type_energie: STRICTEMENT "electricite" ou "gaz" si identifiable, sinon null
- numero_pdl: identifiant du point de comptage. En électricité, PDL/PRM à 14 chiffres. En gaz, PCE — le plus souvent 14 chiffres lui aussi, parfois "GI" suivi de 6 chiffres. Sur les documents c'est libellé "Point de livraison", "PRM", "PDL", "Point de Comptage et d'Estimation" ou "PCE". Retourne le numéro tel quel, sans espaces, sans jamais le tronquer ni le reformater.
- date_signature: date de signature du document (format YYYY-MM-DD)
- date_debut: date de début d'effet / de validité du contrat ou du mandat (format YYYY-MM-DD)
- date_fin: date de fin / d'échéance / de fin de contrat (format YYYY-MM-DD)
- preavis_resiliation_jours: préavis de résiliation exprimé en nombre de jours (entier). Si exprimé en mois, convertis (1 mois = 30 jours).
- signataire_nom: nom complet de la personne signataire côté client

Champs propres au point de livraison (surtout présents sur les factures) :
- site_nom: libellé ou nom du site desservi, s'il est distinct de la raison sociale du client
- adresse: numéro et voie de l'adresse DU POINT DE LIVRAISON / lieu de consommation. Attention : ce n'est PAS l'adresse de facturation quand les deux diffèrent.
- code_postal: code postal du point de livraison (5 chiffres)
- ville: commune du point de livraison
- segment: STRICTEMENT "C1", "C2", "C3", "C4" ou "C5" si mentionné ou déductible de la puissance souscrite en électricité (C5 = ≤ 36 kVA, C4 = 36-250 kVA, C3 = 250 kVA-1 MW environ). Ne devine pas si la puissance est absente.
- tension: STRICTEMENT "BT" (basse tension) ou "HTA" (haute tension A) si identifiable
- puissance_souscrite_kva: puissance souscrite en kVA (nombre). S'il y a plusieurs postes horaires, retourne la puissance de pointe.
- consommation_annuelle_mwh: consommation annuelle en MWh (nombre). Si la facture donne des kWh, convertis en MWh (divise par 1000).
- tarif_distribution: tarif d'acheminement gaz ("T1", "T2", "T3", "T4") si mentionné
- profil_consommation: profil de consommation gaz ("P011" à "P019") si mentionné

Règles impératives :
- Toutes les dates doivent être normalisées au format YYYY-MM-DD (convertis depuis JJ/MM/AAAA si nécessaire).
- Les valeurs numériques doivent être des nombres, sans unité ni séparateur de milliers.
- Si un champ est absent ou ambigu, retourne { "value": null, "confidence": 0 }.
- Retourne UNIQUEMENT le JSON, sans texte autour, sans balises markdown.`

interface ExtractedField {
  value: string | number | null
  confidence: number
}

export interface ExtractDocumentResult {
  success: boolean
  error?: string
  fileName?: string
  extracted?: Record<string, ExtractedField>
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(200).json({ success: false, error: "Extraction indisponible : clé ANTHROPIC_API_KEY manquante sur le serveur." })
    return
  }

  const { fileBase64, fileName, mediaType } = req.body ?? {}
  if (typeof fileBase64 !== 'string' || typeof mediaType !== 'string') {
    res.status(400).json({ error: 'Fichier requis (fileBase64 + mediaType).' })
    return
  }

  const documentBlock =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }

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
        max_tokens: 1500,
        messages: [{ role: 'user', content: [documentBlock, { type: 'text', text: EXTRACTION_PROMPT }] }],
      }),
    })

    const data = await resp.json()
    if (!resp.ok) {
      const message = data?.error?.message ?? `Erreur Anthropic (${resp.status})`
      res.status(200).json({ success: false, error: message })
      return
    }

    const text = Array.isArray(data.content) ? data.content.map((c: { text?: string }) => c.text ?? '').join('') : ''
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : text

    let extracted: Record<string, ExtractedField>
    try {
      extracted = JSON.parse(jsonStr.trim())
    } catch {
      res.status(200).json({ success: false, error: "Impossible d'analyser la réponse de l'IA." })
      return
    }

    res.status(200).json({ success: true, extracted, fileName })
  } catch (err) {
    res.status(200).json({ success: false, error: err instanceof Error ? err.message : "Erreur inconnue lors de l'extraction." })
  }
}

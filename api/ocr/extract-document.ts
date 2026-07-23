import type { VercelRequest, VercelResponse } from '@vercel/node'

// Client serveur pour l'extraction de contrats/mandats scannés via l'API
// Anthropic (Claude, vision native PDF/image). Ne jamais importer ce fichier
// depuis le code front — la clé API ne doit exister que côté serveur.

const EXTRACTION_PROMPT = `Tu es un expert en extraction de données de documents contractuels français dans le secteur de l'énergie (contrats de fourniture d'électricité/gaz, mandats de représentation signés par un client pour le compte d'un courtier/syndic).

Analyse le document fourni et retourne UNIQUEMENT un objet JSON avec les champs suivants. Pour chaque champ, retourne { "value": ..., "confidence": <0-1> } — ou { "value": null, "confidence": 0 } si tu ne trouves pas l'information ou si tu n'es pas sûr. N'invente JAMAIS une valeur.

- type_document: "contrat" (contrat de fourniture d'énergie) ou "mandat" (mandat de représentation/gestion signé par un client), selon la nature du document
- reference_fournisseur: numéro de contrat, de référence ou d'offre mentionné sur le document (texte)
- fournisseur_nom: nom du fournisseur d'énergie (contrat) ou du prestataire/cabinet mandataire (mandat)
- type_energie: STRICTEMENT "electricite" ou "gaz" si identifiable, sinon null
- numero_pdl: numéro de PDL (électricité, 14 chiffres) ou PCE (gaz, "GI" + 6 chiffres) si mentionné sur le document
- date_signature: date de signature du document (format YYYY-MM-DD)
- date_debut: date de début d'effet / de validité du contrat ou du mandat (format YYYY-MM-DD)
- date_fin: date de fin / d'échéance (format YYYY-MM-DD)
- preavis_resiliation_jours: préavis de résiliation exprimé en nombre de jours (entier). Si exprimé en mois, convertis (1 mois = 30 jours).
- signataire_nom: nom complet de la personne signataire côté client

Règles impératives :
- Toutes les dates doivent être normalisées au format YYYY-MM-DD (convertis depuis JJ/MM/AAAA si nécessaire).
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

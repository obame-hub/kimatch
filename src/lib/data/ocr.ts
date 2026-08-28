import { useMutation } from '@tanstack/react-query'
import { authHeaderJson } from '@/lib/data/authHeader'

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible.'))
    reader.readAsDataURL(file)
  })
}

export function useExtractDocument() {
  return useMutation({
    mutationFn: async (file: File): Promise<ExtractDocumentResult> => {
      const fileBase64 = await fileToBase64(file)
      const res = await fetch('/api/ocr/extract-document', {
        method: 'POST',
        headers: await authHeaderJson(),
        body: JSON.stringify({ fileBase64, fileName: file.name, mediaType: file.type || 'application/pdf' }),
      })
      const data = (await res.json()) as ExtractDocumentResult
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
      return data
    },
  })
}

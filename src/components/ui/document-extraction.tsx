import { useEffect, useRef, useState } from 'react'
import { FileScan, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useExtractDocument } from '@/lib/data/ocr'

interface ExtractedField {
  value: string | number | null
  confidence: number
}

export function ExtractDocumentButton({
  onExtracted,
  label = 'Pré-remplir depuis un PDF/scan',
  /** Ouvre le sélecteur de fichier dès l'affichage — utilisé quand l'utilisateur vient de choisir
   * explicitement « Extraction automatique » : lui refaire cliquer serait une étape de trop. */
  autoOpen,
}: {
  onExtracted: (fields: Record<string, ExtractedField>) => void
  label?: string
  autoOpen?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const extractDocument = useExtractDocument()
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (autoOpen) inputRef.current?.click()
  }, [autoOpen])

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFeedback(null)
    try {
      const result = await extractDocument.mutateAsync(file)
      if (!result.success || !result.extracted) {
        setFeedback(result.error ?? "Échec de l'extraction.")
        return
      }
      onExtracted(result.extracted)
      setFeedback('Champs pré-remplis depuis le document — vérifie-les avant d\'enregistrer.')
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Échec de l'extraction.")
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-km-line bg-km-bg/60 p-3">
      <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={handleChange} />
      <Button type="button" variant="outline" size="sm" disabled={extractDocument.isPending} onClick={() => inputRef.current?.click()}>
        {extractDocument.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileScan className="h-3.5 w-3.5" />}
        {label}
      </Button>
      {feedback && <p className="mt-1.5 text-[11px] text-km-muted">{feedback}</p>}
    </div>
  )
}

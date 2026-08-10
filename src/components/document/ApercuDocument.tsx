import { useEffect, useState } from 'react'
import { AlertTriangle, Download, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Type MIME déduit de l'extension du fichier. */
function typeMime(nom: string): string | null {
  const ext = nom.toLowerCase().split('.').pop() ?? ''
  const table: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    csv: 'text/plain',
  }
  return table[ext] ?? null
}

/**
 * Aperçu d'un document directement dans Kimatch, sans ouvrir d'onglet.
 *
 * Demandé par Agathe (07/08/2026) : ouvrir un contrat basculait systématiquement vers un nouvel
 * onglet, ce qui fait perdre le fil quand on vérifie plusieurs pièces d'affilée.
 *
 * Le fichier est récupéré puis ré-étiqueté avant affichage. C'est indispensable : les 6454
 * documents repris de Salesforce sont servis par Supabase Storage en `application/octet-stream`,
 * et un navigateur les téléchargerait au lieu de les afficher. On refabrique donc un Blob avec le
 * type déduit de l'extension. Le bucket est public et autorise les requêtes croisées, donc la
 * lecture depuis l'application fonctionne.
 *
 * L'ouverture en nouvel onglet reste proposée à côté : elle est plus confortable pour lire un
 * contrat de vingt pages, et c'est l'habitude actuelle.
 */
export function ApercuDocument({ url, nomFichier }: { url: string; nomFichier: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(true)

  const mime = typeMime(nomFichier || url)

  useEffect(() => {
    if (!mime) {
      setChargement(false)
      return
    }
    let annule = false
    let cree: string | null = null

    async function charger() {
      try {
        const reponse = await fetch(url)
        if (!reponse.ok) throw new Error(`Le fichier n'a pas pu être récupéré (${reponse.status}).`)
        const donnees = await reponse.blob()
        if (annule) return
        cree = URL.createObjectURL(new Blob([donnees], { type: mime as string }))
        setObjectUrl(cree)
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : 'Aperçu indisponible.')
      } finally {
        if (!annule) setChargement(false)
      }
    }
    void charger()

    return () => {
      annule = true
      // Libère la mémoire : sans cela chaque document consulté reste chargé jusqu'au rechargement.
      if (cree) URL.revokeObjectURL(cree)
    }
  }, [url, mime])

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => window.open(url, '_blank', 'noopener')}>
        <ExternalLink className="h-3.5 w-3.5" />
        Ouvrir dans un onglet
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => window.open(url, '_blank', 'noopener')}>
        <Download className="h-3.5 w-3.5" />
        Télécharger
      </Button>
    </div>
  )

  if (!mime) {
    return (
      <div className="space-y-2 rounded-xl border border-navy-100 bg-navy-50/40 p-4">
        <p className="text-sm text-navy-500">
          Ce format ne peut pas être affiché ici. Ouvre-le dans un onglet ou télécharge-le.
        </p>
        {actions}
      </div>
    )
  }

  if (chargement) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-navy-100 bg-navy-50/40 p-6 text-sm text-navy-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de l'aperçu…
      </div>
    )
  }

  if (erreur || !objectUrl) {
    return (
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-start gap-1.5 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {erreur ?? 'Aperçu indisponible.'}
        </p>
        {actions}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {mime.startsWith('image/') ? (
        <img src={objectUrl} alt={nomFichier} className="max-h-[70vh] w-full rounded-xl border border-navy-100 object-contain bg-navy-50/40" />
      ) : (
        <iframe
          src={objectUrl}
          title={nomFichier || 'Aperçu du document'}
          className="h-[70vh] w-full rounded-xl border border-navy-100 bg-navy-50/40"
        />
      )}
      {actions}
    </div>
  )
}

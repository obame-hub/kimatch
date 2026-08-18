import { useRef, useState } from 'react'
import { Paperclip, FileText, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDocumentsParEntites, useTeleverserDocuments, useDeleteDocument } from '@/lib/data/documents'

/**
 * La grille de prix reçue du fournisseur, attachée à SON offre.
 *
 * « Un champ fichier où Erwan va venir saisir le fichier qu'il a reçu de Gaz Européen sur l'offre
 * acceptée » (réunion du 17/08/2026, 23:01).
 *
 * POURQUOI SUR L'OFFRE ET PAS SUR LA VERSION. Un fournisseur consulté sur 24 et 36 mois envoie une
 * grille par durée. Rattachées à la version, elles se mélangeraient sans qu'on sache laquelle répond
 * à quoi ; rattachées à l'offre, chacune est là où on lit son prix.
 *
 * VOLONTAIREMENT PLUS SOBRE QUE `ZoneDepotFichiers`. Le composant partagé demande de choisir une
 * catégorie de document avant de déposer, ce qui a du sens sur une fiche compte où arrivent des
 * factures, des avenants et des photos. Ici la catégorie ne fait aucun doute — c'est une offre
 * fournisseur — et une offre par ligne : un trombone suffit, et le clic ne coûte rien.
 */
export function FichierOffre({
  offreId,
  libelleOffre,
  typeDocumentOffreId,
  peutModifier,
  signaler,
}: {
  offreId: string
  libelleOffre: string
  /** Type de document à poser sur le dépôt, quand la table de référence en propose un. */
  typeDocumentOffreId: string | null
  peutModifier: boolean
  signaler: (message: string) => void
}) {
  const { data: documents } = useDocumentsParEntites([offreId])
  const televerser = useTeleverserDocuments()
  const supprimer = useDeleteDocument()
  const inputRef = useRef<HTMLInputElement>(null)
  const [enCours, setEnCours] = useState(false)

  const fichiers = documents ?? []

  async function deposer(liste: FileList | null) {
    const choisis = Array.from(liste ?? [])
    if (choisis.length === 0) return
    setEnCours(true)
    try {
      await televerser.mutateAsync({
        fichiers: choisis,
        entite_type: 'offre_fournisseur',
        entite_id: offreId,
        type_document_id: typeDocumentOffreId,
        type_document_libelle: 'Offre fournisseur',
      })
      signaler(`✓ ${choisis.length} fichier${choisis.length > 1 ? 's' : ''} joint${choisis.length > 1 ? 's' : ''} à ${libelleOffre}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // La contrainte CHECK de `documents.entite_type` refuse 'offre_fournisseur' tant que la
      // migration du 18/08/2026 n'est pas appliquée. On le dit en clair plutôt que de laisser
      // remonter une violation 23514 que personne ne peut interpréter.
      signaler(
        message.includes('entite_type')
          ? "Les fichiers d'offre ne sont pas encore autorisés en base : appliquer la migration 20260818120000."
          : `Erreur : ${message}`,
      )
    } finally {
      setEnCours(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {fichiers.map((d) => (
        <span
          key={d.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-kw-sm border border-kw-border-subtle bg-white px-1.5 py-0.5"
        >
          <FileText className="h-3 w-3 shrink-0 text-kw-red" />
          <a
            href={d.url}
            target="_blank"
            rel="noreferrer"
            title={`${d.nom} — ouvrir`}
            className="truncate text-kw-base font-semibold text-kw-ink hover:underline"
          >
            {d.nom}
          </a>
          {peutModifier && (
            <button
              type="button"
              title="Détacher ce fichier"
              onClick={async () => {
                try {
                  await supprimer.mutateAsync(d.id)
                  signaler('Fichier détaché')
                } catch (e) {
                  signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                }
              }}
              className="shrink-0 text-kw-ghost hover:text-kw-red"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}

      {peutModifier && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,image/*"
            className="hidden"
            onChange={(e) => deposer(e.target.files)}
          />
          <button
            type="button"
            disabled={enCours}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'inline-flex items-center gap-1 rounded-kw-sm border border-dashed border-kw-border-strong px-1.5 py-0.5 text-kw-base font-semibold text-kw-meta hover:border-kw-green hover:text-kw-green',
              enCours && 'opacity-60',
            )}
          >
            {enCours ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            {fichiers.length === 0 ? 'Joindre l’offre reçue' : 'Ajouter'}
          </button>
        </>
      )}
    </div>
  )
}

import { useRef, useState } from 'react'
import { FileText, Loader2, Plus, X } from 'lucide-react'
import { useDeleteDocument, useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { LienDocument } from '@/components/document/LienDocument'

/**
 * ══════════ LES PROPOSITIONS REÇUES D'UN FOURNISSEUR ══════════
 *
 * William, 18/09/2026 : « ajoute une zone où un fichier (en l'occurrence l'offre au format PDF)
 * peut être déposé au niveau de la version. Mais également au niveau de chaque offre (GAZ EUROPEEN,
 * PICOTY…) », et il précise : plusieurs propositions par fournisseur.
 *
 * ══ POURQUOI SUR LE FOURNISSEUR CONSULTÉ, ET PAS SUR SES OFFRES ══
 *
 * `FichierOffre` existe déjà et dépose sur l'OFFRE — l'objet qui porte les prix. Mais les prix ne
 * sont pas saisis dans Kimatch : 10 offres chiffrées sur 291, 11 lignes de prix dans toute la base.
 * Attendre qu'une offre existe pour pouvoir ranger le PDF reçu, c'est demander de saisir des prix
 * qu'on ne saisit pas, pour classer un document qu'on a déjà.
 *
 * Le fournisseur consulté, lui, existe toujours : il naît avec la version. Le PDF s'y dépose dès
 * qu'il arrive, et il reste lisible même si aucune offre n'est jamais chiffrée. C'est l'objet dont
 * William a donné les exemples — « GAZ EUROPEEN, PICOTY » sont des fournisseurs, pas des offres.
 *
 * LA MIGRATION QUI LE PERMET : `documents_entite_type_check` refusait `consultation_fournisseur` ;
 * la migration du 18/09/2026 l'a ajouté aux treize types existants. Sans elle, chaque dépôt aurait
 * échoué sur une violation 23514 illisible.
 */
export function PropositionsFournisseur({
  consultationId,
  fournisseurNom,
  typeDocumentId,
  peutModifier,
  signaler,
}: {
  consultationId: string
  fournisseurNom: string
  typeDocumentId: string | null
  peutModifier: boolean
  signaler: (message: string) => void
}) {
  const { data: documents } = useDocumentsParEntites([consultationId])
  const televerser = useTeleverserDocuments()
  const supprimer = useDeleteDocument()
  const champ = useRef<HTMLInputElement>(null)
  const [enCours, setEnCours] = useState(false)

  const fichiers = documents ?? []

  async function deposer(liste: FileList | null) {
    const choisis = Array.from(liste ?? [])
    if (choisis.length === 0) return
    setEnCours(true)
    try {
      await televerser.mutateAsync({
        fichiers: choisis,
        entite_type: 'consultation_fournisseur',
        entite_id: consultationId,
        type_document_id: typeDocumentId,
        type_document_libelle: 'Offre fournisseur',
      })
      signaler(`✓ ${choisis.length > 1 ? `${choisis.length} propositions jointes` : 'Proposition jointe'} à ${fournisseurNom}`)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEnCours(false)
      if (champ.current) champ.current.value = ''
    }
  }

  /* RIEN À MONTRER ET RIEN À FAIRE : on se tait. Une zone de dépôt vide et inerte sur chaque
     fournisseur d'une version en lecture seule n'ajouterait qu'un cadre en pointillés de plus. */
  if (fichiers.length === 0 && !peutModifier) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-km-line-soft pt-2">
      {fichiers.map((d) => (
        <span
          key={d.id}
          className="group/fich inline-flex items-center gap-1.5 rounded-km-sm border border-km-line bg-white px-2 py-[3px] text-km-label text-km-muted"
        >
          <FileText className="h-3 w-3 shrink-0 text-km-red" />
          <LienDocument
            url={d.url}
            nom={d.nom}
            nomFichier={d.nom_fichier}
            titre={d.nom_fichier || d.nom}
            className="max-w-[160px] truncate hover:text-km-green hover:underline"
          >
            {d.nom_fichier || d.nom}
          </LienDocument>
          {peutModifier && (
            <button
              type="button"
              title="Retirer cette proposition"
              onClick={() => {
                supprimer.mutate(d.id, {
                  onSuccess: () => signaler('✓ Proposition retirée'),
                  onError: (e) => signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`),
                })
              }}
              className="shrink-0 text-km-faint opacity-0 transition-opacity hover:text-km-red group-hover/fich:opacity-100"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {peutModifier && (
        <button
          type="button"
          onClick={() => champ.current?.click()}
          disabled={enCours}
          title={`Joindre une proposition reçue de ${fournisseurNom}`}
          className="inline-flex items-center gap-1 rounded-km-sm border border-dashed border-km-line px-2 py-[3px] text-km-label font-semibold text-km-faint hover:border-km-green hover:text-km-green disabled:opacity-60"
        >
          {enCours ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {fichiers.length === 0 ? 'déposer une proposition' : null}
        </button>
      )}
      <input
        ref={champ}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void deposer(e.target.files)}
      />
    </div>
  )
}

import { useMemo, useState } from 'react'
import { FileText, ExternalLink } from 'lucide-react'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { cn } from '@/lib/utils'
import type { Recommandation, DocumentItem } from '@/types/domain'

/**
 * Onglet « Documents » — les pièces du dossier, rangées par version.
 *
 * Ce que la maquette dessine et que cet onglet ne reproduit PAS : la visionneuse maison avec ses
 * boutons de zoom, sa pagination « 3 / 9 » et sa recherche dans le PDF. Dans le design c'est une
 * fausse page dessinée en HTML ; ici les documents sont de vrais fichiers servis depuis le
 * stockage, et le navigateur affiche déjà les PDF avec zoom, pagination et recherche — mieux que ce
 * qu'on réécrirait. L'aperçu est donc un vrai rendu du vrai fichier.
 *
 * Le dépôt rattache à la VERSION AFFICHÉE quand il y en a une (« lié à la version active » dans le
 * design), à la recommandation sinon : un document déposé avant la première cotation ne doit pas
 * être perdu.
 */
export function OngletDocuments({
  reco,
  documents,
  versionAfficheeId,
  typesDocuments,
  onDeposer,
  peutModifier,
}: {
  reco: Recommandation
  documents: DocumentItem[]
  versionAfficheeId: string | null
  typesDocuments: { id: string; libelle: string }[]
  onDeposer: (fichiers: File[], typeDocumentId: string | null, entite: { type: string; id: string }) => Promise<void>
  peutModifier: boolean
}) {
  const [selectionne, setSelectionne] = useState<string | null>(null)

  /** Étiquette de version d'un document : la version à laquelle il est rattaché, ou « dossier ». */
  const parVersion = useMemo(() => {
    const nomDeVersion = new Map(
      reco.versions.map((v) => [v.id, v.nom || `V${v.numero_version ?? '?'}`] as const),
    )
    return documents
      .map((d) => ({
        doc: d,
        etiquette: d.entite_type === 'version_recommandation' ? nomDeVersion.get(d.entite_id) ?? 'version' : 'dossier',
        surVersionAffichee: d.entite_id === versionAfficheeId,
      }))
      .sort((a, b) => b.doc.date_creation.localeCompare(a.doc.date_creation))
  }, [documents, reco.versions, versionAfficheeId])

  const courant = parVersion.find((d) => d.doc.id === selectionne)?.doc ?? parVersion[0]?.doc ?? null
  const cible = versionAfficheeId
    ? { type: 'version_recommandation', id: versionAfficheeId }
    : { type: 'recommandation', id: reco.id }
  const nomCible = versionAfficheeId
    ? reco.versions.find((v) => v.id === versionAfficheeId)?.nom || 'la version affichée'
    : 'la recommandation'

  return (
    <div className="flex animate-kw-fade-slide flex-wrap items-start gap-3.5">
      {/* ── Aperçu ── */}
      <div className="min-w-0 flex-[999_1_340px] overflow-hidden rounded-[13px] border border-km-line bg-white">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-km-line bg-km-soft px-[13px] py-2.5">
          <span className="truncate text-km-body font-bold text-km-text">{courant?.nom ?? 'Aucun document'}</span>
          {courant && (
            <span className="rounded-kw-xs bg-km-amber-soft px-[7px] py-0.5 text-km-label font-extrabold text-[#8a4b2a]">
              {parVersion.find((d) => d.doc.id === courant.id)?.etiquette}
            </span>
          )}
          <span className="flex-1" />
          {courant && (
            <a
              href={courant.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-km-sm border border-km-line bg-white px-2.5 py-1 text-km-body font-semibold text-km-muted hover:bg-km-bg"
            >
              <ExternalLink className="h-3 w-3" /> Ouvrir en plein écran
            </a>
          )}
        </div>
        {courant ? (
          <div className="bg-[#e9e8e4] p-3.5">
            {/* Le navigateur rend le PDF avec ses propres zoom, pagination et recherche. Une image
                s'affiche telle quelle ; tout autre format n'est pas prévisualisable et se télécharge. */}
            <iframe
              key={courant.id}
              title={courant.nom}
              src={courant.url}
              className="block h-[560px] w-full rounded-[3px] border-0 bg-white shadow-[0_4px_16px_rgba(0,0,0,.14)]"
            />
          </div>
        ) : (
          <div className="flex h-[240px] flex-col items-center justify-center gap-2 bg-km-soft text-center">
            <FileText className="h-6 w-6 text-km-faint" />
            <p className="text-km-body text-km-muted">
              Aucune pièce sur ce dossier. Déposez la proposition commerciale ou le comparatif
              fournisseurs.
            </p>
          </div>
        )}
      </div>

      {/* ── Liste par version + dépôt ── */}
      <div className="flex min-w-[220px] flex-[1_1_220px] flex-col gap-2.5">
        <div className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">Documents par version</div>
        {parVersion.length === 0 && <p className="text-km-body text-km-faint">Aucun document.</p>}
        {parVersion.map(({ doc, etiquette, surVersionAffichee }) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => setSelectionne(doc.id)}
            className={cn(
              'rounded-km-lg border bg-white px-[11px] py-2.5 text-left',
              courant?.id === doc.id ? 'border-[#8a4b2a] shadow-[0_2px_8px_rgba(176,118,60,.14)]' : 'border-km-line hover:border-km-line',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-km-red-soft text-[8px] font-extrabold text-km-red">
                {(doc.nom_fichier.split('.').pop() || 'FIC').slice(0, 4).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-km-body font-bold text-km-text">{doc.nom}</div>
                <div className="truncate font-mono text-km-label text-km-faint">
                  {new Date(doc.date_creation).toLocaleDateString('fr-FR')} · {doc.type_document}
                </div>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-kw-xs px-1.5 py-0.5 font-mono text-km-label font-extrabold',
                  surVersionAffichee ? 'bg-km-amber-soft text-[#8a4b2a]' : 'bg-km-soft text-km-faint',
                )}
              >
                {etiquette}
              </span>
            </div>
          </button>
        ))}

        {peutModifier && (
          <>
            <ZoneDepotFichiers
              types={typesDocuments}
              onDeposer={(fichiers, typeDocumentId) => onDeposer(fichiers, typeDocumentId, cible)}
            />
            <p className="text-km-label leading-snug text-km-faint">Le dépôt sera rattaché à {nomCible}.</p>
          </>
        )}
      </div>
    </div>
  )
}

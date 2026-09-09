import { useState } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import type { DocumentItem } from '@/types/domain'
import { cn } from '@/lib/utils'

/**
 * ══ LA COLONNE DES FICHIERS, À GAUCHE DE LA VISIONNEUSE ══
 *
 * William, 09/09/2026 : « dans le volet de gauche on va venir y intégrer la zone de drag & drop
 * ainsi que les différents fichiers uploadés ».
 *
 * ── DES CARTES, ET ELLES PRENNENT LEUR PLACE ──
 *
 * Première version : des lignes serrées, nom en 11 px et date en 9 px. William, 09/09/2026 :
 * « augmente la taille des cards fichiers, tu as de la hauteur, profites-en ». Il avait raison — un
 * mandat porte trois à cinq fichiers, la colonne en fait mille pixels, et l'on comprimait une liste
 * qui n'avait aucune raison de l'être.
 *
 * Chaque fichier est donc une carte à part entière : pastille de 36 px, nom en 13 px sur deux lignes,
 * type et date en dessous, auteur en troisième ligne. Le nom s'enroule au lieu de se tronquer —
 * « Mandat Kiwee — signé » et « Mandat Energix — signé » ne se distinguent que par leur milieu.
 *
 * ── LA SÉLECTION EST L'ÉTAT PRINCIPAL DE L'ÉCRAN ──
 *
 * Le liseré vert à gauche et le fond teinté disent lequel est ouvert. Sans ce repère, cliquer un
 * fichier puis un autre ne se distingue plus : les deux PDF se ressemblent, et l'on doute d'avoir
 * cliqué.
 *
 * ── LA SUPPRESSION DEMANDE CONFIRMATION SUR PLACE ──
 *
 * Pas de fenêtre modale : la suppression d'un document est journalisée par
 * `trg_journaliser_suppression` et la corbeille sait la restaurer. Une modale plein écran pour un
 * geste rattrapable coûte plus d'attention qu'elle n'en protège — c'est la règle déjà appliquée aux
 * tâches et aux notes.
 */
export function ListeFichiers({
  documents,
  selection,
  onSelectionner,
  onSupprimer,
  peutSupprimer,
}: {
  documents: DocumentItem[]
  selection: string | null
  onSelectionner: (doc: DocumentItem) => void
  onSupprimer: (doc: DocumentItem) => Promise<void>
  peutSupprimer: boolean
}) {
  const [aConfirmer, setAConfirmer] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-start gap-1 rounded-km-md border border-dashed border-km-line bg-km-bg/50 px-4 py-5">
        <p className="text-km-body font-bold text-km-text">Aucun fichier</p>
        <p className="text-km-label leading-relaxed text-km-muted">
          Déposez-en un ci-dessus — le mandat signé arrivera tout seul après la signature.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {documents.map((doc) => {
        const actif = selection === doc.id
        return (
          <div
            key={doc.id}
            className={cn(
              'group/fichier relative overflow-hidden rounded-km-md border transition-all',
              actif
                ? 'border-km-green-line bg-km-green-tint shadow-km-card'
                : 'border-km-line bg-white hover:border-km-line-soft hover:bg-km-soft/50',
            )}
          >
            {actif && <span className="absolute inset-y-0 left-0 w-[3px] bg-km-green" />}

            <button
              type="button"
              onClick={() => onSelectionner(doc)}
              className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-km transition-colors',
                  actif ? 'bg-km-green text-white' : 'bg-km-soft text-km-muted',
                )}
              >
                <FileText className="h-[18px] w-[18px]" />
              </span>

              <span className="min-w-0 flex-1">
                {/* Le nom s'écrit sur deux lignes plutôt qu'il ne se tronque : « Mandat Energix —
                    signé » et « Mandat Kiwee — signé » ne se distinguent que par leur milieu, et une
                    troncature les rendrait identiques. */}
                <span
                  className={cn(
                    'line-clamp-2 block break-words text-km-body font-bold leading-snug',
                    actif ? 'text-km-green' : 'text-km-text',
                  )}
                  title={doc.nom}
                >
                  {doc.nom}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  {doc.type_document && (
                    <span className="rounded-km-sm bg-km-soft px-1.5 py-px text-km-tiny font-bold uppercase tracking-[.04em] text-km-muted">
                      {doc.type_document}
                    </span>
                  )}
                  <span className="font-mono text-km-label text-km-faint">
                    {new Date(doc.date_creation).toLocaleDateString('fr-FR')}
                  </span>
                </span>
                {doc.auteur && (
                  <span className="mt-0.5 block truncate text-km-label text-km-faint">{doc.auteur}</span>
                )}
              </span>

              {peutSupprimer && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setAConfirmer((v) => (v === doc.id ? null : doc.id))
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    e.stopPropagation()
                    setAConfirmer((v) => (v === doc.id ? null : doc.id))
                  }}
                  aria-label={`Supprimer « ${doc.nom} »`}
                  title="Supprimer"
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-km-sm transition-all',
                    aConfirmer === doc.id
                      ? 'bg-km-red-soft text-km-red opacity-100'
                      : 'text-km-faint opacity-0 hover:bg-km-red-soft hover:text-km-red focus:opacity-100 group-hover/fichier:opacity-100',
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              )}
            </button>

            {aConfirmer === doc.id && (
              <div className="animate-km-fade flex flex-wrap items-center gap-2 border-t border-km-line px-3.5 py-2">
                <span className="text-km-label text-km-muted">Supprimer ce fichier ?</span>
                <button
                  type="button"
                  disabled={enCours === doc.id}
                  onClick={async () => {
                    setEnCours(doc.id)
                    try {
                      await onSupprimer(doc)
                      setAConfirmer(null)
                    } finally {
                      setEnCours(null)
                    }
                  }}
                  className="rounded-km-sm bg-km-red-soft px-2.5 py-1 text-km-label font-bold text-km-red transition-colors hover:bg-km-red hover:text-white disabled:opacity-50"
                >
                  {enCours === doc.id ? 'Suppression…' : 'Supprimer'}
                </button>
                <button
                  type="button"
                  onClick={() => setAConfirmer(null)}
                  className="rounded-km-sm px-2 py-1 text-km-label font-semibold text-km-muted transition-colors hover:bg-km-soft hover:text-km-text"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * ══ QUEL FICHIER S'OUVRE À L'ARRIVÉE ══
 *
 * William, 09/09/2026 : « toujours le mandat Kiwee signé en premier ».
 *
 * Depuis le 08/09, l'archivage DocuSign dépose une pièce par document de l'enveloppe, nommée d'après
 * le document lui-même : « Mandat Kiwee — signé », « Mandat Energix — signé », « Certificat de
 * signature ». On cherche donc, dans l'ordre :
 *
 *   1. une pièce signée qui parle de Kiwee — la demande explicite ;
 *   2. à défaut, n'importe quelle pièce signée : sur un mandat Energix seul, c'est elle qu'on veut,
 *      et sur les mandats d'avant le 08/09 c'est l'ancien PDF combiné « Mandat signé » ;
 *   3. à défaut, le fichier le plus récent — un mandat non signé n'a que ce qu'on y a déposé.
 *
 * LE CERTIFICAT EST ÉCARTÉ DES DEUX PREMIÈRES PASSES : il contient le mot « signature » et
 * arriverait en tête, alors que personne n'ouvre une fiche pour lire un certificat.
 */
export function fichierParDefaut(documents: DocumentItem[]): DocumentItem | null {
  if (documents.length === 0) return null
  const sansCertificat = documents.filter((d) => !d.nom.toLowerCase().includes('certificat'))
  const signes = sansCertificat.filter((d) => d.nom.toLowerCase().includes('sign'))

  return (
    signes.find((d) => d.nom.toLowerCase().includes('kiwee')) ??
    signes[0] ??
    documents[0] ??
    null
  )
}

/**
 * Le cadre des états sans document : rien à lire, ou rien à ouvrir.
 *
 * IL VIT ICI ET NON DANS LA VISIONNEUSE parce que la visionneuse est chargée à la demande : quand
 * aucun fichier n'est sélectionné, `pdf.js` n'est pas encore là, et le cadre doit pourtant
 * s'afficher.
 */
export function CadreVide({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-1.5 rounded-km-md border border-dashed border-km-line bg-km-bg/50 p-8 text-center">
      {children}
    </div>
  )
}

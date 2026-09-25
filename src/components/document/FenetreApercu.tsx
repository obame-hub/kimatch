import { lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { Download, Loader2, X } from 'lucide-react'
import { ApercuDocument } from '@/components/document/ApercuDocument'
import { urlOuvrableDocument } from '@/lib/data/documents'

const VisionneusePdf = lazy(() =>
  import('@/components/document/VisionneusePdf').then((m) => ({ default: m.VisionneusePdf })),
)

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * REGARDER UN FICHIER SANS LE TÉLÉCHARGER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « quand je veux visualiser un fichier, ouvre une popup avec la
 * visualisatrice. Actuellement ça me le télécharge, alors que ce n'est pas le comportement
 * attendu. »
 *
 * ══ POURQUOI ÇA TÉLÉCHARGEAIT ══
 *
 * Le bouton ouvrait l'adresse signée dans un onglet, et laissait le navigateur décider. Or les
 * 6 454 documents repris de Salesforce sont servis en `application/octet-stream` : devant ce type,
 * un navigateur ne propose pas de lecteur, il enregistre. Ouvrir l'adresse ne pouvait donc pas
 * donner un aperçu — c'était un pari perdu d'avance sur la moitié du fonds.
 *
 * ══ CE QUE FAIT CETTE FENÊTRE ══
 *
 * Elle rend le document DANS Kimatch. Un PDF passe par `VisionneusePdf`, qui le dessine page par
 * page avec pdf.js ; tout le reste passe par `ApercuDocument`, qui récupère le fichier et le
 * RÉ-ÉTIQUETTE avec le type déduit de son extension avant de l'afficher — c'est précisément ce
 * re-typage qui fait qu'un `octet-stream` redevient une image ou un PDF lisible.
 *
 * LE TÉLÉCHARGEMENT RESTE À UN CLIC, en haut à droite : regarder et prendre sont deux gestes, et
 * celui qui regardait ne voulait pas prendre.
 */
export function FenetreApercu({ document: doc, onFermer }: {
  document: { id: string; nom: string; nom_fichier: string | null; url: string }
  onFermer: () => void
}) {
  const nom = doc.nom_fichier || doc.nom
  const estPdf = nom.toLowerCase().endsWith('.pdf') || doc.url.toLowerCase().includes('.pdf')

  async function telecharger() {
    try {
      window.open(await urlOuvrableDocument(doc.url), '_blank', 'noopener')
    } catch {
      /* Le bouton de la visionneuse reste disponible : inutile d'interrompre la lecture pour ça. */
    }
  }

  return createPortal(
    <div
      /* Le voile ferme au clic, comme toutes les fenêtres de Kimatch. `z-[70]` pour passer au-dessus
         des deux pastilles flottantes (appel, notifications), qui vivent en `z-65`. */
      onClick={onFermer}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(10,14,12,0.62)] p-4 backdrop-blur-[3px] sm:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Aperçu de ${nom}`}
        className="flex h-full max-h-[900px] w-full max-w-[1000px] flex-col overflow-hidden rounded-km-lg border border-km-line bg-km-surface shadow-km-shell"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-km-line px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate text-km-name font-bold text-km-text" title={nom}>{nom}</span>
          <button
            type="button"
            onClick={() => void telecharger()}
            title="Télécharger"
            className="inline-flex h-8 items-center gap-1.5 rounded-km border border-km-line bg-km-surface px-2.5 text-km-label font-semibold text-km-muted transition-colors hover:border-km-green hover:text-km-green"
          >
            <Download className="h-3.5 w-3.5" /> Télécharger
          </button>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer l’aperçu"
            className="inline-flex h-8 w-8 items-center justify-center rounded-km text-km-muted transition-colors hover:bg-km-soft hover:text-km-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-km-bg">
          {estPdf ? (
            <Suspense
              fallback={
                <p className="flex h-full items-center justify-center gap-2 text-km-body text-km-faint">
                  <Loader2 className="h-4 w-4 animate-spin" /> Préparation de la lecture…
                </p>
              }
            >
              <VisionneusePdf url={doc.url} nomFichier={nom} />
            </Suspense>
          ) : (
            <div className="p-4">
              <ApercuDocument url={doc.url} nomFichier={nom} />
            </div>
          )}
        </div>
      </div>
    </div>,
    window.document.body,
  )
}

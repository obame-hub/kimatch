import { ArrowRight, FileUp, PenLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Sheet } from '@/components/ui/sheet'

export type PdlMethode = 'extraction' | 'manuel'

/** Panneau de choix de méthode avant d'ajouter un point de livraison, calqué sur Tools
 * (AccountCreationSession : « Comment souhaites-tu procéder ? » avec Extraction automatique
 * recommandée / Saisie manuelle). Dans Kimatch les deux mènent au même formulaire, mais le mode
 * « extraction » ouvre directement le sélecteur de fichier pour pré-remplir depuis une facture. */
export function PdlMethodSheet({
  open,
  onClose,
  compteNom,
  onChoose,
}: {
  open: boolean
  onClose: () => void
  compteNom: string
  onChoose: (methode: PdlMethode) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Ajouter un point de livraison" description={`Rattaché à ${compteNom}`}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-km-faint">Comment souhaites-tu procéder ?</p>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onChoose('extraction')}
          className="group relative w-full rounded-2xl border-2 border-km-line bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-kiwi-300 hover:shadow-md"
        >
          <Badge tone="neutral" className="absolute right-3 top-3 text-[10px]">Recommandé</Badge>
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-kiwi-50 text-km-green">
              <FileUp className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-km-text">Extraction automatique</span>
              <span className="mt-1 block text-xs text-km-muted">
                Dépose une facture PDF ou un scan, l'IA extrait les infos et pré-remplit les champs.
              </span>
            </span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-km-faint opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChoose('manuel')}
          className="group w-full rounded-2xl border-2 border-km-line bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-kiwi-300 hover:shadow-md"
        >
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <PenLine className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-km-text">Saisie manuelle</span>
              <span className="mt-1 block text-xs text-km-muted">
                Renseigne toi-même les champs via un formulaire guidé.
              </span>
            </span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-km-faint opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
          </div>
        </button>
      </div>
    </Sheet>
  )
}

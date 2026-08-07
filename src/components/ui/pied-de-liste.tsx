import { Button } from '@/components/ui/button'

/** Pied des grandes listes : compteur « x sur y » et bouton pour afficher la tranche suivante.
 * Ne rend rien quand tout est déjà affiché. Voir `useTranchesAffichage` pour le pourquoi. */
export function PiedDeListe({
  affiches,
  total,
  reste,
  onAfficherPlus,
  tailleTrancheSuivante,
  libelle,
}: {
  affiches: number
  total: number
  reste: number
  onAfficherPlus: () => void
  tailleTrancheSuivante: number
  /** Nom de l'objet au pluriel, ex. « comptes ». */
  libelle: string
}) {
  if (reste <= 0) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-navy-100 py-3">
      <span className="text-xs text-navy-400">
        {affiches} sur {total} {libelle}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onAfficherPlus}>
        Afficher {Math.min(tailleTrancheSuivante, reste)} de plus
      </Button>
    </div>
  )
}

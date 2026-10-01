import type { VersionRecommandation } from '@/types/domain'

/** Les statuts d'une version déjà close — le même jeu que `clotureRecommandation.ts`. */
const CLOS = ['CLOTUREE', 'ACCEPTEE', 'REFUSEE', 'REMPLACEE', 'EXPIREE', 'ARCHIVEE']

/** Les versions que la clôture va fermer, pour l'annoncer AVANT le clic. */
export function versionsOuvertes(versions: VersionRecommandation[]): VersionRecommandation[] {
  return versions.filter((v) => !CLOS.includes(v.statut))
}

/** « V2 et V3 passeront en Clôturée · Refusée. » — ou rien quand il n'y a aucune version ouverte. */
export function phraseVersions(versions: VersionRecommandation[], resultat: string): string | null {
  const ouvertes = versionsOuvertes(versions)
  if (ouvertes.length === 0) return null
  const noms = ouvertes.map((v) => v.nom || `V${v.numero_version ?? ''}`)
  const liste = noms.length === 1 ? noms[0] : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
  return `${liste} passer${ouvertes.length === 1 ? 'a' : 'ont'} en Clôturée · ${resultat}.`
}

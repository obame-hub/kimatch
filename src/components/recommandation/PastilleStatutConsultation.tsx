import { ChevronDown } from 'lucide-react'
import { STATUT_CONSULTATION_PAR_DEFAUT } from '@/lib/data/recommandations'
import { cn } from '@/lib/utils'
import type { ReferenceRow } from '@/lib/data/referenceTables'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE STATUT D'UN FOURNISSEUR CONSULTÉ — UNE PASTILLE QUI EST SON PROPRE BOUTON
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026, sur la fiche : le statut doit être « changeable par Erwan en un clic ». Puis
 * sur le Pricing, le même jour : « oui câble-le, c'est son geste quotidien ».
 *
 * ══ POURQUOI UN COMPOSANT, ET NON UNE COPIE ══
 *
 * Deux écrans portent maintenant ce geste, et il ne se réduit pas à un menu déroulant : il embarque
 * trois règles qui se sont écrites l'une après l'autre au fil des retours.
 *
 *  · LE STATUT COURANT NE SE REPROPOSE PAS. Le choisir ajouterait un événement de suivi identique au
 *    précédent — la table est un journal, pas un champ.
 *  · « DEMANDE ENVOYÉE » N'EXISTE PAS CHEZ UN FOURNISSEUR À OUTIL EN LIGNE. Rien ne part jamais :
 *    Erwan va lire les prix chez lui, et le suivi démarre à « Demande acceptée » (réunion du
 *    17/08/2026).
 *  · LA COULEUR DIT L'ATTENTE. Gris : rien n'a encore été fait. Bleu : la balle est chez le
 *    fournisseur. Ambre : il a accepté, on attend son prix — le seul état où le temps joue contre
 *    nous. Vert : sa proposition est là. Rouge : il ne répondra pas, et c'est une réponse aussi.
 *
 * Recopier ces trois règles dans le Pricing aurait donné deux endroits à corriger le jour où un
 * sixième statut apparaît — et l'expérience de cette base est qu'on n'en corrige qu'un. Le
 * référentiel a déjà changé deux fois en un mois.
 *
 * ══ IL N'Y A PAS DE MUTATION ICI ══
 *
 * Le composant ne sait pas écrire : il rend un choix, l'appelant décide quoi en faire. C'est ce qui
 * lui permet de servir la fiche — qui signale dans son propre bandeau — et le Pricing — qui
 * rafraîchit sa liste. Une mutation intégrée aurait imposé le même retour visuel aux deux.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const TONS: Record<string, string> = {
  A_TRAITER: 'border-km-line bg-km-soft text-km-muted',
  ENVOYEE: 'border-km-blue/30 bg-km-blue-soft text-km-blue',
  ACCEPTEE: 'border-km-amber/40 bg-km-amber-soft text-km-amber',
  DISPONIBLE: 'border-km-green-line bg-km-green-soft text-km-green',
  REFUSEE: 'border-km-red-line bg-km-red-soft text-km-red',
}

export function PastilleStatutConsultation({
  statutCode,
  statutLibelle,
  modeConsultation,
  statuts,
  onChoisir,
  peutModifier,
  nomFournisseur,
  enCours,
  className,
}: {
  statutCode: string | null
  statutLibelle: string | null
  modeConsultation: 'EMAIL' | 'OUTIL_EN_LIGNE'
  /** Les statuts proposables, déjà restreints aux cinq codes retenus par l'appelant. */
  statuts: ReferenceRow[]
  onChoisir: (statut: ReferenceRow) => void
  peutModifier: boolean
  /** Pour l'étiquette du lecteur d'écran : « Statut de GAZ EUROPEEN ». */
  nomFournisseur: string
  /** Vrai pendant l'écriture : la pastille le dit plutôt que de paraître inerte. */
  enCours?: boolean
  className?: string
}) {
  const libelle = statutLibelle || STATUT_CONSULTATION_PAR_DEFAUT

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1 rounded-km-pill border px-2 py-[2px] text-km-label font-bold',
        TONS[statutCode ?? ''] ?? TONS.A_TRAITER,
        peutModifier && !enCours && 'cursor-pointer hover:brightness-[.97]',
        enCours && 'opacity-60',
        className,
      )}
    >
      {enCours ? 'Enregistrement…' : libelle}
      {peutModifier && (
        <>
          <ChevronDown className="h-2.5 w-2.5 opacity-70" />
          <select
            aria-label={`Statut de ${nomFournisseur}`}
            value=""
            disabled={enCours}
            onChange={(e) => {
              const choisi = statuts.find((st) => st.id === e.target.value)
              if (choisi) onChoisir(choisi)
            }}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          >
            <option value="">Changer…</option>
            {statuts
              .filter((st) => st.libelle !== libelle)
              .filter((st) => modeConsultation !== 'OUTIL_EN_LIGNE' || st.code !== 'ENVOYEE')
              .map((st) => (
                <option key={st.id} value={st.id}>{st.libelle}</option>
              ))}
          </select>
        </>
      )}
    </span>
  )
}

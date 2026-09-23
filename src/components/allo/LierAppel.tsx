/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * À QUOI SE RAPPORTAIT CET APPEL ?
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, via Naoëlle, 23/09/2026 : « à la fin d'un appel, une petite modale qui propose de lier
 * cet appel à quel objet ». Puis : « un seul objet », et « ne le rends pas obligatoire ».
 *
 * ══ CE QU'ON PROPOSE, ET POURQUOI PAS UNE RECHERCHE ══
 *
 * Les objets DU CORRESPONDANT qu'on vient d'avoir, jamais une recherche à l'aveugle : au moment où
 * cette fenêtre s'ouvre, Kimatch sait à qui l'on a parlé. Mesuré sur les comptes réellement appelés
 * ces trente jours, la médiane est de DEUX objets — la liste tient à l'écran, et le bon choix est
 * souvent le seul.
 *
 * UN COMPTE MONTE À SOIXANTE-HUIT, d'où la recherche qui apparaît au-delà de six. Elle est le
 * recours, pas le chemin normal.
 *
 * ══ ON NE FILTRE PAS SUR « EN COURS », ET C'EST MESURÉ ══
 *
 * La tentation était de ne proposer que les recommandations ouvertes. Vérifié sur CABINET MOLINIER,
 * qu'on appelle : ZÉRO sur trente-neuf est encore ouverte. Le filtre aurait vidé la fenêtre — un
 * écran vide au lieu d'un écran utile, exactement le défaut qu'on corrige ailleurs. On propose donc
 * tout, du plus récent au plus ancien.
 *
 * ══ ELLE SE FERME SANS RIEN CHOISIR ══
 *
 * Naoëlle : « ne le rends pas obligatoire ». Une fenêtre qu'on ne peut pas fermer, quarante fois
 * par jour en prospection, s'apprend à expédier — et on clique n'importe quoi pour s'en
 * débarrasser, ce qui est pire qu'un lien absent. L'appel non lié rejoint la liste de rattrapage,
 * où l'on répond au calme.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useState } from 'react'
import { X, Search, Link2, Target, Lightbulb, Inbox, Filter, Check } from 'lucide-react'
import {
  useObjetsLiables,
  useLierAppel,
  type TypeLien,
  type ObjetLiable,
} from '@/lib/data/liensAppel'
import { cn } from '@/lib/utils'

/** Le seuil au-delà duquel la recherche paraît : six lignes se parcourent des yeux, vingt non. */
const SEUIL_RECHERCHE = 6

const DESSIN: Record<TypeLien, { libelle: string; Icone: typeof Target }> = {
  opportunite: { libelle: 'Opportunité', Icone: Target },
  recommandation: { libelle: 'Recommandation', Icone: Lightbulb },
  requete: { libelle: 'Requête', Icone: Inbox },
  piste: { libelle: 'Piste', Icone: Filter },
}

export function LierAppel({
  interactionId,
  compteId,
  contactId,
  nomCorrespondant,
  lienActuel,
  onFerme,
}: {
  interactionId: string
  compteId: string | null
  contactId: string | null
  nomCorrespondant: string | null
  /** Ce à quoi l'appel est déjà rattaché, pour que la fenêtre serve aussi à corriger. */
  lienActuel?: { type: TypeLien; id: string } | null
  onFerme: () => void
}) {
  const { data: objets, isLoading, isError } = useObjetsLiables(compteId, contactId)
  const lier = useLierAppel()
  const [recherche, setRecherche] = useState('')

  const tous = objets ?? []
  const filtres = recherche.trim()
    ? tous.filter((o) =>
        `${o.libelle} ${o.detail ?? ''} ${DESSIN[o.type].libelle}`
          .toLowerCase()
          .includes(recherche.trim().toLowerCase()),
      )
    : tous

  const choisir = (o: ObjetLiable | null) => {
    lier.mutate(
      { interactionId, lien: o ? { type: o.type, id: o.id } : null },
      { onSuccess: onFerme },
    )
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-km-text/25 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="À quoi se rapportait cet appel ?"
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-km-md border border-km-line bg-white shadow-km-pop">
        <div className="flex items-start gap-2.5 border-b border-km-line px-4 py-3">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-km-green" />
          <div className="min-w-0 flex-1">
            <p className="text-km-sm font-semibold text-km-text">À quoi se rapportait cet appel ?</p>
            {nomCorrespondant && (
              <p className="truncate text-km-xs text-km-muted">Avec {nomCorrespondant}</p>
            )}
          </div>
          {/* LA CROIX FERME SANS RIEN ÉCRIRE. C'est le geste que la consigne « pas obligatoire »
              rend indispensable — et l'appel rejoint la liste des non liés, où il attendra. */}
          <button
            type="button"
            onClick={onFerme}
            title="Plus tard"
            aria-label="Fermer sans lier"
            className="shrink-0 rounded p-0.5 text-km-faint transition-colors hover:text-km-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {tous.length > SEUIL_RECHERCHE && (
          <div className="border-b border-km-line px-4 py-2.5">
            <div className="flex items-center gap-2 rounded-km border border-km-line px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-km-faint" />
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Filtrer…"
                className="min-w-0 flex-1 bg-transparent text-km-xs text-km-text outline-none placeholder:text-km-faint"
              />
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {isLoading && <p className="px-2 py-4 text-km-xs text-km-faint">Chargement…</p>}

          {/* UN ÉCHEC DE LECTURE SE DIT. Sans ça, la fenêtre paraîtrait vide et l'on conclurait
              qu'il n'y a rien à lier — le mensonge qu'on corrige partout dans Kimatch. */}
          {isError && (
            <p className="px-2 py-4 text-km-xs text-km-red">
              Impossible de charger les objets de ce compte.
            </p>
          )}

          {!isLoading && !isError && filtres.length === 0 && (
            <p className="px-2 py-4 text-km-xs text-km-faint">
              {tous.length === 0
                ? 'Rien à proposer pour ce correspondant — il n’a ni opportunité, ni recommandation, ni requête, ni piste.'
                : 'Aucun objet ne correspond.'}
            </p>
          )}

          {filtres.map((o) => {
            const { libelle: nomType, Icone } = DESSIN[o.type]
            const retenu = lienActuel?.type === o.type && lienActuel.id === o.id
            return (
              <button
                key={`${o.type}-${o.id}`}
                type="button"
                disabled={lier.isPending}
                onClick={() => choisir(retenu ? null : o)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-km px-2.5 py-2 text-left transition-colors disabled:opacity-50',
                  retenu ? 'bg-km-green-soft' : 'hover:bg-km-soft',
                )}
              >
                <Icone className={cn('h-4 w-4 shrink-0', retenu ? 'text-km-green' : 'text-km-faint')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-km-xs font-semibold text-km-text">{o.libelle}</span>
                  <span className="block truncate text-km-tiny text-km-muted">
                    {nomType}
                    {o.detail ? ` · ${o.detail}` : ''}
                  </span>
                </span>
                {/* LE LIEN ACTUEL SE VOIT, ET SE DÉFAIT D'UN CLIC : cette fenêtre sert aussi à
                    corriger depuis la liste de rattrapage, pas seulement à choisir la première
                    fois. */}
                {retenu && <Check className="h-4 w-4 shrink-0 text-km-green" />}
              </button>
            )
          })}
        </div>

        <div className="border-t border-km-line px-4 py-2.5">
          <button
            type="button"
            onClick={onFerme}
            className="w-full rounded-km border border-km-line px-3 py-2 text-km-xs font-semibold text-km-muted transition-colors hover:bg-km-soft"
          >
            Plus tard
          </button>
        </div>

        {lier.isError && (
          <p className="border-t border-km-line px-4 py-2 text-km-tiny text-km-red">
            {lier.error instanceof Error ? lier.error.message : 'Enregistrement impossible.'}
          </p>
        )}
      </div>
    </div>
  )
}

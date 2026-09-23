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
 * UN COMPTE MONTE À SOIXANTE-HUIT objets, d'où les sections dépliantes : quatre titres tiennent en
 * quatre lignes, et l'on n'ouvre que celle qui concerne l'appel. Naoëlle, 23/09/2026, capture à
 * l'appui : « la modale est trop grande, je veux que les objets apparaissent en un titre dépliant ».
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
import { X, ChevronDown, Link2, Target, Lightbulb, Inbox, Filter, Check } from 'lucide-react'
import {
  useObjetsLiables,
  useLierAppel,
  type TypeLien,
  type ObjetLiable,
} from '@/lib/data/liensAppel'
import { cn } from '@/lib/utils'


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

  /* ══ LA SECTION OUVERTE, ET UNE SEULE ══
   *
   * `null` au départ : tout est fermé, la fenêtre tient sur quelques lignes. En ouvrir une referme
   * l'autre — deux catégories dépliées ramèneraient la liste longue que Naoëlle a refusée.
   *
   * ON NE MONTRE QUE LES CATÉGORIES QUI ONT QUELQUE CHOSE : un titre « Requête » sur un compte qui
   * n'en a aucune promet une liste et rend le vide, le défaut qu'on corrige partout ailleurs. */
  const [ouverte, setOuverte] = useState<TypeLien | null>(null)

  const tous = objets ?? []
  const presentes = (['opportunite', 'recommandation', 'requete', 'piste'] as TypeLien[])
    .filter((t) => tous.some((o) => o.type === t))

  const choisir = (o: ObjetLiable | null) => {
    lier.mutate(
      { interactionId, lien: o ? { type: o.type, id: o.id } : null },
      { onSuccess: onFerme },
    )
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-km-text/25 p-4"
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

        {/* ══ UNE SECTION DÉPLIANTE PAR CATÉGORIE, FERMÉES AU DÉPART ══
         *
         * Naoëlle, 23/09/2026, capture à l'appui : « la modale est trop grande, je veux que les
         * objets apparaissent en un titre dépliant, et quand on déplie on voit les
         * enregistrements ».
         *
         * Sa capture montrait dix lignes empilées, la modale occupant l'écran entier. Or on ne
         * choisit qu'UN objet : afficher les dix revient à montrer neuf lignes qu'on ne prendra
         * pas. Quatre titres tiennent en quatre lignes, et l'on ouvre celui qui concerne l'appel.
         *
         * TOUT EST FERMÉ AU DÉPART, même quand il n'y a qu'une catégorie : ouvrir d'office ferait
         * réapparaître la liste longue dès qu'un compte a vingt recommandations — le défaut qu'on
         * corrige. Un clic de plus, mais une fenêtre qui tient sur un quart d'écran. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {isLoading && <p className="px-2 py-4 text-km-xs text-km-faint">Chargement…</p>}

          {/* UN ÉCHEC DE LECTURE SE DIT. Sans ça, la fenêtre paraîtrait vide et l'on conclurait
              qu'il n'y a rien à lier — le mensonge qu'on corrige partout dans Kimatch. */}
          {isError && (
            <p className="px-2 py-4 text-km-xs text-km-red">
              Impossible de charger les objets de ce compte.
            </p>
          )}

          {!isLoading && !isError && tous.length === 0 && (
            <p className="px-2 py-4 text-km-xs text-km-faint">
              Rien à proposer pour ce correspondant — il n’a ni opportunité, ni recommandation, ni
              requête, ni piste.
            </p>
          )}

          {presentes.map((t) => {
            const lignes = tous.filter((o) => o.type === t)
            const { libelle, Icone } = DESSIN[t]
            const deplie = ouverte === t
            return (
              <div key={t}>
                <button
                  type="button"
                  onClick={() => setOuverte(deplie ? null : t)}
                  aria-expanded={deplie}
                  className="flex w-full items-center gap-2.5 rounded-km px-2.5 py-2.5 text-left transition-colors hover:bg-km-soft"
                >
                  <Icone className="h-4 w-4 shrink-0 text-km-faint" />
                  <span className="flex-1 text-km-xs font-semibold text-km-text">{libelle}</span>
                  <span className="text-km-tiny font-bold text-km-muted">{lignes.length}</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 text-km-faint transition-transform',
                      deplie && 'rotate-180',
                    )}
                  />
                </button>

                {deplie && (
                  <div className="pb-1 pl-6">
                    {lignes.map((o) => {
                      const retenu = lienActuel?.type === o.type && lienActuel.id === o.id
                      return (
                        <button
                          key={o.id}
                          type="button"
                          disabled={lier.isPending}
                          onClick={() => choisir(retenu ? null : o)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-km px-2.5 py-2 text-left transition-colors disabled:opacity-50',
                            retenu ? 'bg-km-green-soft' : 'hover:bg-km-soft',
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-km-xs text-km-text">{o.libelle}</span>
                            {o.detail && (
                              <span className="block truncate text-km-tiny text-km-muted">{o.detail}</span>
                            )}
                          </span>
                          {/* LE LIEN ACTUEL SE VOIT, ET SE DÉFAIT D'UN CLIC : cette fenêtre sert
                              aussi à corriger depuis la liste de rattrapage. */}
                          {retenu && <Check className="h-4 w-4 shrink-0 text-km-green" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
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

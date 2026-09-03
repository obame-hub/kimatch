import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ══ POURQUOI CE CHIFFRE EST CE QU'IL EST ══
 *
 * Naoëlle, 03/09/2026 : « sur la recommandation et tous les objets qui en découlent, que sur chaque
 * champ de calcul, au survol, tu expliques pourquoi c'est rempli, pourquoi c'est pas rempli, comment
 * c'est calculé — toutes les infos à comprendre, afin que s'il y a un truc qu'ils ne comprennent
 * pas, ils arrêtent de venir me voir. »
 *
 * C'est une demande de fond, pas de décoration. Un champ calculé qui affiche « — » sans rien dire
 * envoie forcément quelqu'un poser la question : le lecteur ne peut pas savoir si la donnée manque,
 * si la règle l'exclut, ou si l'écran est cassé. Trois causes très différentes, un seul tiret.
 *
 * ══ CE QUE L'INFOBULLE DOIT DIRE, DANS CET ORDRE ══
 *
 *   resume     ce que le chiffre veut dire, en une phrase — souvent la seule chose qu'on cherche
 *   etapes     le calcul terme à terme, AVEC LES VRAIS NOMBRES du dossier et leur provenance
 *   resultat   le total, pour refermer la démonstration
 *   manques    ce qui empêche le calcul, quand il n'aboutit pas
 *   aller      où corriger — parce que comprendre sans pouvoir agir ne règle rien
 *
 * LES VRAIS NOMBRES, PAS LA FORMULE ABSTRAITE. « volume ÷ 12 × durée × marge » n'apprend rien :
 * c'est « 227 ÷ 12 × 36 × (4 × 50 %) » qui permet de retrouver son chiffre et de repérer lequel des
 * quatre termes est faux. Chaque étape porte donc sa valeur telle qu'elle est dans le dossier, et
 * d'où elle vient.
 *
 * ══ POURQUOI PAS LA CSS `.kw-ib` DÉJÀ EN PLACE ══
 *
 * Elle existe, reprise de la maquette de William, et elle ne convient pas ici : 230 px de large pour
 * un texte de quinze mots, `pointer-events: none` donc rien de sélectionnable, et un panneau en
 * position absolue que le premier parent en `overflow: hidden` coupe — or ces champs vivent dans des
 * cartes qui défilent. Celui-ci passe par un portail, comme `MenuChoix`, et s'ouvre AU CLIC autant
 * qu'au survol : sur une tablette il n'y a pas de survol, et au clavier non plus.
 */

export interface EtapeCalcul {
  libelle: string
  /** La valeur telle qu'elle est dans le dossier. `null` quand elle manque — et c'est dit. */
  valeur: string | null
  /** D'où elle vient : « offre retenue », « saisi sur la fiche », « fiche fournisseur »… */
  origine?: string
}

export function ExplicationCalcul({
  titre,
  resume,
  etapes,
  resultat,
  manques,
  aller,
  className,
}: {
  titre: string
  resume: string
  /** Le calcul, terme à terme. Vide quand le champ n'est pas issu d'un calcul mais d'une règle. */
  etapes?: EtapeCalcul[]
  resultat?: { libelle: string; valeur: string }
  /** Ce qui empêche le calcul d'aboutir. Non vide ⇒ le champ est vide, et voilà pourquoi. */
  manques?: string[]
  /** Où aller corriger. Un bouton, parce que comprendre sans pouvoir agir ne règle rien. */
  aller?: { libelle: string; onClick: () => void }
  className?: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const [cadre, setCadre] = useState<{ haut: number; gauche: number; versLeHaut: boolean } | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const panneau = useRef<HTMLDivElement>(null)

  const LARGEUR = 320

  useLayoutEffect(() => {
    if (!ouvert || !bouton.current) return
    const r = bouton.current.getBoundingClientRect()
    // Une estimation suffit : le panneau bascule vers le haut quand le bas de la fenêtre est proche,
    // et l'erreur de quelques pixels ne se voit pas. La mesurer vraiment demanderait un premier
    // rendu invisible, pour un gain nul.
    const hauteur = 130 + (etapes?.length ?? 0) * 22 + (manques?.length ?? 0) * 20
    const versLeHaut = window.innerHeight - r.bottom < hauteur + 16 && r.top > hauteur
    setCadre({
      haut: versLeHaut ? r.top - 6 : r.bottom + 6,
      // Aligné à droite du déclencheur, ramené dans la fenêtre : ces champs sont souvent en fin de
      // ligne, et un panneau qui déborde à droite est illisible.
      gauche: Math.min(Math.max(8, r.right - LARGEUR), Math.max(8, window.innerWidth - LARGEUR - 8)),
      versLeHaut,
    })
  }, [ouvert, etapes?.length, manques?.length])

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => {
      const c = e.target as Node
      if (!bouton.current?.contains(c) && !panneau.current?.contains(c)) setOuvert(false)
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOuvert(false); bouton.current?.focus() }
    }
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', echap)
    // Le panneau est posé à une position figée : le laisser flotter pendant un défilement le
    // détacherait du chiffre qu'il explique.
    const bouge = () => setOuvert(false)
    window.addEventListener('scroll', bouge, true)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', echap)
      window.removeEventListener('scroll', bouge, true)
    }
  }, [ouvert])

  const incomplet = Boolean(manques && manques.length > 0)

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOuvert((v) => !v) }}
        onMouseEnter={() => setOuvert(true)}
        aria-label={`Comment « ${titre} » est calculé`}
        aria-expanded={ouvert}
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full align-middle transition-colors',
          incomplet
            ? 'text-km-amber hover:bg-km-amber-soft'
            : 'text-km-faint hover:bg-km-soft hover:text-km-muted',
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {ouvert && cadre && createPortal(
        <div
          ref={panneau}
          role="dialog"
          aria-label={titre}
          onMouseLeave={() => setOuvert(false)}
          style={{
            position: 'fixed',
            top: cadre.versLeHaut ? undefined : cadre.haut,
            bottom: cadre.versLeHaut ? window.innerHeight - cadre.haut : undefined,
            left: cadre.gauche,
            width: LARGEUR,
          }}
          className="z-[70] rounded-km-md border border-km-line bg-km-surface p-3 text-left shadow-km-pop"
        >
          <p className="text-km-micro font-bold uppercase tracking-[0.07em] text-km-faint">
            {titre}
          </p>
          <p className="mt-1 text-km-label leading-relaxed text-km-text">{resume}</p>

          {etapes && etapes.length > 0 && (
            <div className="mt-2.5 border-t border-km-line pt-2">
              <p className="mb-1.5 text-km-micro font-bold uppercase tracking-[0.06em] text-km-faint">
                Le calcul, sur ce dossier
              </p>
              <div className="flex flex-col gap-1">
                {etapes.map((e) => (
                  <div key={e.libelle} className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-km-label leading-snug text-km-muted">
                      {e.libelle}
                      {e.origine && (
                        <span className="block text-km-tiny text-km-faint">{e.origine}</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-km-label tabular-nums',
                        /* LA VALEUR MANQUANTE EST EN AMBRE, PAS EN GRIS. C'est elle qu'on cherche
                           quand on ouvre cette bulle : la noyer dans la même couleur que les autres
                           obligerait à lire les quatre lignes. */
                        e.valeur == null ? 'font-bold text-km-amber' : 'font-semibold text-km-text',
                      )}
                    >
                      {e.valeur ?? 'manque'}
                    </span>
                  </div>
                ))}
              </div>
              {resultat && (
                <div className="mt-1.5 flex items-baseline gap-2 border-t border-km-line pt-1.5">
                  <span className="flex-1 text-km-label font-semibold text-km-text">
                    {resultat.libelle}
                  </span>
                  <span className="shrink-0 font-mono text-km-body font-bold tabular-nums text-km-text">
                    {resultat.valeur}
                  </span>
                </div>
              )}
            </div>
          )}

          {incomplet && (
            <div className="mt-2.5 rounded-km border border-km-amber-line bg-km-amber-soft/40 px-2.5 py-2">
              <p className="text-km-micro font-bold uppercase tracking-[0.06em] text-km-amber">
                Pourquoi c’est vide
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {manques!.map((m) => (
                  <li key={m} className="text-km-label leading-snug text-km-text">{m}</li>
                ))}
              </ul>
            </div>
          )}

          {aller && (
            <button
              type="button"
              onClick={() => { setOuvert(false); aller.onClick() }}
              className="mt-2.5 w-full rounded-km bg-km-soft px-2.5 py-1.5 text-km-label font-semibold text-km-text transition-colors hover:bg-km-green-soft"
            >
              {aller.libelle}
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

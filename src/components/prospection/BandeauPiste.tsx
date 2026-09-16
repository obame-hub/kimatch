import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Filter, History, MoreHorizontal, Pencil, Trash2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE BANDEAU DE LA FICHE PISTE — LE MÊME QUE CELUI DU COMPTE, CE QUI EST LE BUT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « tu vas reprendre le graphique du header de la fiche compte et simplement
 * l'adapter à la fiche piste ».
 *
 * ══ CE QUI EST REPRIS À L'IDENTIQUE, ET POURQUOI ÇA COMPTE ══
 *
 * La géométrie, au pixel : hauteur de barre, retour à gauche, jeton d'objet de 32 px, titre en
 * 23 px, cartouches, gestes à droite, onglets en dessous. Deux fiches qui se ressemblent se lisent
 * sans réapprentissage — on cherche le bouton Modifier au même endroit sur un compte et sur une
 * piste, et c'est exactement ce qu'un utilisateur fait sans y penser.
 *
 * SEULE LA COULEUR DU JETON CHANGE : pétrole (`km-piste`) au lieu du bleu du compte, avec l'icône de
 * la navigation. C'est le seul repère qui doit différer — il dit sur quel objet on est.
 *
 * ══ CE QUI CHANGE, PARCE QU'UNE PISTE N'EST PAS UN COMPTE ══
 *
 * LE TITRE EST LE NOM DE LA PERSONNE. « Le nom de la piste c'est le nom complet du contact. » Une
 * piste n'a pas de raison sociale propre : c'est quelqu'un qu'on appelle, chez une société. Le nom
 * de la société vient donc juste dessous, en seconde ligne — présent, mais subordonné.
 *
 * IL S'ÉDITE EN PLACE ET FAIT 19 px, comme celui du compte. Je l'avais posé en texte mort à 23 px :
 * c'était la taille du gabarit, pas celle qu'on voit à l'écran, où `InlineField` redescend à 19.
 * « Les polices ne sont pas de même taille » — William, 16/09/2026. Le bandeau ne fixe donc plus la
 * taille du titre : la fiche passe le champ tout habillé, exactement comme la fiche compte.
 *
 * LA RÉFÉRENCE N'EST PLUS AFFICHÉE. « Le PST-2026-2870 est inutile à l'affichage. » Elle ne sert
 * qu'à se retrouver dans Salesforce, et l'onglet Piste la porte.
 *
 * PAS DE TIROIR DE PARC. « Ne code pas le défilé du parc qui ouvre les 3 cards en défilement. » Il
 * n'aurait rien à montrer : une piste n'a ni compteurs, ni contrats, ni échéances. Une bande qui
 * afficherait trois tirets serait pire que son absence.
 *
 * ET RIEN NE VIENT PRENDRE SA PLACE. J'y avais glissé le chemin de statut, pour qu'il survive au
 * changement d'onglet ; William, 16/09/2026 : « le chemin doit être dans le volet de gauche, pas
 * dans le header ». La ligne d'identité touche donc les onglets, exactement comme sur un compte au
 * tiroir replié — et le bandeau reste ce qu'il devait être : le même que celui du compte.
 *
 * « CONVERTIR » REMPLACE « CRÉER ». Sur un compte, le hub de création ouvre six objets. Une piste
 * n'en produit qu'un, et une seule fois : l'opportunité. Le bouton porte donc le geste lui-même
 * plutôt qu'un menu — et il disparaît quand la piste est déjà convertie, parce qu'on ne convertit
 * pas deux fois.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function BandeauPiste({
  canManage,
  titre,
  societe,
  pastilles,
  proprietaire,
  convertie,
  onRetour,
  onModifier,
  onSupprimer,
  onConvertir,
  onDisqualifier,
  onHistorique,
  lienOpportunite,
  onglets,
}: {
  canManage: boolean
  /** Le nom complet du contact, éditable en place quand les droits le permettent. */
  titre: React.ReactNode
  /** La société, en seconde ligne : une piste est une personne CHEZ une entreprise. */
  societe: React.ReactNode
  /** Le cartouche Entreprise / Syndic professionnel, et le statut. */
  pastilles: React.ReactNode
  proprietaire: React.ReactNode
  /** Vrai quand la piste a déjà produit son opportunité : le bouton cède la place au lien. */
  convertie: boolean
  onRetour: () => void
  onModifier: () => void
  onSupprimer: () => void
  onConvertir: () => void
  /** Absent quand la piste est déjà close : on ne disqualifie pas deux fois. */
  onDisqualifier?: () => void
  onHistorique: () => void
  /** L'opportunité issue de cette piste, quand elle existe. Prend la place de « Convertir ». */
  lienOpportunite?: string
  onglets?: React.ReactNode
}) {
  const geste = 'inline-flex h-8 items-center gap-1.5 rounded-km border px-2.5 text-km-label font-semibold transition-colors'

  const [menu, setMenu] = useState(false)
  const zoneMenu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const auClic = (e: MouseEvent) => {
      if (zoneMenu.current && !zoneMenu.current.contains(e.target as Node)) setMenu(false)
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('mousedown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [menu])

  return (
    <div className="flex-none bg-km-surface">
      {/* ══ LA LIGNE D'IDENTITÉ ══ */}
      <div className="flex items-center gap-2.5 px-4 py-2 sm:px-[22px]">
        <button
          type="button"
          onClick={onRetour}
          title="Retour aux pistes"
          aria-label="Retour aux pistes"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-km text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* L'ICÔNE DE LA NAVIGATION, sur le pétrole des pistes : le même jeton que dans le rail de
            gauche, pour qu'on reconnaisse l'objet avant même de lire le nom. */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-km-md bg-gradient-to-br from-km-piste to-[#2a8598] text-white">
          <Filter className="h-4 w-4" />
        </span>

        {/* ══ LA CARTOUCHE SE COLLE AU NOM, COMME SUR LE COMPTE ══
            William, 16/09/2026 : « la cartouche doit être positionnée juste après nom de
            l'enregistrement (comme sur compte) ». Je l'avais poussée à l'autre bout de la ligne, où
            elle se lisait comme une étiquette de la barre d'outils et non comme ce que la piste EST.

            DEUX LIGNES, ET LE COUPLE NOM + CARTOUCHE SUR LA PREMIÈRE. La société reste dessous, en
            second rang : on appelle quelqu'un, pas une raison sociale. */}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="min-w-0 truncate">{titre}</div>
            <div className="flex shrink-0 items-center gap-1.5">{pastilles}</div>
          </div>
          <div className="truncate text-km-label leading-tight text-km-muted">{societe}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {proprietaire}
          <span className="hidden h-4 w-px bg-km-line sm:block" />
          {canManage && (
            <button
              type="button"
              onClick={onModifier}
              title="Modifier la fiche"
              className={cn(geste, 'border-km-line bg-km-surface text-km-muted hover:border-km-green-line hover:bg-km-green-soft hover:text-km-green')}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Modifier</span>
            </button>
          )}

          {/* ══ CONVERTIR, LE SEUL GESTE QUE CETTE FICHE PRODUIT ══
              En vert plein, comme « Créer » sur un compte : c'est l'action qu'on vient faire ici.
              Absent une fois la piste convertie — la fiche affiche alors le lien vers l'opportunité,
              qui est ce qu'on cherche à ce moment-là. */}
          {canManage && !convertie && (
            <button
              type="button"
              onClick={onConvertir}
              title="Convertir cette piste en opportunité"
              className={cn(geste, 'border-km-green bg-km-green text-white hover:brightness-110')}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Convertir
            </button>
          )}

          {/* ══ UNE FOIS CONVERTIE, LE BOUTON DEVIENT LE LIEN ══
              L'onglet « Rattachements » qui le portait a été supprimé le 16/09/2026. C'est la même
              place, et c'est juste : avant la conversion on vient la faire, après on vient voir ce
              qu'elle a produit. En contour et non en plein — l'affaire est faite, le geste est
              devenu une consultation. */}
          {convertie && lienOpportunite && (
            <Link
              to={lienOpportunite}
              title="Ouvrir l’opportunité issue de cette piste"
              className={cn(geste, 'border-km-green-line bg-km-green-soft text-km-green hover:brightness-95')}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">L’opportunité</span>
            </Link>
          )}

          {/* Les deux gestes rares sous « ⋯ », même convention que la fiche compte : on consulte
              l'historique quand une question se pose, on supprime deux fois par an. */}
          <div className="relative" ref={zoneMenu}>
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              aria-label="Autres actions"
              title="Autres actions"
              className={cn(geste, 'px-2', menu
                ? 'border-km-green bg-km-green-soft text-km-green'
                : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft')}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>

            {menu && (
              <div className="absolute right-0 z-40 mt-1.5 w-56 animate-km-hub-pop overflow-hidden rounded-km-md border border-km-line bg-km-surface py-1 shadow-kw-panel">
                <button
                  type="button"
                  onClick={() => { setMenu(false); onHistorique() }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-km-body font-semibold text-km-text hover:bg-km-soft"
                >
                  <History className="h-3.5 w-3.5 text-km-muted" /> Historique des modifications
                </button>

                {/* ══ DISQUALIFIER EST ICI, ET NON DANS LE CHEMIN ══
                    Le chemin avance d'un clic, sans rien demander. Écarter une piste réclame son
                    motif — Naoëlle, 01/09/2026 : « mettre un commentaire pour disqualifié » — donc
                    le geste ouvre une fenêtre, et un cran de frise qui ouvre une fenêtre ment sur ce
                    qu'il fait. Il rejoint les deux autres gestes qui sortent du travail courant. */}
                {canManage && onDisqualifier && (
                  <button
                    type="button"
                    onClick={() => { setMenu(false); onDisqualifier() }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-km-body font-semibold text-km-text hover:bg-km-soft"
                  >
                    <XCircle className="h-3.5 w-3.5 text-km-muted" /> Disqualifier cette piste
                  </button>
                )}

                {canManage && (
                  <>
                    <div className="my-1 h-px bg-km-line-soft" />
                    <button
                      type="button"
                      onClick={() => { setMenu(false); onSupprimer() }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-km-body font-semibold text-km-red hover:bg-km-red-soft"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer cette piste
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {onglets}
    </div>
  )
}

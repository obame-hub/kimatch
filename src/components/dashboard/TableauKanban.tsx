import { Fragment, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * UN TABLEAU KANBAN, PAR STATUT.
 *
 * Michel, rappelé le 25/08/2026 : une vue kanban dans le tableau de bord, pour les objets de sa
 * diapositive 13 — et cette diapositive est justement la liste de ceux qui ONT des statuts :
 *
 *   SIGNAL          Nouveau · À qualifier · Converti · Écarté
 *   OPPORTUNITÉ     Nouvelle · En qualification · Mandat si requis · Prête à convertir ·
 *                   Convertie · Abandonnée
 *   RECOMMANDATION  Brouillon · Consultation · Offres reçues · À présenter · Présentée ·
 *                   Acceptée / Refusée
 *
 * CETTE DERNIÈRE LIGNE N'EST PLUS VRAIE, et elle est laissée là pour qu'on sache d'où l'on vient.
 * La refonte du 28/08/2026 a ramené le dossier à quatre états DÉDUITS de sa dernière version —
 * Brouillon · Active · À réactiver · Clôturée — et déplacé le détail de la fin dans
 * `finalite_cloture`. Les six paliers ci-dessus sont désactivés en base ; l'historique et la table
 * d'audit les portent encore, c'est pourquoi on ne les efface pas.
 *
 * ON NE DÉPLACE PAS LES CARTES, ET C'EST UN CHOIX, pas une facilité. Le statut d'une opportunité se
 * CALCULE à partir des objets réunis — « la maturité se fait si les objets sont valides » — donc
 * glisser une carte d'une colonne à l'autre ne voudrait rien dire : elle reviendrait à sa place au
 * rechargement. Et pour une recommandation, sa règle est « le statut évolue, il ne régresse jamais » :
 * un glisser-déposer permettrait précisément de le faire reculer. Le tableau sert à VOIR le pipeline.
 * Cliquer une carte ouvre l'objet, où les gestes qui font avancer existent déjà et vérifient leurs
 * conditions.
 *
 * LES CARTES SONT ORDONNÉES PAR URGENCE, pas par date de création : c'est un tableau de bord, il
 * répond à « par quoi je commence ». Chaque appelant fournit l'ordre qui vaut pour son objet.
 *
 * LES COLONNES TERMINALES SONT ÉCARTÉES par l'appelant, pas ici : « Converti », « Écarté »,
 * « Acceptée », « Refusée », « Abandonnée » sont des aboutissements. Les afficher remplirait l'écran
 * de dossiers finis — 1 573 recommandations closes contre 134 vivantes — et noierait le travail
 * restant.
 */

export interface ColonneKanban {
  code: string
  libelle: string
  /** Teinte du filet supérieur. Reprend la couleur du référentiel quand elle existe. */
  couleur?: string | null
  /**
   * LA PASTILLE DE TOTAL, collée au titre de colonne — maquettes 5 et 6 du dossier UX du 26/08/2026 :
   * « afficher le volume de consommation par statut PRÈS DU TITRE DE COLONNE et le total près du titre
   * de page », « afficher la marge par statut près du titre de chaque colonne ».
   *
   * ELLE REMPLACE LE BANDEAU que j'avais livré le matin même, et sa version est meilleure : le chiffre
   * est là où on lit la colonne, pas dans un tableau récapitulatif au-dessus qu'il faut mettre en
   * correspondance de tête. Un bandeau séparé oblige à faire le lien ; une pastille le fait pour vous.
   *
   * Déjà formatée, unité comprise : le tableau ne sait pas s'il montre des euros ou des GWh.
   */
  total?: string | null
}

/**
 * LA CARTE, TELLE QUE MICHEL LA DESSINE dans ses six maquettes du 25/08/2026.
 *
 * Quatre étages, du haut vers le bas : l'étiquette de NATURE, le titre et son client, le MOTIF dans
 * son cadre, et les CHIFFRES en pied. Chacun répond à une question que le commercial se pose avant
 * d'ouvrir la fiche : de quoi il s'agit, chez qui, pourquoi c'est là, et combien ça pèse.
 *
 * TOUS LES ÉTAGES SONT OPTIONNELS et se replient s'ils sont absents : les six pages ne portent pas
 * les mêmes informations, et une carte de recommandation n'a pas de nature à annoncer là où une carte
 * de signal en a une. Une carte qui n'a que son titre reste une carte correcte.
 */
export interface CarteKanban {
  id: string
  titre: string
  sousTitre?: string
  /** Mention de droite : une date, un nombre de jours, un palier. */
  mention?: string
  /** Vrai quand la carte mérite d'être traitée avant les autres de sa colonne. */
  urgent?: boolean
  /** L'étiquette de nature, en tête de carte — le type de signal, l'origine d'une piste. */
  nature?: string
  /**
   * UNE ICÔNE DEVANT LE TITRE — l'énergie d'un dossier, aujourd'hui.
   *
   * Elle remplace l'emoji que 204 noms de recommandation portaient en préfixe (nettoyé en base le
   * 31/08/2026). Un emoji est dessiné par le système : il change d'aspect d'une machine à l'autre,
   * arrive en couleurs pleines au milieu d'une interface en traits fins, et ignore la couleur du
   * texte. Une icône du jeu de l'application ne fait aucune de ces trois choses.
   */
  icone?: ReactNode
  /**
   * La phrase qui dit POURQUOI la carte existe, dans son cadre — « l'échéance tombe dans 4 mois ».
   *
   * C'est l'apport de ses maquettes : sur un kanban, la colonne dit l'état et le titre dit l'objet,
   * mais rien ne disait le motif. Le commercial devait ouvrir la fiche pour savoir s'il devait s'en
   * occuper maintenant.
   */
  motif?: string
  /** Chiffres en pied de carte, deux au plus pour rester lisibles — un volume, un montant. */
  chiffres?: { libelle: string; valeur: string }[]
  /**
   * LE GROUPE AUQUEL LA CARTE APPARTIENT, écrit ENTRE les cartes et non dessus.
   *
   * Naoëlle, 27/08/2026 : « je veux pas que les instructions en retard etc. soient sur les tuiles, je
   * veux que ce soit indiqué entre les tuiles — par exemple c'est écrit "en retard de 1 jour" et il y
   * a toutes les tuiles en retard de 1 jour en dessous ».
   *
   * Elle a raison, et c'est un meilleur dessin : une pastille répétée sur huit tuiles consécutives
   * écrit huit fois la même chose et vole la place du nom du fournisseur. Un intertitre l'écrit une
   * fois et transforme la colonne en liste lisible d'un coup d'œil — on voit d'emblée COMBIEN de
   * dossiers partagent la même urgence, ce qu'une pastille par tuile ne montre pas.
   *
   * LE REGROUPEMENT SUIT L'ORDRE REÇU, il ne trie pas : l'intertitre apparaît quand `cle` change
   * d'une carte à la suivante. C'est volontaire — le tri se décide en base (voir useKanbanServeur),
   * et regrouper ici reviendrait à réordonner un échantillon de dix cartes en ignorant les autres.
   * Conséquence à assumer : si l'appelant fournit des cartes mal ordonnées, un même groupe peut
   * apparaître deux fois. Mieux vaut ce défaut visible qu'un tri caché qui contredirait la base.
   */
  groupe?: { cle: string; texte: string; ton: 'retard' | 'jour' | 'proche' | 'loin' }
  to: string
}

/** Nombre de cartes montrées par colonne AVANT dépliage. Au-delà, un bouton montre le reste. */
const CARTES_PAR_COLONNE = 8

/**
 * La tuile d'un tableau : un lien quand elle mene a une fiche, un bouton quand elle declenche
 * une action. Meme balisage a l'oeil, comportements differents sous la main — et c'est bien la
 * difference que le navigateur et les lecteurs d'ecran ont besoin de connaitre.
 */
function CarteCliquable({
  to,
  onClick,
  className,
  children,
}: {
  to?: string
  onClick?: () => void
  className?: string
  children: ReactNode
}) {
  if (to) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  )
}

export function TableauKanban({
  colonnes,
  cartes,
  totaux,
  onCarte,
  siVide,
}: {
  colonnes: ColonneKanban[]
  /** Cartes indexées par code de colonne, déjà ordonnées par urgence par l'appelant. */
  cartes: Record<string, CarteKanban[]>
  /**
   * Le vrai total par colonne, quand il ne se déduit PAS du nombre de cartes fournies.
   *
   * Sur une page dont la liste est paginée en base — les recommandations — l'appelant ne reçoit que
   * dix cartes par colonne et le total vient d'un `count` séparé. Sans ce paramètre, la colonne
   * annoncerait « 10 » sur 648 dossiers, et « et 2 autres » là où il en reste 640.
   */
  totaux?: Record<string, number>
  /**
   * Que faire au clic, quand ouvrir une page ne convient pas.
   *
   * Les pistes n'ont pas de fiche : leurs actions — cocher les cinq validations, convertir, joindre
   * un fichier — vivaient dans la carte de liste. Sans ce rappel, retirer la liste rendrait la page
   * inutilisable. Fourni, il l'emporte sur `to`.
   */
  onCarte?: (id: string) => void
  siVide: string
}) {
  /* LES COLONNES DÉPLIÉES, une par une. Naoëlle, 28/08/2026 : « quand je veux appuyer sur les autres
     pour les voir, c'est impossible ». La mention « et 15 autres » était du texte mort : on annonçait
     un reste sans donner le moyen de l'atteindre, ce qui est pire que de ne rien annoncer.

     Le dépliage est PAR COLONNE et non global : on déplie celle qu'on travaille, et les autres
     gardent leur hauteur — sinon le tableau devient un mur et on perd la comparaison entre colonnes,
     qui est tout l'intérêt d'un kanban. */
  const [depliees, setDepliees] = useState<Set<string>>(new Set())
  const basculer = (code: string) =>
    setDepliees((d) => {
      const suivant = new Set(d)
      if (suivant.has(code)) suivant.delete(code)
      else suivant.add(code)
      return suivant
    })
  const compte = (code: string) => totaux?.[code] ?? cartes[code]?.length ?? 0
  const total = colonnes.reduce((n, c) => n + compte(c.code), 0)

  if (total === 0) {
    return (
      <p className="rounded-km-md border border-dashed border-km-line bg-km-soft px-4 py-3 text-km-label text-km-muted">
        {siVide}
      </p>
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {colonnes.map((col) => {
        const liste = cartes[col.code] ?? []
        const depliee = depliees.has(col.code)
        const montrees = depliee ? liste : liste.slice(0, CARTES_PAR_COLONNE)
        /* PLUS DE LISERÉ COLORÉ EN HAUT DES COLONNES. Chacune portait la couleur de son statut
              — bleu, orange, violet — soit une rangée de barres saturées qui n'a rien à voir avec
              sa maquette. Naoëlle, 31/08/2026 : « tu as laissé les couleurs qui n'ont rien à voir
              avec le vert ».

              Sa maquette met une PASTILLE VERTE de 5 px devant chaque intitulé, la même pour
              toutes : elle dit « voici une colonne », pas « voici quelle colonne ». La couleur
              reste réservée au sens métier — l'urgence d'une carte, un statut — et cesse de
              décorer une structure que le titre nomme déjà. */
        return (
          <div
            key={col.code}
            className="flex w-[236px] shrink-0 flex-col rounded-km-md border border-km-line bg-km-soft/70 p-2.5"
          >
            {/* ══ LE TITRE DE COLONNE SUR SA PROPRE LIGNE ══
                « EN CONTRACTUALISATI… » : sur la capture du 31/08/2026, le titre est tronqué au
                milieu d'un mot. Il partageait sa ligne avec une pastille, un montant et un compte —
                dans 236 px de large, il ne lui restait qu'une soixantaine de pixels.
                Les chiffres passent en dessous : ils se lisent aussi bien, et le titre est enfin
                entier. C'est la seule information de l'en-tête qui ne se devine pas. */}
            <div className="mb-2 px-0.5">
              <p className="truncate text-km-tiny font-bold uppercase tracking-[0.06em] text-km-muted">
                {col.libelle}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                {/* Le total d'abord, le nombre de cartes ensuite : c'est le chiffre qui porte
                    l'information, le compte n'est qu'une indication de volume. */}
                {col.total && (
                  <span className="shrink-0 rounded-km-md bg-km-green-soft px-1.5 py-px text-km-tiny font-bold tabular-nums text-km-green">
                    {col.total}
                  </span>
                )}
                <span className="ml-auto shrink-0 rounded-km-md bg-km-surface px-1.5 py-px text-km-tiny font-bold tabular-nums text-km-muted">
                  {compte(col.code)}
                </span>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
              {montrees.length === 0 && <p className="px-0.5 text-km-micro text-km-faint">Vide</p>}
              {montrees.map((c, i) => (
                <Fragment key={c.id}>
                  {/* ══ L'INTERTITRE DE GROUPE ══
                      Écrit dès que la clé change par rapport à la carte précédente. Le premier
                      intertitre sort toujours, sinon le premier groupe serait le seul sans nom et
                      on lirait ses cartes comme si elles n'appartenaient à rien. */}
                  {c.groupe && (i === 0 || montrees[i - 1].groupe?.cle !== c.groupe.cle) && (
                    <p
                      className={cn(
                        'mt-1 flex items-center gap-1.5 px-0.5 pt-1 text-km-micro font-bold uppercase tracking-[0.06em] first:mt-0 first:pt-0',
                        c.groupe.ton === 'retard'
                          ? 'text-km-red'
                          : c.groupe.ton === 'jour'
                            ? 'text-km-amber'
                            : c.groupe.ton === 'proche'
                              ? 'text-km-amber'
                              : 'text-km-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          c.groupe.ton === 'retard'
                            ? 'bg-km-red'
                            : c.groupe.ton === 'jour'
                              ? 'bg-km-amber'
                              : c.groupe.ton === 'proche'
                                ? 'bg-km-amber-line'
                                : 'bg-km-faint',
                        )}
                      />
                      <span className="truncate">{c.groupe.texte}</span>
                      {/* Le nombre de cartes du groupe : c'est ce qu'un intertitre apporte de plus
                          qu'une pastille par tuile — savoir que le retard porte sur sept dossiers
                          et non un seul. Compté sur les cartes MONTRÉES, jamais sur le total de la
                          colonne : annoncer sept quand on n'en affiche que trois serait faux. */}
                      <span className="ml-auto shrink-0 tabular-nums opacity-70">
                        {montrees.filter((x) => x.groupe?.cle === c.groupe?.cle).length}
                      </span>
                    </p>
                  )}
                {/* UNE CARTE QUI MENE A UNE FICHE EST UN LIEN, PAS UN BOUTON.

                    En bouton, elle ne repondait ni au clic du milieu, ni au Ctrl+clic, ni au clic
                    droit « ouvrir dans un nouvel onglet », et ne montrait aucune adresse en bas de
                    la fenetre avant qu'on clique. Comparer deux dossiers cote a cote — le geste le
                    plus courant du metier — obligeait a faire un aller-retour par ecran. Un lecteur
                    d'ecran annoncait « bouton » la ou il s'agit d'aller quelque part.

                    Les cartes qui declenchent une action et non une navigation (onCarte) restent des
                    boutons : c'est bien ce qu'elles sont. Les classes sont identiques dans les deux
                    cas, l'apparence ne bouge pas. */}
                <CarteCliquable
                  to={onCarte ? undefined : c.to}
                  onClick={onCarte ? () => onCarte(c.id) : undefined}
                  className={cn(
                    'group flex items-start gap-1.5 rounded-km-md border bg-km-surface px-2 py-1.5 text-left transition-colors hover:bg-km-soft',
                    c.urgent ? 'border-km-amber' : 'border-km-line',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    {/* ── L'étiquette de nature ── */}
                    {c.nature && (
                      <span className="mb-1 inline-block max-w-full truncate rounded-[3px] bg-km-soft px-1.5 py-px text-km-micro font-bold uppercase tracking-[0.06em] text-km-muted">
                        {c.nature}
                      </span>
                    )}

                    {/* ══ TROIS NIVEAUX, PAS UN SEUL ══
                        Naoëlle, 31/08/2026 : « c'est vraiment pas beau, c'est pas classe et aéré ».
                        Toute la carte vivait entre 8,5 et 11 px : le titre à 11, absolument tout le
                        reste à 8,5. Une carte sans hiérarchie n'est pas dense, elle est illisible —
                        l'œil n'a aucun point d'entrée et doit tout lire pour trouver le nom.
                        Le titre monte à 13 px, les chiffres à 11 : deux valeurs relevées, rien
                        d'abaissé, et la carte ne gagne que quelques pixels de haut. */}
                    <span className="flex items-center gap-1.5">
                      {c.icone}
                      <span className="min-w-0 flex-1 truncate text-km-body font-semibold text-km-text">{c.titre}</span>
                    </span>
                    {c.sousTitre && (
                      <span className="block truncate text-km-tiny text-km-muted">{c.sousTitre}</span>
                    )}

                    {/* ── Le motif, dans son cadre. Deux lignes au plus : au-delà, ce n'est plus un
                           motif, c'est un commentaire, et il a sa place sur la fiche. ── */}
                    {c.motif && (
                      <span className="mt-1.5 block rounded-[4px] bg-km-soft px-2 py-1.5 text-km-tiny text-km-muted line-clamp-2">
                        {c.motif}
                      </span>
                    )}

                    {/* ── Les chiffres en pied ── */}
                    {c.chiffres && c.chiffres.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                        {c.chiffres.map((n) => (
                          <span key={n.libelle} className="block">
                            <span className="block text-km-micro uppercase tracking-[0.05em] text-km-faint">{n.libelle}</span>
                            <span className="block text-km-label font-bold tabular-nums text-km-text">
                              {n.valeur}
                            </span>
                          </span>
                        ))}
                      </span>
                    )}

                    {c.mention && (
                      <span
                        className={cn(
                          'mt-1 block text-km-label font-semibold tabular-nums',
                          c.urgent ? 'text-km-amber' : 'text-km-muted',
                        )}
                      >
                        {c.mention}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-km-faint opacity-0 transition-opacity group-hover:opacity-100" />
                </CarteCliquable>
                </Fragment>
              ))}
              {/* ══ VOIR LE RESTE, OU LE REPLIER ══
                     On dit ce qu'on ne montre pas — une colonne coupée en silence se lit comme une
                     colonne vidée — mais on donne maintenant le moyen de l'ouvrir.

                     TROIS CAS, ET LE TROISIÈME EST LE PLUS IMPORTANT :
                       · il reste des cartes chargées → un bouton les déplie ;
                       · la colonne est dépliée → un bouton la replie ;
                       · il reste des cartes NON CHARGÉES → on le dit sans promettre de les montrer.
                     Le troisième évite le pire des retours : un bouton qui, une fois cliqué,
                     n'affiche rien de plus parce que la base n'a pas envoyé la suite. */}
              {(() => {
                const total = compte(col.code)
                const reste = total - montrees.length
                if (reste <= 0 && !depliee) return null
                const resteChargeable = liste.length - montrees.length

                if (depliee) {
                  return (
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => basculer(col.code)}
                        className="rounded-km-sm px-0.5 text-km-micro font-bold text-km-green hover:underline"
                      >
                        Replier
                      </button>
                      {reste > 0 && (
                        <span className="ml-1.5 text-km-micro text-km-faint">
                          {reste} de plus, non chargée{reste > 1 ? 's' : ''} — affinez la recherche
                        </span>
                      )}
                    </div>
                  )
                }

                return (
                  <div className="pt-0.5">
                    {resteChargeable > 0 ? (
                      <button
                        type="button"
                        onClick={() => basculer(col.code)}
                        className="rounded-km-sm px-0.5 text-km-micro font-bold text-km-green hover:underline"
                      >
                        Voir les {reste} autre{reste > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="px-0.5 text-km-micro text-km-faint">
                        et {reste} autre{reste > 1 ? 's' : ''} — affinez la recherche pour les voir
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })}
    </div>
  )
}

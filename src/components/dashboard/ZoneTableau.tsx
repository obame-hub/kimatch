
/**
 * ══ CE QUE LES DEUX ZONES DU TABLEAU DE BORD ONT EN COMMUN ══
 *
 * V2, 11/09/2026. « Offres du jour » et « Tâches du jour » sont deux blocs jumeaux : même largeur,
 * même barre de titre, mêmes filtres de statut, mêmes hauteurs de ligne. En V1 tout cela existait
 * en DEUX exemplaires, recopiés d'un fichier à l'autre — trois constantes de hauteur, un composant
 * `Filtre` et une barre de titre, à chaque fois presque identiques.
 *
 * « Presque » est le mot qui coûte. Les deux barres n'avaient déjà pas la même hauteur d'icône, et
 * les deux `Filtre` divergeaient sur l'ombre portée. Ce sont des écarts qu'on ne voit pas en
 * regardant un bloc, seulement en les superposant — et personne ne les superpose.
 *
 * Ce fichier ne contient donc QUE ce qui doit rester identique. Tout ce qui est propre à une zone
 * — ses colonnes, son tri, ses gestes — reste chez elle.
 *
 * ── IL A MAIGRI, ET C'EST BON SIGNE ──
 *
 * Il hébergeait aussi un composant `FiltreStatut`, la pastille que les deux tableaux employaient.
 * Plus aucun ne s'en sert : les offres ont leurs trois cartes à gauche, les tâches ont rangé leurs
 * statuts dans le menu « Filtres ». Un composant partagé que personne n'appelle n'est pas une
 * réserve pour plus tard, c'est du code que la prochaine lecture croira vivant.
 */

/* ══ LES TROIS HAUTEURS, PARTAGÉES ══
   La hauteur d'un bloc est la SOMME de ce qu'il contient, jamais une valeur ronde posée à l'œil :
   celle-ci couperait la dernière ligne en deux, ce qui est pire que de la masquer — on croit avoir
   tout vu. Les deux zones calculent donc leur hauteur à partir de ces trois nombres, et c'est ce
   qui garantit l'alignement au pixel que William a demandé le 10/09/2026. */

/** La barre de titre. 44 px : la barre claire n'a plus besoin de la masse qu'avait la barre noire. */
export const HAUTEUR_BARRE = 44
/** La ligne des noms de colonnes. */
export const HAUTEUR_ENTETE = 34
/** Une ligne de données. 46 px : au-dessus du seuil de confort tactile, et six lignes à l'écran. */
export const HAUTEUR_LIGNE = 46

/**
 * La barre de commande d'un tableau.
 *
 * ── ELLE ÉTAIT GRAPHITE, ELLE EST CLAIRE ──
 *
 * Le fond sombre avait une justification écrite : « la rangée du dessus porte déjà cinq teintes
 * vives, une sixième au-dessus du tableau aurait fait foire ». Les cinq aplats vifs ont disparu en
 * V2 (voir `CartesDuJour`), et la justification avec eux. Restaient deux rectangles noirs de
 * 910 × 52 px au milieu d'une page claire, deuxième masse visuelle de l'écran, pour porter un
 * titre de deux mots.
 *
 * ── ET ELLE NE PORTE PLUS DE TITRE DU TOUT ──
 *
 * V3 : le titre de la zone est remonté au-dessus du panneau, dans `ZonePanneau`. Le laisser ici
 * l'aurait écrit DEUX FOIS à trente pixels d'écart — c'est précisément le doublon que la V2 avait
 * corrigé dans l'autre sens, en supprimant le titre de page.
 *
 * Reste ce qui ne peut être qu'ici : LE DÉCOMPTE, qui change avec les filtres et doit donc être
 * lu juste à côté d'eux, et LES FILTRES eux-mêmes. Le décompte est écrit « 12 études » plutôt que
 * « 12 » seul : une pastille chiffrée sans son unité, séparée de son titre, ne veut plus rien
 * dire.
 *
 * Chacun son rôle : le chapitre annonce, la barre pilote.
 */
export function BarreZone({
  nombre,
  unite,
  unitePluriel,
  children,
}: {
  /** `null` pendant le chargement : on écrit un tiret plutôt qu'un zéro, qui serait un mensonge. */
  nombre: number | null
  /** L'unité au singulier — « étude », « tâche ». */
  unite: string
  /** Le pluriel, quand il ne s'obtient pas par un simple « s ». */
  unitePluriel?: string
  /** Les filtres, poussés à droite. */
  children: React.ReactNode
}) {
  const mot = nombre !== null && nombre > 1 ? (unitePluriel ?? `${unite}s`) : unite

  return (
    /* PAS DE `flex-wrap` : un retour à la ligne ferait grandir la barre et fausserait l'addition
       des hauteurs. Les filtres ne se compriment jamais — c'est eux qu'on vient chercher.

       L'ICÔNE A DISPARU. Elle occupait 28 px pour redire ce que le titre dit en toutes lettres,
       et ces 28 px manquaient aux filtres sur un écran de portable. */
    <div
      className="flex shrink-0 items-center gap-2.5 border-b border-km-line px-4"
      style={{ height: HAUTEUR_BARRE }}
    >
      {/* PLUS DE TITRE ICI — il est monté sur la bande de la zone, où il ne se répète pas.
          La barre ne garde que ce qui bouge : le décompte, qui suit les filtres. */}
      <p className="min-w-0 truncate text-km-body font-medium text-km-text">
        <span className="tabular-nums">{nombre === null ? '—' : nombre}</span>
        {' '}{mot}
      </p>

      <span className="ml-auto flex shrink-0 items-center gap-1.5">{children}</span>
    </div>
  )
}

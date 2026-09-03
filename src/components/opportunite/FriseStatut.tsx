import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * La frise de statut de l'opportunité, reprise de la maquette « Fiche Opportunite » de William
 * (23/08/2026) — jalons, segments, et l'animation qui distingue l'étape en cours.
 *
 * RELEVÉ DANS SON FICHIER SOURCE, pas sur une capture d'écran. Les valeurs viennent de sa fonction
 * `railVals()` : jalon de 30 px (34 px pour l'étape courante), dégradé `#8c2168 → #c14e9c` dès qu'il
 * est atteint, cercle blanc à bordure tiretée `2px dashed` tant qu'il ne l'est pas ; segment de 5 px
 * de haut, plein en dégradé derrière soi, HACHURÉ ET DÉFILANT devant. Les deux animations sont les
 * siennes : `ringPulse` (le jalon courant respire) et `stripeMove` (les hachures avancent de 36 px).
 *
 * POURQUOI L'ANIMATION COMPTE. Une frise inerte dit « voici les étapes » ; celle-ci dit « vous êtes
 * ici, et voilà ce qui reste à franchir ». C'est le seul élément de l'écran qui donne le sens de la
 * marche, et c'est précisément ce qui manquait à ma première version.
 *
 * `prefers-reduced-motion` coupe les deux animations : une pulsation permanente est pénible pour
 * qui y est sensible, et l'information reste lisible sans elle (taille, couleur, coche).
 *
 * ══ ELLE SERT MAINTENANT À TOUS LES OBJETS ══
 *
 * Naoëlle, 27/08/2026 : « il y a plusieurs objets qui n'ont pas l'animation que William a faite dans
 * la frise des statuts, les traits qui bougent entre deux statuts — il faut que tous les statuts des
 * objets aient cette animation ».
 *
 * Elle était réservée à l'opportunité. Le contrat avait une frise inerte, la recommandation aucune,
 * le signal et le mandat non plus. Le composant prend donc une TEINTE : le montage, les tailles et
 * les deux animations de William ne bougent pas d'un pixel, seule la couleur suit l'objet — magenta
 * pour l'opportunité comme avant, et sa propre famille pour les autres.
 *
 * POURQUOI LA COULEUR ET RIEN D'AUTRE : c'est le seul endroit où la frise doit parler de l'objet
 * qu'elle décrit. Le reste — le jalon qui respire, les hachures qui avancent — dit « vous êtes ici,
 * voilà ce qui reste », et ça se dit de la même façon partout.
 */

/** Les familles de couleur d'une frise. Chacune reprend les jetons déjà utilisés par son objet. */
export interface TeinteFrise {
  /** Dégradé des jalons franchis et des segments derrière soi. */
  gradient: string
  /** Ombre portée du jalon courant. */
  ombreCourant: string
  /** Ombre portée d'un jalon franchi. */
  ombreFranchi: string
  /** Les deux teintes des hachures du segment en cours : trait, puis fond. */
  hachures: [string, string]
  /** Animation de pulsation du jalon courant, ou `null` pour ne pas en mettre. */
  pulsation: string | null
}

export const TEINTES_FRISE: Record<string, TeinteFrise> = {
  /** L'opportunité — le magenta de William, inchangé au pixel près. */
  opportunite: {
    gradient: 'from-opp-600 to-opp-400',
    ombreCourant: 'shadow-[0_5px_14px_rgba(168,49,127,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(168,49,127,.2)]',
    hachures: ['#e8c3dc', '#f4eef1'],
    pulsation: 'animate-km-opp-pulse',
  },
  /** La recommandation — le vert de Kiwee, sa couleur dans tout le reste de l'app. */
  recommandation: {
    gradient: 'from-kiwi-600 to-kiwi-400',
    ombreCourant: 'shadow-[0_5px_14px_rgba(13,122,95,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(13,122,95,.2)]',
    hachures: ['#c3ddd4', '#eef5f2'],
    pulsation: 'animate-km-soft-pulse',
  },
  /** Le signal — l'ambre de la détection, comme sa tuile du tableau de bord. */
  signal: {
    gradient: 'from-amber-600 to-amber-400',
    ombreCourant: 'shadow-[0_5px_14px_rgba(181,122,36,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(181,122,36,.2)]',
    hachures: ['#e8d5b4', '#f6f1e6'],
    pulsation: 'animate-km-soft-pulse',
  },
  /**
   * La requête — la terre cuite déjà employée par sa pastille et son icône dans la liste.
   *
   * PAS LE VERT DE KIWEE, ET PAS L'AMBRE DU SIGNAL. Une requête n'est ni une affaire qui avance ni
   * une alerte : c'est un problème client qu'on doit débloquer. Elle porte cette teinte partout
   * ailleurs dans l'écran — reprendre une couleur d'un autre objet ferait lire un autre objet.
   */
  requete: {
    gradient: 'from-[#a8371f] to-[#d4694a]',
    ombreCourant: 'shadow-[0_5px_14px_rgba(168,55,31,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(168,55,31,.2)]',
    hachures: ['#e8c6bc', '#f7efec'],
    pulsation: 'animate-km-soft-pulse',
  },
  /**
   * La piste — l'ambre de la prospection, celle que portent déjà ses statuts « Nouvelle » et « En
   * qualification » dans `TON_STATUT_PISTE`.
   *
   * PAS LE MAGENTA DE L'OPPORTUNITÉ, alors que la piste la précède : ce sont deux objets, et une
   * piste convertie DEVIENT une opportunité. Leur donner la même couleur ferait lire la frise de
   * l'une comme la suite de l'autre, sur deux écrans qui se ressemblent déjà beaucoup.
   */
  piste: {
    gradient: 'from-amber-600 to-amber-400',
    ombreCourant: 'shadow-[0_5px_14px_rgba(181,122,36,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(181,122,36,.2)]',
    hachures: ['#e8d5b4', '#f6f1e6'],
    pulsation: 'animate-km-soft-pulse',
  },
  /**
   * Le mandat — l'ambre qu'il porte déjà partout : son icône, sa carte, ses pastilles de statut.
   *
   * PAS LE BLEU DU CONTRAT, alors que le commentaire d'origine les rangeait ensemble sous « les
   * engagements ». Ce sont deux objets qui se suivent dans le travail — on fait signer un mandat
   * POUR obtenir un contrat — et deux fiches qui se ressemblent. La couleur est ce qui dit, avant
   * toute lecture, sur laquelle des deux on se trouve.
   */
  mandat: {
    gradient: 'from-amber-600 to-amber-500',
    ombreCourant: 'shadow-[0_5px_14px_rgba(181,122,36,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(181,122,36,.2)]',
    hachures: ['#e8d5b4', '#f6f1e6'],
    pulsation: 'animate-km-soft-pulse',
  },
  /**
   * La tâche — l'ambre de son icône et de sa carte, partout dans l'application.
   *
   * MÊME AMBRE QUE LE MANDAT, et c'est assumé : les deux ne se croisent jamais sur un même écran,
   * et personne ne confond une tâche avec un mandat. Dupliquer la teinte plutôt que réutiliser
   * `mandat` évite surtout qu'une retouche de couleur sur l'un déteigne sur l'autre par surprise.
   */
  tache: {
    gradient: 'from-amber-600 to-amber-500',
    ombreCourant: 'shadow-[0_5px_14px_rgba(181,122,36,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(181,122,36,.2)]',
    hachures: ['#e8d5b4', '#f6f1e6'],
    pulsation: 'animate-km-soft-pulse',
  },
  /** Le contrat — le bleu des engagements. */
  contrat: {
    gradient: 'from-sky-600 to-sky-400',
    ombreCourant: 'shadow-[0_5px_14px_rgba(59,95,138,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(59,95,138,.2)]',
    hachures: ['#c2d0e0', '#eef1f6'],
    pulsation: 'animate-km-soft-pulse',
  },
}
export interface JalonFrise {
  code: string
  libelle: string
  /**
   * CE JALON EST-IL FRANCHI, INDÉPENDAMMENT DE SA POSITION ?
   *
   * La frise a été écrite pour un PARCOURS : les jalons avant le courant sont franchis, ceux après
   * restent à venir. C'est vrai d'une opportunité, qui ne saute pas d'étape.
   *
   * Ce n'est pas vrai d'une LISTE DE VÉRIFICATIONS. Les cinq contrôles d'une piste — contact,
   * société, e-mail, portable, décisionnaire — se cochent dans l'ordre où le commercial obtient les
   * réponses, souvent pas celui de la liste. Sans ce drapeau, cocher le quatrième avant le deuxième
   * afficherait le quatrième comme « à venir » alors qu'il est fait, et la frise mentirait sur le
   * travail accompli.
   *
   * Absent, le comportement d'origine s'applique : la position décide.
   */
  franchi?: boolean
}

export function FriseStatut({ jalons, courant, finalite, teinte = 'opportunite', onJalon, issues }: {
  jalons: JalonFrise[]
  /** Code du palier atteint. Les jalons précédents sont « franchis ». */
  courant: string
  /**
   * Qualification finale, quand l'objet est clôturé : elle ferme la frise.
   *
   * `neutre` COUVRE LES FINS QUI NE SONT NI GAGNÉES NI PERDUES. Une piste disqualifiée en est une :
   * Naoëlle, 02/09/2026 — « écarter une piste est un travail fait, pas un échec », et sur cinq
   * mille pistes importées c'est l'issue de la plupart. Le rouge est réservé à ce qui appelle une
   * action ; le vert dirait qu'on a gagné quelque chose. Ni l'un ni l'autre ne convient, d'où ce
   * troisième ton.
   */
  finalite?: { libelle: string; perdue: boolean; neutre?: boolean } | null
  /** La famille de couleur. Par défaut celle de l'opportunité, pour ne rien changer à l'existant. */
  teinte?: keyof typeof TEINTES_FRISE
  /**
   * Bascule un jalon au clic — pour les frises qui sont une LISTE DE VÉRIFICATIONS et non un
   * parcours. Absent, la frise reste ce qu'elle était : un affichage, pas une commande.
   */
  onJalon?: (code: string) => void
  /**
   * LES SORTIES, PROPOSÉES À CÔTÉ DE LA FRISE ET NON DEDANS.
   *
   * Naoëlle, 03/09/2026 : « ajoute résilié et annulé dans la frise ». Les mettre EN JALONS aurait
   * dessiné « … Actif → Terminé → Résilié → Annulé », c'est-à-dire un contrat qui passerait de l'un
   * à l'autre — ce qui n'arrive jamais : on sort par l'un OU par l'autre, et depuis n'importe où.
   *
   * Elles sont donc rendues après la frise, détachées, et cliquables. Le geste qu'elle demande est
   * là — sortir un objet sans quitter la page — sans faire mentir le dessin sur l'ordre des choses.
   *
   * Quand l'objet EST dans une de ces issues, c'est `finalite` qui la porte et cette rangée
   * disparaît : il n'y a plus de sortie à proposer à ce qui est déjà sorti.
   */
  issues?: { code: string; libelle: string }[]
}) {
  const t = TEINTES_FRISE[teinte] ?? TEINTES_FRISE.opportunite
  const indexCourant = Math.max(0, jalons.findIndex((j) => j.code === courant))
  // Une opportunité clôturée a tout franchi : la frise s'arrête sur sa qualification finale.
  const atteint = finalite ? jalons.length : indexCourant
  /* Quand les jalons portent leur propre état, c'est LUI qui décide — voir `JalonFrise.franchi`.
     Le « courant » devient alors le premier jalon non franchi, celui qui pulse et appelle l'action. */
  const parJalon = jalons.some((j) => j.franchi !== undefined)
  const premierRestant = jalons.findIndex((j) => !j.franchi)

  return (
    <div className="flex items-center px-1.5 pb-1.5 pt-4">
      {jalons.map((jalon, i) => {
        const etat = parJalon
          ? jalons[i].franchi
            ? 'franchi'
            : i === premierRestant
              ? 'courant'
              : 'a_venir'
          : i < atteint
            ? 'franchi'
            : i === atteint
              ? 'courant'
              : 'a_venir'
        // Le segment qui SUIT immédiatement l'étape courante est celui qu'il reste à franchir : on
        // l'affiche hachuré et défilant. Les autres sont pleins ou éteints.
        const reference = parJalon ? (premierRestant === -1 ? jalons.length : premierRestant) : atteint
        const segmentEnCours = i === reference + 1 && !finalite
        return (
          <div key={jalon.code} className="flex min-w-0 flex-1 items-center">
            {i > 0 && (
              <div
                /* LES HACHURES PASSENT PAR LE STYLE EN LIGNE, et c'est obligé : Tailwind compile
                   les classes qu'il LIT dans le source, donc une classe construite à l'exécution
                   (`bg-[…${couleur}…]`) n'existerait jamais dans la feuille produite. Le motif est
                   celui de William au pixel près — 7 px de trait, 7 px de fond, défilement de 36. */
                style={
                  segmentEnCours
                    ? {
                        backgroundImage: `repeating-linear-gradient(90deg,${t.hachures[0]} 0px,${t.hachures[0]} 7px,${t.hachures[1]} 7px,${t.hachures[1]} 14px)`,
                      }
                    : undefined
                }
                className={cn(
                  '-mx-2.5 h-[5px] flex-1 rounded-[3px] transition-colors duration-300',
                  /* EN MODE LISTE DE VÉRIFICATIONS, le trait relie deux coches et ne raconte aucun
                     ordre : il n'est plein que si LES DEUX qu'il relie sont faites. Le remplir
                     jusqu'au premier restant, comme sur un parcours, affirmerait une progression
                     linéaire qui n'existe pas ici. */
                  (parJalon ? jalons[i - 1]?.franchi && jalons[i].franchi : i <= atteint)
                    ? 'bg-gradient-to-r ' + t.gradient
                    : segmentEnCours
                      ? 'animate-km-stripe bg-[length:36px_100%] motion-reduce:animate-none'
                      : 'bg-[#eceae6]',
                )}
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col items-center">
              {/* UN BOUTON QUAND LA FRISE EST UNE COMMANDE, une simple pastille sinon. Un cercle
                  cliquable qui ne se distingue pas d'un cercle décoratif se découvre par hasard :
                  d'où le curseur, l'agrandissement au survol et l'intitulé de l'action. */}
              <button
                type="button"
                disabled={!onJalon}
                onClick={onJalon ? () => onJalon(jalon.code) : undefined}
                /* L'INTITULÉ DIT LE GESTE RÉEL, et il n'est pas le même dans les deux modes. En
                   liste de vérifications (`franchi` fourni), on coche et décoche. En parcours —
                   la requête, la piste — on CHANGE DE STATUT : « Décocher En qualification » y
                   décrirait une action qui n'existe pas. */
                title={
                  onJalon
                    ? parJalon
                      ? etat === 'franchi'
                        ? `Décocher « ${jalon.libelle} »`
                        : `Cocher « ${jalon.libelle} »`
                      : `Passer à « ${jalon.libelle} »`
                    : undefined
                }
                className={cn(
                  'z-[1] flex shrink-0 items-center justify-center rounded-full transition-all duration-200',
                  onJalon && 'cursor-pointer hover:scale-110',
                  etat === 'courant' ? 'h-[34px] w-[34px]' : 'h-[30px] w-[30px]',
                  etat === 'a_venir'
                    ? 'border-2 border-dashed border-[#dcdad5] bg-white text-[#c0c2bd]'
                    : 'bg-gradient-to-br text-white ' + t.gradient,
                  etat === 'courant' && t.ombreCourant,
                  etat === 'franchi' && t.ombreFranchi,
                  etat === 'courant' && !finalite && t.pulsation && t.pulsation + ' motion-reduce:animate-none',
                )}
              >
                {etat === 'franchi'
                  ? <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  : <span className={cn('rounded-full bg-current', etat === 'courant' ? 'h-1.5 w-1.5' : 'h-1 w-1')} />}
              </button>
              <p
                className={cn(
                  'mt-2 text-center text-km-label leading-tight tracking-tight',
                  etat === 'a_venir' ? 'font-semibold text-[#b6b8b3]' : 'font-extrabold text-km-text',
                )}
              >
                {jalon.libelle}
              </p>
            </div>
          </div>
        )
      })}

      {/* LES SORTIES POSSIBLES, séparées de la progression par un trait vertical : elles ne sont
          pas la suite du chemin, elles en sont la porte de côté. */}
      {!finalite && issues && issues.length > 0 && onJalon && (
        <div className="ml-3 flex shrink-0 items-center gap-1 border-l border-km-line pl-3">
          {issues.map((issue) => (
            <button
              key={issue.code}
              type="button"
              onClick={() => onJalon(issue.code)}
              title={`Passer à « ${issue.libelle} »`}
              className="rounded-km border border-dashed border-[#dcdad5] px-2 py-1 text-km-label font-semibold text-km-faint transition-colors hover:border-km-red/40 hover:bg-km-red-soft hover:text-km-red"
            >
              {issue.libelle}
            </button>
          ))}
        </div>
      )}

      {finalite && (
        <div className="flex min-w-0 flex-1 items-center">
          <div
            className={cn(
              '-mx-2.5 h-[5px] flex-1 rounded-[3px] bg-gradient-to-r',
              finalite.neutre
                ? 'from-[#d8d6d1] to-[#a9aca6]'
                : finalite.perdue
                  ? 'from-red-300 to-red-600'
                  : 'from-kiwi-300 to-kiwi-600',
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <div
              className={cn(
                'z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white',
                finalite.neutre
                  ? 'bg-[#8d918b] shadow-[0_5px_16px_rgba(90,94,88,.24)]'
                  : finalite.perdue
                    ? 'bg-red-600 shadow-[0_5px_16px_rgba(194,69,45,.35)]'
                    : 'bg-km-green shadow-[0_5px_16px_rgba(13,122,95,.35)]',
              )}
            >
              <Check className="h-4 w-4" strokeWidth={2.6} />
            </div>
            <p
              className={cn(
                'mt-2 text-center text-km-label font-extrabold tracking-tight',
                finalite.neutre ? 'text-km-muted' : finalite.perdue ? 'text-red-700' : 'text-km-green',
              )}
            >
              {finalite.libelle}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

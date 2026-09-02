import { useNavigate } from 'react-router-dom'
import { CheckSquare, Diamond, TrendingUp } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Indicateurs } from '@/components/ui/page-header'
import { TuileChiffre } from '@/components/dashboard/TuileChiffre'
import { MaJournee } from '@/components/dashboard/MaJournee'
import { MaPerformance } from '@/components/dashboard/MaPerformance'
import {
  useChiffresTableauDeBord,
  useMaPerformance,
  useMesActions,
  useObjectifsDuMois,
} from '@/lib/data/tableauDeBord'
import { useMonProfil } from '@/lib/data/roles'

/**
 * LA MAQUETTE DE MICHEL DU 25/08/2026, PORTÉE TELLE QUELLE.
 *
 * Il l'a envoyée en PDF à la fin de l'appel de 16 h 27, avec une consigne sans ambiguïté :
 * « occupe-toi de la dashboard et on avance notamment sur les écrans ». Son écran se lit de haut en
 * bas : la date et le bonjour, un bandeau « Marge générée », quatre tuiles chiffrées, « Ma journée ».
 *
 * L'ORDRE DES TUILES EST LE SIEN — il les voulait signaux, opportunités, recommandations, montant
 * du pipe. Ce n'est pas l'ordre de priorité de la diapositive 12 (recommandations d'abord), et c'est
 * voulu : une maquette dessinée après l'appel dit ce qu'il veut voir aujourd'hui, pas ce qu'il
 * disait la semaine dernière. Elles sont trois depuis le 02/09/2026 — les signaux ont quitté
 * l'application entière, pas seulement ce tableau — mais l'ordre des trois restantes est le sien.
 *
 * CE QUI RESTE DE L'ANCIEN TABLEAU DE BORD, ET POURQUOI. Les quatre listes « à traiter » et le fil du
 * portefeuille sont conservés SOUS sa maquette. Sa maquette s'arrête à « Ma journée », mais la table
 * `actions` est vide : un commercial qui arrive le matin y verrait quatre chiffres et un bloc vide,
 * alors que sa phrase de l'appel était « ce qui est le plus pertinent, c'est que le commercial puisse
 * s'asseoir et savoir ce qu'il a à faire ». Ces listes sont, aujourd'hui, la seule chose qui le lui
 * dit. Elles se retireront le jour où les tâches existeront — pas avant.
 *
 * LES QUATRE TUILES À DÉGRADÉ DISPARAISSENT : ses tuiles chiffrées disent la même chose, et deux
 * rangées d'indicateurs qui se répètent auraient été exactement le « trop destructuré » qu'il a
 * reproché au rapport du 24/08.
 */




export default function Dashboard() {
  const navigate = useNavigate()
  const { data: monProfil } = useMonProfil()
  const { data: chiffres, isLoading: chiffresEnCours } = useChiffresTableauDeBord()
  const { data: journee, isLoading: journeeEnCours } = useMesActions(monProfil?.id)
  const { data: perso, isLoading: persoEnCours } = useMaPerformance(monProfil?.id)
  const { data: objectifs } = useObjectifsDuMois(monProfil?.id)

  // « MARDI 25 AOÛT 2026 » — la date complète, comme sur sa maquette.
  const dateDuJour = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const nombre = (v: number | undefined) =>
    chiffresEnCours || v == null ? '—' : v.toLocaleString('fr-FR')

  /**
   * SES QUATRE MESURES, ET UNE SEULE QUESTION : qu'est-ce qui merite mon attention aujourd'hui ?
   *
   * Aucune ne parle de performance passee. Un commercial qui s'assoit le matin ne cherche pas sa
   * marge du mois, il cherche ce qu'il a a faire — c'est la phrase de Michel de l'appel du 25/08 :
   * « ce qui est le plus pertinent, c'est que le commercial puisse s'asseoir et savoir ce qu'il a
   * a faire ».
   *
   * LES PRECISIONS NE SONT PAS DECORATIVES : chacune dit d'ou vient le chiffre, ou ce qu'il faut
   * en faire. Un « 12 » sans « a decider aujourd'hui » n'aide personne a choisir quoi ouvrir.
   */
  /* `joursRestants` est deja calcule par la couche de donnees : negatif quand l'echeance est
     passee, nul sans date. Le recalculer ici depuis une date brute ferait deux verites pour un
     seul chiffre — et c'est le genre d'ecart qui ne se voit qu'a cote de « Ma journee ». */
  const aFaire = (journee ?? []).filter((a) => !a.faite)
  const enRetard = aFaire.filter((a) => (a.joursRestants ?? 0) < 0).length
  const mesures = [
    {
      libelle: 'Actions du jour',
      valeur: journeeEnCours ? '—' : String(aFaire.length),
      precision: enRetard > 0 ? `${enRetard} en retard` : 'Rien en retard',
    },
    {
      libelle: 'À présenter',
      valeur: nombre(chiffres?.recosAPresenter),
      precision: 'Le client attend une réponse',
    },
    {
      libelle: 'Opportunités actives',
      valeur: nombre(chiffres?.opportunitesActives),
      precision: 'Dans le cycle commercial',
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="Tableau de bord" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6 lg:px-6">
        {/* ══════ L'EN-TÊTE, AU MODÈLE COMMUN DE SON DOSSIER ══════

            « Nom de la page, phrase explicative et une action principale au maximum. » La date
            complète passe au-dessus du titre, en petit : elle situe sans occuper une ligne de titre.

            LE TITRE PASSE DE 23 À 28 PX et perd son extra-gras. Sur sa maquette, un titre de page
            est en 570 de graisse — assez pour dominer, pas assez pour crier. L'ancien était en
            extra-gras avec un point d'exclamation implicite. */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="mr-auto min-w-0">
            <p className="text-km-label font-semibold uppercase tracking-[0.07em] text-km-faint">
              {dateDuJour}
            </p>
            <h1 className="mt-1 font-display text-km-h1 font-[570] tracking-[-0.04em] text-km-text">
              Bonjour{monProfil?.prenom ? ` ${monProfil.prenom}` : ''}
            </h1>
            {/* « VOS INDICATEURS » DEVIENT « LES INDICATEURS DE L'ÉQUIPE » : les chiffres ne sont pas
                filtrés sur l'utilisateur, parce que tous les commerciaux voient tous les comptes
                (Naoëlle, 14/08/2026, non négociable). Écrire « vos » ferait croire à un portefeuille
                personnel. Seule « Ma journée » est bien personnelle. */}
            <p className="mt-1.5 text-km-lead text-km-muted">
              Les actions qui méritent votre attention aujourd’hui.
            </p>
          </div>
        </div>

        {/* ══════ LES INDICATEURS DU HAUT ══════

            SA MAQUETTE EN COMPTE QUATRE ; CET ÉCRAN EN ALIGNAIT DOUZE. Un bandeau de marge sur
            toute la largeur, quatre tuiles « Ma performance », quatre tuiles chiffrées, et le
            tout avant d'arriver à ce qu'il y a à faire. Naoëlle, 31/08/2026 : « la maquette de
            Michel se veut minimaliste ».

            Ils répondent à une seule question — qu'est-ce qui mérite mon attention aujourd'hui :
            les actions à faire, les décisions attendues du client, les affaires en cours. Aucun ne
            parle de performance passée.

            ILS SONT TROIS DEPUIS LE 02/09/2026 : « les signaux à décider » est parti avec le reste
            du sujet (voir `cycleNavItems`). Aucune mesure n'a été inventée pour combler la case —
            un indicateur qu'on ajoute pour remplir une grille n'aide personne à choisir quoi
            ouvrir, et c'est exactement ce que ce bloc doit faire.

            LE RESTE N'EST PAS SUPPRIMÉ, IL DESCEND. Son dossier le dit : « pipeline actif présenté
            en synthèse secondaire ». La marge du mois et la performance personnelle sont un bilan,
            pas une priorité du matin — elles se lisent après, quand on les cherche. */}
        <div className="mt-5">
          <Indicateurs mesures={mesures} />
        </div>

        {/* ══════ MA JOURNÉE ══════ */}
        <div className="mt-4">
          <MaJournee actions={journee} chargement={journeeEnCours} profilId={monProfil?.id} />
        </div>

        {/* ══════ LA SYNTHÈSE SECONDAIRE ══════

            SON DOSSIER : « pipeline actif présenté en synthèse secondaire ». Ces deux blocs
            étaient AU-DESSUS de « Ma journée » ; ils passent en dessous.

            Ce sont des bilans : la marge du mois, la performance personnelle, le montant du pipe.
            Un commercial qui s'assoit le matin ne cherche pas sa marge, il cherche ce qu'il a à
            faire — c'est la phrase de Michel de l'appel du 25/08. Les garder en tête de page
            faisait passer douze chiffres avant la première action à mener.

            Ils ne sont pas supprimés : on les consulte, simplement, quand on les cherche. */}
        <h2 className="mb-3 mt-9 text-km-name font-semibold text-km-text">
          Où en est le mois
        </h2>
        {/* ══════ MA PERFORMANCE ══════

            SA MAQUETTE PLACE LE PERSONNEL DIRECTEMENT SOUS LE GLOBAL, et « directement » est le mot.
            Sa phrase dans l'appel du 26/08 : « c'est juste en dessous de la performance, pour que la
            lecture soit correcte ».

            LES QUATRE TUILES CHIFFRÉES S'INTERCALAIENT ICI ; elles sont passées DESSOUS. Deux blocs
            de performance séparés par une rangée d'indicateurs sont deux blocs qu'on ne compare
            plus : l'œil doit passer de la marge de Kiwee à la sienne sans rien franchir. */}
        <div className="mt-4">
          <MaPerformance
            chiffres={perso}
            chargement={persoEnCours}
            prenom={null}
            objectif={objectifs?.personnel}
          />
        </div>


        {/* ══════ LES QUATRE TUILES CHIFFRÉES ══════

            ELLES ÉTAIENT ENTRE LES DEUX BLOCS DE PERFORMANCE, elles passent dessous. Sa phrase de
            l'appel du 26/08 : « c'est juste en dessous de la performance, pour que la lecture soit
            correcte » — et « juste » est le mot. Deux blocs de performance séparés par une rangée
            d'indicateurs sont deux blocs qu'on ne compare plus : l'œil doit passer de la marge de
            Kiwee à la sienne sans rien franchir.

            ELLES RESTENT, ET C'EST VOULU : elles répondent à une autre question — non pas « où en
            est-on » mais « qu'est-ce qui attend ». Leur place est donc après la performance et avant
            « Ma journée », qui les détaille. La lecture descend ainsi du résultat vers le travail. */}
        {/* Trois tuiles depuis le 02/09/2026 : « Signaux à traiter » est parti avec le sujet. La
            grille passe à trois colonnes plutôt que d'en laisser une vide. */}
        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          <TuileChiffre
            icone={Diamond}
            teinte="bg-sky-50 text-km-blue"
            badge={chiffres ? `+${chiffres.opportunitesRecentes} cette semaine` : null}
            valeur={nombre(chiffres?.opportunitesActives)}
            libelle="Opportunités actives"
            definition="Opportunités non clôturées : Nouvelle, En qualification, Couverture mandat, Prête à convertir. Le badge compte celles créées depuis sept jours."
            onClick={() => navigate('/opportunites')}
          />
          <TuileChiffre
            icone={CheckSquare}
            teinte="bg-km-green-soft text-km-green"
            badge={chiffres ? `${chiffres.recosAPresenter} à présenter` : null}
            valeur={nombre(chiffres?.recosOuvertes)}
            libelle="Recommandations"
            definition="Recommandations encore ouvertes : Brouillon, Consultation, Offres reçues, À présenter, Présentée."
            onClick={() => navigate('/recommandations')}
          />
          <TuileChiffre
            icone={TrendingUp}
            teinte="bg-km-green-soft text-km-green"
            badge={chiffres ? `${chiffres.pipeRenseigne}/${chiffres.recosOuvertes} chiffrées` : null}
            valeur={
              chiffresEnCours || !chiffres
                ? '—'
                : Math.round(chiffres.montantPipe / 1000).toLocaleString('fr-FR') + ' k€'
            }
            libelle="Montant du pipe"
            definition="Somme des montants d’affaire des recommandations ouvertes. Le badge dit combien d’entre elles portent un montant : le pipe est partiel tant qu’elles ne sont pas toutes chiffrées."
            onClick={() => navigate('/recommandations')}
          />
        </div>

        {/* ══════ RIEN APRÈS « MA JOURNÉE » ══════

            Naoëlle, 27/08/2026 : « enlève tout ce qu'il y a en dessous de À traiter, tout ce qui sera
            à traiter sera dans le bloc Ma journée dans À réaliser, et quand on coche ça part dans
            Réalisé ».

            LES QUATRE LISTES « À TRAITER » DISPARAISSENT, et c'est cohérent avec sa maquette qui
            s'arrête à « Ma journée ». Je les avais gardées le 25/08 parce que la table des tâches
            était vide et qu'un commercial n'aurait rien eu à faire ; elles faisaient double emploi
            dès lors que les tâches existent.

            ET ELLES EXISTENT MAINTENANT : la prochaine action d'un signal crée sa tâche, et toute
            tâche créée est rattachée à son auteur depuis aujourd'hui. Le plan de travail a donc un
            seul endroit — « Ma journée » — au lieu de deux qui se contredisaient : l'un listait les
            objets à traiter, l'autre les tâches, sans lien entre eux.

            LE FIL DU PORTEFEUILLE PART AVEC : c'était un flux d'activité, pas un plan de travail. */}
      </div>
    </div>
  )
}

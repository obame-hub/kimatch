import { useNavigate } from 'react-router-dom'
import { CheckSquare, Diamond, Plus, TrendingUp, Zap } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { BandeauMarge } from '@/components/dashboard/BandeauMarge'
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
 * L'ORDRE DES QUATRE TUILES EST LE SIEN — signaux, opportunités, recommandations, montant du pipe.
 * Ce n'est pas l'ordre de priorité de la diapositive 12 (recommandations d'abord), et c'est voulu :
 * une maquette dessinée après l'appel dit ce qu'il veut voir aujourd'hui, pas ce qu'il disait la
 * semaine dernière.
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="Tableau de bord" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6 lg:px-6">
        {/* ══════ L'EN-TÊTE ══════ */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="mr-auto min-w-0">
            <p className="text-km-label font-extrabold uppercase tracking-[0.09em] text-km-muted">
              {dateDuJour}
            </p>
            <h1 className="mt-1.5 font-display text-kw-display font-extrabold tracking-[-0.02em] text-km-text">
              Bonjour{monProfil?.prenom ? ` ${monProfil.prenom}` : ''},
            </h1>
            {/* « VOS INDICATEURS » DEVIENT « LES INDICATEURS DE L'ÉQUIPE » : les chiffres ne sont pas
                filtrés sur l'utilisateur, parce que tous les commerciaux voient tous les comptes
                (Naoëlle, 14/08/2026, non négociable). Écrire « vos » ferait croire à un portefeuille
                personnel. Seule « Ma journée » est bien personnelle. */}
            <p className="mt-1 text-km-body text-km-muted">
              Voici les indicateurs de l’équipe et vos actions du jour.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/opportunites?nouveau=1')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-km-lg bg-km-green px-4 py-2.5 text-km-body font-bold text-white shadow-kw-green transition-[filter] hover:brightness-95"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            Nouvelle opportunité
          </button>
        </div>

        {/* ══════ LE BANDEAU DE LA MARGE ══════ */}
        <div className="mt-5">
          <BandeauMarge chiffres={chiffres} chargement={chiffresEnCours} objectif={objectifs?.equipe} />
        </div>

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
        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <TuileChiffre
            icone={Zap}
            teinte="bg-km-amber-soft text-km-amber"
            badge={chiffres ? `${chiffres.signauxRecents} cette semaine` : null}
            valeur={nombre(chiffres?.signauxATraiter)}
            libelle="Signaux à traiter"
            definition="Signaux au statut Nouveau ou À qualifier. Le badge compte ceux détectés depuis sept jours — la gravité n’étant renseignée sur aucun signal, « prioritaires » n’a pas de source en base."
            onClick={() => navigate('/signaux')}
          />
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

        {/* ══════ MA JOURNÉE ══════ */}
        <div className="mt-4">
          <MaJournee actions={journee} chargement={journeeEnCours} profilId={monProfil?.id} />
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

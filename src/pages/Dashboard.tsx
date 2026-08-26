import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Check,
  CheckSquare,
  ChevronRight,
  Diamond,
  Filter,
  Plus,
  Sparkle,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { FilPortefeuille } from '@/components/dashboard/FilPortefeuille'
import { BandeauMarge } from '@/components/dashboard/BandeauMarge'
import { TuileChiffre } from '@/components/dashboard/TuileChiffre'
import { MaJournee } from '@/components/dashboard/MaJournee'
import { MaPerformance } from '@/components/dashboard/MaPerformance'
import { useDashboardStats, type SectionAction } from '@/lib/data/dashboard'
import { useChiffresTableauDeBord, useMaPerformance, useMesActions } from '@/lib/data/tableauDeBord'
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

/**
 * LES QUATRE ACTIVITÉS DE LA DIAPOSITIVE 12 — « le commercial pilote quatre activités » : PISTES,
 * PATRIMOINE, OPPORTUNITÉS, RECOMMANDATIONS. Les dégradés viennent de la maquette de William ; ils
 * ont seulement changé d'attribution, pas de valeur, sauf l'opportunité qui prend le magenta de sa
 * fiche (famille `opp`) pour que la couleur dise la même chose partout dans l'application.
 */
const TUILES = {
  piste: { haut: '#3d95a5', bas: '#256571' },
  patrimoine: { haut: '#b08f14', bas: '#8a6d08' },
  opportunite: { haut: '#a8437f', bas: '#8c2168' },
  reco: { haut: '#9d5b30', bas: '#6f3a1e' },
} as const

/** Couleur d'accent de chaque section, cohérente avec sa tuile. */
const ACCENTS: Record<SectionAction['cle'], { haut: string; bas: string }> = {
  piste: TUILES.piste,
  patrimoine: TUILES.patrimoine,
  opportunite: TUILES.opportunite,
  reco: TUILES.reco,
}

const ICONES: Record<SectionAction['cle'], typeof Sparkle> = {
  piste: Filter,
  patrimoine: Building2,
  opportunite: Target,
  reco: Sparkle,
}

/** Liste complète correspondant à une section, pour le lien « tout voir ». */
const LISTES: Record<SectionAction['cle'], string> = {
  piste: '/prospection',
  patrimoine: '/patrimoine?objet=compteurs',
  opportunite: '/opportunites',
  reco: '/recommandations',
}

function Section({ section }: { section: SectionAction }) {
  const navigate = useNavigate()
  const accent = ACCENTS[section.cle]
  const Icone = ICONES[section.cle]

  // Tout est traité : on le dit en une ligne verte plutôt que d'afficher un cadre vide.
  if (section.total === 0) {
    return (
      <div className="flex items-center gap-3 rounded-[15px] border border-kiwi-200 bg-kiwi-50 px-[17px] py-3.5">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-kiwi-600 text-white">
          <Check className="h-3.5 w-3.5" />
        </span>
        <span className="text-[13.5px] font-semibold tracking-[-.01em] text-kiwi-800">
          {section.titre} — tout est à jour
        </span>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[15px] border border-navy-100 bg-white">
      <div
        className="flex items-center gap-[11px] px-[18px] py-[13px]"
        style={{ background: `linear-gradient(100deg,${accent.haut} 0%,${accent.bas} 100%)` }}
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white/20 text-white">
          <Icone className="h-4 w-4" />
        </span>
        <span className="text-[14.5px] font-bold tracking-[-.01em] text-white">{section.titre}</span>
        <span className="inline-flex items-center rounded-[20px] bg-white/[.22] px-2.5 py-0.5 font-mono text-[11.5px] font-extrabold text-white">
          {section.total}
        </span>
        <div className="flex-1" />
        <span className="hidden text-[11px] text-white/[.72] sm:inline">{section.precision}</span>
      </div>

      {section.groupes.map((groupe) => (
        <div key={groupe.libelle}>
          <div className="flex items-center gap-2.5 border-t border-navy-100 bg-navy-50/60 px-[18px] pb-[9px] pt-2.5">
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: groupe.lignes.length ? accent.bas : undefined }}
              data-vide={groupe.lignes.length === 0 || undefined}
            />
            <span
              className="text-[11px] font-extrabold uppercase tracking-[.06em]"
              style={{ color: groupe.lignes.length ? accent.bas : undefined }}
            >
              {groupe.libelle}
            </span>
            <span
              className="inline-flex items-center rounded-[20px] px-2 py-px font-mono text-[10.5px] font-bold"
              style={
                groupe.lignes.length
                  ? { color: accent.bas, background: `${accent.bas}18` }
                  : undefined
              }
            >
              {groupe.lignes.length}
            </span>
          </div>

          {groupe.lignes.length === 0 ? (
            <div className="flex items-center gap-2.5 border-t border-navy-50 px-[18px] py-3.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-kiwi-50 text-kiwi-600">
                <Check className="h-3 w-3" />
              </span>
              <span className="text-xs text-navy-500">{groupe.siVide}</span>
            </div>
          ) : (
            groupe.lignes.map((ligne) => (
              <div
                key={ligne.id}
                onClick={() => navigate(ligne.to)}
                className="flex cursor-pointer items-center gap-3 border-t border-navy-50 px-[18px] py-3 transition-colors hover:bg-navy-50/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold tracking-[-.01em] text-navy-800">{ligne.titre}</p>
                  <p className="truncate text-[11.5px] text-navy-500">{ligne.sousTitre}</p>
                </div>
                <span
                  className="shrink-0 font-mono text-[11px] font-bold"
                  style={{ color: ligne.urgent ? accent.bas : undefined }}
                >
                  {ligne.echeance}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-navy-300" />
              </div>
            ))
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => navigate(LISTES[section.cle])}
        className="w-full border-t border-navy-50 px-[18px] py-2.5 text-left text-[11px] font-semibold text-kiwi-700 transition-colors hover:bg-navy-50/60"
      >
        Voir les {section.total} — liste complète
      </button>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useDashboardStats()
  const { data: monProfil } = useMonProfil()
  const { data: chiffres, isLoading: chiffresEnCours } = useChiffresTableauDeBord()
  const { data: journee, isLoading: journeeEnCours } = useMesActions(monProfil?.id)
  const { data: perso, isLoading: persoEnCours } = useMaPerformance(monProfil?.id)

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
            <p className="text-kw-xs font-extrabold uppercase tracking-[0.09em] text-kw-meta">
              {dateDuJour}
            </p>
            <h1 className="mt-1.5 font-display text-kw-display font-extrabold tracking-[-0.02em] text-kw-ink">
              Bonjour{monProfil?.prenom ? ` ${monProfil.prenom}` : ''},
            </h1>
            {/* « VOS INDICATEURS » DEVIENT « LES INDICATEURS DE L'ÉQUIPE » : les chiffres ne sont pas
                filtrés sur l'utilisateur, parce que tous les commerciaux voient tous les comptes
                (Naoëlle, 14/08/2026, non négociable). Écrire « vos » ferait croire à un portefeuille
                personnel. Seule « Ma journée » est bien personnelle. */}
            <p className="mt-1 text-kw-sm text-kw-meta">
              Voici les indicateurs de l’équipe et vos actions du jour.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/opportunites?nouveau=1')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-kw-xl bg-kw-green px-4 py-2.5 text-kw-sm font-bold text-white shadow-kw-green transition-[filter] hover:brightness-95"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            Nouvelle opportunité
          </button>
        </div>

        {/* ══════ LE BANDEAU DE LA MARGE ══════ */}
        <div className="mt-5">
          <BandeauMarge chiffres={chiffres} chargement={chiffresEnCours} />
        </div>

        {/* ══════ MA PERFORMANCE ══════

            SA MAQUETTE PLACE LE PERSONNEL DIRECTEMENT SOUS LE GLOBAL, et « directement » est le mot.
            Sa phrase dans l'appel du 26/08 : « c'est juste en dessous de la performance, pour que la
            lecture soit correcte ».

            LES QUATRE TUILES CHIFFRÉES S'INTERCALAIENT ICI ; elles sont passées DESSOUS. Deux blocs
            de performance séparés par une rangée d'indicateurs sont deux blocs qu'on ne compare
            plus : l'œil doit passer de la marge de Kiwee à la sienne sans rien franchir. */}
        <div className="mt-4">
          <MaPerformance chiffres={perso} chargement={persoEnCours} prenom={null} />
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
            teinte="bg-kw-amber-light text-kw-amber"
            badge={chiffres ? `${chiffres.signauxRecents} cette semaine` : null}
            valeur={nombre(chiffres?.signauxATraiter)}
            libelle="Signaux à traiter"
            definition="Signaux au statut Nouveau ou À qualifier. Le badge compte ceux détectés depuis sept jours — la gravité n’étant renseignée sur aucun signal, « prioritaires » n’a pas de source en base."
            onClick={() => navigate('/signaux')}
          />
          <TuileChiffre
            icone={Diamond}
            teinte="bg-sky-50 text-kw-blue"
            badge={chiffres ? `+${chiffres.opportunitesRecentes} cette semaine` : null}
            valeur={nombre(chiffres?.opportunitesActives)}
            libelle="Opportunités actives"
            definition="Opportunités non clôturées : Nouvelle, En qualification, Couverture mandat, Prête à convertir. Le badge compte celles créées depuis sept jours."
            onClick={() => navigate('/opportunites')}
          />
          <TuileChiffre
            icone={CheckSquare}
            teinte="bg-kw-green-light text-kw-green"
            badge={chiffres ? `${chiffres.recosAPresenter} à présenter` : null}
            valeur={nombre(chiffres?.recosOuvertes)}
            libelle="Recommandations"
            definition="Recommandations encore ouvertes : Brouillon, Consultation, Offres reçues, À présenter, Présentée."
            onClick={() => navigate('/recommandations')}
          />
          <TuileChiffre
            icone={TrendingUp}
            teinte="bg-kw-green-light text-kw-green"
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
          <MaJournee actions={journee} chargement={journeeEnCours} />
        </div>

        {/* ══════ CE QU'IL Y A À TRAITER — conservé sous sa maquette, voir la note du fichier ══════ */}
        <h2 className="mb-3 mt-8 text-kw-h3 font-extrabold tracking-[-0.01em] text-kw-ink">À traiter</h2>
        {isLoading && <p className="mb-3 text-kw-sm text-kw-meta">Chargement de vos listes…</p>}

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
          <div className="flex min-w-0 flex-col gap-4">
            {(data?.sections ?? []).map((section) => (
              <Section key={section.cle} section={section} />
            ))}
          </div>

          <FilPortefeuille />
        </div>
      </div>
    </div>
  )
}

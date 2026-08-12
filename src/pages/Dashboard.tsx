import { useNavigate } from 'react-router-dom'
import { Check, FileText, Sparkle, ShieldCheck, Zap, ChevronRight } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { TuileIndicateur } from '@/components/dashboard/TuileIndicateur'
import { FilPortefeuille } from '@/components/dashboard/FilPortefeuille'
import { useDashboardStats, type SectionAction } from '@/lib/data/dashboard'
import { useActions } from '@/lib/data/actions'
import { useMonProfil } from '@/lib/data/roles'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** Dégradés des quatre tuiles de tête, repris de la maquette de William au pixel. Ils sont propres
 * au tableau de bord et n'ont pas d'équivalent dans la palette Tailwind. */
const TUILES = {
  signal: { haut: '#cf5238', bas: '#9e3722' },
  reco: { haut: '#9d5b30', bas: '#6f3a1e' },
  mandat: { haut: '#b08f14', bas: '#8a6d08' },
  contrat: { haut: '#3d95a5', bas: '#256571' },
} as const

/** Couleur d'accent de chaque section, cohérente avec sa tuile. */
const ACCENTS: Record<SectionAction['cle'], { haut: string; bas: string }> = {
  signal: TUILES.signal,
  reco: TUILES.reco,
  mandat: TUILES.mandat,
  contrat: TUILES.contrat,
}

const ICONES: Record<SectionAction['cle'], typeof Zap> = {
  signal: Zap,
  reco: Sparkle,
  mandat: ShieldCheck,
  contrat: FileText,
}

/** Liste complète correspondant à une section, pour le lien « tout voir ». */
const LISTES: Record<SectionAction['cle'], string> = {
  signal: '/signaux',
  reco: '/recommandations',
  mandat: '/mandats',
  contrat: '/contrats',
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
  const { data: actions } = useActions()
  const today = todayIso()

  const mesTachesDuJour = (actions ?? [])
    .filter(
      (a) =>
        a.responsable_id === monProfil?.id &&
        a.statut !== 'TERMINEE' &&
        a.statut !== 'ANNULEE' &&
        a.echeance &&
        a.echeance.slice(0, 10) <= today,
    )
    .sort((a, b) => a.echeance.localeCompare(b.echeance))

  const dateDuJour = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // Une phrase qui résume la journée, plutôt qu'un texte d'accueil figé.
  const aTraiter =
    (data?.signauxNouveaux ?? 0) + (data?.recosPretes ?? 0) + (data?.mandatsTresEnRetard ?? 0) + (data?.contratsASigner ?? 0)
  const resume = isLoading
    ? 'Chargement de votre journée…'
    : aTraiter === 0
      ? 'Rien d’urgent aujourd’hui — tout est à jour.'
      : `${aTraiter} élément${aTraiter > 1 ? 's' : ''} à traiter en priorité${mesTachesDuJour.length ? ` · ${mesTachesDuJour.length} tâche${mesTachesDuJour.length > 1 ? 's' : ''} du jour` : ''}.`

  return (
    <div>
      <Topbar title="Tableau de bord" />

      <div className="border-b border-navy-100 bg-white px-6 pb-[15px] pt-[18px]">
        <div className="flex items-baseline gap-3">
          <span className="text-[23px] font-bold tracking-[-.02em] text-navy-900">
            Bonjour{monProfil?.prenom ? ` ${monProfil.prenom}` : ''}
          </span>
          <span className="text-xs capitalize text-navy-400">{dateDuJour}</span>
        </div>
        <div className="mt-1 text-[13px] text-navy-600">{resume}</div>
      </div>

      <div className="px-6 pb-9 pt-[18px]">
        <div className="mb-5 grid grid-cols-1 gap-[13px] sm:grid-cols-2 xl:grid-cols-4">
          <TuileIndicateur
            libelle="Suivi des contrats"
            valeur={data?.contratsASuivre ?? 0}
            unite="en cours"
            detail={`${data?.contratsASigner ?? 0} à signer`}
            icone={FileText}
            couleurHaut={TUILES.contrat.haut}
            couleurBas={TUILES.contrat.bas}
            remplissage={Math.min(1, (data?.contratsASuivre ?? 0) / 40)}
            index={0}
            onClick={() => navigate('/contrats')}
          />
          <TuileIndicateur
            libelle="Suivi des recommandations"
            valeur={data?.recommandationsEnCours ?? 0}
            unite="aujourd’hui"
            detail={`${data?.recosPretes ?? 0} prêtes à présenter`}
            icone={Sparkle}
            couleurHaut={TUILES.reco.haut}
            couleurBas={TUILES.reco.bas}
            remplissage={Math.min(1, (data?.recommandationsEnCours ?? 0) / 150)}
            index={1}
            onClick={() => navigate('/recommandations')}
          />
          <TuileIndicateur
            libelle="Suivi des mandats"
            valeur={data?.mandatsARelancer ?? 0}
            unite="en attente"
            detail={`${data?.mandatsTresEnRetard ?? 0} sans réponse depuis plus de 14 j`}
            icone={ShieldCheck}
            couleurHaut={TUILES.mandat.haut}
            couleurBas={TUILES.mandat.bas}
            remplissage={Math.min(1, (data?.mandatsARelancer ?? 0) / 50)}
            index={2}
            onClick={() => navigate('/mandats')}
          />
          <TuileIndicateur
            libelle="Suivi des signaux"
            valeur={data?.signauxOuverts ?? 0}
            unite="ouverts"
            detail={`${data?.signauxNouveaux ?? 0} nouveaux à qualifier`}
            icone={Zap}
            couleurHaut={TUILES.signal.haut}
            couleurBas={TUILES.signal.bas}
            remplissage={Math.min(1, (data?.signauxOuverts ?? 0) / 250)}
            index={3}
            onClick={() => navigate('/signaux')}
          />
        </div>

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

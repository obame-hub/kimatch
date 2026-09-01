import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Radio, Sparkle } from 'lucide-react'
import type { Recommandation, Signal } from '@/types/domain'
import { FINALITES_RECOMMANDATION, type CleFinalite } from '@/lib/finalitesRecommandation'

/**
 * Onglets de la fiche compte, portés depuis la maquette « Fiche Compte » de William (12/08/2026).
 *
 * Les couleurs, tailles et largeurs fixes viennent de `recosVals()` et des templates de la maquette.
 * Les pastilles d'étape et de finalité ont une largeur figée (96 px, 84 px) : c'est voulu chez lui,
 * les colonnes restent alignées d'une ligne à l'autre quelle que soit la longueur du libellé.
 */

const ANIMATION_ONGLET = 'animate-km-fade-slide'

/** Teintes d'étape — reprises de `stC`, complétées pour Clôture que la maquette n'affiche pas
 *  dans les recos actives (une reco clôturée passe dans l'historique). */
const TEINTE_ETAPE: Record<string, [string, string]> = {
  DIAGNOSTIC: ['#4f5aa8', '#eef0fa'],
  CONSULTATION: ['#8a4b2a', '#f7ece3'],
  DECISION: ['#0d7a5f', '#eaf4f0'],
  CLOTURE: ['#83868f', '#f0efec'],
}

/** Teintes d'échéance — `echC` de la maquette. */
const TEINTE_ECHEANCE = {
  rouge: ['#c2452d', '#fbeae5'],
  ambre: ['#b57a24', '#fdf3e0'],
  gris: ['#83868f', '#f2f1ee'],
} as const

/**
 * Finalités de clôture. La maquette écrit « Perdue », mais le référentiel arrêté le 12/08 dit
 * « Refusée » — c'est lui qui fait foi, la maquette datait d'avant l'harmonisation.
 */

function joursAvant(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

/** Titre de section : 10px, 700, .08em, gris — le motif de toutes les sections de la maquette. */
export function TitreSection({ children, precision }: { children: React.ReactNode; precision?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-km-xs font-bold uppercase tracking-[.08em] text-[#a3a5a0]">{children}</span>
      {precision && <span className="text-km-xs text-[#a3a5a0]">{precision}</span>}
    </div>
  )
}

// ══ RECOMMANDATIONS ═══════════════════════════════════════════════════════════════════════════

export function OngletRecommandations({ recommandations }: { recommandations: Recommandation[] }) {
  const navigate = useNavigate()
  const [filtre, setFiltre] = useState<'tous' | CleFinalite>('tous')

  const { actives, historique } = useMemo(() => {
    // Les trois issues terminales de Michel, plus la finalité pour les dossiers d'avant.
    const closes = recommandations.filter(
      (r) => ['ACCEPTEE', 'REFUSEE', 'ABANDONNEE'].includes(r.etape) || r.finalite_cloture,
    )
    return {
      actives: recommandations.filter((r) => !closes.includes(r)),
      historique: closes,
    }
  }, [recommandations])

  const compte = (cle: CleFinalite) => historique.filter((r) => r.finalite_cloture === cle).length
  const filtres: [('tous' | CleFinalite), string, string, number][] = [
    ['tous', 'Toutes', '#5c5f66', historique.length],
    ['ACCEPTEE', 'Acceptées', FINALITES_RECOMMANDATION.ACCEPTEE.couleur, compte('ACCEPTEE')],
    ['REFUSEE', 'Refusées', FINALITES_RECOMMANDATION.REFUSEE.couleur, compte('REFUSEE')],
    ['EXPIREE', 'Expirées', FINALITES_RECOMMANDATION.EXPIREE.couleur, compte('EXPIREE')],
  ]
  const affichees = historique.filter((r) => filtre === 'tous' || r.finalite_cloture === filtre)

  return (
    <div className={`${ANIMATION_ONGLET} flex flex-col gap-2.5`}>
      <TitreSection>
        {actives.length} recommandation{actives.length > 1 ? 's' : ''} active{actives.length > 1 ? 's' : ''} · compte
      </TitreSection>

      {actives.length === 0 && (
        <div className="rounded-[11px] border border-dashed border-[#e0dfdb] bg-white p-[22px] text-center text-xs text-[#83868f]">
          Aucune recommandation en cours sur ce compte
        </div>
      )}

      {actives.map((r) => {
        const jours = joursAvant(r.date_cloture)
        const nature = jours === null ? 'gris' : jours < 30 ? 'rouge' : jours < 90 ? 'ambre' : 'gris'
        const [couleurEch, fondEch] = TEINTE_ECHEANCE[nature]
        const [couleurEtape, fondEtape] = TEINTE_ETAPE[r.etape] ?? TEINTE_ETAPE.DIAGNOSTIC
        return (
          <div
            key={r.id}
            onClick={() => navigate(`/recommandations/${r.id}`)}
            className="flex cursor-pointer items-center gap-3 rounded-[11px] border border-[#e7e6e2] bg-white px-[15px] py-3 transition-colors hover:border-[#dcc39c] hover:bg-[#fffdf9]"
          >
            <span className="inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] bg-[#f7ece3] text-[#8a4b2a]">
              <Sparkle className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-km-body font-bold">{r.titre}</span>
            <span
              title="Échéance"
              className="w-[84px] flex-none rounded-[5px] py-[3px] text-center font-mono text-km-label font-bold"
              style={{ color: couleurEch, background: fondEch }}
            >
              {jours === null ? '—' : jours < 0 ? `+${-jours} j` : `${jours} j`}
            </span>
            <span
              className="w-24 flex-none rounded-[5px] py-1 text-center text-km-tiny font-extrabold uppercase tracking-[.04em]"
              style={{ color: couleurEtape, background: fondEtape }}
            >
              {r.etape.toLowerCase()}
            </span>
            <ChevronRight className="h-3.5 w-3.5 flex-none text-[#c9cbc6]" />
          </div>
        )
      })}

      <div className="mt-2.5 flex items-center gap-2.5">
        <span className="text-km-xs font-bold uppercase tracking-[.08em] text-[#a3a5a0]">Historique du compte</span>
        <div className="h-px flex-1 bg-[#e7e6e2]" />
        <span className="text-km-xs text-[#83868f]">{affichees.length} affichée{affichees.length > 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-wrap gap-[7px]">
        {filtres.map(([cle, label, couleur, n]) => {
          const actif = filtre === cle
          return (
            <button
              key={cle}
              type="button"
              onClick={() => setFiltre(cle)}
              className="inline-flex cursor-pointer select-none items-center gap-[7px] rounded-lg border px-[11px] py-[5px] text-km-label font-bold transition-all duration-[130ms]"
              style={{
                color: actif ? '#fff' : '#5c5f66',
                background: actif ? couleur : '#fff',
                borderColor: actif ? couleur : '#e0dfdb',
              }}
            >
              <span
                className="h-[7px] w-[7px] flex-none rounded-full"
                style={{ background: actif ? 'rgba(255,255,255,.85)' : couleur }}
              />
              {label}
              <span
                className="font-mono text-km-tiny font-extrabold"
                style={{ color: actif ? 'rgba(255,255,255,.8)' : '#a3a5a0' }}
              >
                {n}
              </span>
            </button>
          )
        })}
      </div>

      {affichees.map((r) => {
        const finalite = r.finalite_cloture ? FINALITES_RECOMMANDATION[r.finalite_cloture] : FINALITES_RECOMMANDATION.EXPIREE
        // versions[0] est la plus récente : la liste est triée décroissant depuis le 12/08/2026.
        const derniere = r.versions[0]
        return (
          <div
            key={r.id}
            onClick={() => navigate(`/recommandations/${r.id}`)}
            className="flex cursor-pointer items-center gap-3 rounded-[11px] border border-[#e7e6e2] bg-white px-[15px] py-[11px] transition-colors hover:bg-[#fbfbfa]"
          >
            <span
              className="w-[68px] flex-none rounded-[5px] py-1 text-center text-km-tiny font-extrabold uppercase tracking-[.05em]"
              style={{ color: finalite.couleur, background: finalite.fond }}
            >
              {finalite.libelle}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{r.titre}</div>
              <div className="truncate text-km-xs text-[#83868f]">
                {derniere?.nom || 'Aucune version'}
                {r.type_energie ? ` · ${r.type_energie}` : ''}
              </div>
            </div>
            {/* La commission n'apparaît que sur une reco acceptée : c'est la seule où KiWee perçoit. */}
            {r.finalite_cloture === 'ACCEPTEE' && r.marge_nette != null && (
              <span title="Commission KiWee perçue" className="flex flex-none flex-col items-end gap-px">
                <span className="text-km-micro font-extrabold uppercase tracking-[.06em] text-[#0d7a5f]">Commission</span>
                <span className="font-mono text-km-body font-extrabold tracking-[-.02em] text-[#0d7a5f]">
                  {Math.round(r.marge_nette).toLocaleString('fr-FR')} €
                </span>
              </span>
            )}
            <span className="w-[52px] flex-none text-right font-mono text-km-xs text-[#a3a5a0]">
              {r.date_cloture ? new Date(r.date_cloture).toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' }) : '—'}
            </span>
          </div>
        )
      })}

      {affichees.length === 0 && (
        <div className="rounded-[11px] border border-dashed border-[#e0dfdb] bg-white p-[22px] text-center text-xs text-[#83868f]">
          Aucune recommandation {filtre === 'tous' ? '' : `${FINALITES_RECOMMANDATION[filtre as CleFinalite]?.libelle.toLowerCase() ?? ''} `}sur ce compte
        </div>
      )}
    </div>
  )
}

// ══ SIGNAUX ═══════════════════════════════════════════════════════════════════════════════════

export function OngletSignaux({
  signaux,
  onVoirTout,
}: {
  signaux: Signal[]
  onVoirTout: () => void
}) {
  const navigate = useNavigate()

  // Tri par priorité : la maquette annonce « trier : priorité ▾ ». La gravité fait foi, la date
  // départage à gravité égale.
  const tries = useMemo(
    () =>
      [...signaux].sort(
        (a, b) => (b.gravite ?? 0) - (a.gravite ?? 0) || b.date_creation.localeCompare(a.date_creation),
      ),
    [signaux],
  )

  return (
    <div className={`${ANIMATION_ONGLET} flex flex-col gap-2.5`}>
      <div className="flex items-center gap-2.5">
        {/* L'éclair n'était pas une énergie ici, c'était une puce décorative devant un compte de
            signaux — et un emoji en couleurs pleines au milieu d'une ligne de capitales grises.
            L'icône des signaux, celle du rail de navigation, dit la même chose et appartient au jeu. */}
        <span className="inline-flex items-center gap-1.5 text-km-xs font-bold uppercase tracking-[.08em] text-[#a3a5a0]">
          <Radio className="h-3 w-3 shrink-0" aria-hidden="true" />
          {signaux.length} signal{signaux.length > 1 ? 'ux' : ''} ouvert{signaux.length > 1 ? 's' : ''} · compte
        </span>
        <span className="flex-1" />
        <span className="text-km-xs text-[#83868f]">trié par priorité</span>
      </div>

      {tries.map((s) => {
        // Gravité 2 = critique, 1 = à surveiller, 0 ou absent = informatif.
        const critique = (s.gravite ?? 0) >= 2
        const vigilance = (s.gravite ?? 0) === 1
        return (
          <div
            key={s.id}
            className="flex flex-wrap items-center gap-3 rounded-[11px] border bg-white px-[15px] py-3"
            style={{
              borderColor: critique ? '#f0c8bd' : vigilance ? '#f0dcb4' : '#e7e6e2',
              background: critique ? '#fffbfa' : '#fff',
            }}
          >
            <div className="min-w-[170px] flex-1">
              <div className="text-km-body font-bold">
                {s.type_signal}{' '}
                <button
                  type="button"
                  onClick={() => navigate(`/sites/${s.site_id}`)}
                  className="rounded-[5px] bg-[#f2f1ee] px-1.5 py-px text-km-xs font-semibold text-[#5c5f66] transition-colors hover:bg-[#e7e6e2]"
                >
                  {s.site_nom}
                </button>
              </div>
              <div className="mt-0.5 text-km-label text-[#83868f]">{s.description}</div>
            </div>
            <button
              type="button"
              onClick={onVoirTout}
              className="cursor-pointer rounded-[7px] border border-[#e0dfdb] bg-white px-[11px] py-1.5 text-km-label font-semibold text-[#5c5f66] transition-colors hover:bg-[#f0efec]"
            >
              Voir dans Signaux
            </button>
            {s.recommandation_id ? (
              <button
                type="button"
                onClick={() => navigate(`/recommandations/${s.recommandation_id}`)}
                className="cursor-pointer rounded-[7px] bg-[#0d7a5f] px-[11px] py-1.5 text-km-label font-bold text-white transition-colors hover:bg-[#0a6650]"
              >
                Recommandation liée
              </button>
            ) : (
              <span className="rounded-[7px] bg-[#f7ece3] px-[11px] py-1.5 text-km-label font-bold text-[#8a4b2a]">
                À qualifier
              </span>
            )}
          </div>
        )
      })}

      {signaux.length === 0 && (
        <div className="rounded-[11px] border border-dashed border-[#d3e5de] bg-white p-[22px] text-center text-xs font-semibold text-[#0d7a5f]">
          ✓ Aucun signal ouvert — compte sous contrôle
        </div>
      )}
    </div>
  )
}

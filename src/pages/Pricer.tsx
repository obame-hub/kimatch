import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import kiweePicto from '@/assets/kiwee-picto.png'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { ChiffrageVersion } from '@/components/pricing/offres/ChiffrageVersion'
import { useVersionsPricing, type VersionPricing } from '@/lib/data/pricingVersions'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * PRICER — le chiffrage en plein écran
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « pour gagner un max de place, je pense que le mode pricing, c'est-à-dire
 * créer des offres, ça doit être du full page, comme le mode sprint ». Sans le rail de gauche, sur
 * un écran de 13 pouces : la liste des dossiers à gauche, le tableau à compléter à droite.
 *
 * SEULS LES DOSSIERS DU JOUR ET EN RETARD — « montre-moi uniquement les offres attendues aujourd'hui
 * et celles en retard, pas les prochaines ». Le reste se lit dans Pricing.
 *
 * Le dossier choisi se garde dans l'adresse (`?version=`) : un lien envoyé ouvre le même tableau.
 *
 * LE VOLET SE REPLIE — William, 01/10/2026 : « plier le tableau prend vraiment tout l'écran ». Replié,
 * il reste un rail étroit : une pastille par dossier, pour changer sans rouvrir ; au survol, la
 * pastille montre la carte du dossier. Il est REPLIÉ PAR DÉFAUT ; qui le rouvre le retrouve ouvert
 * sur ce poste.
 */

const CLE_REPLIE = 'kimatch.pricer.volet-replie'
const lireReplie = () => { try { return window.localStorage.getItem(CLE_REPLIE) !== '0' } catch { return true } }
const ecrireReplie = (v: boolean) => { try { window.localStorage.setItem(CLE_REPLIE, v ? '1' : '0') } catch { /* sans stockage, le volet se rouvre au prochain chargement */ } }

const estGaz = (v: VersionPricing) => String(v.type_energie ?? '').toUpperCase() === 'GAZ'
const estElec = (v: VersionPricing) => String(v.type_energie ?? '').toUpperCase().startsWith('ELEC')

export default function Pricer() {
  const { data: versions, isLoading } = useVersionsPricing()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [toast, setToast] = useState<string | null>(null)
  const montrer = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3200) }
  const [replie, setReplie] = useState(lireReplie)
  const basculer = () => setReplie((r) => { ecrireReplie(!r); return !r })
  const [survol, setSurvol] = useState<{ v: VersionPricing; top: number; left: number } | null>(null)

  const aTraiter = useMemo(
    () => (versions ?? [])
      .filter((v) => v.version_statut === 'EN_CONSTRUCTION' && v.jours_avant_livraison != null && v.jours_avant_livraison <= 0)
      .sort((a, b) => (a.jours_avant_livraison ?? 0) - (b.jours_avant_livraison ?? 0)),
    [versions],
  )
  const enRetard = aTraiter.filter((v) => (v.jours_avant_livraison ?? 0) < 0)
  const duJour = aTraiter.filter((v) => v.jours_avant_livraison === 0)
  const choisie = params.get('version') ?? aTraiter[0]?.version_id ?? null
  useEffect(() => {
    if (!params.get('version') && aTraiter[0]) setParams({ version: aTraiter[0].version_id }, { replace: true })
  }, [aTraiter, params, setParams])

  return (
    <div className="flex h-screen flex-col bg-km-bg">
      <TitreOnglet crumb="Pricing" title="Pricer" />
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-km-side-line bg-gradient-to-b from-km-side to-km-side-bas px-4">
        <img src={kiweePicto} alt="" className="h-[22px] w-[22px] object-contain" />
        <span className="text-[14px] font-bold tracking-[-.02em] text-km-side-text">Pricer</span>
        <span className="h-4 w-px bg-km-side-line" aria-hidden="true" />
        <span className="text-[12px] text-km-side-muted">
          <b className="font-semibold text-km-side-text">{aTraiter.length}</b> dossier{aTraiter.length > 1 ? 's' : ''} à chiffrer
          {enRetard.length > 0 && <> · <b className="font-semibold text-km-side-red">{enRetard.length} en retard</b></>}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/pricing'))}
          className="inline-flex h-8 items-center gap-1.5 rounded-km border border-km-side-line px-3 text-[12px] font-semibold text-km-side-muted transition-colors hover:bg-white/[0.055] hover:text-km-side-text"
        >
          <X className="h-3.5 w-3.5" /> Quitter
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {replie ? (
          <nav aria-label="Dossiers à chiffrer" className="flex w-[46px] shrink-0 flex-col items-center gap-1.5 overflow-y-auto rounded-[13px] border border-km-line bg-white py-2">
            <button type="button" onClick={basculer} title="Afficher les dossiers" aria-label="Afficher les dossiers" className="flex h-8 w-8 items-center justify-center rounded-km-sm text-km-muted hover:bg-km-soft hover:text-km-text">
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <span className="h-px w-6 bg-km-line" aria-hidden="true" />
            {aTraiter.map((v) => {
              const j = v.jours_avant_livraison ?? 0
              const actif = v.version_id === choisie
              return (
                <button
                  key={v.version_id}
                  type="button"
                  onClick={() => { setSurvol(null); setParams({ version: v.version_id }) }}
                  onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSurvol({ v, top: r.top, left: r.right + 10 }) }}
                  onMouseLeave={() => setSurvol(null)}
                  onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSurvol({ v, top: r.top, left: r.right + 10 }) }}
                  onBlur={() => setSurvol(null)}
                  aria-label={v.recommandation_nom}
                  aria-current={actif ? 'true' : undefined}
                  className={cn(
                    'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-km-sm border text-[10.5px] font-extrabold',
                    actif ? 'border-km-green bg-km-green-soft text-km-green' : 'border-km-line bg-white text-km-muted hover:border-[#C9D0CB] hover:text-km-text',
                  )}
                >
                  {initiales(v.recommandation_nom)}
                  <span className={cn('absolute -right-[3px] -top-[3px] h-2 w-2 rounded-full ring-2 ring-white', j < 0 ? 'bg-km-red' : 'bg-km-amber')} aria-hidden="true" />
                </button>
              )
            })}
            {/* LA CARTE AU SURVOL — la même que dans le volet ouvert, posée à côté du rail. */}
            {survol && (
              <div
                role="tooltip"
                style={{ top: Math.min(survol.top - 6, window.innerHeight - 150), left: survol.left }}
                className="pointer-events-none fixed z-50 w-[260px] animate-km-fade rounded-km-lg shadow-km-pop"
              >
                <CarteDossier v={survol.v} choisie={survol.v.version_id === choisie} onChoisir={() => {}} />
              </div>
            )}
          </nav>
        ) : (
          <nav aria-label="Dossiers à chiffrer" className="flex w-[260px] shrink-0 flex-col gap-4 overflow-y-auto pr-0.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-extrabold uppercase tracking-[.09em] text-km-faint">Dossiers</span>
              <button type="button" onClick={basculer} title="Replier le volet" aria-label="Replier le volet des dossiers" className="flex h-7 w-7 items-center justify-center rounded-km-sm text-km-muted hover:bg-km-soft hover:text-km-text">
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            {isLoading && <p className="px-1 text-km-body text-km-faint">Chargement…</p>}
            {!isLoading && aTraiter.length === 0 && (
              <div className="rounded-km-lg border border-km-green-line bg-km-green-tint px-4 py-5">
                <p className="text-[14px] font-bold text-km-green">Rien à chiffrer aujourd’hui.</p>
                <p className="mt-1 text-km-body text-km-muted">Aucune version attendue aujourd’hui ni en retard.</p>
              </div>
            )}
            <Groupe titre="En retard" classes="text-km-red" versions={enRetard} choisie={choisie} choisir={(id) => setParams({ version: id })} />
            <Groupe titre="Aujourd’hui" classes="text-km-amber" versions={duJour} choisie={choisie} choisir={(id) => setParams({ version: id })} />
          </nav>
        )}

        {choisie ? (
          <ChiffrageVersion versionId={choisie} onToast={montrer} />
        ) : (
          <section className="flex flex-1 items-center justify-center rounded-[13px] border border-dashed border-km-line text-km-body text-km-faint">Choisissez un dossier à gauche.</section>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[10px] bg-ink-800 px-[14px] py-2 text-[13px] text-white shadow-[0_6px_20px_rgba(0,0,0,.25)]">{toast}</div>
      )}
    </div>
  )
}

/** Deux lettres pour reconnaître un dossier sur le rail : les initiales des deux premiers mots. */
function initiales(nom: string) {
  const mots = nom.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  return ((mots[0]?.[0] ?? '') + (mots[1]?.[0] ?? '')).toUpperCase() || '?'
}

function Groupe({ titre, classes, versions, choisie, choisir }: { titre: string; classes: string; versions: VersionPricing[]; choisie: string | null; choisir: (id: string) => void }) {
  if (!versions.length) return null
  return (
    <div className="flex flex-col gap-2">
      <span className={cn('px-1 text-[10px] font-extrabold uppercase tracking-[.09em]', classes)}>{titre} · {versions.length}</span>
      {versions.map((v) => <CarteDossier key={v.version_id} v={v} choisie={v.version_id === choisie} onChoisir={() => choisir(v.version_id)} />)}
    </div>
  )
}

/**
 * UNE CARTE AÉRÉE — William, 01/10/2026 : « trop d'infos, trop compact ». Trois lignes seulement :
 * le dossier, le client, puis l'énergie, le retard et l'avancement. La version et la date exacte se
 * lisent dans le tableau, une fois le dossier ouvert.
 */
function CarteDossier({ v, choisie, onChoisir }: { v: VersionPricing; choisie: boolean; onChoisir: () => void }) {
  const combinaisons = v.fournisseurs.flatMap((f) => f.combinaisons)
  const pretes = combinaisons.filter((c) => c.statut === 'DISPONIBLE' || c.statut === 'INDISPONIBLE').length
  const gaz = estGaz(v)
  const elec = estElec(v)
  const j = v.jours_avant_livraison ?? 0
  return (
    <button
      type="button"
      onClick={onChoisir}
      aria-current={choisie ? 'true' : undefined}
      className={cn(
        'flex w-full flex-col gap-2 rounded-km-lg border bg-white px-3.5 py-3 text-left transition-[border-color,box-shadow]',
        choisie ? 'border-km-green shadow-[0_0_0_3px_rgba(13,122,95,.10)]' : 'border-km-line hover:border-[#C9D0CB]',
      )}
    >
      <span className="line-clamp-2 text-[13px] font-bold leading-[18px] text-km-text">{v.recommandation_nom}</span>
      {v.compte_nom && <span className="-mt-1 truncate text-[11.5px] text-km-faint">{v.compte_nom}</span>}
      <span className="flex items-center gap-2">
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-extrabold',
          gaz ? 'bg-km-gaz-soft text-km-gaz' : elec ? 'bg-km-elec-soft text-km-elec' : 'bg-km-soft text-km-muted',
        )}>
          {gaz ? 'Gaz' : elec ? 'Élec' : 'Énergie ?'}
        </span>
        <span className={cn('text-[11.5px] font-semibold', j < 0 ? 'text-km-red' : 'text-km-amber')}>{j < 0 ? `Retard ${-j} j` : 'Aujourd’hui'}</span>
        <span className="ml-auto font-mono text-[11.5px] text-km-muted"><b className={pretes ? 'text-km-green' : ''}>{pretes}</b>/{combinaisons.length}</span>
      </span>
      {combinaisons.length > 0 && (
        <span className="flex gap-[3px]">
          {combinaisons.map((c) => (
            <span key={c.id} className={cn('h-1 flex-1 rounded-full', c.statut === 'DISPONIBLE' ? 'bg-km-green' : c.statut === 'INDISPONIBLE' ? 'bg-km-red/50' : 'bg-km-line')} />
          ))}
        </span>
      )}
    </button>
  )
}

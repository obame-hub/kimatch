import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ══ LA DURÉE ET LES MANDATS — UNE SEULE ZONE POUR DEUX PARCOURS ══
 *
 * Née dans le mandat en une page de la conversion d'une piste (`MandatEnUnePage`, 24/09/2026), elle
 * sert aussi le parcours de création d'un mandat (29/09/2026). La recopier aurait fait deux choix de
 * durée qui divergent au premier réglage — et c'est le mandat du client qui porterait l'écart.
 *
 * 12 MOIS PAR DÉFAUT — réunion du 05/10/2026 : « il faut que tous nos mandats passent sur 12 mois,
 * parce que le mandat de Yanis [Energix] est sur 12 mois et on ne peut pas éditer la durée ».
 * L'homologation Tradeo est tenue par le mandat : un mandat KiWee plus long que son mandat Energix
 * laisserait croire à une homologation qui ne vaut plus. Avec Energix, la durée est donc FIXÉE à
 * 12 mois ; sans Energix, « Autre » reste possible. KiWee toujours, Energix en option.
 */

export const DUREES = [12, 24, 36, 48] as const
export const DUREE_DEFAUT = 12
/** La durée du mandat Energix, que Tradeo ne permet pas de changer. */
export const DUREE_ENERGIX = 12

export function ChoixDureeMandats({ dureeMois, onDuree, avecEnergix, onEnergix }: {
  dureeMois: number
  onDuree: (mois: number) => void
  avecEnergix: boolean
  onEnergix: (oui: boolean) => void
}) {
  const [dureeLibre, setDureeLibre] = useState(!DUREES.includes(dureeMois as (typeof DUREES)[number]))

  return (
    <div className="grid grid-cols-2 gap-[13px]">
      <div className="flex flex-col gap-[9px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Durée</span>
        <div className="flex gap-[2px] rounded-[9px] border border-km-line bg-km-soft p-[3px]">
          {DUREES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { setDureeLibre(false); onDuree(d) }}
              disabled={avecEnergix && d !== DUREE_ENERGIX}
              title={avecEnergix && d !== DUREE_ENERGIX ? 'Avec Energix, le mandat est de 12 mois' : undefined}
              className={cn(
                'disabled:cursor-not-allowed disabled:opacity-40',
                'flex-1 rounded-[6px] py-[6px] text-[12px] tabular-nums transition-colors',
                !dureeLibre && dureeMois === d
                  ? 'bg-km-green font-bold text-white'
                  : 'font-medium text-km-muted hover:bg-white hover:text-km-text',
              )}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDureeLibre(true)}
            disabled={avecEnergix}
            className={cn(
              'disabled:cursor-not-allowed disabled:opacity-40',
              'flex-1 rounded-[6px] py-[6px] text-[12px] transition-colors',
              dureeLibre
                ? 'bg-km-green font-bold text-white'
                : 'font-medium text-km-muted hover:bg-white hover:text-km-text',
            )}
          >
            Autre
          </button>
        </div>
        {dureeLibre ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              autoFocus
              value={dureeMois || ''}
              onChange={(e) => onDuree(Number(e.target.value))}
              className="w-[90px] rounded-[9px] border border-km-line bg-white px-[11px] py-[7px] font-mono text-[13px] text-km-text outline-none focus:border-km-green"
            />
            <span className="text-[11.5px] text-km-muted">mois</span>
          </div>
        ) : (
          <span className="text-[11px] text-km-faint">{avecEnergix ? 'Avec Energix : 12 mois, comme son mandat.' : 'En mois. Un an par défaut.'}</span>
        )}
      </div>

      <div className="flex flex-col gap-[9px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Mandats</span>
        <div className="flex items-center gap-[10px] rounded-[9px] border border-km-line bg-white px-[11px] py-[7px]">
          <Check className="h-[13px] w-[13px] shrink-0 text-km-green" />
          <span className="flex-1 text-[12.5px] font-semibold text-km-text">KiWee Énergie</span>
          <span className="text-[10.5px] text-km-faint">toujours</span>
        </div>
        <label className={cn(
          'flex cursor-pointer items-center gap-[10px] rounded-[9px] border px-[11px] py-[7px]',
          avecEnergix ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-white',
        )}>
          <input
            type="checkbox"
            checked={avecEnergix}
            onChange={(e) => {
              onEnergix(e.target.checked)
              if (e.target.checked) { setDureeLibre(false); onDuree(DUREE_ENERGIX) }
            }}
            className="h-[15px] w-[15px] shrink-0 accent-km-green"
          />
          <span className="flex-1 text-[12.5px] font-semibold text-km-text">Energix</span>
          <span className="text-[10.5px] text-km-faint">en option</span>
        </label>
      </div>
    </div>
  )
}

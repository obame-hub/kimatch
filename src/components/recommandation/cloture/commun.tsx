import { Champ, SAISIE, SAISIE_MONO } from '@/components/parcours/Parcours'
import { jourLocalISO } from '@/lib/heureTache'
import { cn } from '@/lib/utils'

/**
 * Les morceaux que partagent les trois parcours de clôture — voir `clotureRecommandation.ts`.
 */

/** Aujourd'hui, au jour de Paris : la date de clôture proposée. `toISOString` daterait de la veille après minuit. */
export function aujourdhui(): string {
  return jourLocalISO(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
}

export function dateFr(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-')
  return `${j}/${m}/${a}`
}

export const dateValide = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

/** La date de clôture : préremplie avec aujourd'hui, modifiable quand la décision date d'un autre jour. */
export function ChampDateCloture({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  return (
    <Champ intitule="Date de clôture" requis>
      <input type="date" value={valeur} onChange={(e) => onChange(e.target.value)} className={cn(SAISIE_MONO, 'w-[170px]')} />
      <span className="text-[11.5px] text-km-faint">Aujourd’hui par défaut ; changez-la si la décision date d’un autre jour.</span>
    </Champ>
  )
}

/** L'étape du motif, commune à Refusée et Expirée : une question, un texte libre, la date. */
export function EtapeMotif({ question, aide, motif, onMotif, date, onDate }: {
  question: string
  aide: string
  motif: string
  onMotif: (v: string) => void
  date: string
  onDate: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <Champ intitule={question} requis>
        <textarea
          autoFocus
          rows={5}
          value={motif}
          onChange={(e) => onMotif(e.target.value)}
          placeholder={aide}
          className={cn(SAISIE, 'resize-none leading-[1.5]')}
        />
      </Champ>
      <ChampDateCloture valeur={date} onChange={onDate} />
    </div>
  )
}

/**
 * Un montant en euros, au centime (règle de William : on n'arrondit jamais un prix). La saisie
 * accepte la virgule comme le point ; `null` quand le champ est vide.
 */
export function lireMontant(texte: string): number | null | 'invalide' {
  const t = texte.replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return 'invalide'
  return Number(t)
}

export function ecrireMontant(v: number | null | undefined): string {
  return v == null ? '' : String(v).replace('.', ',')
}

export function SaisieMontant({ valeur, onChange, invalide, sombre, autoFocus }: {
  valeur: string
  onChange: (v: string) => void
  invalide?: boolean
  /** Sur la capsule verte : un champ blanc, texte sombre, pour qu'on voie ce qu'on tape. */
  sombre?: boolean
  autoFocus?: boolean
}) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0,00"
        className={cn(SAISIE_MONO, 'w-[132px] text-right tabular-nums', invalide && 'border-km-red', sombre && 'border-white/40')}
      />
      <span className={cn('text-[12.5px]', sombre ? 'text-white/85' : 'text-km-muted')}>€</span>
    </span>
  )
}

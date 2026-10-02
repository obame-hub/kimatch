import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TarifsTurpe } from '@/components/administration/TarifsTurpe'
import { CoefficientsCpb, TaxeReglementee, type DefinitionTaxe } from '@/components/administration/TaxesReglementees'

/**
 * ADMINISTRATION › PRICING — William, 02/10/2026 : « je préférerais que dans Administration l'onglet se
 * nomme "Pricing" et que dans Pricing, je dispose de plusieurs onglets (TURPE étant un de ces
 * onglets). Les autres onglets seront AE, AG, CPB, CTA, TQD. »
 *
 * Tout ce qui est fixé par la réglementation et entre dans les budgets du Pricer : la base les lit à
 * chaque calcul (`fn_reglementaire_version_compteur`), rien ne se ressaisit dans les offres.
 */

const TAXES: DefinitionTaxe[] = [
  { code: 'AE', nom: 'Accise sur l’électricité', energie: 'Électricité', unite: '€/MWh', dimension: 'unique', aide: 'Appliquée à toute la consommation du compteur.' },
  { code: 'AG', nom: 'Accise sur le gaz', energie: 'Gaz', unite: '€/MWh', dimension: 'unique', aide: 'Appliquée à la CAR du compteur.' },
  { code: 'TQD', nom: 'Terme de quantité de distribution', energie: 'Gaz', unite: '€/MWh', dimension: 'tarif', aide: 'Selon le tarif d’acheminement du compteur (T1 à T4).' },
  { code: 'CTA', nom: 'Contribution tarifaire d’acheminement', energie: 'Gaz', unite: '€/an', dimension: 'tarif_profil', aide: 'Selon le tarif et le profil du compteur.' },
]

type Onglet = 'TURPE' | 'AE' | 'AG' | 'TQD' | 'CTA' | 'CPB'
const ONGLETS: [Onglet, string, string][] = [
  ['TURPE', 'TURPE', 'Électricité'],
  ['AE', 'AE', 'Accise électricité'],
  ['AG', 'AG', 'Accise gaz'],
  ['TQD', 'TQD', 'Distribution gaz'],
  ['CTA', 'CTA', 'Acheminement gaz'],
  ['CPB', 'CPB', 'Biogaz'],
]

export function ReferentielsPricing() {
  const [onglet, setOnglet] = useState<Onglet>('TURPE')
  const def = TAXES.find((t) => t.code === onglet)
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Données réglementées du pricing" className="flex flex-wrap gap-1 border-b border-km-line">
        {ONGLETS.map(([id, nom, aide]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={onglet === id}
            onClick={() => setOnglet(id)}
            className={cn('-mb-px flex flex-col items-start border-b-[2.5px] px-3.5 pb-2 pt-1 text-left', onglet === id ? 'border-km-green' : 'border-transparent hover:border-km-line')}
          >
            <span className={cn('font-mono text-[13px] font-bold', onglet === id ? 'text-km-text' : 'text-km-muted')}>{nom}</span>
            <span className="text-[10.5px] text-km-faint">{aide}</span>
          </button>
        ))}
      </div>
      {onglet === 'TURPE' ? <TarifsTurpe /> : onglet === 'CPB' ? <CoefficientsCpb /> : def ? <TaxeReglementee key={def.code} def={def} /> : null}
    </div>
  )
}

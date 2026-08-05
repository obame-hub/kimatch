// Regroupement des fournisseurs en 3 zones fixes, basé sur
// `comptes_fournisseurs.partnership`/`intermediary` -- kiwee (partenariat direct), obd et energix
// (intermédiaires). La détection de zone est partagée entre Cotation et Contrat, mais Tools
// utilise pour chacun un ordre ET des libellés différents et incohérents entre eux
// (StepSuppliers.tsx pour Cotation vs SupplierCardPicker.tsx pour Contrat) -- reproduits tels
// quels ici plutôt qu'unifiés, par fidélité exacte au comportement réel de Tools.
export const ZONE_ORDER_COTATION = ['kiwee', 'obd', 'energix'] as const
export const ZONE_LABEL_COTATION: Record<string, string> = {
  kiwee: 'Kiwee',
  obd: 'Intermédiaire OBD',
  energix: 'Intermédiaire Energix',
  autre: 'Autre',
}

export const ZONE_ORDER_CONTRAT = ['kiwee', 'energix', 'obd'] as const
export const ZONE_LABEL_CONTRAT: Record<string, string> = {
  kiwee: 'Partenariat KiWee',
  energix: 'Via Energix',
  obd: 'Via OBD',
  autre: 'Autre',
}

export function zoneDuFournisseur(intermediary: string | null | undefined, partnership: string | null | undefined): string {
  if ((intermediary ?? '').toLowerCase() === 'obd') return 'obd'
  if ((intermediary ?? '').toLowerCase() === 'energix') return 'energix'
  if ((partnership ?? '').toLowerCase() === 'kiwee') return 'kiwee'
  return 'autre'
}

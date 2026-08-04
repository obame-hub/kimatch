// Regroupement des fournisseurs en 3 zones fixes (Tools : CotationWizard/ContratWizard), basé sur
// `comptes_fournisseurs.partnership`/`intermediary` -- kiwee (partenariat direct), obd et energix
// (intermédiaires). Partagé entre les flots Cotation et Contrat pour rester cohérent.
export const ZONE_LABEL: Record<string, string> = {
  kiwee: 'KiWee (partenariat direct)',
  obd: 'OBD (intermédiaire)',
  energix: 'Energix (intermédiaire)',
  autre: 'Autre',
}

export function zoneDuFournisseur(intermediary: string | null | undefined, partnership: string | null | undefined): string {
  if ((intermediary ?? '').toLowerCase() === 'obd') return 'obd'
  if ((intermediary ?? '').toLowerCase() === 'energix') return 'energix'
  if ((partnership ?? '').toLowerCase() === 'kiwee') return 'kiwee'
  return 'autre'
}

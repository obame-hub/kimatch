export interface MarketPrice {
  price: number
  changePct: number
  at: string
}

export interface MarketTickerData {
  peg: MarketPrice
  base: MarketPrice
}

// Aucun flux de prix PEG/BASE n'est branché côté backend (aucun endpoint, aucune table) --
// le ticker du header (voir Topbar.tsx) affiche des tirets tant que cette fonction retourne
// null plutôt que d'inventer des cotations. À remplacer par un vrai fetch le jour où une
// source de prix marché (API fournisseur, flux interne...) est disponible.
export function useMarketTicker(): MarketTickerData | null {
  return null
}

import type { Mandat } from '@/types/domain'

/**
 * ══ UN COMPTEUR EST-IL COUVERT PAR UN MANDAT KIWEE ENCORE ACTIF ? ══
 *
 * William, 30/09/2026 : « les boutons de synchronisation GRDF et ENEDIS ne doivent être cliquables
 * que si le compteur en question est couvert par un mandat KiWee encore actif. Aucune erreur ne doit
 * être possible car tout appel non couvert pourrait être sanctionné envers l'entreprise. »
 *
 * LA MÊME RÈGLE QUE LE SERVEUR (`api/_mandatActif.ts`), qui reste le vrai garde-fou : un bouton
 * grisé est une politesse, le refus vit là où la requête passe. Sur un même mandat, en même temps :
 * le lien au compteur non caduc, le statut ACTIF, le courtier KiWee, une fin de validité absente ou
 * pas encore passée.
 */
export function mandatKiweeCouvre(mandats: Mandat[] | undefined, compteurId: string, aujourdhui = jourParis()): boolean {
  return mandatCouvre(mandats, compteurId, 'KIWI', aujourdhui)
}

/**
 * La même règle pour un courtier donné — `KIWI` ou `ENERGIX` (06/10/2026 : un mandat Energix ouvre
 * les fournisseurs Energix à la consultation).
 */
export function mandatCouvre(mandats: Mandat[] | undefined, compteurId: string, courtier: 'KIWI' | 'ENERGIX', aujourdhui = jourParis()): boolean {
  return (mandats ?? []).some((m) =>
    m.compteur_ids.includes(compteurId)
    && !m.compteur_ids_caducs.includes(compteurId)
    && m.statut === 'ACTIF'
    && m.courtier_codes.includes(courtier)
    && (!m.date_fin_validite || m.date_fin_validite.slice(0, 10) >= aujourdhui),
  )
}

function jourParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

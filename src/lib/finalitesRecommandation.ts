/**
 * Finalités de clôture d'une recommandation.
 *
 * Ce sont les TROIS valeurs réellement présentes en base (`recommandations.finalite_cloture`),
 * sur 1573 lignes closes : ACCEPTEE 867, EXPIREE 386, REFUSEE 320. La maquette de William en
 * propose cinq (Convertie, Non qualifiée, Perdue, Reportée, Annulée) ; décision de Naoëlle le
 * 16/08/2026 : on garde les trois de la base et on reprend le geste du design, pas son
 * vocabulaire. Rien n'est remappé, aucune ligne close n'est réinterprétée.
 *
 * La liste vivait en dur dans `components/compte/OngletsCompte.tsx`. Elle est remontée ici parce
 * que la fiche recommandation en a besoin aussi, et que deux copies auraient divergé.
 */
export const FINALITES_RECOMMANDATION = {
  ACCEPTEE: { libelle: 'Acceptée', couleur: '#0d7a5f', fond: '#eaf4f0', bordure: '#d3e5de' },
  REFUSEE: { libelle: 'Refusée', couleur: '#c2452d', fond: '#fbeae5', bordure: '#f0c8bd' },
  EXPIREE: { libelle: 'Expirée', couleur: '#83868f', fond: '#f0efec', bordure: '#dcdad5' },
} as const

export type CleFinalite = keyof typeof FINALITES_RECOMMANDATION

export const CLES_FINALITES = Object.keys(FINALITES_RECOMMANDATION) as CleFinalite[]

/**
 * Une finalité impose-t-elle une date de réactivation ?
 *
 * Aucune des trois valeurs actuelles ne le fait : la règle « la date de réactivation est
 * obligatoire » de la maquette ne se déclenche que sur une finalité de report, qui n'existe pas
 * dans le vocabulaire retenu. La fonction est là pour que la règle s'applique d'elle-même le jour
 * où une finalité de report est ajoutée — la colonne `date_reactivation` est déjà en base.
 */
export function exigeDateReactivation(finalite: CleFinalite): boolean {
  return REPORTS.includes(finalite as never)
}

const REPORTS: readonly CleFinalite[] = []

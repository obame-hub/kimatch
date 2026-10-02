/**
 * LES CATÉGORIES DES PIÈCES JOINTES — William, 02/10/2026 : Facture, Mandat, Appel d'offres, Contrat,
 * RIB, Certificat, Avenant, Appel, Mail, Offre fournisseur, Autre. La liste vit en base
 * (`types_documents`) ; ce module ne porte que leurs teintes et les codes dont le code a besoin.
 */
export const CATEGORIE = {
  FACTURE: 'FACTURE',
  MANDAT: 'MANDAT',
  APPEL_OFFRES: 'APPEL_OFFRES',
  CONTRAT: 'CONTRAT',
  RIB: 'RIB',
  CERTIFICAT: 'CERTIFICAT',
  AVENANT: 'AVENANT',
  APPEL: 'APPEL',
  MAIL: 'MAIL',
  OFFRE_FOURNISSEUR: 'OFFRE_FOURNISSEUR',
  AUTRE: 'AUTRE',
} as const

/** [texte, fond] — la même teinte d'une liste à l'autre, pour reconnaître une catégorie d'un coup d'œil. */
const TEINTES: Record<string, [string, string]> = {
  FACTURE: ['#3F6E9C', '#EAF1F8'],
  MANDAT: ['#7C5BB0', '#F2ECFB'],
  APPEL_OFFRES: ['#A06B19', '#FFF3D8'],
  CONTRAT: ['#0D7A5F', '#E7F4EF'],
  RIB: ['#2F6F7E', '#E4F2F4'],
  CERTIFICAT: ['#5B6470', '#EDEFF2'],
  AVENANT: ['#B85145', '#FBE9E6'],
  APPEL: ['#8A5A2B', '#F6EDE3'],
  MAIL: ['#3D5AA8', '#E9EDFA'],
  OFFRE_FOURNISSEUR: ['#6B4CA0', '#F1ECF8'],
}
const TEINTE_AUTRE: [string, string] = ['#69716C', '#F3F5F2']

export function teinteCategorie(code: string | null | undefined): [string, string] {
  return (code && TEINTES[code]) || TEINTE_AUTRE
}

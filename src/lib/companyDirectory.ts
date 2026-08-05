// Recherche d'entreprise via l'API publique gratuite recherche-entreprises.api.gouv.fr (INSEE),
// exactement comme dans Tools -- sert a l'identite (SIREN/SIRET/adresse/dirigeant), separement du
// score de solvabilite Ellisphere qui reste branche via /api/ellisphere/score.

export interface CompanyResult {
  siren: string
  siret: string | null
  nomComplet: string
  raisonSociale: string | null
  dirigeant: string | null
  codeApe: string | null
  libelleApe: string | null
  etatAdministratif: string | null
  street: string | null
  city: string | null
  postalCode: string | null
  formeJuridique: string | null
  dateCreation: string | null
  /** PME/ETI/GE/GEI -- champ `categorie_entreprise` de l'API. Non affiché (Tools ne le montre pas). */
  categorieEntreprise: string | null
  /** Code tranche INSEE (ex. "21"), à traduire via TRANCHE_EFFECTIF_LABEL pour l'affichage. */
  trancheEffectifSalarie: string | null
  /** L'établissement retenu est-il le siège social ? Tools affiche « Catégorie : Siège social »
   * dans le bloc « Direction & taille » -- vérifié en direct le 05/08/2026 (ce n'est PAS la
   * catégorie d'entreprise PME/ETI/GE, contrairement à ce qu'on avait supposé). */
  estSiege: boolean
}

/** Libellés des codes "tranche_effectif_salarie" de l'INSEE (nomenclature officielle). */
export const TRANCHE_EFFECTIF_LABEL: Record<string, string> = {
  NN: 'Non renseigné',
  '00': '0 salarié',
  '01': '1 à 2 salariés',
  '02': '3 à 5 salariés',
  '03': '6 à 9 salariés',
  '11': '10 à 19 salariés',
  '12': '20 à 49 salariés',
  '21': '50 à 99 salariés',
  '22': '100 à 199 salariés',
  '31': '200 à 249 salariés',
  '32': '250 à 499 salariés',
  '41': '500 à 999 salariés',
  '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés',
  '52': '5 000 à 9 999 salariés',
  '53': '10 000 salariés et plus',
}

interface RechRaw {
  siren: string
  nom_complet: string
  nom_raison_sociale?: string | null
  nature_juridique?: string | null
  date_creation?: string | null
  dirigeants?: Array<{ nom?: string; prenoms?: string; nom_complet?: string }>
  matching_etablissements?: Array<{
    siret?: string
    adresse?: string
    code_postal?: string
    libelle_commune?: string
    etat_administratif?: string
    activite_principale?: string
    numero_voie?: string
    type_voie?: string
    libelle_voie?: string
    etablissement_siege?: boolean
  }>
  siege?: Record<string, unknown>
  activite_principale?: string
  libelle_activite_principale?: string
  categorie_entreprise?: string | null
  tranche_effectif_salarie?: string | null
}

export async function searchCompanies(query: string, signal?: AbortSignal): Promise<CompanyResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=10`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Recherche entreprises indisponible')
  const json = await res.json()
  const results = (json.results ?? []) as RechRaw[]

  return results.map((r) => {
    const etab = (r.matching_etablissements?.[0] ?? r.siege ?? {}) as Record<string, unknown>
    const dir = r.dirigeants?.[0]
    const dirName = dir?.nom_complet ?? [dir?.prenoms, dir?.nom].filter(Boolean).join(' ') ?? null
    const street =
      (etab.adresse as string) ??
      [etab.numero_voie, etab.type_voie, etab.libelle_voie].filter(Boolean).join(' ').trim() ??
      null
    const etat = etab.etat_administratif === 'A' ? 'Actif' : etab.etat_administratif === 'C' ? 'Cessé' : (etab.etat_administratif as string) ?? null
    return {
      siren: r.siren,
      siret: (etab.siret as string) ?? null,
      nomComplet: r.nom_complet,
      raisonSociale: r.nom_raison_sociale ?? null,
      dirigeant: dirName || null,
      codeApe: (etab.activite_principale as string) ?? r.activite_principale ?? null,
      libelleApe: r.libelle_activite_principale ?? null,
      etatAdministratif: etat,
      street: (street as string) || null,
      city: (etab.libelle_commune as string) ?? null,
      postalCode: (etab.code_postal as string) ?? null,
      formeJuridique: r.nature_juridique ?? null,
      dateCreation: r.date_creation ?? null,
      categorieEntreprise: r.categorie_entreprise ?? null,
      trancheEffectifSalarie: r.tranche_effectif_salarie ?? null,
      estSiege: etab.etablissement_siege === true,
    } satisfies CompanyResult
  })
}

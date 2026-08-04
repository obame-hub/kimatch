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
  }>
  siege?: Record<string, unknown>
  activite_principale?: string
  libelle_activite_principale?: string
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
    } satisfies CompanyResult
  })
}

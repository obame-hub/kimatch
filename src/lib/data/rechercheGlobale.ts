import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SearchEntry } from '@/lib/search'

/**
 * Recherche globale (⌘K) executee par la base, et non en memoire.
 *
 * Le composant de resultats construisait son index a partir de onze tables entieres -- environ
 * 100 000 lignes, dont 66 000 interactions et 130 Mo -- des la premiere lettre tapee. Le montage
 * differe evitait de le faire sur chaque page, mais la premiere frappe payait toujours la note.
 *
 * Ici, chaque famille fait une requete filtree et plafonnee : la base cherche, le navigateur
 * affiche. Le cout ne depend plus de la taille du CRM.
 *
 * `ilike` avec des jokers de part et d'autre ne peut pas utiliser un index B-tree classique, mais
 * sur des tables de quelques milliers de lignes le parcours reste bien plus rapide que de tout
 * transferer. Si la recherche devient lente en grandissant, l'etape suivante est un index trigramme
 * (pg_trgm) sur les colonnes concernees -- pas un retour au chargement complet.
 */

const PAR_FAMILLE = 5

/** Echappe les caracteres que PostgREST interprete dans un filtre `or(...)`. */
function motif(query: string): string {
  return `%${query.replace(/[,()%]/g, ' ').trim()}%`
}

async function chercher(query: string): Promise<SearchEntry[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const m = motif(q)

  const [comptes, sites, contacts, compteurs, mandats, recommandations, contrats] = await Promise.all([
    supabase.from('comptes').select('id, nom, ville, siren').or(`nom.ilike.${m},siren.ilike.${m},ville.ilike.${m}`).limit(PAR_FAMILLE),
    supabase.from('sites').select('id, nom, ville, code_postal, adresse, compte:comptes(nom)').or(`nom.ilike.${m},ville.ilike.${m},code_postal.ilike.${m},adresse.ilike.${m}`).limit(PAR_FAMILLE),
    supabase.from('contacts').select('id, prenom, nom, email, telephone, compte:comptes(nom)').or(`nom.ilike.${m},prenom.ilike.${m},email.ilike.${m},telephone.ilike.${m}`).limit(PAR_FAMILLE),
    supabase.from('compteurs').select('id, numero_point, libelle, site:sites(nom)').or(`numero_point.ilike.${m},libelle.ilike.${m}`).limit(PAR_FAMILLE),
    supabase.from('mandats').select('id, reference, compte:comptes(nom)').or(`reference.ilike.${m}`).limit(PAR_FAMILLE),
    supabase.from('recommandations').select('id, nom, compte:comptes(nom)').or(`nom.ilike.${m}`).limit(PAR_FAMILLE),
    supabase.from('contrats').select('id, reference, reference_fournisseur, compte:comptes(nom)').or(`reference.ilike.${m},reference_fournisseur.ilike.${m}`).limit(PAR_FAMILLE),
  ])

  const nomDe = (v: unknown): string => {
    const x = Array.isArray(v) ? v[0] : v
    return (x as { nom?: string } | null)?.nom ?? ''
  }

  const entrees: SearchEntry[] = []
  for (const c of comptes.data ?? []) {
    entrees.push({ kind: 'compte', id: c.id, label: c.nom, sublabel: c.ville ?? '', to: `/comptes/${c.id}`, fields: [] })
  }
  for (const s of sites.data ?? []) {
    entrees.push({ kind: 'site', id: s.id, label: s.nom, sublabel: [nomDe(s.compte), s.ville].filter(Boolean).join(' · '), to: `/sites/${s.id}`, fields: [] })
  }
  for (const c of contacts.data ?? []) {
    entrees.push({
      kind: 'contact',
      id: c.id,
      label: `${c.prenom ?? ''} ${c.nom ?? ''}`.trim(),
      sublabel: [nomDe(c.compte), c.email].filter(Boolean).join(' · '),
      to: `/contacts/${c.id}`,
      fields: [],
    })
  }
  for (const c of compteurs.data ?? []) {
    entrees.push({ kind: 'compteur', id: c.id, label: c.numero_point, sublabel: [nomDe(c.site), c.libelle].filter(Boolean).join(' · '), to: `/compteurs/${c.id}`, fields: [] })
  }
  for (const m2 of mandats.data ?? []) {
    entrees.push({ kind: 'mandat', id: m2.id, label: m2.reference ?? 'Mandat', sublabel: nomDe(m2.compte), to: `/mandats/${m2.id}`, fields: [] })
  }
  for (const r of recommandations.data ?? []) {
    entrees.push({ kind: 'recommandation', id: r.id, label: r.nom, sublabel: nomDe(r.compte), to: `/recommandations/${r.id}`, fields: [] })
  }
  for (const c of contrats.data ?? []) {
    entrees.push({
      kind: 'contrat',
      id: c.id,
      label: c.reference ?? c.reference_fournisseur ?? 'Contrat',
      sublabel: nomDe(c.compte),
      to: `/contrats/${c.id}`,
      fields: [],
    })
  }
  return entrees
}

export function useRechercheGlobale(query: string) {
  return useQuery({
    queryKey: ['recherche-globale', query.trim()],
    queryFn: () => chercher(query),
    enabled: query.trim().length >= 2,
    // La frappe change la cle a chaque lettre : garder les resultats precedents evite que la liste
    // clignote entre deux caracteres.
    placeholderData: (precedent) => precedent,
    staleTime: 30 * 1000,
  })
}

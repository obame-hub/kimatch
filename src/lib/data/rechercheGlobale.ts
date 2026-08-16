import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SearchEntry } from '@/lib/search'
import { useFrappePosee } from '@/lib/useFrappePosee'

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

/** Quatre mots suffisent a identifier une ligne ; au-dela on empilerait des filtres pour rien. */
const MOTS_MAX = 4

/** Decoupe la saisie en mots, en otant ce que PostgREST interprete dans un filtre `or(...)`. */
function mots(query: string): string[] {
  return query
    .replace(/[,()%]/g, ' ')
    .split(/\s+/)
    .filter((mot) => mot.length > 0)
    .slice(0, MOTS_MAX)
}

/**
 * Applique la recherche a une requete : CHAQUE mot doit se retrouver dans AU MOINS UN des champs.
 *
 * Le filtre portait auparavant la saisie entiere sur chaque champ pris isolement. Chercher
 * « Romain Hebrard » ne rendait donc rien : `prenom` vaut « Romain » et `nom` vaut « HEBRARD »,
 * aucun des deux ne contient « Romain Hebrard ». Toute recherche « prenom + nom » etait muette,
 * et le meme travers touchait « SDC 17 » sur un site ou un compte en plusieurs mots.
 *
 * Chaque appel a `.or()` ajoute un filtre, et PostgREST combine les filtres successifs par ET :
 * on obtient bien « (mot1 dans un champ) ET (mot2 dans un champ) ».
 */
function appliquer<T>(requete: T, listeMots: string[], champs: string[]): T {
  let r = requete
  for (const mot of listeMots) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r = (r as any).or(champs.map((c) => `${c}.ilike.%${mot}%`).join(','))
  }
  return r
}

async function chercher(query: string): Promise<SearchEntry[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const listeMots = mots(q)
  if (listeMots.length === 0) return []

  const [comptes, sites, contacts, compteurs, mandats, recommandations, contrats] = await Promise.all([
    appliquer(supabase.from('comptes').select('id, nom, ville, siren'), listeMots, ['nom', 'siren', 'ville']).limit(PAR_FAMILLE),
    appliquer(supabase.from('sites').select('id, nom, ville, code_postal, adresse, compte:comptes(nom)'), listeMots, ['nom', 'ville', 'code_postal', 'adresse']).limit(PAR_FAMILLE),
    appliquer(supabase.from('contacts').select('id, prenom, nom, email, telephone, compte:comptes(nom)'), listeMots, ['nom', 'prenom', 'email', 'telephone']).limit(PAR_FAMILLE),
    appliquer(supabase.from('compteurs').select('id, numero_point, libelle, site:sites(nom)'), listeMots, ['numero_point', 'libelle']).limit(PAR_FAMILLE),
    appliquer(supabase.from('mandats').select('id, reference, compte:comptes(nom)'), listeMots, ['reference']).limit(PAR_FAMILLE),
    // `!<contrainte>` obligatoire ici : recommandations et contrats ont CHACUNE deux cles
    // etrangeres vers comptes (le compte du dossier et le fournisseur). Un embed non qualifie
    // rend PGRST201 « relation ambigue » et fait echouer toute la famille de resultats.
    appliquer(supabase.from('recommandations').select('id, nom, compte:comptes!recommandations_compte_id_fkey(nom)'), listeMots, ['nom']).limit(PAR_FAMILLE),
    appliquer(supabase.from('contrats').select('id, reference, reference_fournisseur, compte:comptes!contrats_compte_id_fkey(nom)'), listeMots, ['reference', 'reference_fournisseur']).limit(PAR_FAMILLE),
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
  const terme = useFrappePosee(query.trim())
  return useQuery({
    queryKey: ['recherche-globale', terme],
    queryFn: () => chercher(terme),
    enabled: terme.length >= 2,
    // La frappe change la cle a chaque lettre : garder les resultats precedents evite que la liste
    // clignote entre deux caracteres.
    placeholderData: (precedent) => precedent,
    staleTime: 30 * 1000,
  })
}

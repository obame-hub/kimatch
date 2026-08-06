import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 1000
const CONCURRENCY = 4

// PostgREST plafonne chaque requête à 1000 lignes par défaut : sans pagination, les lignes
// les plus anciennes/les moins prioritaires disparaissent silencieusement dès qu'une table
// dépasse ce plafond -- repéré sur `interactions` le 29/07/2026. Ce helper généralise le même
// correctif à toutes les tables qui vont grossir fortement une fois les ~2650 comptes Salesforce
// migrés (comptes, contacts, compteurs, contrats, documents, etc.).
// `configure` peut ajouter un .eq()/.order() ; il est appliqué à la fois à la requête de
// comptage et à chaque page, donc il ne doit pas appeler .select() lui-même.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(table: string, selectString: string, configure?: (query: any) => any): Promise<T[]> {
  const apply = configure ?? ((q: any) => q) // eslint-disable-line @typescript-eslint/no-explicit-any

  // `*` et non `id` : les tables de liaison à clé primaire composite (recommandations_compteurs,
  // versions_recommandation_durees…) n'ont pas de colonne `id` et PostgREST répondait 400, ce qui
  // faisait échouer toute leur lecture. `head: true` ne renvoie aucune ligne, `*` ne coûte donc rien.
  const { count, error: countError } = await apply(supabase.from(table).select('*', { count: 'exact', head: true }))
  if (countError) throw countError

  const total = count ?? 0
  const pageStarts: number[] = []
  for (let from = 0; from < total; from += PAGE_SIZE) pageStarts.push(from)
  if (pageStarts.length === 0) return []

  async function fetchPage(from: number, attempt = 0): Promise<T[]> {
    const { data, error } = await apply(supabase.from(table).select(selectString)).range(from, from + PAGE_SIZE - 1)
    if (error) {
      // Supabase renvoie parfois 500/503 quand trop de requêtes lourdes partent en même temps.
      if (attempt < 2) return fetchPage(from, attempt + 1)
      throw error
    }
    return (data ?? []) as T[]
  }

  const results: T[][] = new Array(pageStarts.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < pageStarts.length) {
      const idx = nextIndex++
      results[idx] = await fetchPage(pageStarts[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pageStarts.length) }, worker))
  return results.flat()
}

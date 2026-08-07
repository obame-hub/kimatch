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

  // Plus de comptage préalable. Le `HEAD ... count=exact` que faisait cette fonction renvoyait
  // des 503 sur les grosses tables (mesuré en production le 06/08/2026 sur `compteurs` : chaque
  // comptage échouait puis était retenté, d'où 29 requêtes pour charger une table de 8 pages).
  // On avance par vagues et on s'arrête dès qu'une vague revient incomplète : une requête de
  // moins par table, et plus de comptage à faire échouer.
  async function fetchPage(from: number, attempt = 0): Promise<T[]> {
    const { data, error } = await apply(supabase.from(table).select(selectString)).range(from, from + PAGE_SIZE - 1)
    if (error) {
      // Supabase renvoie parfois 500/503 quand trop de requêtes lourdes partent en même temps.
      if (attempt < 2) return fetchPage(from, attempt + 1)
      throw error
    }
    return (data ?? []) as T[]
  }

  // Une seule page d'abord. La grande majorité des appels sont filtrés (les sites d'un compte,
  // les compteurs de ces sites…) et tiennent largement dedans : lancer d'emblée une vague de
  // requêtes parallèles en gaspillerait trois sur quatre.
  const premiere = await fetchPage(0)
  if (premiere.length < PAGE_SIZE) return premiere

  // Table volumineuse : on continue par vagues parallèles jusqu'à en voir le bout.
  const tout: T[] = [...premiere]
  for (let vague = 0; vague <= 50; vague += 1) {
    const departs = Array.from({ length: CONCURRENCY }, (_, i) => (1 + vague * CONCURRENCY + i) * PAGE_SIZE)
    const pages = await Promise.all(departs.map((from) => fetchPage(from)))
    for (const page of pages) tout.push(...page)
    // Une page plus courte que PAGE_SIZE signifie qu'on a atteint la fin de la table.
    if (pages.some((page) => page.length < PAGE_SIZE)) return tout
  }
  return tout
}

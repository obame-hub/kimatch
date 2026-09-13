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

/**
 * ══ LE SECOND PLAFOND DE POSTGREST : LA LONGUEUR DE L'URL ══
 *
 * Audit du 13/09/2026, constat ARC-02.
 *
 * `fetchAllRows` franchit le plafond des mille lignes. Il en reste un autre, et il frappe à
 * l'autre bout : un `.in()` porte CHAQUE valeur dans l'URL de la requête. Au-delà d'environ
 * cent cinquante identifiants, l'URL dépasse ce qu'un serveur HTTP accepte et la requête échoue
 * ENTIÈREMENT — pas de troncature, pas de résultat partiel : une erreur.
 *
 * ── LE CORRECTIF EXISTAIT DÉJÀ, À UN SEUL ENDROIT ──
 *
 * `visibility.ts` porte une fonction `idsParLots` depuis le 13/08/2026, écrite après que les deux
 * plafonds réunis ont fait disparaître 677 sites du périmètre de Marie Thonnard. Son commentaire
 * disait déjà l'essentiel : « le motif s'était déjà répété à trois endroits ».
 *
 * Il s'est répété encore. Six appels le manquaient au 13/09/2026 :
 *
 *     documents.ts:51        .in('entite_id', entiteIds)
 *     actions.ts:64          .in('site_id', siteIds)
 *     opportunites.ts:73,76,79   .in('opportunite_id', ids)
 *     recommandations.ts:268,307,344
 *
 * ── CE QUE ÇA PRODUISAIT, ET POURQUOI PERSONNE NE LE VOYAIT ──
 *
 * Dans `CompteDetail.tsx:166`, la liste passée aux documents vaut :
 *
 *     [compte, …groupesAdresse, …tousLesCompteurs, …tousLesMandats]
 *
 * Pour un syndic à 1 677 sites et environ 2 000 compteurs, cela fait près de 3 700 UUID, soit plus
 * de 140 Ko d'URL. La requête échouait à coup sûr — et comme `fetchDocuments` se termine par
 * `catch { return [] }`, l'onglet Fichiers s'affichait VIDE, sans un mot. Le compte le plus gros
 * était celui dont on voyait le moins.
 *
 * ── POURQUOI ELLE VIT ICI ET NON DANS `visibility.ts` ──
 *
 * `idsParLots` ne sait ramener qu'une colonne d'identifiants, ce qui suffit à son usage. Les six
 * appels ci-dessus veulent des LIGNES, avec leurs jointures. Plutôt que d'élargir une fonction de
 * visibilité à des besoins qui n'ont rien à voir, la version générale rejoint `fetchAllRows`,
 * dont elle est la suite logique — et `idsParLots` s'appuie désormais dessus.
 */
const LOT_IN = 150

export async function fetchAllRowsParLots<T>(
  table: string,
  selectString: string,
  colonneFiltre: string,
  valeurs: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configure?: (query: any) => any,
  /**
   * ══ LE PIÈGE DU DÉCOUPAGE, ET POURQUOI CE PARAMÈTRE N'EST PAS FACULTATIF EN PRATIQUE ══
   *
   * PostgreSQL trie CHAQUE requête, pas l'ensemble des requêtes. Dès qu'il y a plus d'un lot, le
   * résultat concaténé vaut « lot 1 trié, puis lot 2 trié » — ce qui n'est PAS trié.
   *
   * C'est exactement le genre de régression que ce correctif est censé empêcher : invisible sur
   * les petits comptes (un seul lot, l'ordre est juste), fausse sur les gros — donc découverte
   * trois semaines plus tard par quelqu'un qui cherchera pourquoi ses documents récents sont au
   * milieu de la liste.
   *
   * Tout appelant qui pose un `.order()` dans `configure` DOIT donner ici le comparateur
   * équivalent. Le tri final n'est appliqué que s'il y a eu plusieurs lots : sur un seul, celui
   * de la base fait déjà foi.
   */
  trierApres?: (a: T, b: T) => number,
): Promise<T[]> {
  /* Une liste vide ne veut pas dire « pas de filtre » : elle veut dire « aucune valeur ne peut
     correspondre ». Sans ce cas, un `.in()` vide laisserait passer la table entière — l'inverse
     exact de ce qui est demandé. */
  if (valeurs.length === 0) return []

  /* Le cas courant, et de loin : moins de 150 valeurs, donc une seule requête. On ne paie le
     découpage que quand il sert. */
  if (valeurs.length <= LOT_IN) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return fetchAllRows<T>(table, selectString, (q: any) => {
      const filtre = q.in(colonneFiltre, valeurs)
      return configure ? configure(filtre) : filtre
    })
  }

  const lots: string[][] = []
  for (let i = 0; i < valeurs.length; i += LOT_IN) lots.push(valeurs.slice(i, i + LOT_IN))

  /* EN SÉRIE, PAS EN PARALLÈLE. `fetchAllRows` lance déjà jusqu'à quatre requêtes de front pour
     paginer ; multiplier cela par le nombre de lots enverrait des dizaines de requêtes lourdes
     simultanées. Le commentaire de `fetchAllRows` dit ce que Supabase en fait : « 500/503 quand
     trop de requêtes lourdes partent en même temps ». Un compte à 3 700 entités ferait 25 lots ;
     en parallèle, c'est un moyen sûr de faire tomber ce qu'on essaie de réparer. */
  const tout: T[] = []
  for (const lot of lots) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lignes = await fetchAllRows<T>(table, selectString, (q: any) => {
      const filtre = q.in(colonneFiltre, lot)
      return configure ? configure(filtre) : filtre
    })
    tout.push(...lignes)
  }

  /* Voir le commentaire du paramètre : chaque lot est trié par la base, l'ensemble ne l'est pas. */
  return trierApres ? tout.sort(trierApres) : tout
}

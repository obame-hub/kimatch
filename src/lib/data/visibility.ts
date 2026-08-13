import { supabase } from '@/lib/supabase'
import { fetchCurrentAccess } from '@/lib/data/roles'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

// Périmètre de visibilité par compte (profils_comptes), voulu par Michel : un admin
// (SUPER_ADMIN/ADMIN) voit tout, tout le monde d'autre ne voit que les comptes qui lui
// sont explicitement assignés. `null` = aucune restriction (voit tout) ; sinon la liste
// des compte_id autorisés (peut être vide = ne voit aucun compte).
// Même raison et mêmes précautions que `fetchCurrentAccess` : onze modules appellent cette
// fonction au montage d'un écran, pour un résultat identique. Vidé par `viderCacheAcces`.
let cacheComptesVisibles: Promise<string[] | null> | null = null

/** Vide le cache du périmètre de visibilité. Appelé par `viderCacheAcces`. */
export function viderCacheVisibilite() {
  cacheComptesVisibles = null
}

export function fetchComptesVisibles(): Promise<string[] | null> {
  if (!cacheComptesVisibles) {
    cacheComptesVisibles = calculerComptesVisibles().catch((err) => {
      cacheComptesVisibles = null
      throw err
    })
  }
  return cacheComptesVisibles
}

async function calculerComptesVisibles(): Promise<string[] | null> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return []

  const access = await fetchCurrentAccess()
  if (access.roleCode === 'SUPER_ADMIN' || access.roleCode === 'ADMIN') return null

  // Paginé pour la même raison que fetchSitesVisiblesIds : la réponse est plafonnée à 1000 lignes.
  // Guillaume Gilles en a 935 — il passe, mais à 65 comptes du seuil au-delà duquel il perdrait
  // silencieusement une partie de son portefeuille. Ce n'est pas une limite théorique : c'est la
  // même mécanique qui a fait disparaître les compteurs de Marie Thonnard.
  try {
    const lignes = await fetchAllRows<{ compte_id: string }>('profils_comptes', 'compte_id', (q) =>
      q.eq('profil_id', userData.user.id).eq('actif', true),
    )
    return lignes.map((r) => r.compte_id)
  } catch (error) {
    console.error('calculerComptesVisibles', error)
    return []
  }
}

// Dérive les sites visibles à partir des comptes visibles — pour les entités qui ne
// portent qu'un site_id (signaux, compteurs, contrats...) et pas un compte_id direct.
export async function fetchSitesVisiblesIds(comptesVisibles: string[] | null): Promise<string[] | null> {
  if (comptesVisibles === null) return null
  if (comptesVisibles.length === 0) return []

  // DEUX PLAFONDS À FRANCHIR, ET AUCUN DES DEUX NE LÈVE D'ERREUR.
  //
  // 1. PostgREST tronque toute réponse à 1000 lignes. Marie Thonnard a 1677 sites dans son
  //    périmètre : elle en perdait 677, avec tous leurs compteurs, contrats et signaux. Les sites
  //    tombés dépendaient de l'ordre renvoyé par la base, donc variaient d'un chargement à l'autre
  //    — d'où le symptôme « je ne vois aucun compteur de CE compte », les 19 sites de CABINET
  //    ROUMILHAC JOURDAN étant hors des 1000 premiers. D'où fetchAllRows, qui pagine.
  //
  // 2. La longueur de l'URL. Un `in()` porte chaque identifiant dans la requête : 935 comptes pour
  //    Guillaume Gilles font une URL de 34 ko, très au-delà de ce qu'acceptent PostgREST et le
  //    proxy. La requête échouerait entièrement — pas de troncature, rien du tout. D'où le
  //    découpage par lots de 150, le même seuil que dans interactions.ts.
  //
  // Les administrateurs ne voyaient rien de tout cela : ils reçoivent `null` et sortent plus haut.
  const LOT = 150
  try {
    const ids: string[] = []
    for (let i = 0; i < comptesVisibles.length; i += LOT) {
      const lot = comptesVisibles.slice(i, i + LOT)
      const lignes = await fetchAllRows<{ id: string }>('sites', 'id', (q) => q.in('compte_id', lot))
      for (const ligne of lignes) ids.push(ligne.id)
    }
    return ids
  } catch (error) {
    console.error('fetchSitesVisiblesIds', error)
    // Liste vide plutôt que sous-ensemble : un périmètre partiel se lit comme une absence de
    // données, ce qui est plus trompeur qu'un écran vide.
    return []
  }
}

// `null` = pas de restriction. Sinon, ne garde que les éléments dont l'id extrait
// (compte_id ou site_id selon l'entité) figure dans la liste autorisée.
export function filterVisibles<T>(
  items: T[],
  visibleIds: string[] | null,
  getScopeId: (item: T) => string | null | undefined,
): T[] {
  if (visibleIds === null) return items
  const set = new Set(visibleIds)
  return items.filter((item) => {
    const id = getScopeId(item)
    return id != null && set.has(id)
  })
}

// ── Mon portefeuille : ce que J'AI À TRAITER, distinct de ce que j'ai le DROIT DE VOIR ──────────
//
// Deux notions à ne pas confondre. `fetchComptesVisibles` répond à « qu'ai-je le droit de
// consulter ? » et laisse tout passer aux administrateurs. Le tableau de bord et le fil
// d'actualité posent une autre question : « qu'ai-je à traiter aujourd'hui ? » — et là, le rôle
// ne change rien. William, le 12/08/2026 : « t'es censé voir uniquement les contrats qui sont à
// toi, qui t'appartiennent. Ce qui fait que moi, normalement, à aucun moment je suis censé
// [voir 120 recommandations] ». Décision de Naoëlle : la règle vaut pour tout le monde, y compris
// les administrateurs.
//
// Aucun cache ici : la liste est courte, la requête est indexée, et un cache de plus serait un
// cache de plus à invalider au changement de session.
let cacheMonPortefeuille: Promise<{ comptes: string[]; sites: string[] }> | null = null

/** Vide le cache du portefeuille personnel. Appelé par `viderCacheAcces`. */
export function viderCacheMonPortefeuille() {
  cacheMonPortefeuille = null
}

/** Les comptes dont je suis propriétaire, et leurs sites. */
export function fetchMonPortefeuille(): Promise<{ comptes: string[]; sites: string[] }> {
  if (!cacheMonPortefeuille) {
    cacheMonPortefeuille = calculerMonPortefeuille().catch((err) => {
      cacheMonPortefeuille = null
      throw err
    })
  }
  return cacheMonPortefeuille
}

async function calculerMonPortefeuille(): Promise<{ comptes: string[]; sites: string[] }> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { comptes: [], sites: [] }

  const { data, error } = await supabase.from('comptes').select('id').eq('proprietaire_id', userData.user.id)
  if (error || !data) return { comptes: [], sites: [] }
  const comptes = (data as { id: string }[]).map((r) => r.id)
  if (comptes.length === 0) return { comptes: [], sites: [] }

  const { data: sitesRows } = await supabase.from('sites').select('id').in('compte_id', comptes)
  return { comptes, sites: (sitesRows as { id: string }[] | null)?.map((r) => r.id) ?? [] }
}

/**
 * Un objet est « à moi » si son propriétaire est moi ; à défaut de propriétaire renseigné, si le
 * compte auquel il est rattaché est à moi.
 *
 * Ce double critère n'est pas une précaution de style : `proprietaire_id` est vide sur la
 * totalité des mandats (1429/1429), des contrats (1597/1598) et des recommandations (1692/1693),
 * la migration Salesforce ne l'ayant jamais rempli. S'en tenir au propriétaire viderait le
 * tableau de bord de tout le monde ; s'en tenir au compte ignorerait les objets réassignés à la
 * main. La règle couvre l'état actuel de la base comme celui d'après un futur backfill.
 */
export function filtrerMesElements<T>(
  items: T[],
  portefeuille: { comptes: string[]; sites: string[] } | undefined,
  monProfilId: string | null | undefined,
  scope: { proprietaireId?: (item: T) => string | null | undefined; compteId?: (item: T) => string | null | undefined; siteId?: (item: T) => string | null | undefined },
): T[] {
  if (!portefeuille) return []
  const comptes = new Set(portefeuille.comptes)
  const sites = new Set(portefeuille.sites)

  return items.filter((item) => {
    const proprio = scope.proprietaireId?.(item)
    if (proprio) return proprio === monProfilId

    const compte = scope.compteId?.(item)
    if (compte) return comptes.has(compte)

    const site = scope.siteId?.(item)
    if (site) return sites.has(site)

    // Ni propriétaire, ni compte, ni site : impossible de dire à qui c'est. On ne l'affiche pas,
    // plutôt que de le faire apparaître dans le tableau de bord de tout le monde.
    return false
  })
}

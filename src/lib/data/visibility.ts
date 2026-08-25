import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

// Perimetre de visibilite par compte. `null` = aucune restriction ; sinon la liste des compte_id
// autorises (peut etre vide = ne voit aucun compte).
//
// La restriction par portefeuille est LEVEE depuis le 14/08/2026 : « il faut que tous les
// commerciaux voient tous les comptes, pour pouvoir les gerer en l'absence d'un collegue »
// (Naoelle, non negociable). Elle avait ete demandee par Michel a l'origine.
//
// Ce qu'elle produisait : Marie Thonnard, conseillere, ne voyait que les 171 comptes dont elle est
// proprietaire. CABINET MOLINIER appartenant a Matthieu Bruere, il etait absent de sa liste et de
// sa recherche, et sa fiche restait vide -- pris pour un probleme de chargement pendant deux jours.
//
// La mecanique reste en place, cache compris : elle sert de point unique si un perimetre doit
// revenir un jour, et profils_comptes continue d'alimenter la notion de portefeuille (« mes
// comptes », tableau de bord), qui est un usage distinct de la visibilite.
// Meme raison et memes precautions que `fetchCurrentAccess` : onze modules appellent cette
// fonction au montage d'un ecran, pour un resultat identique. Vide par `viderCacheAcces`.
let cacheComptesVisibles: Promise<string[] | null> | null = null

let cacheMesComptes: Promise<string[] | null> | null = null

/** Vide le cache du périmètre de visibilité. Appelé par `viderCacheAcces`. */
export function viderCacheVisibilite() {
  cacheComptesVisibles = null
  cacheMesComptes = null
}

/**
 * LES COMPTES DONT JE SUIS PROPRIÉTAIRE. `null` = aucune restriction (administrateurs).
 *
 * Michel, appel du 25/08/2026 : « est-ce qu'on pourrait faire en sorte, LÀ EN URGENCE, que chaque
 * commercial ne voie que les recommandations sur lesquelles il est propriétaire du compte », avec
 * l'exemple qui la motive : « Matthieu veut regarder ses recommandations, mais il a les
 * recommandations de tout le monde ». Naoëlle, dans le même appel : « OK vas-y, pas de souci ».
 *
 * CE N'EST PAS UN RETOUR À LA RESTRICTION GÉNÉRALE, et la nuance est capitale. Le périmètre par
 * compte a été levé le 14/08 par une décision de Naoëlle qu'elle a qualifiée de non négociable —
 * « il faut que tous les commerciaux voient tous les comptes, pour pouvoir les gérer en l'absence
 * d'un collègue ». `calculerComptesVisibles` reste donc inchangée : comptes, sites, contacts,
 * compteurs, contrats, signaux restent visibles de tous. SEULES LES RECOMMANDATIONS sont filtrées,
 * parce que c'est ce qu'il a demandé et rien de plus.
 *
 * LES ADMINISTRATEURS VOIENT TOUT — c'est sa propre phrase, « à part toi, moi », en ouvrant la
 * question. Michel est super-administrateur, Naoëlle administratrice ; son exemple porte sur
 * Matthieu, conseiller.
 *
 * Mesuré avant d'écrire, le 25/08/2026 : 2 744 des 2 764 comptes portent un propriétaire, et AUCUNE
 * des 1 707 recommandations n'est rattachée à un compte qui en manque — donc aucune ne devient
 * invisible pour tout le monde. La répartition : Marie 648, Guillaume 498, Matthieu 295, Thomas 183,
 * Fabien 74, William 8, Naoëlle 1.
 */
export function fetchMesComptes(): Promise<string[] | null> {
  if (!cacheMesComptes) {
    cacheMesComptes = calculerMesComptes().catch((err) => {
      cacheMesComptes = null
      throw err
    })
  }
  return cacheMesComptes
}

async function calculerMesComptes(): Promise<string[] | null> {
  const { data: userData } = await supabase.auth.getUser()
  // Session absente : on ne montre rien plutôt que tout. Même précaution que pour les comptes
  // visibles — une erreur d'authentification ne doit jamais élargir un périmètre.
  if (!userData.user) return []

  const { data: role } = await supabase
    .from('profils_roles_acces')
    .select('role_acces:roles_acces(code)')
    .eq('profil_id', userData.user.id)
    .maybeSingle()
  const brut = (role as { role_acces: { code: string } | { code: string }[] | null } | null)?.role_acces
  const code = (Array.isArray(brut) ? brut[0]?.code : brut?.code) ?? null
  if (code === 'ADMIN' || code === 'SUPER_ADMIN') return null

  // `profils.id` EST l'identifiant du compte d'authentification, la jointure est donc directe.
  const lignes = await fetchAllRows<{ id: string }>('comptes', 'id', (q) =>
    q.eq('proprietaire_id', userData.user!.id),
  )
  return lignes.map((l) => l.id)
}

/**
 * Charge des identifiants filtrés par un `in()`, en franchissant les deux plafonds de PostgREST.
 *
 * 1. Une réponse est tronquée à 1000 lignes, sans erreur — d'où fetchAllRows, qui pagine.
 * 2. Un `in()` porte chaque valeur dans l'URL ; au-delà d'environ 150 identifiants elle devient
 *    trop longue et la requête échoue entièrement — d'où le découpage par lots.
 *
 * Ces deux pièges ont fait disparaître 677 sites du périmètre de Marie Thonnard le 13/08/2026, et
 * le motif s'était déjà répété à trois endroits. Passer par cette fonction évite de le réécrire —
 * et de le réoublier.
 */
async function idsParLots(
  table: string,
  colonneLue: string,
  colonneFiltre: string,
  valeurs: string[],
): Promise<string[]> {
  const LOT = 150
  const ids: string[] = []
  for (let i = 0; i < valeurs.length; i += LOT) {
    const lot = valeurs.slice(i, i + LOT)
    const lignes = await fetchAllRows<Record<string, string>>(table, colonneLue, (q) => q.in(colonneFiltre, lot))
    for (const ligne of lignes) ids.push(ligne[colonneLue])
  }
  return ids
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
  // Tout le monde voit tous les comptes. On garde le controle d'authentification : une session
  // absente ne doit pas ouvrir l'acces, elle doit ne rien montrer.
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return []
  return null
}

// Dérive les sites visibles à partir des comptes visibles — pour les entités qui ne
// portent qu'un site_id (signaux, compteurs, contrats...) et pas un compte_id direct.
export async function fetchSitesVisiblesIds(comptesVisibles: string[] | null): Promise<string[] | null> {
  if (comptesVisibles === null) return null
  if (comptesVisibles.length === 0) return []

  // Marie Thonnard a 1677 sites dans son périmètre : un select direct en perdait 677, avec tous
  // leurs compteurs, contrats et signaux, et les sites tombés changeaient à chaque chargement. Les
  // administrateurs n'en voyaient rien : ils reçoivent `null` et sortent plus haut.
  try {
    return await idsParLots('sites', 'id', 'compte_id', comptesVisibles)
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

  // Mêmes deux plafonds que fetchSitesVisiblesIds, et le même effet : cette fonction alimente le
  // tableau de bord et le fil du portefeuille. Non paginée, elle rendait leur contenu incomplet pour
  // Guillaume Gilles (935 comptes, à 65 lignes du seuil) et faux pour Marie Thonnard (1677 sites,
  // donc 677 perdus).
  try {
    const comptes = await idsParLots('comptes', 'id', 'proprietaire_id', [userData.user.id])
    if (comptes.length === 0) return { comptes: [], sites: [] }
    const sites = await idsParLots('sites', 'id', 'compte_id', comptes)
    return { comptes, sites }
  } catch (error) {
    console.error('calculerMonPortefeuille', error)
    return { comptes: [], sites: [] }
  }
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

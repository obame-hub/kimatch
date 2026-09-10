import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Site } from '@/types/domain'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import { toUpperFR } from '@/lib/textFormat'

interface RawSite {
  id: string
  compte_id: string
  nom: string
  adresse: string | null
  ville: string | null
  code_postal: string | null
  actif: boolean
  compte: { nom: string } | null
  type_site_id: string | null
  type_site: { libelle: string } | null
}

interface RawSiteExtra {
  id: string
  latitude: number | null
  longitude: number | null
  annee_construction: number | null
  surface_m2: number | null
  date_derniere_ag: string | null
  proprietaire_id: string | null
  proprietaire: { prenom: string; nom: string } | null
  date_creation: string | null
  date_modification: string | null
  rue: string | null
  departement_code: string | null
  departement_nom: string | null
}

/**
 * @param compteId Ne charger que les sites de ce compte. Une fiche compte n'a besoin que des
 *   siens ; tirer les 6346 sites pour en afficher sept coûtait plusieurs secondes.
 */
/** Lecture par identifiants de site, pour les fiches qui n'en affichent qu'un. */
async function fetchSitesParIds(siteIds: string[]): Promise<Site[]> {
  return fetchSites(undefined, siteIds)
}

async function fetchSites(compteId?: string, siteIds?: string[]): Promise<Site[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restreindre = (q: any) => {
    if (compteId) return q.eq('compte_id', compteId)
    if (siteIds) return q.in('id', siteIds)
    return q
  }
  const cible = Boolean(compteId || siteIds)

  try {
    // Les sites d'abord : quand on filtre par compte, leurs identifiants servent à restreindre
    // aussi les agrégats. Sans cela, afficher les 7 sites d'un compte chargeait quand même les
    // 7884 compteurs et tous les signaux du CRM juste pour en compter quelques-uns par site.
    const sites = await fetchAllRows<RawSite>(
      'sites',
      'id, compte_id, nom, adresse, ville, code_postal, actif, type_site_id, compte:comptes(nom), type_site:types_sites(libelle)',
      (q) => restreindre(q).order('nom'),
    )
    const idsSites = sites.map((s) => s.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const surCesSites = (q: any) => (cible ? q.in('site_id', idsSites) : q)

    const [compteursRows, signauxRows] = cible && idsSites.length === 0
      ? [[], []]
      : await Promise.all([
          fetchAllRows<{ site_id: string }>('compteurs', 'site_id', surCesSites),
          fetchAllRows<{ site_id: string; statut: { est_cloture: boolean } | null }>('signaux', 'site_id, statut:statuts_signaux(est_cloture)', surCesSites),
        ])

    // Colonnes ajoutées ultérieurement (tâche #55) — sélectionnées à part : si elles n'existent
    // pas encore en base, on retombe sur null pour elles sans perdre les vraies données du site.
    const extraParSite = new Map<string, RawSiteExtra>()
    try {
      const extraRows = await fetchAllRows<RawSiteExtra>(
        'sites',
        'id, latitude, longitude, annee_construction, surface_m2, date_derniere_ag, proprietaire_id, proprietaire:profils!sites_proprietaire_id_fkey(prenom, nom), date_creation, date_modification, rue, departement_code, departement_nom',
        restreindre,
      )
      for (const e of extraRows) extraParSite.set(e.id, e)
    } catch {
      // colonnes pas encore presentes -- on garde extraParSite vide, comme avant.
    }

    const compteursParSite = new Map<string, number>()
    for (const c of compteursRows) {
      compteursParSite.set(c.site_id, (compteursParSite.get(c.site_id) ?? 0) + 1)
    }
    const signauxOuvertsParSite = new Map<string, number>()
    for (const s of signauxRows) {
      if (!s.statut?.est_cloture) {
        signauxOuvertsParSite.set(s.site_id, (signauxOuvertsParSite.get(s.site_id) ?? 0) + 1)
      }
    }

    const comptesVisibles = await fetchComptesVisibles()

    return filterVisibles(sites, comptesVisibles, (s) => s.compte_id).map((s) => {
      const extra = extraParSite.get(s.id)
      return {
        id: s.id,
        nom: s.nom,
        compte_id: s.compte_id,
        compte_nom: s.compte?.nom ?? '',
        type_site: s.type_site?.libelle ?? '',
        type_site_id: s.type_site_id ?? null,
        adresse: s.adresse ?? '',
        ville: s.ville ?? '',
        code_postal: s.code_postal ?? '',
        latitude: extra?.latitude ?? null,
        longitude: extra?.longitude ?? null,
        annee_construction: extra?.annee_construction ?? null,
        surface_m2: extra?.surface_m2 ?? null,
        date_derniere_ag: extra?.date_derniere_ag ?? null,
        proprietaire_id: extra?.proprietaire_id ?? null,
        proprietaire_nom: extra?.proprietaire ? `${extra.proprietaire.prenom} ${extra.proprietaire.nom}` : null,
        rue: extra?.rue ?? null,
        departement_code: extra?.departement_code ?? null,
        departement_nom: extra?.departement_nom ?? null,
        nb_compteurs: compteursParSite.get(s.id) ?? 0,
        nb_signaux_ouverts: signauxOuvertsParSite.get(s.id) ?? 0,
        statut: s.actif ? 'actif' : 'inactif',
        date_creation: extra?.date_creation ?? undefined,
        date_modification: extra?.date_modification ?? undefined,
      }
    })
  } catch (error) {
    console.error('fetchSites', error)
    return []
  }
}

export function useSites() {
  return useQuery({ queryKey: ['sites'], queryFn: () => fetchSites() })
}

// ---------------------------------------------------------------------------
// LA LISTE DES SITES N'EXISTE PLUS (retrait de l'objet site, 09/09/2026)
// ---------------------------------------------------------------------------
//
// Cinq exports vivaient ici et n'avaient qu'un seul lecteur, l'écran `Sites.tsx` :
// `LigneSiteListe`, `TriSites`, `FonctionListeAbsente`, `useSitesListe` et `useSitesCarte`.
// L'écran supprimé, ils sont morts le même jour, et avec eux les deux fonctions SQL qu'ils
// appelaient — `liste_sites` et `carte_sites`, supprimées par la migration 20260910100000.
//
// C'est la contrepartie ironique du retrait : cette liste était le morceau le plus optimisé du
// CRM — une fonction SQL écrite le 15/08/2026 pour remplacer 87 requêtes PostgREST par une
// seule, ~140 ms pour 100 lignes — et elle servait l'écran dont William disait le 09/09 qu'il
// l'« embête plus qu'il ne le sert ».

/** Sites d'un seul compte -- pour les fiches de détail. */
/**
 * Un seul site, lu par son identifiant.
 *
 * La fiche site le cherchait avec `sites?.find(...)`, ce qui telechargeait les 6346 sites du CRM
 * pour en garder un. Meme motif que useCompte.
 */
export function useSite(siteId: string | undefined) {
  return useQuery({
    queryKey: ['sites', 'un', siteId],
    queryFn: async () => (await fetchSitesParIds([siteId as string]))[0] ?? null,
    enabled: !!siteId,
  })
}

export function useSitesParCompte(compteId: string | undefined) {
  return useQuery({
    queryKey: ['sites', 'compte', compteId],
    queryFn: () => fetchSites(compteId as string),
    enabled: !!compteId,
  })
}

interface CreateSiteInput {
  nom: string
  compte_id: string
  compte_nom: string
  type_site_id: string | null
  type_site_libelle: string
  adresse?: string
  ville: string
  code_postal: string
}

interface CreateSiteResult {
  site: Site
  persisted: boolean
}

export function useCreateSite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateSiteInput): Promise<CreateSiteResult> => {
      let persisted = false
      let site: Site = {
        id: `local-${Date.now()}`,
        nom: input.nom,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        type_site: input.type_site_libelle,
        type_site_id: input.type_site_id,
        adresse: toUpperFR(input.adresse),
        ville: input.ville,
        code_postal: input.code_postal,
        latitude: null,
        longitude: null,
        annee_construction: null,
        surface_m2: null,
        date_derniere_ag: null,
        proprietaire_id: null,
        nb_compteurs: 0,
        nb_signaux_ouverts: 0,
        statut: 'actif',
      }

      const { data, error } = await supabase
        .from('sites')
        .insert({
          nom: input.nom,
          compte_id: input.compte_id,
          adresse: toUpperFR(input.adresse) || null,
          ville: input.ville,
          code_postal: input.code_postal,
          actif: true,
          ...(input.type_site_id ? { type_site_id: input.type_site_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        site = { ...site, id: (data as { id: string }).id }
        persisted = true
      }

      queryClient.setQueryData<Site[]>(['sites'], (old) => (old ? [...old, site] : [site]))
      return { site, persisted }
    },
  })
}

/* ── `UpdateSiteInput` ET `useUpdateSite` SONT PARTIS ─────────────────────────────────────────
   Cette mutation réécrivait les treize colonnes d'un site d'un coup, formulaire d'édition complet
   à l'appui. Elle n'avait plus AUCUN lecteur avant même le chantier du 09/09/2026 : la fiche site
   n'écrit que par `useUpdateSitePartiel` ci-dessous, champ par champ. Trois de ses colonnes
   (`surface_m2`, `annee_construction`, `date_derniere_ag`) sont d'ailleurs vides sur les 6 374
   sites — relevé du 09/09 — ce qui dit assez que ce formulaire n'a jamais servi. */

/**
 * Colonnes réellement modifiables de `sites`.
 *
 * Volontairement PAS `Partial<Site>` : `Site` mélange des colonnes et des champs calculés
 * (`compte_nom`, `nb_compteurs`, `type_site` qui est le libellé du type et non sa clé). Les
 * envoyer dans un UPDATE fait répondre 400 à PostgREST — une erreur que le typage doit
 * attraper à la compilation plutôt qu'un utilisateur en production.
 */
export type PatchSite = Partial<{
  nom: string
  adresse: string | null
  ville: string | null
  code_postal: string | null
  type_site_id: string | null
  annee_construction: number | null
  surface_m2: number | null
  date_derniere_ag: string | null
  latitude: number | null
  longitude: number | null
  proprietaire_id: string | null
  actif: boolean
}>

/** Mise à jour partielle -- contrairement à l’ancien `useUpdateSite` retiré ci-dessus,
 * ne touche que les champs fournis. À utiliser pour l'édition inline (un champ à la fois). */
export function useUpdateSitePartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchSite }) => {
      const { error } = await supabase.from('sites').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    // Attendre l'invalidation : le champ ne se referme qu'une fois la valeur relue, sinon il
    // repasse une fraction de seconde par l'ancienne valeur et donne l'impression d'un echec.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sites'] }),
  })
}

export function normalizeTexte(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export type SiteMatch = { kind: 'auto'; site: Site } | { kind: 'ambiguous'; candidates: Site[] } | { kind: 'new' }

/**
 * Détermine si un compteur en cours de création correspond à un site existant du compte
 * (même ville + code postal), à un groupe de sites ambigu à faire trancher par l'utilisateur,
 * ou à aucun site connu (nouveau site à créer).
 */
export function matchSitesPourCompteur(sites: Site[], compteId: string, ville: string, codePostal: string): SiteMatch {
  const sitesDuCompte = sites.filter((s) => s.compte_id === compteId)
  const villeN = normalizeTexte(ville)
  const cpN = codePostal.trim()

  if (!villeN && !cpN) {
    return sitesDuCompte.length > 0 ? { kind: 'ambiguous', candidates: sitesDuCompte } : { kind: 'new' }
  }

  const exact = sitesDuCompte.filter((s) => normalizeTexte(s.ville) === villeN && s.code_postal.trim() === cpN)
  if (exact.length === 1) return { kind: 'auto', site: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact }

  const partiel = sitesDuCompte.filter((s) => (cpN && s.code_postal.trim() === cpN) || (villeN && normalizeTexte(s.ville) === villeN))
  if (partiel.length > 0) return { kind: 'ambiguous', candidates: partiel }

  return { kind: 'new' }
}

/* ── `useDeleteSite` EST PARTI AVEC LA FICHE SITE ────────────────────────────────────────────
   Son seul appelant était `SiteDetail.tsx`, supprimé le 10/09/2026 quand `/sites/:id` est devenu
   une redirection. Son bouton avait déjà été retiré de l'écran la veille : depuis que
   `compteurs.site_id` est en `on delete set null` sur une colonne `not null`, supprimer un site
   qui porte un compteur remonte une erreur PostgreSQL brute — 6 341 sites sur 6 378.

   On ne supprime plus un regroupement d'adresse à la main. Il se vide quand on déplace ses
   compteurs, et la table partira d'un coup. */

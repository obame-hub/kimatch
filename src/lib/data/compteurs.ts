import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Compteur } from '@/types/domain'
import { fetchComptesVisibles, fetchSitesVisiblesIds, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawCompteurElec {
  segment: string | null
  tension: string | null
  tarif_distribution: string | null
  conso_base_mwh: number | null
  conso_hp_mwh: number | null
  conso_hc_mwh: number | null
  conso_hpe_mwh: number | null
  conso_hce_mwh: number | null
  conso_hph_mwh: number | null
  conso_hch_mwh: number | null
  conso_pointe_mwh: number | null
  puissance_base_kva: number | null
  puissance_hp_kva: number | null
  puissance_hc_kva: number | null
  puissance_hpe_kva: number | null
  puissance_hce_kva: number | null
  puissance_hph_kva: number | null
  puissance_hch_kva: number | null
  puissance_pointe_kva: number | null
}

interface RawCompteurGaz {
  car_mwh: number | null
  profil_consommation: string | null
  tarif_distribution: string | null
  zone_tarifaire: string | null
}

interface RawCompteur {
  id: string
  site_id: string
  numero_point: string
  libelle: string | null
  actif: boolean
  consommation_annuelle_mwh: number | null
  synchro_eneo: boolean
  date_derniere_synchro_eneo: string | null
  proprietaire_id: string | null
  type_utilisation_compteur_id: string | null
  responsable_contact_id: string | null
  contact_conseil_syndical_id: string | null
  type_energie: { code: string } | null
  type_utilisation: { libelle: string } | null
  site: { nom: string } | null
  responsable_contact: { prenom: string; nom: string } | null
  contact_conseil_syndical: { prenom: string; nom: string } | null
  compteurs_electricite: RawCompteurElec | RawCompteurElec[] | null
  compteurs_gaz: RawCompteurGaz | RawCompteurGaz[] | null
  proprietaire: { prenom: string; nom: string } | null
  date_creation: string
  date_modification: string
  fournisseur_actuel_compte_id: string | null
  fournisseur_actuel: { nom: string } | null
  date_echeance?: string | null
}

const first = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

const CONSO_KEYS = ['base', 'hp', 'hc', 'hpe', 'hce', 'hph', 'hch', 'pointe'] as const

function classeMap(elec: RawCompteurElec, prefix: 'conso' | 'puissance', suffix: 'mwh' | 'kva'): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of CONSO_KEYS) {
    const key = `${prefix}_${k}_${suffix}` as keyof RawCompteurElec
    const v = elec[key] as number | null
    if (v != null) out[k.toUpperCase()] = v
  }
  return out
}

/**
 * @param siteIds Ne charger que les compteurs de ces sites. Les compteurs n'ont pas de `compte_id`
 *   direct — on passe par les sites du compte. Évite de tirer les 7884 compteurs pour en afficher
 *   quelques-uns sur une fiche.
 */
async function fetchCompteurs(siteIds?: string[]): Promise<Compteur[]> {
  try {
    if (siteIds && siteIds.length === 0) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restreindre = (q: any) => (siteIds ? q.in('site_id', siteIds) : q)
    const data = await fetchAllRows<RawCompteur>(
      'compteurs',
      // `*` plutôt qu'une liste de colonnes fixe : `date_echeance` vient d'être ajoutée par
      // migration et peut ne pas encore exister en prod au moment du déploiement -- un select
      // nommé sur une colonne absente ferait échouer la requête (400) pour TOUS les compteurs.
      '*, type_energie:types_energies(code), type_utilisation:types_utilisations_compteur(libelle), site:sites(nom), compteurs_electricite(*), compteurs_gaz(*), proprietaire:profils!compteurs_proprietaire_id_fkey(prenom, nom), fournisseur_actuel:comptes!compteurs_fournisseur_actuel_compte_id_fkey(nom), responsable_contact:contacts!compteurs_responsable_contact_id_fkey(prenom, nom), contact_conseil_syndical:contacts!compteurs_contact_conseil_syndical_id_fkey(prenom, nom)',
      restreindre,
    )

    const comptesVisibles = await fetchComptesVisibles()
    const sitesVisibles = await fetchSitesVisiblesIds(comptesVisibles)

    return filterVisibles(data, sitesVisibles, (c) => c.site_id).map((c) => {
      const elec = first(c.compteurs_electricite)
      const gaz = first(c.compteurs_gaz)
      return {
        id: c.id,
        site_id: c.site_id,
        site_nom: c.site?.nom ?? '',
        type_energie: (c.type_energie?.code?.toLowerCase() ?? 'electricite') as 'electricite' | 'gaz',
        numero_pdl: c.numero_point,
        utilisation: c.libelle ?? '',
        type_utilisation_compteur_id: c.type_utilisation_compteur_id,
        type_utilisation_compteur: c.type_utilisation?.libelle ?? null,
        statut: c.actif ? 'actif' : 'inactif',
        consommation_annuelle_mwh: c.consommation_annuelle_mwh,
        synchro_eneo: c.synchro_eneo,
        date_derniere_synchro_eneo: c.date_derniere_synchro_eneo,
        proprietaire_id: c.proprietaire_id ?? null,
        proprietaire_nom: c.proprietaire ? `${c.proprietaire.prenom} ${c.proprietaire.nom}` : null,
        date_creation: c.date_creation,
        date_modification: c.date_modification,
        fournisseur_actuel_compte_id: c.fournisseur_actuel_compte_id,
        fournisseur_actuel_nom: c.fournisseur_actuel?.nom ?? null,
        responsable_contact_id: c.responsable_contact_id,
        responsable_contact_nom: c.responsable_contact ? `${c.responsable_contact.prenom} ${c.responsable_contact.nom}` : null,
        contact_conseil_syndical_id: c.contact_conseil_syndical_id,
        contact_conseil_syndical_nom: c.contact_conseil_syndical ? `${c.contact_conseil_syndical.prenom} ${c.contact_conseil_syndical.nom}` : null,
        date_echeance: c.date_echeance ?? null,
        ...(elec
          ? {
              segment: elec.segment,
              tension: elec.tension,
              tarif_distribution: elec.tarif_distribution,
              consoParClasseMwh: classeMap(elec, 'conso', 'mwh'),
              puissanceParClasseKva: classeMap(elec, 'puissance', 'kva'),
            }
          : {}),
        ...(gaz
          ? {
              car_mwh: gaz.car_mwh,
              profil_consommation: gaz.profil_consommation,
              tarif_distribution: gaz.tarif_distribution,
              zone_tarifaire: gaz.zone_tarifaire,
            }
          : {}),
      }
    })
  } catch (error) {
    console.error('fetchCompteurs', error)
    return []
  }
}

export function useCompteurs() {
  return useQuery({ queryKey: ['compteurs'], queryFn: () => fetchCompteurs() })
}

/** Compteurs des sites donnés -- pour les fiches de détail. */
export function useCompteursParSites(siteIds: string[] | undefined) {
  const cle = [...(siteIds ?? [])].sort()
  return useQuery({
    queryKey: ['compteurs', 'sites', cle],
    queryFn: () => fetchCompteurs(cle),
    enabled: !!siteIds,
  })
}

interface GrdElecData {
  segment?: string | null
  tension?: string | null
  tarif_distribution?: string | null
  consoParClasseMwh?: Record<string, number>
  puissanceParClasseKva?: Record<string, number>
}

interface GrdGazData {
  car_mwh?: number | null
  profil_consommation?: string | null
  tarif_distribution?: string | null
  zone_tarifaire?: string | null
}

interface CreateCompteurInput {
  site_id: string
  site_nom: string
  type_energie_id: string | null
  type_energie: 'electricite' | 'gaz'
  numero_pdl: string
  utilisation: string
  type_utilisation_compteur_id?: string | null
  consommation_annuelle_mwh?: number | null
  date_echeance?: string | null
  fournisseur_actuel_compte_id?: string | null
  fournisseur_actuel_nom?: string | null
  responsable_contact_id?: string | null
  responsable_contact_nom?: string | null
  grdElec?: GrdElecData
  grdGaz?: GrdGazData
  /** true uniquement pour une vraie synchro Enedis/GRDF automatisée -- toujours absent/false pour
   * des caractéristiques techniques saisies à la main (via PdlDraftRows), qui empruntent le même
   * conduit grdElec/grdGaz sans pour autant constituer une synchro réelle. */
  synchroReelle?: boolean
}

/** Dédoublonnage par égalité EXACTE du numéro de PDL (pas de normalisation) -- même règle que
 * Tools. Simple alerte non bloquante, jamais un blocage dur. */
export function findCompteurByNumero(compteurs: Compteur[], numeroPdl: string): Compteur | null {
  const n = numeroPdl.trim()
  if (!n) return null
  return compteurs.find((c) => c.numero_pdl === n) ?? null
}

/** Format PDL (14 chiffres, PRM électricité) ou PCE gaz -- même regex que Tools, mais toujours en
 * alerte visible, jamais en blocage (contrairement au chemin extraction IA de Tools qui bloque dur
 * sur ce même motif).
 * ⚠️ Un PCE gaz fait le plus souvent 14 chiffres lui aussi (vu en réel : PCE 19145151868513), et
 * non « GI + 6 chiffres » comme le laissait entendre l'ancien commentaire — les deux formes sont
 * couvertes par la regex, mais ne pas se fier au préfixe GI pour distinguer gaz et électricité. */
export const PDL_FORMAT_RE = /^(\d{14}|GI\d{6})$/

interface CreateCompteurResult {
  compteur: Compteur
  persisted: boolean
}

export function classeInsertRow(prefix: 'conso' | 'puissance', suffix: 'mwh' | 'kva', values?: Record<string, number>) {
  const row: Record<string, number> = {}
  if (!values) return row
  for (const [code, v] of Object.entries(values)) {
    row[`${prefix}_${code.toLowerCase()}_${suffix}`] = v
  }
  return row
}

export function useCreateCompteur() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateCompteurInput): Promise<CreateCompteurResult> => {
      const synchro = input.synchroReelle === true
      const now = synchro ? new Date().toISOString() : null
      let persisted = false
      let compteur: Compteur = {
        id: `local-${Date.now()}`,
        site_id: input.site_id,
        site_nom: input.site_nom,
        type_energie: input.type_energie,
        numero_pdl: input.numero_pdl,
        utilisation: input.utilisation,
        type_utilisation_compteur_id: input.type_utilisation_compteur_id ?? null,
        type_utilisation_compteur: null,
        statut: 'actif',
        consommation_annuelle_mwh: input.consommation_annuelle_mwh ?? null,
        synchro_eneo: synchro,
        date_derniere_synchro_eneo: now,
        proprietaire_id: null,
        date_echeance: input.date_echeance ?? null,
        fournisseur_actuel_compte_id: input.fournisseur_actuel_compte_id ?? null,
        fournisseur_actuel_nom: input.fournisseur_actuel_nom ?? null,
        responsable_contact_id: input.responsable_contact_id ?? null,
        responsable_contact_nom: input.responsable_contact_nom ?? null,
        ...(input.grdElec ? { segment: input.grdElec.segment, tension: input.grdElec.tension, tarif_distribution: input.grdElec.tarif_distribution, consoParClasseMwh: input.grdElec.consoParClasseMwh, puissanceParClasseKva: input.grdElec.puissanceParClasseKva } : {}),
        ...(input.grdGaz ? { car_mwh: input.grdGaz.car_mwh, profil_consommation: input.grdGaz.profil_consommation, tarif_distribution: input.grdGaz.tarif_distribution, zone_tarifaire: input.grdGaz.zone_tarifaire } : {}),
      }

      const { data, error } = await supabase
        .from('compteurs')
        .insert({
          site_id: input.site_id,
          numero_point: input.numero_pdl,
          libelle: input.utilisation,
          actif: true,
          consommation_annuelle_mwh: input.consommation_annuelle_mwh ?? null,
          synchro_eneo: synchro,
          date_derniere_synchro_eneo: now,
          type_utilisation_compteur_id: input.type_utilisation_compteur_id ?? null,
          date_echeance: input.date_echeance ?? null,
          fournisseur_actuel_compte_id: input.fournisseur_actuel_compte_id ?? null,
          responsable_contact_id: input.responsable_contact_id ?? null,
          ...(input.type_energie_id ? { type_energie_id: input.type_energie_id } : {}),
        })
        .select('id')
        .single()

      if (!error && data) {
        const compteurId = (data as { id: string }).id
        compteur = { ...compteur, id: compteurId }
        persisted = true

        if (input.grdElec) {
          await supabase.from('compteurs_electricite').insert({
            compteur_id: compteurId,
            segment: input.grdElec.segment ?? null,
            tension: input.grdElec.tension ?? null,
            tarif_distribution: input.grdElec.tarif_distribution ?? null,
            ...classeInsertRow('conso', 'mwh', input.grdElec.consoParClasseMwh),
            ...classeInsertRow('puissance', 'kva', input.grdElec.puissanceParClasseKva),
          })
        }
        if (input.grdGaz) {
          await supabase.from('compteurs_gaz').insert({
            compteur_id: compteurId,
            car_mwh: input.grdGaz.car_mwh ?? null,
            profil_consommation: input.grdGaz.profil_consommation ?? null,
            tarif_distribution: input.grdGaz.tarif_distribution ?? null,
            zone_tarifaire: input.grdGaz.zone_tarifaire ?? null,
          })
        }
      }

      queryClient.setQueryData<Compteur[]>(['compteurs'], (old) => (old ? [...old, compteur] : [compteur]))
      return { compteur, persisted }
    },
  })
}

export interface UpdateCompteurInput {
  id: string
  utilisation: string
  consommation_annuelle_mwh: number | null
  proprietaire_id: string | null
  type_utilisation_compteur_id?: string | null
}

/** Rattachement PDL depuis la création d'un contact (si rôle Décisionnaire/Conseil syndical) --
 * écrit sur `compteurs.responsable_contact_id` ou `contact_conseil_syndical_id` selon le rôle,
 * les deux colonnes existant déjà et gardées distinctes (voir PDL.Responsable__c /
 * Contact_conseil_syndical__c côté Tools). */
export function useAssignCompteurContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ compteurIds, contactId, field }: { compteurIds: string[]; contactId: string; field: 'responsable_contact_id' | 'contact_conseil_syndical_id' }) => {
      if (compteurIds.length === 0) return
      const { error } = await supabase.from('compteurs').update({ [field]: contactId }).in('id', compteurIds)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compteurs'] }),
  })
}

export function useUpdateCompteur() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateCompteurInput) => {
      const { error } = await supabase
        .from('compteurs')
        .update({
          libelle: input.utilisation,
          consommation_annuelle_mwh: input.consommation_annuelle_mwh,
          proprietaire_id: input.proprietaire_id,
          ...(input.type_utilisation_compteur_id !== undefined ? { type_utilisation_compteur_id: input.type_utilisation_compteur_id } : {}),
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compteurs'] }),
  })
}

export interface SyncCompteurElecResult {
  segment?: string | null
  tensionLivraison?: string | null
  fta?: string | null
  consoParClasseMwh?: Record<string, number> | null
  puissancesParClasse?: Record<string, number> | null
  consoTotaleMwh?: number | null
  periodeDebut?: string | null
  periodeFin?: string | null
}

export function useSyncCompteurElec() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ compteurId, result }: { compteurId: string; result: SyncCompteurElecResult }) => {
      const now = new Date().toISOString()

      const { error: eCompteur } = await supabase
        .from('compteurs')
        .update({
          synchro_eneo: true,
          date_derniere_synchro_eneo: now,
          ...(result.consoTotaleMwh != null ? { consommation_annuelle_mwh: result.consoTotaleMwh } : {}),
        })
        .eq('id', compteurId)
      if (eCompteur) throw new Error(eCompteur.message)

      const { error: eElec } = await supabase.from('compteurs_electricite').upsert(
        {
          compteur_id: compteurId,
          segment: result.segment ?? null,
          tension: result.tensionLivraison ?? null,
          tarif_distribution: result.fta ?? null,
          ...classeInsertRow('conso', 'mwh', result.consoParClasseMwh ?? undefined),
          ...classeInsertRow('puissance', 'kva', result.puissancesParClasse ?? undefined),
        },
        { onConflict: 'compteur_id' },
      )
      if (eElec) throw new Error(eElec.message)

      if (result.consoParClasseMwh && result.periodeDebut && result.periodeFin) {
        await supabase.from('consommations').delete().eq('compteur_id', compteurId).eq('source', 'Enedis')
        const rows = Object.entries(result.consoParClasseMwh)
          .filter(([, v]) => v > 0)
          .map(([classe, v]) => ({
            compteur_id: compteurId,
            date_debut_periode: result.periodeDebut as string,
            date_fin_periode: result.periodeFin as string,
            quantite: v,
            unite: 'MWh',
            poste_tarifaire: classe,
            type_valeur: 'MESUREE',
            source: 'Enedis',
            commentaire: null,
          }))
        if (rows.length) {
          const { error: eConso } = await supabase.from('consommations').insert(rows)
          if (eConso) throw new Error(eConso.message)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compteurs'] })
      queryClient.invalidateQueries({ queryKey: ['consommations'] })
    },
  })
}

export interface SyncCompteurGazResult {
  carMwh?: number | null
  profil?: string | null
  tarif?: string | null
}

export function useSyncCompteurGaz() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ compteurId, result }: { compteurId: string; result: SyncCompteurGazResult }) => {
      const now = new Date().toISOString()

      const { error: eCompteur } = await supabase
        .from('compteurs')
        .update({
          synchro_eneo: true,
          date_derniere_synchro_eneo: now,
          ...(result.carMwh != null ? { consommation_annuelle_mwh: result.carMwh } : {}),
        })
        .eq('id', compteurId)
      if (eCompteur) throw new Error(eCompteur.message)

      const { error: eGaz } = await supabase.from('compteurs_gaz').upsert(
        {
          compteur_id: compteurId,
          car_mwh: result.carMwh ?? null,
          profil_consommation: result.profil ?? null,
          tarif_distribution: result.tarif ?? null,
        },
        { onConflict: 'compteur_id' },
      )
      if (eGaz) throw new Error(eGaz.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compteurs'] })
    },
  })
}

export function useDeleteCompteur() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compteurs').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compteurs'] }),
  })
}

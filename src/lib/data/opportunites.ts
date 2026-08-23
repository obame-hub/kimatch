import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import type { Opportunite } from '@/types/domain'

/**
 * L'opportunité, entre le patrimoine et la recommandation.
 *
 * Mémo de Michel, 23/08/2026 : « Piste / Portefeuille / Demande entrante / Partenaire → Opportunité
 * → Recommandation. Une Opportunité correspond à un potentiel commercial concret. »
 *
 * CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT PAS. Elle rassemble les prérequis — compte, contact,
 * périmètre, mandat, accord du client — et rien de plus : le pricing, les consultations et les
 * marges restent à la recommandation. C'est la raison d'être de la règle de conversion : on ne crée
 * une recommandation que quand il n'y a plus rien à rassembler.
 */

interface RawOpportunite {
  id: string
  reference: string | null
  origine: string | null
  type_opportunite: string | null
  compte_id: string | null
  contact_id: string | null
  piste_id: string | null
  signal_id: string | null
  signal_libelle: string | null
  qualification_fin: string | null
  motif_cloture: string | null
  date_cloture: string | null
  date_reactivation: string | null
  accord_client: boolean | null
  prochaine_action: string | null
  prochaine_action_echeance: string | null
  prochaine_action_faite_le: string | null
  score_maturite: number | null
  commentaire: string | null
  proprietaire_id: string | null
  date_creation: string
  date_modification: string
  statut: { code: string; libelle: string } | null
  compte: { nom: string } | null
  contact: { prenom: string; nom: string } | null
  proprietaire: { prenom: string; nom: string } | null
}

interface RawLien {
  opportunite_id: string
  site_id?: string
  compteur_id?: string
}

async function fetchOpportunites(opportuniteId?: string): Promise<Opportunite[]> {
  try {
    const lignes = await fetchAllRows<RawOpportunite>(
      'opportunites',
      // `*` et non une liste nommée : les colonnes viennent de la migration 20260823100000 et
      // seraient absentes tant qu'elle n'est pas appliquée. Un select qui nomme une colonne absente
      // renvoie 400 et fait échouer le chargement de TOUTES les opportunités.
      '*, statut:statuts_opportunites(code, libelle), compte:comptes(nom), contact:contacts(prenom, nom), proprietaire:profils!opportunites_proprietaire_id_fkey(prenom, nom)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => (opportuniteId ? q.eq('id', opportuniteId) : q.order('date_creation', { ascending: false })),
    )
    if (lignes.length === 0) return []

    const ids = lignes.map((o) => o.id)
    // Le périmètre et les recommandations, en trois requêtes plutôt qu'une par opportunité.
    const [sites, compteurs, recos] = await Promise.all([
      fetchAllRows<RawLien>('opportunites_sites', 'opportunite_id, site_id',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => q.in('opportunite_id', ids)),
      fetchAllRows<RawLien>('opportunites_compteurs', 'opportunite_id, compteur_id',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => q.in('opportunite_id', ids)),
      fetchAllRows<{ id: string; opportunite_id: string | null }>('recommandations', 'id, opportunite_id',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => q.in('opportunite_id', ids)),
    ])

    const parOpp = <T extends RawLien>(liste: T[], cle: 'site_id' | 'compteur_id') => {
      const m = new Map<string, string[]>()
      for (const l of liste) {
        const v = l[cle]
        if (!v) continue
        m.set(l.opportunite_id, [...(m.get(l.opportunite_id) ?? []), v])
      }
      return m
    }
    const sitesParOpp = parOpp(sites, 'site_id')
    const compteursParOpp = parOpp(compteurs, 'compteur_id')
    const recosParOpp = new Map<string, string[]>()
    for (const r of recos) {
      if (!r.opportunite_id) continue
      recosParOpp.set(r.opportunite_id, [...(recosParOpp.get(r.opportunite_id) ?? []), r.id])
    }

    const comptesVisibles = await fetchComptesVisibles()
    // Une opportunité sans compte reste visible : c'est justement l'état d'une opportunité qui
    // démarre, et la cacher empêcherait de lui en rattacher un.
    const visibles = filterVisibles(lignes, comptesVisibles, (o) => o.compte_id ?? '')

    return visibles.map((o) => ({
      id: o.id,
      reference: o.reference,
      origine: o.origine,
      type_opportunite: o.type_opportunite,
      compte_id: o.compte_id,
      compte_nom: o.compte?.nom ?? '',
      contact_id: o.contact_id,
      contact_nom: o.contact ? `${o.contact.prenom} ${o.contact.nom}`.trim() : '',
      piste_id: o.piste_id,
      signal_id: o.signal_id,
      statut: o.statut?.code ?? 'NOUVELLE',
      statut_libelle: o.statut?.libelle ?? 'Nouvelle',
      qualification_fin: o.qualification_fin,
      motif_cloture: o.motif_cloture,
      date_cloture: o.date_cloture,
      date_reactivation: o.date_reactivation,
      accord_client: o.accord_client ?? false,
      prochaine_action: o.prochaine_action,
      prochaine_action_echeance: o.prochaine_action_echeance,
      prochaine_action_faite_le: o.prochaine_action_faite_le,
      signal_libelle: o.signal_libelle ?? null,
      score_maturite: o.score_maturite,
      commentaire: o.commentaire,
      proprietaire_id: o.proprietaire_id,
      proprietaire_nom: o.proprietaire ? `${o.proprietaire.prenom} ${o.proprietaire.nom}`.trim() : '',
      date_creation: o.date_creation,
      date_modification: o.date_modification,
      site_ids: sitesParOpp.get(o.id) ?? [],
      compteur_ids: compteursParOpp.get(o.id) ?? [],
      recommandation_ids: recosParOpp.get(o.id) ?? [],
    }))
  } catch (error) {
    console.error('fetchOpportunites', error)
    return []
  }
}

export function useOpportunites() {
  return useQuery({ queryKey: ['opportunites'], queryFn: () => fetchOpportunites() })
}

export function useOpportunite(id: string | undefined) {
  return useQuery({
    queryKey: ['opportunites', 'une', id],
    queryFn: async () => (await fetchOpportunites(id as string))[0] ?? null,
    enabled: !!id,
  })
}

/** Les statuts, dans leur ordre métier. */
export function useStatutsOpportunites() {
  return useQuery({
    queryKey: ['statuts_opportunites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuts_opportunites')
        .select('id, code, libelle, ordre, est_cloture')
        .order('ordre')
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string; code: string; libelle: string; ordre: number; est_cloture: boolean }[]
    },
  })
}

/**
 * LES ORIGINES, telles que Michel les énumère : « d'une Piste convertie ; du portefeuille KiWee,
 * lorsqu'un signal positif est détecté ; d'une demande entrante ; d'une demande ou opportunité
 * apportée par un partenaire ».
 */
export const ORIGINES_OPPORTUNITE = [
  { code: 'PISTE', libelle: 'Piste convertie' },
  { code: 'PORTEFEUILLE', libelle: 'Portefeuille KiWee' },
  { code: 'DEMANDE_ENTRANTE', libelle: 'Demande entrante' },
  { code: 'PARTENAIRE', libelle: 'Partenaire' },
] as const

/**
 * LES QUALIFICATIONS DE FIN. « Convertie | Non qualifiée | Perdue | Reportée | Annulée. »
 *
 * `convertie` porte la règle : elle seule ouvre la création d'une recommandation.
 */
export const QUALIFICATIONS_FIN = [
  { code: 'CONVERTIE', libelle: 'Convertie', convertie: true },
  { code: 'NON_QUALIFIEE', libelle: 'Non qualifiée', convertie: false },
  { code: 'PERDUE', libelle: 'Perdue', convertie: false },
  { code: 'REPORTEE', libelle: 'Reportée', convertie: false },
  { code: 'ANNULEE', libelle: 'Annulée', convertie: false },
] as const

export type PatchOpportunite = Partial<{
  origine: string | null
  type_opportunite: string | null
  compte_id: string | null
  contact_id: string | null
  statut_id: string | null
  qualification_fin: string | null
  motif_cloture: string | null
  date_cloture: string | null
  date_reactivation: string | null
  accord_client: boolean
  prochaine_action: string | null
  prochaine_action_echeance: string | null
  prochaine_action_faite_le: string | null
  signal_libelle: string | null
  commentaire: string | null
  proprietaire_id: string | null
}>

export function useMajOpportunite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchOpportunite }) => {
      const { error } = await supabase
        .from('opportunites')
        .update({ ...patch, date_modification: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(messageDErreur(error.message))
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['opportunites'] }) },
  })
}

export function useCreerOpportunite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      compte_id: string | null
      contact_id: string | null
      origine: string | null
      type_opportunite: string | null
      statut_id: string | null
      commentaire: string | null
      /** Le signal constaté, quand il n'est pas un signal enregistré. Prérequis de création. */
      signal_libelle?: string | null
      signal_id?: string | null
      site_ids?: string[]
      compteur_ids?: string[]
    }) => {
      const base = {
        compte_id: input.compte_id,
        contact_id: input.contact_id,
        origine: input.origine,
        type_opportunite: input.type_opportunite,
        ...(input.statut_id ? { statut_id: input.statut_id } : {}),
        ...(input.signal_id ? { signal_id: input.signal_id } : {}),
        commentaire: input.commentaire,
      }

      // UN SEUL CHAMP INCONNU FAIT ÉCHOUER TOUTE L'ÉCRITURE. PostgREST rejette l'insertion entière
      // quand la charge nomme une colonne absente. `signal_libelle` arrive par la migration
      // 20260823150000 : tant qu'elle n'est pas appliquée, on retente sans elle plutôt que de
      // laisser la création tomber, et le signal rejoint le commentaire pour ne pas être perdu.
      let reponse = await supabase
        .from('opportunites')
        .insert({ ...base, ...(input.signal_libelle ? { signal_libelle: input.signal_libelle } : {}) })
        .select('id')
        .single()
      if (reponse.error && input.signal_libelle && /signal_libelle/.test(reponse.error.message)) {
        const commentaire = [input.signal_libelle, input.commentaire].filter(Boolean).join(' — ')
        reponse = await supabase.from('opportunites').insert({ ...base, commentaire }).select('id').single()
      }
      const { data, error } = reponse
      if (error) throw new Error(messageDErreur(error.message))
      const id = (data as { id: string }).id

      // Le périmètre part avec la création quand on l'a déjà : une opportunité créée depuis une
      // fiche compte connaît ses sites.
      if (input.site_ids?.length) {
        await supabase.from('opportunites_sites').insert(input.site_ids.map((s) => ({ opportunite_id: id, site_id: s })))
      }
      if (input.compteur_ids?.length) {
        await supabase.from('opportunites_compteurs').insert(input.compteur_ids.map((k) => ({ opportunite_id: id, compteur_id: k })))
      }
      return id
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['opportunites'] }) },
  })
}

/** Ajoute ou retire un site du périmètre. */
export function useMajPerimetreOpportunite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input:
      | { action: 'ajouter'; table: 'sites' | 'compteurs'; opportuniteId: string; cibleId: string }
      | { action: 'retirer'; table: 'sites' | 'compteurs'; opportuniteId: string; cibleId: string }) => {
      const table = input.table === 'sites' ? 'opportunites_sites' : 'opportunites_compteurs'
      const colonne = input.table === 'sites' ? 'site_id' : 'compteur_id'
      if (input.action === 'ajouter') {
        const { error } = await supabase
          .from(table)
          .insert({ opportunite_id: input.opportuniteId, [colonne]: input.cibleId })
        // Un doublon n'est pas une erreur : la contrainte d'unicité fait son travail, le périmètre
        // contient déjà cette cible.
        if (error && !/duplicate key/i.test(error.message)) throw new Error(messageDErreur(error.message))
      } else {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('opportunite_id', input.opportuniteId)
          .eq(colonne, input.cibleId)
        if (error) throw new Error(messageDErreur(error.message))
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['opportunites'] }) },
  })
}

/**
 * Traduit un refus de PostgREST en phrase actionnable.
 *
 * Même motif que sur les prix et les dépôts de fichiers : tant que la migration 20260823100000
 * n'est pas appliquée, toute écriture échoue sur une table absente, et un message brut n'apprend
 * rien à celui qui le lit.
 */
function messageDErreur(brut: string): string {
  if (/relation .* does not exist|42P01/i.test(brut)) {
    return `La table des opportunités n'existe pas encore : la migration 20260823100000 reste à appliquer. (${brut})`
  }
  if (/column .* does not exist|PGRST204|42703|schema cache/i.test(brut)) {
    return `Colonne absente : la migration 20260823100000 reste à appliquer. (${brut})`
  }
  if (/violates row-level security|42501/i.test(brut)) {
    return `Écriture refusée par les droits. (${brut})`
  }
  return brut
}

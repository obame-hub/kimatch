import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contrat } from '@/types/domain'
import { notifySlack } from '@/lib/data/slackSettings'
import { buildContratCreatedBlocks } from '@/lib/slackTemplates'
import { notifyEmail } from '@/lib/data/emailSettings'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawContrat {
  id: string
  id_salesforce: string | null
  compte_id: string | null
  site_id: string | null
  fournisseur_compte_id: string | null
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  duree_mois?: number | null
  date_reception_souhaitee?: string | null
  preavis_resiliation_jours: number | null
  proprietaire_id: string | null
  docusign_envelope_id: string | null
  date_envoi_signature: string | null
  date_signature: string | null
  statut_signature: string | null
  contact_signataire_id: string | null
  prix_molecule_eur_mwh: number | null
  type_prix: string | null
  clause_tacite_reconduction: boolean | null
  clause_renegociation_anticipee: boolean | null
  clause_engagement_consommation: boolean | null
  clause_energie_verte: boolean | null
  clause_indexation_prix: boolean | null
  clause_penalites_resiliation: boolean | null
  interlocuteur_pricing_contact_id: string | null
  strategie_tarifaire?: string | null
  site: { nom: string } | null
  fournisseur: { nom: string } | null
  type_energie: { code: string } | null
  statut: { code: string } | null
  contact_signataire: { prenom: string; nom: string } | null
  interlocuteur_pricing: { prenom: string; nom: string } | null
  proprietaire: { prenom: string; nom: string } | null
  compte: { nom: string } | null
  date_creation: string
  date_modification: string
}

/** `compteId` restreint la lecture aux contrats d'un compte, jointure des compteurs comprise.
 *  Même motif que fetchMandats : une fiche compte ne doit pas payer les 1598 contrats du CRM. */
async function fetchContrats(compteId?: string, contratId?: string, listeSeule = false): Promise<Contrat[]> {
  try {
    const contrats = await fetchAllRows<RawContrat>(
      'contrats',
      // `*` plutôt qu'une liste de colonnes fixe : `strategie_tarifaire` vient d'être ajoutée
      // par migration et peut ne pas encore exister en prod au moment du déploiement.
      '*, site:sites(nom), fournisseur:comptes!contrats_fournisseur_compte_id_fkey(nom), compte:comptes!contrats_compte_id_fkey(nom), type_energie:types_energies(code), statut:statuts_contrats(code), contact_signataire:contacts!contrats_contact_signataire_id_fkey(prenom, nom), interlocuteur_pricing:contacts!contrats_interlocuteur_pricing_contact_id_fkey(prenom, nom), proprietaire:profils!contrats_proprietaire_id_fkey(prenom, nom)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => {
        if (contratId) return q.eq('id', contratId)
        return (compteId ? q.eq('compte_id', compteId) : q).order('date_debut', { ascending: false })
      },
    )
    const contratIds = contrats.map((c) => c.id)
    const cible = Boolean(compteId || contratId)
    if (cible && contratIds.length === 0) return []
    // Le tableau de bord ne lit que le statut d'un contrat : voir useContratsListe.
    const compteursRows = listeSeule ? [] : await fetchAllRows<{ id: string; contrat_id: string; compteur: { id: string; numero_point: string; libelle: string | null } | null }>(
      'contrats_compteurs',
      'id, contrat_id, compteur:compteurs(id, numero_point, libelle)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cible ? (q: any) => q.in('contrat_id', contratIds) : undefined,
    )

    const compteursParContrat = new Map<string, { id: string; contrat_compteur_id: string | null; numero_pdl: string; utilisation: string }[]>()
    for (const cc of compteursRows) {
      if (!cc.compteur) continue
      const list = compteursParContrat.get(cc.contrat_id) ?? []
      list.push({ id: cc.compteur.id, contrat_compteur_id: cc.id, numero_pdl: cc.compteur.numero_point, utilisation: cc.compteur.libelle ?? '' })
      compteursParContrat.set(cc.contrat_id, list)
    }

    // Le compte est la source de verite (decision Michel/William 31/07/2026), plus site_id --
    // filtrage de visibilite fait directement sur compte_id, independant des compteurs/sites.
    const comptesVisibles = await fetchComptesVisibles()

    return filterVisibles(contrats, comptesVisibles, (c) => c.compte_id).map((c) => ({
      id: c.id,
      id_salesforce: c.id_salesforce,
      compte_id: c.compte_id,
      compte_nom: c.compte?.nom ?? '',
      site_id: c.site_id,
      site_nom: c.site?.nom ?? '',
      fournisseur_compte_id: c.fournisseur_compte_id,
      fournisseur_nom: c.fournisseur?.nom ?? '',
      type_energie: (c.type_energie?.code?.toLowerCase() ?? 'electricite') as 'electricite' | 'gaz',
      reference_fournisseur: c.reference_fournisseur,
      date_debut: c.date_debut,
      date_fin: c.date_fin,
      duree_mois: c.duree_mois ?? null,
      date_reception_souhaitee: c.date_reception_souhaitee ?? null,
      preavis_resiliation_jours: c.preavis_resiliation_jours,
      statut: c.statut?.code ?? '',
      compteurs: compteursParContrat.get(c.id) ?? [],
      proprietaire_id: c.proprietaire_id ?? null,
      proprietaire_nom: c.proprietaire ? `${c.proprietaire.prenom} ${c.proprietaire.nom}` : null,
      contact_signataire_id: c.contact_signataire_id,
      contact_signataire_nom: c.contact_signataire ? `${c.contact_signataire.prenom} ${c.contact_signataire.nom}` : undefined,
      interlocuteur_pricing_contact_id: c.interlocuteur_pricing_contact_id,
      interlocuteur_pricing_nom: c.interlocuteur_pricing ? `${c.interlocuteur_pricing.prenom} ${c.interlocuteur_pricing.nom}` : null,
      docusign_envelope_id: c.docusign_envelope_id,
      date_creation: c.date_creation,
      date_modification: c.date_modification,
      date_envoi_signature: c.date_envoi_signature,
      date_signature: c.date_signature,
      statut_signature: c.statut_signature,
      prix_molecule_eur_mwh: c.prix_molecule_eur_mwh,
      type_prix: c.type_prix,
      strategie_tarifaire: c.strategie_tarifaire ?? null,
      clause_tacite_reconduction: c.clause_tacite_reconduction,
      clause_renegociation_anticipee: c.clause_renegociation_anticipee,
      clause_engagement_consommation: c.clause_engagement_consommation,
      clause_energie_verte: c.clause_energie_verte,
      clause_indexation_prix: c.clause_indexation_prix,
      clause_penalites_resiliation: c.clause_penalites_resiliation,
    }))
  } catch (error) {
    console.error('fetchContrats', error)
    return []
  }
}


/**
 * Un contrat lu par son identifiant.
 *
 * Les fiches le cherchaient avec `liste?.find(x => x.id === id)`, ce qui telechargeait la table
 * entiere pour en garder une ligne. Meme motif que useCompte et useSite.
 */
export function useContrat(contratId: string | undefined) {
  return useQuery({
    queryKey: ['contrats', 'un', contratId],
    queryFn: async () => (await fetchContrats(undefined, contratId as string))[0] ?? null,
    enabled: !!contratId,
  })
}
/** Contrats sans leurs PDL -- pour qui n'affiche que l'en-tete. */
export function useContratsListe() {
  return useQuery({ queryKey: ['contrats', 'liste'], queryFn: () => fetchContrats(undefined, undefined, true) })
}

export function useContrats() {
  return useQuery({ queryKey: ['contrats'], queryFn: () => fetchContrats() })
}

/** Contrats d'un seul compte, filtrés côté serveur. À préférer sur toute fiche. */
export function useContratsParCompte(compteId: string | undefined) {
  return useQuery({
    queryKey: ['contrats', 'compte', compteId],
    queryFn: () => fetchContrats(compteId as string),
    enabled: !!compteId,
  })
}

interface CreateContratInput {
  /** Optionnel : si absent, derive automatiquement du compte du site (compat ecrans existants). */
  compte_id?: string
  site_id: string
  site_nom: string
  fournisseur_compte_id: string | null
  fournisseur_nom: string
  type_energie_id: string | null
  type_energie: 'electricite' | 'gaz'
  statut_id: string | null
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  duree_mois?: number | null
  date_reception_souhaitee?: string | null
  compteur_ids: string[]
  compteurs: { id: string; numero_pdl: string; utilisation: string }[]
  contact_signataire_id: string | null
  contact_signataire_nom?: string
  type_prix?: string | null
  strategie_tarifaire?: string
  prix_molecule_eur_mwh?: number | null
  clauses?: Record<string, boolean>
  /** Opportunité dont découle la demande (Tools : le wizard part d'un opportunityId). */
  recommandation_id?: string | null
  /** Version (cotation) retenue qui a abouti à cette demande. */
  version_recommandation_id?: string | null
  /** Statut affiché côté cache local, le temps que la liste se rafraîchisse. */
  statut_code?: string
}

type CreateContratLocalCompteur = { id: string; contrat_compteur_id: string | null; numero_pdl: string; utilisation: string }

interface CreateContratResult {
  contrat: Contrat
  persisted: boolean
}

export function useCreateContrat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateContratInput): Promise<CreateContratResult> => {
      let persisted = false
      let compteId = input.compte_id ?? null
      if (!compteId) {
        const { data: siteRow } = await supabase.from('sites').select('compte_id').eq('id', input.site_id).single()
        compteId = (siteRow as { compte_id: string } | null)?.compte_id ?? null
      }
      let contrat: Contrat = {
        id: `local-${Date.now()}`,
        id_salesforce: null,
        compte_id: compteId,
        site_id: input.site_id,
        site_nom: input.site_nom,
        fournisseur_compte_id: input.fournisseur_compte_id,
        fournisseur_nom: input.fournisseur_nom,
        type_energie: input.type_energie,
        reference_fournisseur: input.reference_fournisseur,
        date_debut: input.date_debut,
        date_fin: input.date_fin,
        duree_mois: input.duree_mois ?? null,
        date_reception_souhaitee: input.date_reception_souhaitee ?? null,
        preavis_resiliation_jours: null,
        statut: input.statut_code ?? 'ACTIF',
        compteurs: input.compteurs.map((c): CreateContratLocalCompteur => ({ ...c, contrat_compteur_id: null })),
        proprietaire_id: null,
        contact_signataire_id: input.contact_signataire_id,
        contact_signataire_nom: input.contact_signataire_nom,
        docusign_envelope_id: null,
        date_envoi_signature: null,
        date_signature: null,
        statut_signature: null,
        type_prix: input.type_prix ?? null,
        prix_molecule_eur_mwh: input.prix_molecule_eur_mwh ?? null,
        ...(input.clauses ?? {}),
      }

      const { data, error } = await supabase
        .from('contrats')
        .insert({
          compte_id: compteId,
          site_id: input.site_id,
          fournisseur_compte_id: input.fournisseur_compte_id,
          reference_fournisseur: input.reference_fournisseur,
          date_debut: input.date_debut,
          date_fin: input.date_fin,
          duree_mois: input.duree_mois ?? null,
          date_reception_souhaitee: input.date_reception_souhaitee ?? null,
          type_prix: input.type_prix ?? null,
          strategie_tarifaire: input.strategie_tarifaire ?? 'marge_fixe',
          prix_molecule_eur_mwh: input.prix_molecule_eur_mwh ?? null,
          ...(input.clauses ?? {}),
          ...(input.recommandation_id ? { recommandation_id: input.recommandation_id } : {}),
          ...(input.version_recommandation_id ? { version_recommandation_id: input.version_recommandation_id } : {}),
          ...(input.type_energie_id ? { type_energie_id: input.type_energie_id } : {}),
          ...(input.statut_id ? { statut_id: input.statut_id } : {}),
          ...(input.contact_signataire_id ? { contact_signataire_id: input.contact_signataire_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        const contratId = (data as { id: string }).id
        contrat = { ...contrat, id: contratId }
        persisted = true
        if (input.compteur_ids.length > 0) {
          await supabase
            .from('contrats_compteurs')
            .insert(input.compteur_ids.map((compteur_id) => ({ contrat_id: contratId, compteur_id })))
        }
      }

      queryClient.setQueryData<Contrat[]>(['contrats'], (old) => (old ? [contrat, ...old] : [contrat]))

      const tpl = buildContratCreatedBlocks({
        siteName: contrat.site_nom,
        siteUrl: `${window.location.origin}/sites/${contrat.site_id}`,
        fournisseurName: contrat.fournisseur_nom,
        energyType: contrat.type_energie,
        dateDebut: contrat.date_debut,
        dateFin: contrat.date_fin,
        compteurs: contrat.compteurs.map((c) => ({ label: c.utilisation, numeroPdl: c.numero_pdl })),
        contratUrl: `${window.location.origin}/contrats/${contrat.id}`,
      })
      void notifySlack({ module: 'contrat', text: tpl.text, blocks: tpl.blocks })

      // Email de demande de contrat -- Tools en envoie un à chaque demande, Kimatch n'avait que
      // Slack. Destinataires configurables dans Paramètres (repris de l'export Tools : Erwan en
      // destinataire, William en copie).
      const periode = [contrat.date_debut, contrat.date_fin]
        .map((d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—'))
        .join(' → ')
      void notifyEmail(
        'contrat',
        { contractName: contrat.compte_nom || contrat.site_nom, supplierName: contrat.fournisseur_nom },
        [
          `Une demande de contrat vient d'être créée.`,
          ``,
          `Compte       : ${contrat.compte_nom || '—'}`,
          `Site         : ${contrat.site_nom || '—'}`,
          `Fournisseur  : ${contrat.fournisseur_nom || '—'}`,
          `Énergie      : ${contrat.type_energie === 'gaz' ? 'Gaz' : 'Électricité'}`,
          `Période      : ${periode}${contrat.duree_mois ? ` (${contrat.duree_mois} mois)` : ''}`,
          `Réception    : ${contrat.date_reception_souhaitee ? new Date(contrat.date_reception_souhaitee).toLocaleDateString('fr-FR') : '—'}`,
          `Signataire   : ${contrat.contact_signataire_nom ?? '—'}`,
          `Points de livraison : ${contrat.compteurs.length}`,
          ``,
          `${window.location.origin}/contrats/${contrat.id}`,
        ].join('\n'),
      )

      return { contrat, persisted }
    },
  })
}

export interface UpdateContratInput {
  id: string
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  proprietaire_id: string | null
  contact_signataire_id?: string | null
  docusign_envelope_id?: string | null
  date_envoi_signature?: string | null
  date_signature?: string | null
  statut_signature?: string | null
}

export function useUpdateContrat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateContratInput) => {
      const { error } = await supabase
        .from('contrats')
        .update({
          reference_fournisseur: input.reference_fournisseur,
          date_debut: input.date_debut,
          date_fin: input.date_fin,
          proprietaire_id: input.proprietaire_id,
          ...(input.contact_signataire_id !== undefined ? { contact_signataire_id: input.contact_signataire_id } : {}),
          ...(input.docusign_envelope_id !== undefined ? { docusign_envelope_id: input.docusign_envelope_id } : {}),
          ...(input.date_envoi_signature !== undefined ? { date_envoi_signature: input.date_envoi_signature } : {}),
          ...(input.date_signature !== undefined ? { date_signature: input.date_signature } : {}),
          ...(input.statut_signature !== undefined ? { statut_signature: input.statut_signature } : {}),
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['contrats'] }) },
  })
}

export function useDeleteContrat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contrats').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['contrats'] }) },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contrat } from '@/types/domain'
import { notifySlack } from '@/lib/data/slackSettings'
import { buildContratCreatedBlocks } from '@/lib/slackTemplates'
import { notifyEmail } from '@/lib/data/emailSettings'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import { mentionSignatureManuelle, statutMetierApresSignature } from '@/lib/signatureManuelleContrat'
import { relancer } from '@/lib/data/erreurLecture'

interface RawContrat {
  id: string
  id_salesforce: string | null
  compte_id: string | null
  site_id: string | null
  fournisseur_compte_id: string | null
  /** Notre numéro, CT-00001 — optionnel tant que la migration 20260903120000 n'est pas appliquée. */
  reference?: string | null
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  duree_mois?: number | null
  date_reception_souhaitee?: string | null
  preavis_resiliation_jours: number | null
  proprietaire_id: string | null
  recommandation_id: string | null
  docusign_envelope_id: string | null
  date_envoi_signature: string | null
  date_signature: string | null
  statut_signature: string | null
  contact_signataire_id: string | null
  prix_molecule_eur_mwh: number | null
  type_prix: string | null
  clause_tacite_reconduction: boolean | null
  date_declenchement_tacite?: string | null
  jours_alerte_tacite?: number | null
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
  avancement: { code: string; libelle: string } | null
  date_consultation: string | null
  nb_ouvertures: number | null
  date_resiliation: string | null
  commentaire: string | null
  date_validation: string | null
  valide_par_id: string | null
  valide_par: { prenom: string; nom: string } | null
  contact_signataire: { prenom: string; nom: string } | null
  interlocuteur_pricing: { prenom: string; nom: string } | null
  proprietaire: { prenom: string; nom: string } | null
  recommandation: { nom: string } | null
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
      '*, site:sites(nom), fournisseur:comptes!contrats_fournisseur_compte_id_fkey(nom), compte:comptes!contrats_compte_id_fkey(nom), type_energie:types_energies(code), statut:statuts_contrats(code), avancement:statuts_contrats_avancement(code, libelle), valide_par:profils!contrats_valide_par_id_fkey(prenom, nom), contact_signataire:contacts!contrats_contact_signataire_id_fkey(prenom, nom), interlocuteur_pricing:contacts!contrats_interlocuteur_pricing_contact_id_fkey(prenom, nom), proprietaire:profils!contrats_proprietaire_id_fkey(prenom, nom), recommandation:recommandations!contrats_recommandation_id_fkey(nom)',
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
      reference: c.reference ?? null,
      reference_fournisseur: c.reference_fournisseur,
      date_debut: c.date_debut,
      date_fin: c.date_fin,
      duree_mois: c.duree_mois ?? null,
      date_reception_souhaitee: c.date_reception_souhaitee ?? null,
      preavis_resiliation_jours: c.preavis_resiliation_jours,
      statut: c.statut?.code ?? '',
      /* LES DEUX CHEMINS, SÉPARÉS. `avancement` est le cycle de signature ; le cycle de vie ne
         figure pas ici parce qu'il ne se stocke pas — `statutVieContrat(date_debut, date_fin,
         aujourd'hui, date_resiliation)` le déduit à la lecture. */
      avancement: c.avancement?.code ?? null,
      avancement_libelle: c.avancement?.libelle ?? null,
      date_consultation: c.date_consultation ?? null,
      nb_ouvertures: c.nb_ouvertures ?? null,
      date_resiliation: c.date_resiliation ?? null,
      // Lu parce que la signature enregistrée à la main y AJOUTE sa mention plutôt que de
      // l'écraser : il faut donc savoir ce qu'il contient déjà.
      commentaire: c.commentaire ?? null,
      date_validation: c.date_validation ?? null,
      valide_par_id: c.valide_par_id ?? null,
      valide_par_nom: c.valide_par ? `${c.valide_par.prenom} ${c.valide_par.nom}` : null,
      compteurs: compteursParContrat.get(c.id) ?? [],
      proprietaire_id: c.proprietaire_id ?? null,
      proprietaire_nom: c.proprietaire ? `${c.proprietaire.prenom} ${c.proprietaire.nom}` : null,
      recommandation_id: c.recommandation_id ?? null,
      recommandation_nom: c.recommandation?.nom ?? null,
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
      date_declenchement_tacite: c.date_declenchement_tacite ?? null,
      jours_alerte_tacite: c.jours_alerte_tacite ?? null,
      clause_renegociation_anticipee: c.clause_renegociation_anticipee,
      clause_engagement_consommation: c.clause_engagement_consommation,
      clause_energie_verte: c.clause_energie_verte,
      clause_indexation_prix: c.clause_indexation_prix,
      clause_penalites_resiliation: c.clause_penalites_resiliation,
    }))
  } catch (error) {
    relancer('fetchContrats', error)
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

/**
 * LES CONTRATS ISSUS D'UNE RECOMMANDATION.
 *
 * Lecture légère et volontairement minimale : la fiche recommandation n'a besoin que de savoir
 * QU'UN contrat existe et de pouvoir l'ouvrir. Passer par `fetchContrats` aurait chargé les
 * compteurs et la visibilité pour afficher deux lignes.
 *
 * La visibilité n'est pas rejouée ici parce qu'il n'y a rien de plus à cacher : pour voir ce lien
 * il faut déjà être sur la fiche de la recommandation, et Michel/William ont tranché le 14/08/2026
 * que tous les commerciaux voient tous les comptes.
 */
export function useContratsDeRecommandation(recoId: string | undefined) {
  return useQuery({
    queryKey: ['contrats', 'recommandation', recoId],
    enabled: !!recoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contrats')
        .select('id, reference_fournisseur, date_debut, date_fin, date_signature, date_envoi_signature, statut_signature, docusign_envelope_id, date_creation, duree_mois, type_prix, fournisseur:comptes!contrats_fournisseur_compte_id_fkey(nom), statut:statuts_contrats(code)')
        .eq('recommandation_id', recoId as string)
        .eq('actif', true)
        .order('date_debut', { ascending: false })
      if (error) {
        console.error('useContratsDeRecommandation', error)
        return []
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((c: any) => ({
        id: c.id as string,
        reference_fournisseur: (c.reference_fournisseur ?? null) as string | null,
        date_debut: (c.date_debut ?? null) as string | null,
        date_fin: (c.date_fin ?? null) as string | null,
        date_signature: (c.date_signature ?? null) as string | null,
        /* LE SUIVI DE SIGNATURE EN DIRECT : le hero de la fiche recommandation interroge DocuSign
           avec ces trois-là — l'enveloppe pour savoir s'il y a quelque chose à demander, les deux
           dates pour dire depuis quand. Ajoutés le 18/09/2026. */
        date_envoi_signature: (c.date_envoi_signature ?? null) as string | null,
        docusign_envelope_id: (c.docusign_envelope_id ?? null) as string | null,
        date_creation: (c.date_creation ?? null) as string | null,
        statut_signature: (c.statut_signature ?? null) as string | null,
        /* CE QUE LE HERO DIT DU CONTRAT, au-delà de sa signature (William, 22/09/2026 : « utilise
           la zone blanche pour indiquer la durée, le fournisseur et le type de prix »).

           `duree_mois` EST PRESQUE TOUJOURS VIDE — 23 des 716 contrats issus d'une recommandation
           le portent, soit 3 %. Les deux dates, elles, sont remplies sur les 716. La durée se
           calcule donc, et ne se lit qu'en dernier recours : afficher la colonne stockée aurait
           laissé la case vide 97 fois sur 100. */
        duree_mois: (c.duree_mois ?? null) as number | null,
        type_prix: (c.type_prix ?? null) as string | null,
        fournisseur_nom: (c.fournisseur?.nom ?? '') as string,
        statut: (c.statut?.code ?? '') as string,
      }))
    },
  })
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

/**
 * Colonnes réellement modifiables de `contrats`, pour l'édition en place.
 *
 * Comme pour les sites, volontairement pas un `Partial<Contrat>` : le type de domaine porte des
 * champs joints (`compte_nom`, `site_nom`, `contact_signataire_nom`, `proprietaire_nom`) qui
 * n'existent pas comme colonnes et feraient répondre 400 à PostgREST.
 */
export type PatchContrat = Partial<{
  statut_id: string | null
  /** Le cycle de signature — Brouillon, Demandé, Réceptionné, Envoyé, Consulté, Signé. */
  statut_avancement_id: string | null
  /** La résiliation avant terme, seul état du cycle de vie qui ne se déduise pas des dates. */
  date_resiliation: string | null
  /** La validation, qui clôt le cycle de signature et ouvre le cycle de vie. */
  date_validation: string | null
  valide_par_id: string | null
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  preavis_resiliation_jours: number | null
  date_declenchement_tacite: string | null
  jours_alerte_tacite: number | null
  clause_tacite_reconduction: boolean | null
  proprietaire_id: string | null
  contact_signataire_id: string | null
}>

/** Mise à jour d'un seul champ, sans réécrire tout le contrat. */
export function useUpdateContratPartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchContrat }) => {
      const { error } = await supabase.from('contrats').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    // Attendue : le champ ne se referme qu'une fois la nouvelle valeur relue.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contrats'] }),
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

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ENREGISTRER UNE SIGNATURE QUI N'EST PAS PASSÉE PAR DOCUSIGN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 15/09/2026 : « ajoute la possibilité de le passer au statut signé à la main (quand
 * exceptionnellement on l'a pas envoyé via DocuSign) ».
 *
 * ══ « EXCEPTIONNELLEMENT » EST UN EUPHÉMISME, ET LES CHIFFRES LE DISENT ══
 *
 * 1 571 contrats sont à « Signé », et CINQ portent une enveloppe DocuSign. La signature hors
 * DocuSign n'est pas le cas rare, c'est le cas ordinaire — la reprise Salesforce l'a simplement
 * rendue invisible en important les statuts tout faits.
 *
 * Le trou se voyait sur les contrats nés dans Kimatch : 28 ne sont pas signés, dont 24 sans
 * enveloppe. Ceux-là ne pouvaient PAS l'être. Le cycle de signature ne proposait que deux pas
 * manuels — « Demandé au fournisseur » puis « Contrat réceptionné » — et laissait la suite à
 * DocuSign. Sans enveloppe, aucun événement n'arrivera jamais : le contrat restait bloqué à
 * « Réceptionné » ou « Envoyé », et le bouton « Valider le contrat », qui ouvre la facturation,
 * restait hors d'atteinte.
 *
 * ══ CE QUI EST ÉCRIT, ET POURQUOI CHACUN ══
 *
 *   date_signature        la date SAISIE, pas celle du jour — voir plus bas.
 *   statut_avancement_id  « Signé » : c'est ce que le cycle de signature affiche.
 *   statut_id             le statut métier, par la même règle que le webhook DocuSign.
 *   statut_signature      « SIGNE », pour que la colonne miroir de DocuSign dise la même chose que
 *                         le reste — sans quoi un contrat signé afficherait « en attente » dans le
 *                         bloc de suivi le jour où quelqu'un lui rattache une enveloppe.
 *   commentaire           d'où vient la signature, ajouté à l'existant.
 *
 * LA DATE NE VAUT PAS FORCÉMENT AUJOURD'HUI. Un contrat signé sur papier il y a trois semaines se
 * saisit avec sa vraie date : c'est elle qui décide si le contrat est « à venir », « actif » ou déjà
 * « terminé », et la poser au jour de la saisie fausserait le statut.
 *
 * ON NE TOUCHE NI À `date_debut` NI À `date_fin`. Contrairement au mandat, dont la validité se
 * calcule depuis la signature, les dates de fourniture d'un contrat sont NÉGOCIÉES : elles figurent
 * dans le document, et la signature ne les décide pas. Les 28 contrats non signés les portent
 * d'ailleurs tous.
 */
export function useSignerContratManuellement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      contratId: string
      /** `AAAA-MM-JJ`. */
      dateSignature: string
      /** Où la signature a eu lieu — la seule trace, faute d'enveloppe à consulter. */
      origine: string
      commentaireExistant: string | null
      dateDebut: string | null
      dateFin: string | null
      /** Résolus par l'écran : les codes des tables de référence ne sont pas des identifiants. */
      avancementSigneId: string | null
      statutsMetier: { code: string; id: string }[]
    }) => {
      if (!input.avancementSigneId) {
        throw new Error('Statut d’avancement « Signé » introuvable — rechargez la page.')
      }

      const codeMetier = statutMetierApresSignature(input.dateDebut, input.dateFin)
      const statutMetierId = input.statutsMetier.find((s) => s.code === codeMetier)?.id ?? null

      const { error } = await supabase
        .from('contrats')
        .update({
          date_signature: input.dateSignature,
          statut_avancement_id: input.avancementSigneId,
          statut_signature: 'SIGNE',
          ...(statutMetierId ? { statut_id: statutMetierId } : {}),
          commentaire: mentionSignatureManuelle(
            input.commentaireExistant,
            input.origine,
            input.dateSignature,
          ),
        })
        .eq('id', input.contratId)
      if (error) throw new Error(error.message)

      return { codeMetier }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contrats'] })
      // La santé d'un compteur et le périmètre d'un compte lisent l'état des contrats : sans cette
      // invalidation, la fiche d'à côté continue d'annoncer un contrat en attente de signature.
      void queryClient.invalidateQueries({ queryKey: ['compteurs'] })
      void queryClient.invalidateQueries({ queryKey: ['comptes'] })
    },
  })
}

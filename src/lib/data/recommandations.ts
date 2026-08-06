import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  Recommandation,
  VersionRecommandation,
  Optimisation,
  OffreFournisseur,
  OffreFournisseurCompteur as OffreFournisseurCompteurType,
  FournisseurConsulte,
  SuiviConsultationFournisseur,
} from '@/types/domain'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawRecommandation {
  id: string
  nom: string
  description: string | null
  priorite: number
  commentaire_interne: string | null
  date_ouverture: string
  proprietaire_id: string | null
  contact_signataire_id: string | null
  marge_brute: number | null
  marge_nette: number | null
  marge_nette_coeff: number | null
  marge_apporteur: number | null
  date_cloture?: string | null
  type_opportunite?: string | null
  etape: { code: string } | null
  origine: { libelle: string } | null
  type_energie?: { code: string } | null
  responsable: { prenom: string; nom: string } | null
  compte: { id: string; nom: string } | null
  contact_signataire: { prenom: string; nom: string; email: string | null; telephone: string | null } | null
}

interface RawVersion {
  id: string
  recommandation_id: string
  nom: string | null
  resume: string | null
  contexte_et_hypotheses: string | null
  gain_estime_annuel: number | null
  economie_estimee_pourcentage: number | null
  niveau_confiance: number | null
  version_actuelle: boolean
  est_figee: boolean
  date_publication: string | null
  date_presentation_client: string | null
  date_decision_client: string | null
  date_creation: string
  statut: { code: string } | null
  motif: { libelle: string } | null
  contact_id: string | null
  contact: { prenom: string; nom: string } | null
}

interface RawOptimisation {
  id: string
  version_recommandation_id: string
  nom: string | null
  description: string | null
  resultat_attendu: string | null
  gain_estime_annuel: number | null
  cout_estime: number | null
  roi_mois: number | null
  priorite: number | null
  est_retenue: boolean
  type_optimisation: { code: string; libelle: string } | null
}

interface RawFournisseurConsulte {
  id: string
  optimisation_id: string
  fournisseur_compte_id: string
  date_creation: string
  fournisseur: { nom: string } | null
}

interface RawSuiviConsultation {
  id: string
  optimisation_fournisseur_id: string
  date_evenement: string
  commentaire: string | null
  statut: { libelle: string } | null
  auteur: { prenom: string; nom: string } | null
}

interface RawOffreFournisseur {
  id: string
  optimisation_id: string
  reference_offre: string | null
  nom: string | null
  description: string | null
  statut: string | null
  montant_annuel_ht: number | null
  montant_total_ht: number | null
  economie_annuelle_estimee: number | null
  economie_pourcentage: number | null
  duree_mois: number | null
  est_offre_recommandee: boolean
  compte_fournisseur: { compte: { nom: string } | null } | null
}

interface RawOffreFournisseurCompteur {
  id: string
  offre_fournisseur_id: string
  version_recommandation_compteur_id: string
  consommation_annuelle_reference_mwh: number | null
  cout_fourniture_annuel_ht: number | null
  cout_acheminement_annuel_ht: number | null
  cout_taxes_annuel: number | null
  cout_total_annuel_estime_ht: number | null
  economie_annuelle_estimee: number | null
  economie_pourcentage: number | null
}

async function fetchRecommandations(): Promise<Recommandation[]> {

  try {
    interface RawRecoSite {
      recommandation_id: string
      site: { id: string; nom: string } | null
    }

    interface RawRecoCompteur {
      recommandation_id: string
      compteur_id: string
    }

    const [recos, sitesRows, compteursRows, versionsRows, versionsCompteursRows, dureesRows, versionsExtraRows, optimisationsRows, offresRows, offresCompteursRows, fournisseursConsultesRows, suivisConsultationRows] =
      await Promise.all([
        fetchAllRows<RawRecommandation>(
          'recommandations',
          // `*` plutôt qu'une liste de colonnes fixe : `date_cloture`/`type_opportunite`/
          // `type_energie_id` viennent d'être ajoutées par migration et peuvent ne pas encore
          // exister en prod au moment du déploiement -- un select nommé sur une colonne absente
          // ferait échouer la requête (400) pour TOUTES les recommandations.
          '*, etape:etapes_recommandation(code), origine:types_origines(libelle), type_energie:types_energies(code), responsable:profils!recommandations_responsable_profil_id_fkey(prenom, nom), compte:comptes(id, nom), contact_signataire:contacts!recommandations_contact_signataire_id_fkey(prenom, nom, email, telephone)',
          (q) => q.order('date_ouverture', { ascending: false }),
        ),
        fetchAllRows<RawRecoSite>('recommandations_sites', 'recommandation_id, site:sites(id, nom)'),
        fetchAllRows<RawRecoCompteur>('recommandations_compteurs', 'recommandation_id, compteur_id').catch(() => [] as RawRecoCompteur[]),
        fetchAllRows<RawVersion>(
          'versions_recommandation',
          'id, recommandation_id, nom, resume, contexte_et_hypotheses, gain_estime_annuel, economie_estimee_pourcentage, niveau_confiance, version_actuelle, est_figee, date_publication, date_presentation_client, date_decision_client, date_creation, statut:statuts_versions_recommandation(code), motif:motifs_versions_recommandation(libelle), contact_id, contact:contacts(prenom, nom)',
          (q) => q.order('date_creation'),
        ),
        fetchAllRows<{ id: string; version_recommandation_id: string; compteur_id: string; compteur: { numero_point: string; libelle: string | null } | null }>(
          'versions_recommandation_compteurs',
          'id, version_recommandation_id, compteur_id, compteur:compteurs(numero_point, libelle)',
        ),
        // Durées par PDL + type de prix + date souhaitée : requêtes SÉPARÉES et tolérantes, comme
        // recommandations_compteurs plus haut. La table et les colonnes datent du 06/08/2026 et
        // peuvent manquer sur un environnement pas encore migré -- un select nommé les incluant
        // ferait échouer le chargement de TOUTES les versions (400).
        fetchAllRows<{ version_recommandation_id: string; compteur_id: string; duree_mois: number }>(
          'versions_recommandation_durees',
          'version_recommandation_id, compteur_id, duree_mois',
        ).catch(() => [] as { version_recommandation_id: string; compteur_id: string; duree_mois: number }[]),
        fetchAllRows<{ id: string; types_prix: string[] | null; date_souhaitee: string | null }>(
          'versions_recommandation',
          'id, types_prix, date_souhaitee',
        ).catch(() => [] as { id: string; types_prix: string[] | null; date_souhaitee: string | null }[]),
        fetchAllRows<RawOptimisation>(
          'optimisations',
          'id, version_recommandation_id, nom, description, resultat_attendu, gain_estime_annuel, cout_estime, roi_mois, priorite, est_retenue, type_optimisation:types_optimisations(code, libelle)',
          (q) => q.order('ordre'),
        ),
        fetchAllRows<RawOffreFournisseur>(
          'offres_fournisseurs',
          'id, optimisation_id, reference_offre, nom, description, statut, montant_annuel_ht, montant_total_ht, economie_annuelle_estimee, economie_pourcentage, duree_mois, est_offre_recommandee, compte_fournisseur:comptes_fournisseurs(compte:comptes(nom))',
        ),
        fetchAllRows<RawOffreFournisseurCompteur>(
          'offres_fournisseurs_compteurs',
          'id, offre_fournisseur_id, version_recommandation_compteur_id, consommation_annuelle_reference_mwh, cout_fourniture_annuel_ht, cout_acheminement_annuel_ht, cout_taxes_annuel, cout_total_annuel_estime_ht, economie_annuelle_estimee, economie_pourcentage',
        ),
        fetchAllRows<RawFournisseurConsulte>(
          'optimisations_fournisseurs',
          'id, optimisation_id, fournisseur_compte_id, date_creation, fournisseur:comptes(nom)',
        ),
        fetchAllRows<RawSuiviConsultation>(
          'suivis_consultations_fournisseurs',
          'id, optimisation_fournisseur_id, date_evenement, commentaire, statut:statuts_consultations_fournisseurs(libelle), auteur:profils(prenom, nom)',
          (q) => q.order('date_evenement'),
        ),
      ])

    interface RawVersionCompteur {
      id: string
      version_recommandation_id: string
      compteur_id: string
      compteur: { numero_point: string; libelle: string | null } | null
    }

    const compteurIdsParVersion = new Map<string, string[]>()
    const versionCompteurById = new Map<string, { compteurId: string; label: string }>()
    for (const vc of versionsCompteursRows as unknown as RawVersionCompteur[]) {
      const list = compteurIdsParVersion.get(vc.version_recommandation_id) ?? []
      list.push(vc.compteur_id)
      compteurIdsParVersion.set(vc.version_recommandation_id, list)
      versionCompteurById.set(vc.id, { compteurId: vc.compteur_id, label: vc.compteur?.libelle || vc.compteur?.numero_point || '' })
    }

    const detailsParOffre = new Map<string, OffreFournisseurCompteurType[]>()
    for (const dc of offresCompteursRows) {
      const vc = versionCompteurById.get(dc.version_recommandation_compteur_id)
      const list = detailsParOffre.get(dc.offre_fournisseur_id) ?? []
      list.push({
        id: dc.id,
        compteur_id: vc?.compteurId ?? '',
        compteur_label: vc?.label ?? '',
        consommation_annuelle_reference_mwh: dc.consommation_annuelle_reference_mwh,
        cout_fourniture_annuel_ht: dc.cout_fourniture_annuel_ht,
        cout_acheminement_annuel_ht: dc.cout_acheminement_annuel_ht,
        cout_taxes_annuel: dc.cout_taxes_annuel,
        cout_total_annuel_estime_ht: dc.cout_total_annuel_estime_ht,
        economie_annuelle_estimee: dc.economie_annuelle_estimee,
        economie_pourcentage: dc.economie_pourcentage,
      })
      detailsParOffre.set(dc.offre_fournisseur_id, list)
    }

    const historiqueParFournisseur = new Map<string, SuiviConsultationFournisseur[]>()
    for (const s of suivisConsultationRows) {
      const list = historiqueParFournisseur.get(s.optimisation_fournisseur_id) ?? []
      list.push({
        id: s.id,
        statut: s.statut?.libelle ?? '',
        date_evenement: s.date_evenement,
        commentaire: s.commentaire,
        auteur_nom: s.auteur ? `${s.auteur.prenom} ${s.auteur.nom}` : null,
      })
      historiqueParFournisseur.set(s.optimisation_fournisseur_id, list)
    }

    const fournisseursConsultesParOptimisation = new Map<string, FournisseurConsulte[]>()
    for (const f of fournisseursConsultesRows) {
      const historique = historiqueParFournisseur.get(f.id) ?? []
      const list = fournisseursConsultesParOptimisation.get(f.optimisation_id) ?? []
      list.push({
        id: f.id,
        fournisseur_compte_id: f.fournisseur_compte_id,
        fournisseur_nom: f.fournisseur?.nom ?? '',
        date_creation: f.date_creation,
        statut_actuel: historique.length > 0 ? historique[historique.length - 1].statut : null,
        historique,
      })
      fournisseursConsultesParOptimisation.set(f.optimisation_id, list)
    }

    const offresParOptimisation = new Map<string, OffreFournisseur[]>()
    for (const o of offresRows) {
      const list = offresParOptimisation.get(o.optimisation_id) ?? []
      list.push({
        id: o.id,
        fournisseur_nom: o.compte_fournisseur?.compte?.nom ?? '',
        reference_offre: o.reference_offre,
        nom: o.nom,
        description: o.description,
        statut: o.statut,
        montant_annuel_ht: o.montant_annuel_ht,
        montant_total_ht: o.montant_total_ht,
        economie_annuelle_estimee: o.economie_annuelle_estimee,
        economie_pourcentage: o.economie_pourcentage,
        duree_mois: o.duree_mois,
        est_offre_recommandee: o.est_offre_recommandee,
        details_par_compteur: detailsParOffre.get(o.id) ?? [],
      })
      offresParOptimisation.set(o.optimisation_id, list)
    }

    const optimisationsParVersion = new Map<string, Optimisation[]>()
    for (const opt of optimisationsRows) {
      const list = optimisationsParVersion.get(opt.version_recommandation_id) ?? []
      list.push({
        id: opt.id,
        nom: opt.nom,
        type_optimisation: opt.type_optimisation?.libelle ?? '',
        type_optimisation_code: opt.type_optimisation?.code ?? '',
        description: opt.description,
        resultat_attendu: opt.resultat_attendu,
        gain_estime_annuel: opt.gain_estime_annuel,
        cout_estime: opt.cout_estime,
        roi_mois: opt.roi_mois,
        priorite: opt.priorite,
        est_retenue: opt.est_retenue,
        offres: offresParOptimisation.get(opt.id) ?? [],
        fournisseurs_consultes: fournisseursConsultesParOptimisation.get(opt.id) ?? [],
      })
      optimisationsParVersion.set(opt.version_recommandation_id, list)
    }

    const sitesParReco = new Map<string, { id: string; nom: string }[]>()
    for (const rs of sitesRows) {
      if (!rs.site) continue
      const list = sitesParReco.get(rs.recommandation_id) ?? []
      list.push(rs.site)
      sitesParReco.set(rs.recommandation_id, list)
    }

    const compteurIdsParReco = new Map<string, string[]>()
    for (const rc of compteursRows) {
      const list = compteurIdsParReco.get(rc.recommandation_id) ?? []
      list.push(rc.compteur_id)
      compteurIdsParReco.set(rc.recommandation_id, list)
    }

    // Durées par version puis par compteur, + union aplatie triée (ce que consomme le fan-out
    // fournisseur, comme `allDurations` dans Tools).
    const dureesParVersion = new Map<string, Record<string, number[]>>()
    for (const d of dureesRows) {
      const parCompteur = dureesParVersion.get(d.version_recommandation_id) ?? {}
      parCompteur[d.compteur_id] = [...(parCompteur[d.compteur_id] ?? []), d.duree_mois].sort((a, b) => a - b)
      dureesParVersion.set(d.version_recommandation_id, parCompteur)
    }
    const extraParVersion = new Map(versionsExtraRows.map((v) => [v.id, v]))

    const versionsParReco = new Map<string, VersionRecommandation[]>()
    for (const v of versionsRows) {
      const list = versionsParReco.get(v.recommandation_id) ?? []
      list.push({
        id: v.id,
        nom: v.nom,
        statut: v.statut?.code ?? '',
        motif_creation: v.motif?.libelle ?? '',
        date_creation: v.date_creation,
        gains_estimes: v.gain_estime_annuel,
        resume: v.resume ?? '',
        contexte_et_hypotheses: v.contexte_et_hypotheses,
        economie_pourcentage: v.economie_estimee_pourcentage,
        niveau_confiance: v.niveau_confiance,
        version_actuelle: v.version_actuelle,
        est_figee: v.est_figee,
        date_publication: v.date_publication,
        date_presentation_client: v.date_presentation_client,
        date_decision_client: v.date_decision_client,
        compteur_ids: compteurIdsParVersion.get(v.id) ?? [],
        optimisations: optimisationsParVersion.get(v.id) ?? [],
        contact_id: v.contact_id,
        contact_nom: v.contact ? `${v.contact.prenom} ${v.contact.nom}` : null,
        durees_par_compteur: dureesParVersion.get(v.id) ?? {},
        durees: [...new Set(Object.values(dureesParVersion.get(v.id) ?? {}).flat())].sort((a, b) => a - b),
        types_prix: extraParVersion.get(v.id)?.types_prix ?? [],
        date_souhaitee: extraParVersion.get(v.id)?.date_souhaitee ?? null,
      })
      versionsParReco.set(v.recommandation_id, list)
    }

    const comptesVisibles = await fetchComptesVisibles()

    return filterVisibles(recos, comptesVisibles, (r) => r.compte?.id).map((r) => ({
      id: r.id,
      titre: r.nom,
      compte_id: r.compte?.id ?? '',
      compte_nom: r.compte?.nom ?? '',
      sites: sitesParReco.get(r.id) ?? [],
      etape: r.etape?.code ?? '',
      conseiller: r.responsable ? `${r.responsable.prenom} ${r.responsable.nom}` : '',
      origine: r.origine?.libelle,
      description: r.description ?? '',
      priorite: r.priorite,
      commentaire_interne: r.commentaire_interne ?? '',
      date_creation: r.date_ouverture,
      versions: versionsParReco.get(r.id) ?? [],
      proprietaire_id: r.proprietaire_id,
      contact_signataire_id: r.contact_signataire_id,
      contact_signataire_nom: r.contact_signataire ? `${r.contact_signataire.prenom} ${r.contact_signataire.nom}` : null,
      contact_signataire_email: r.contact_signataire?.email ?? null,
      contact_signataire_telephone: r.contact_signataire?.telephone ?? null,
      marge_brute: r.marge_brute,
      marge_nette: r.marge_nette,
      marge_nette_coeff: r.marge_nette_coeff,
      marge_apporteur: r.marge_apporteur,
      type_energie: (r.type_energie?.code?.toLowerCase() as 'electricite' | 'gaz' | undefined) ?? null,
      date_cloture: r.date_cloture ?? null,
      type_opportunite: r.type_opportunite ?? null,
      compteur_ids: compteurIdsParReco.get(r.id) ?? [],
    }))
  } catch (error) {
    console.error('fetchRecommandations', error)
    return []
  }
}

export function useRecommandations() {
  return useQuery({ queryKey: ['recommandations'], queryFn: fetchRecommandations })
}

/** Codes d'étape considérés "clos" -- un PDL rattaché uniquement à des recommandations dans ces
 * étapes est de nouveau éligible à une nouvelle opportunité (même règle que Tools). */
const ETAPES_CLOSES = new Set(['REFUSEE', 'CLOTUREE'])

/** Compteurs déjà engagés dans une recommandation non close -- à exclure de la sélection PDL
 * d'une nouvelle opportunité (Tools : "pas déjà rattaché à une opportunité non close"). */
export function compteursDejaEngages(recommandations: Recommandation[]): Set<string> {
  const set = new Set<string>()
  for (const r of recommandations) {
    if (ETAPES_CLOSES.has(r.etape)) continue
    for (const id of r.compteur_ids ?? []) set.add(id)
  }
  return set
}

interface CreateRecommandationInput {
  titre: string
  mandat_id: string
  compte_id: string
  compte_nom: string
  type_energie_id: string | null
  type_energie: 'electricite' | 'gaz'
  compteurs: { id: string; site_id: string; site_nom: string }[]
  contact_signataire_id: string | null
  date_cloture: string | null
  type_opportunite: string
  etape_id: string | null
  origine_id: string | null
  origine_libelle?: string
  priorite: number
  description: string
  commentaire_interne: string
}

interface CreateRecommandationResult {
  recommandation: Recommandation
  persisted: boolean
}

export function useCreateRecommandation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateRecommandationInput): Promise<CreateRecommandationResult> => {
      const now = new Date().toISOString()
      const sites = [...new Map(input.compteurs.map((c) => [c.site_id, { id: c.site_id, nom: c.site_nom }])).values()]
      let persisted = false
      let recommandation: Recommandation = {
        id: `local-${Date.now()}`,
        titre: input.titre,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        sites,
        etape: 'A_PREPARER',
        conseiller: '',
        origine: input.origine_libelle,
        description: input.description,
        priorite: input.priorite,
        commentaire_interne: input.commentaire_interne,
        date_creation: now,
        versions: [],
        proprietaire_id: null,
        contact_signataire_id: input.contact_signataire_id,
        type_energie: input.type_energie,
        date_cloture: input.date_cloture,
        type_opportunite: input.type_opportunite,
        compteur_ids: input.compteurs.map((c) => c.id),
      }

      const { data, error } = await supabase
        .from('recommandations')
        .insert({
          nom: input.titre,
          compte_id: input.compte_id,
          description: input.description,
          priorite: input.priorite,
          commentaire_interne: input.commentaire_interne,
          date_ouverture: now,
          date_cloture: input.date_cloture,
          type_opportunite: input.type_opportunite,
          ...(input.contact_signataire_id ? { contact_signataire_id: input.contact_signataire_id } : {}),
          ...(input.type_energie_id ? { type_energie_id: input.type_energie_id } : {}),
          ...(input.etape_id ? { etape_id: input.etape_id } : {}),
          ...(input.origine_id ? { origine_id: input.origine_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        const recoId = (data as { id: string }).id
        recommandation = { ...recommandation, id: recoId }
        persisted = true
        if (input.compteurs.length > 0) {
          await supabase
            .from('recommandations_compteurs')
            .insert(input.compteurs.map((c) => ({ recommandation_id: recoId, compteur_id: c.id })))
        }
        await supabase
          .from('recommandations_mandats')
          .insert({ recommandation_id: recoId, mandat_id: input.mandat_id, principal: true })
        if (sites.length > 0) {
          await supabase
            .from('recommandations_sites')
            .insert(sites.map((s) => ({ recommandation_id: recoId, site_id: s.id })))
        }
      }

      queryClient.setQueryData<Recommandation[]>(['recommandations'], (old) =>
        old ? [recommandation, ...old] : [recommandation],
      )
      return { recommandation, persisted }
    },
  })
}

export interface CreateVersionInput {
  recommandation_id: string
  compteur_ids: string[]
  motif_id: string | null
  statut_brouillon_id: string | null
  type_optimisation_mise_en_concurrence_id: string | null
  fournisseur_ids: string[]
  /** Durées demandées PAR PDL, clé = compteur_id, 3 max par compteur (Tools: pdlDurations). */
  durees_par_compteur: Record<string, number[]>
  /** « Fixe » et/ou « Indexé » -- sélection multiple, pas exclusive. */
  types_prix: string[]
  date_souhaitee: string | null
  resume: string
  contexte_et_hypotheses: string | null
  /** Étape "EN_ANALYSE" -- ne fait passer l'opportunité que si c'est sa toute première cotation
   * (Tools : "le statut de l'opportunité ne passe à Instruction qu'à la première cotation,
   * jamais lors d'une actualisation"). */
  etape_en_analyse_id: string | null
}

/** Crée une nouvelle version (cotation) sur une recommandation. Si des versions précédentes non
 * terminales existent, elles basculent à REMPLACEE (Tools : "actualisation = relancer le même
 * wizard, toutes les AUTRES cotations basculent automatiquement à Abandonnée"). */
export function useCreateVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateVersionInput) => {
      const { data: statutRemplacee } = await supabase.from('statuts_versions_recommandation').select('id').eq('code', 'REMPLACEE').maybeSingle()
      const { data: versionsExistantes } = await supabase
        .from('versions_recommandation')
        .select('id, numero_version, version_actuelle, statut:statuts_versions_recommandation(code)')
        .eq('recommandation_id', input.recommandation_id)

      const estActualisation = (versionsExistantes ?? []).length > 0
      // Numérotation continue par recommandation : on repart du plus grand numéro existant plutôt
      // que du nombre de versions, pour ne pas réattribuer un numéro déjà utilisé si l'une a été
      // supprimée.
      const numeroVersion = Math.max(
        0,
        ...(versionsExistantes ?? []).map((v) => (v as { numero_version?: number }).numero_version ?? 0),
      ) + 1
      const aTraiter = (versionsExistantes ?? []).filter((v) => {
        const code = (v.statut as { code: string } | { code: string }[] | null)
        const c = Array.isArray(code) ? code[0]?.code : code?.code
        return v.version_actuelle && c !== 'ACCEPTEE' && c !== 'REFUSEE'
      })
      if (aTraiter.length > 0 && statutRemplacee) {
        await supabase
          .from('versions_recommandation')
          .update({ version_actuelle: false, ...(statutRemplacee ? { statut_version_id: statutRemplacee.id } : {}) })
          .in('id', aTraiter.map((v) => v.id))
      }

      const { data: version, error } = await supabase
        .from('versions_recommandation')
        .insert({
          recommandation_id: input.recommandation_id,
          resume: input.resume,
          contexte_et_hypotheses: input.contexte_et_hypotheses,
          version_actuelle: true,
          est_figee: false,
          date_creation: new Date().toISOString(),
          types_prix: input.types_prix,
          date_souhaitee: input.date_souhaitee,
          // Colonnes NOT NULL sans valeur par défaut : la version n'a jamais pu être créée sans
          // elles. `numero_version` et `nom` n'étaient pas fournis du tout, et les deux clés
          // étrangères portaient de mauvais noms (`motif_id`/`statut_id` au lieu de
          // `motif_version_id`/`statut_version_id`) — d'où l'erreur PostgREST « Could not find the
          // 'motif_id' column ... in the schema cache », vue en production le 06/08/2026.
          numero_version: numeroVersion,
          nom: `Version ${numeroVersion}`,
          ...(input.motif_id ? { motif_version_id: input.motif_id } : {}),
          ...(input.statut_brouillon_id ? { statut_version_id: input.statut_brouillon_id } : {}),
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      const versionId = (version as { id: string }).id

      if (input.compteur_ids.length > 0) {
        await supabase
          .from('versions_recommandation_compteurs')
          .insert(input.compteur_ids.map((compteur_id) => ({ version_recommandation_id: versionId, compteur_id })))
      }

      // Durées par PDL. Une ligne par (version, compteur, durée) -- la clé primaire dédoublonne,
      // les bornes 1-60 sont vérifiées côté base.
      const lignesDurees = Object.entries(input.durees_par_compteur).flatMap(([compteur_id, durees]) =>
        durees.map((duree_mois) => ({ version_recommandation_id: versionId, compteur_id, duree_mois })),
      )
      if (lignesDurees.length > 0) {
        await supabase.from('versions_recommandation_durees').insert(lignesDurees)
      }

      let optimisationId: string | null = null
      if (input.fournisseur_ids.length > 0) {
        const { data: optimisation } = await supabase
          .from('optimisations')
          .insert({
            version_recommandation_id: versionId,
            nom: 'Mise en concurrence',
            priorite: 1,
            est_retenue: false,
            ...(input.type_optimisation_mise_en_concurrence_id ? { type_optimisation_id: input.type_optimisation_mise_en_concurrence_id } : {}),
          })
          .select('id')
          .single()
        optimisationId = (optimisation as { id: string } | null)?.id ?? null
        if (optimisationId) {
          await supabase
            .from('optimisations_fournisseurs')
            .insert(input.fournisseur_ids.map((fournisseur_compte_id) => ({ optimisation_id: optimisationId, fournisseur_compte_id })))
        }
      }

      // L'étape de l'opportunité ne passe à "En analyse" qu'à la toute première cotation.
      if (!estActualisation && input.etape_en_analyse_id) {
        await supabase.from('recommandations').update({ etape_id: input.etape_en_analyse_id }).eq('id', input.recommandation_id)
      }

      queryClient.invalidateQueries({ queryKey: ['recommandations'] })
      return { versionId }
    },
  })
}

export interface UpdateRecommandationInput {
  id: string
  titre: string
  description: string
  commentaire_interne: string
  priorite: number
  proprietaire_id: string | null
}

export function useUpdateRecommandation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateRecommandationInput) => {
      const { error } = await supabase
        .from('recommandations')
        .update({
          nom: input.titre,
          description: input.description,
          commentaire_interne: input.commentaire_interne,
          priorite: input.priorite,
          proprietaire_id: input.proprietaire_id,
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

export function useAjouterFournisseurConsulte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { optimisationId: string; fournisseurCompteId: string; fournisseurNom: string }) => {
      const { error } = await supabase.from('optimisations_fournisseurs').insert({
        optimisation_id: input.optimisationId,
        fournisseur_compte_id: input.fournisseurCompteId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

export function useAjouterSuiviConsultation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      optimisationId: string
      optimisationFournisseurId: string
      statutId: string
      statutLibelle: string
      commentaire: string | null
    }) => {
      const { error } = await supabase.from('suivis_consultations_fournisseurs').insert({
        optimisation_fournisseur_id: input.optimisationFournisseurId,
        statut_id: input.statutId,
        commentaire: input.commentaire,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

export function useDeleteRecommandation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recommandations').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

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
  finalite_cloture?: 'ACCEPTEE' | 'REFUSEE' | 'EXPIREE' | null
  motif_cloture?: string | null
  date_reactivation?: string | null
  type_opportunite?: string | null
  /** Colonnes ajoutées le 15/08/2026 (migration 20260815150000). Optionnelles : le select est en
   *  `*`, elles sont donc absentes tant que la migration n'est pas appliquée. */
  id_salesforce?: string | null
  montant?: number | null
  marge_nette_mwh?: number | null
  duree_mois?: number | null
  volume_contractuel?: number | null
  budget_ancienne_offre?: number | null
  budget_nouvelle_offre?: number | null
  difference_budgetaire?: number | null
  difference_budgetaire_pourcentage?: number | null
  commission_interne?: number | null
  commission_nette?: number | null
  remuneration_apporteur?: number | null
  fournisseur_compte_id?: string | null
  /** Colonnes de la fiche Recommandation portée depuis la maquette (migration 20260816180000).
   *  Optionnelles pour la même raison que les précédentes : le select est en `*`. */
  contexte_demande?: string | null
  cout_prestation_estime?: number | null
  cout_prestation_reel?: number | null
  /** Référence métier affichée en tête de fiche (« RC-2026-027 » dans le design). La colonne
   *  existe mais est vide sur les 1703 lignes : la fiche retombe donc sur le nom. */
  reference?: string | null
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
  numero_version: number | null
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

/** Colonnes de version arrivées par migrations successives, lues à part et sans faire échouer le
 *  chargement si l'une manque encore. */
interface VersionExtra {
  id: string
  types_prix: string[] | null
  date_souhaitee: string | null
  lien_eneo?: string | null
  id_salesforce?: string | null
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
  /** Fournisseur consulté dont cette offre est la réponse. C'est la clé de regroupement de
   *  l'écran : « les offres DE ce fournisseur » (demande de Michel, 17/08/2026). Nullable en base
   *  sur les lignes qui précéderaient le branchement. */
  optimisation_fournisseur_id: string | null
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
  date_reception?: string | null
  date_validite?: string | null
  /** Colonnes ajoutées le 17/08/2026 (migration 20260817140000). Optionnelles : le select les
   *  nomme, mais l'écran doit rester debout si la migration n'est pas encore appliquée. */
  type_prix?: string | null
  prix_moyen_mwh?: number | null
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

/** `compteId` restreint toute la cascade aux recommandations d'un compte. Voir le commentaire au
 *  debut du corps : c'est le poste le plus lourd de l'application. */
async function fetchRecommandations(
  compteId?: string,
  recoId?: string,
  listeSeule = false,
): Promise<Recommandation[]> {

  try {
    interface RawRecoSite {
      recommandation_id: string
      site: { id: string; nom: string } | null
    }

    interface RawRecoCompteur {
      recommandation_id: string
      compteur_id: string
    }

    // Lecture en quatre vagues plutot qu'un seul Promise.all de douze tables entieres.
    //
    // Sans `compteId`, le comportement est inchange : tout est charge (les pages de liste en ont
    // besoin). Avec, chaque niveau ne lit que ce qui pend au niveau precedent -- les recommandations
    // du compte, puis leurs versions, puis leurs optimisations, puis les offres et les suivis de
    // consultation de ces optimisations.
    //
    // C'est le poste le plus lourd de l'application : mesure le 14/08/2026, afficher les 38
    // recommandations d'une fiche compte telechargeait ces douze tables en entier, soit a lui seul
    // pres de la moitie des 56 requetes de la page. Les vagues coutent trois allers-retours de plus
    // qu'un Promise.all, sur des volumes sans commune mesure.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const surColonne = (colonne: string, valeurs: string[]) => (q: any) => q.in(colonne, valeurs)

    const recos = await fetchAllRows<RawRecommandation>(
      'recommandations',
      // `*` plutot qu'une liste de colonnes fixe : `date_cloture`/`type_opportunite`/
      // `type_energie_id` viennent d'etre ajoutees par migration et peuvent ne pas encore
      // exister en prod au moment du deploiement -- un select nomme sur une colonne absente
      // ferait echouer la requete (400) pour TOUTES les recommandations.
      '*, etape:etapes_recommandation(code), origine:types_origines(libelle), type_energie:types_energies(code), responsable:profils!recommandations_responsable_profil_id_fkey(prenom, nom), compte:comptes!recommandations_compte_id_fkey(id, nom), contact_signataire:contacts!recommandations_contact_signataire_id_fkey(prenom, nom, email, telephone)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => {
        if (recoId) return q.eq('id', recoId)
        return (compteId ? q.eq('compte_id', compteId) : q).order('date_ouverture', { ascending: false })
      },
    )
    const recoIds = recos.map((r) => r.id)
    const cible = Boolean(compteId || recoId)
    if (cible && recoIds.length === 0) return []
    const parReco = cible ? surColonne('recommandation_id', recoIds) : undefined

    const [sitesRows, compteursRows, versionsRows] = await Promise.all([
      fetchAllRows<RawRecoSite>('recommandations_sites', 'recommandation_id, site:sites(id, nom)', parReco),
      fetchAllRows<RawRecoCompteur>('recommandations_compteurs', 'recommandation_id, compteur_id', parReco).catch(() => [] as RawRecoCompteur[]),
      fetchAllRows<RawVersion>(
        'versions_recommandation',
        'id, recommandation_id, numero_version, nom, resume, contexte_et_hypotheses, gain_estime_annuel, economie_estimee_pourcentage, niveau_confiance, version_actuelle, est_figee, date_publication, date_presentation_client, date_decision_client, date_creation, statut:statuts_versions_recommandation(code), motif:motifs_versions_recommandation(libelle), contact_id, contact:contacts(prenom, nom)',
        // « Les versions doivent s'afficher du plus recent au plus ancien » (reunion du
        // 12/08/2026). Le tri porte sur numero_version, qui EST le rang metier de la version,
        // plutot que sur la date qui n'en est qu'un indice : rien n'interdit de reprendre une
        // version anterieure ni d'en creer deux le meme jour. 318 recommandations ont plusieurs
        // versions, l'ordre s'y voit donc vraiment. date_creation ne sert qu'a departager.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => (cible ? q.in('recommandation_id', recoIds) : q).order('numero_version', { ascending: false, nullsFirst: false }).order('date_creation', { ascending: false }),
      ),
    ])

    // Les pages de liste n'affichent qu'un en-tete : titre, compte, etape, sites, nombre de
    // versions. Les trois vagues suivantes -- compteurs et durees par version, optimisations,
    // offres fournisseurs, suivis de consultation -- ne servent qu'a la fiche detaillee.
    const aucune = <T,>(): Promise<T[]> => Promise.resolve([])

    const versionIds = versionsRows.map((v) => v.id)
    const parVersion = cible ? surColonne('version_recommandation_id', versionIds) : undefined

    const [versionsCompteursRows, dureesRows, versionsExtraRows, optimisationsRows] = await Promise.all([
      listeSeule ? aucune<{ id: string; version_recommandation_id: string; compteur_id: string; compteur: { numero_point: string; libelle: string | null } | null }>() : fetchAllRows<{ id: string; version_recommandation_id: string; compteur_id: string; compteur: { numero_point: string; libelle: string | null } | null }>(
        'versions_recommandation_compteurs',
        'id, version_recommandation_id, compteur_id, compteur:compteurs(numero_point, libelle)',
        parVersion,
      ),
      // Durees par PDL + type de prix + date souhaitee : requetes SEPAREES et tolerantes, comme
      // recommandations_compteurs plus haut. La table et les colonnes datent du 06/08/2026 et
      // peuvent manquer sur un environnement pas encore migre -- un select nomme les incluant
      // ferait echouer le chargement de TOUTES les versions (400).
      listeSeule ? aucune<{ version_recommandation_id: string; compteur_id: string; duree_mois: number }>() : fetchAllRows<{ version_recommandation_id: string; compteur_id: string; duree_mois: number }>(
        'versions_recommandation_durees',
        'version_recommandation_id, compteur_id, duree_mois',
        parVersion,
      ).catch(() => [] as { version_recommandation_id: string; compteur_id: string; duree_mois: number }[]),
      // `lien_eneo` et `id_salesforce` rejoignent cette requête tolérante (migration 20260817170000)
      // pour la même raison : tant qu'elle n'est pas appliquée, le `.catch` renvoie une liste vide et
      // la fiche s'affiche sans le lien, au lieu de perdre toutes les versions.
      listeSeule ? aucune<VersionExtra>() : fetchAllRows<VersionExtra>(
        'versions_recommandation',
        'id, types_prix, date_souhaitee, lien_eneo, id_salesforce',
        cible ? surColonne('id', versionIds) : undefined,
      ).catch(() => [] as VersionExtra[]),
      listeSeule ? aucune<RawOptimisation>() : fetchAllRows<RawOptimisation>(
        'optimisations',
        'id, version_recommandation_id, nom, description, resultat_attendu, gain_estime_annuel, cout_estime, roi_mois, priorite, est_retenue, type_optimisation:types_optimisations(code, libelle)',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => (cible ? q.in('version_recommandation_id', versionIds) : q).order('ordre'),
      ),
    ])

    const optimisationIds = optimisationsRows.map((o) => o.id)
    const parOptimisation = cible ? surColonne('optimisation_id', optimisationIds) : undefined

    const [offresRows, fournisseursConsultesRows] = await Promise.all([
      listeSeule ? aucune<RawOffreFournisseur>() : fetchAllRows<RawOffreFournisseur>(
        'offres_fournisseurs',
        // `*` et non une liste nommée : `type_prix` et `prix_moyen_mwh` viennent de la migration
        // 20260817140000 et peuvent ne pas encore exister. Un select qui les nomme sur une colonne
        // absente renvoie 400 et fait échouer le chargement de TOUTES les offres — même piège que
        // sur `recommandations`.
        '*, compte_fournisseur:comptes_fournisseurs(compte:comptes(nom))',
        parOptimisation,
      ),
      listeSeule ? aucune<RawFournisseurConsulte>() : fetchAllRows<RawFournisseurConsulte>(
        'optimisations_fournisseurs',
        'id, optimisation_id, fournisseur_compte_id, date_creation, fournisseur:comptes(nom)',
        parOptimisation,
      ),
    ])

    const [offresCompteursRows, suivisConsultationRows] = await Promise.all([
      listeSeule ? aucune<RawOffreFournisseurCompteur>() : fetchAllRows<RawOffreFournisseurCompteur>(
        'offres_fournisseurs_compteurs',
        'id, offre_fournisseur_id, version_recommandation_compteur_id, consommation_annuelle_reference_mwh, cout_fourniture_annuel_ht, cout_acheminement_annuel_ht, cout_taxes_annuel, cout_total_annuel_estime_ht, economie_annuelle_estimee, economie_pourcentage',
        cible ? surColonne('offre_fournisseur_id', offresRows.map((o) => o.id)) : undefined,
      ),
      listeSeule ? aucune<RawSuiviConsultation>() : fetchAllRows<RawSuiviConsultation>(
        'suivis_consultations_fournisseurs',
        'id, optimisation_fournisseur_id, date_evenement, commentaire, statut:statuts_consultations_fournisseurs(libelle), auteur:profils(prenom, nom)',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => (cible ? q.in('optimisation_fournisseur_id', fournisseursConsultesRows.map((f) => f.id)) : q).order('date_evenement'),
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

    const offresParOptimisation = new Map<string, OffreFournisseur[]>()
    // Les offres rangées SOUS leur fournisseur consulté — « la ou les offres différentes » de
    // chaque fournisseur (Michel, 17/08/2026). Le même objet est référencé dans les deux index :
    // l'écran groupe par fournisseur, le comparatif balaie l'optimisation.
    const offresParFournisseurConsulte = new Map<string, OffreFournisseur[]>()
    for (const o of offresRows) {
      const offre: OffreFournisseur = {
        id: o.id,
        optimisation_fournisseur_id: o.optimisation_fournisseur_id ?? null,
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
        type_prix: o.type_prix ?? null,
        prix_moyen_mwh: o.prix_moyen_mwh ?? null,
        date_reception: o.date_reception ?? null,
        date_validite: o.date_validite ?? null,
        est_offre_recommandee: o.est_offre_recommandee,
        details_par_compteur: detailsParOffre.get(o.id) ?? [],
      }
      const list = offresParOptimisation.get(o.optimisation_id) ?? []
      list.push(offre)
      offresParOptimisation.set(o.optimisation_id, list)

      if (o.optimisation_fournisseur_id) {
        const parFournisseur = offresParFournisseurConsulte.get(o.optimisation_fournisseur_id) ?? []
        parFournisseur.push(offre)
        offresParFournisseurConsulte.set(o.optimisation_fournisseur_id, parFournisseur)
      }
    }

    // Tri des offres d'un fournisseur : durée croissante puis type de prix, pour que « 24 fixe / 24
    // indexé / 36 fixe » se lise dans cet ordre et pas dans celui des insertions.
    for (const liste of offresParFournisseurConsulte.values()) {
      liste.sort(
        (a, b) => (a.duree_mois ?? 0) - (b.duree_mois ?? 0) || (a.type_prix ?? '').localeCompare(b.type_prix ?? ''),
      )
    }

    // Les fournisseurs consultés sont assemblés APRÈS les offres : chacun porte les siennes.
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
        offres: offresParFournisseurConsulte.get(f.id) ?? [],
      })
      fournisseursConsultesParOptimisation.set(f.optimisation_id, list)
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

    // fetchAllRows pagine : l'ordre est garanti page par page, pas entre les pages. On retrie donc
    // côté client, ce qui coûte peu et rend l'ordre indépendant de la façon dont les pages tombent.
    const versionsTriees = [...versionsRows].sort(
      (a, b) => (b.numero_version ?? 0) - (a.numero_version ?? 0) || b.date_creation.localeCompare(a.date_creation),
    )

    const versionsParReco = new Map<string, VersionRecommandation[]>()
    for (const v of versionsTriees) {
      const list = versionsParReco.get(v.recommandation_id) ?? []
      list.push({
        id: v.id,
        numero_version: v.numero_version,
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
        lien_eneo: extraParVersion.get(v.id)?.lien_eneo ?? null,
        id_salesforce: extraParVersion.get(v.id)?.id_salesforce ?? null,
      })
      versionsParReco.set(v.recommandation_id, list)
    }

    const comptesVisibles = await fetchComptesVisibles()

    // Nom du fournisseur retenu. Requete SEPAREE et tolerante, jamais un embed PostgREST :
    // `fournisseur_compte_id` date du 15/08/2026 et peut manquer sur un environnement pas encore
    // migre — un embed la citant ferait echouer le chargement de TOUTES les recommandations.
    // Une quinzaine de fournisseurs seulement, la requete est negligeable.
    const fournisseursParId = new Map<string, string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idsFournisseurs = [...new Set(recos.map((r: any) => r.fournisseur_compte_id).filter(Boolean))] as string[]
    if (idsFournisseurs.length > 0) {
      const { data: fournisseurs } = await supabase.from('comptes').select('id, nom').in('id', idsFournisseurs)
      for (const f of fournisseurs ?? []) fournisseursParId.set(f.id, f.nom)
    }

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
      finalite_cloture: r.finalite_cloture ?? null,
      motif_cloture: r.motif_cloture ?? null,
      date_reactivation: r.date_reactivation ?? null,
      type_opportunite: r.type_opportunite ?? null,
      compteur_ids: compteurIdsParReco.get(r.id) ?? [],
      // Champs chiffres repris de l'opportunite Salesforce (migration 20260815150000). Le select
      // etant en `*`, ils arrivent sans avoir a etre nommes ; ils restent nuls tant que la
      // migration n'est pas appliquee, et sur les 103 recommandations au nom ambigu.
      montant: r.montant ?? null,
      marge_nette_mwh: r.marge_nette_mwh ?? null,
      duree_mois: r.duree_mois ?? null,
      volume_contractuel: r.volume_contractuel ?? null,
      budget_ancienne_offre: r.budget_ancienne_offre ?? null,
      budget_nouvelle_offre: r.budget_nouvelle_offre ?? null,
      difference_budgetaire: r.difference_budgetaire ?? null,
      difference_budgetaire_pourcentage: r.difference_budgetaire_pourcentage ?? null,
      commission_interne: r.commission_interne ?? null,
      commission_nette: r.commission_nette ?? null,
      remuneration_apporteur: r.remuneration_apporteur ?? null,
      fournisseur_compte_id: r.fournisseur_compte_id ?? null,
      fournisseur_nom: r.fournisseur_compte_id ? (fournisseursParId.get(r.fournisseur_compte_id) ?? null) : null,
      id_salesforce: r.id_salesforce ?? null,
      reference: r.reference ?? null,
      contexte_demande: r.contexte_demande ?? null,
      cout_prestation_estime: r.cout_prestation_estime ?? null,
      cout_prestation_reel: r.cout_prestation_reel ?? null,
    }))
  } catch (error) {
    console.error('fetchRecommandations', error)
    return []
  }
}


/**
 * Une recommandation lu par son identifiant.
 *
 * Les fiches le cherchaient avec `liste?.find(x => x.id === id)`, ce qui telechargeait la table
 * entiere pour en garder une ligne. Meme motif que useCompte et useSite.
 */
export function useRecommandation(recoId: string | undefined) {
  return useQuery({
    queryKey: ['recommandations', 'un', recoId],
    queryFn: async () => (await fetchRecommandations(undefined, recoId as string))[0] ?? null,
    enabled: !!recoId,
  })
}
/**
 * Recommandations pour une page de liste : l'en-tete seulement.
 *
 * Mesure le 15/08/2026, /recommandations faisait 53 requetes dont 36 pages supplementaires,
 * en descendant la cascade des douze tables jusqu'aux suivis de consultation fournisseur --
 * pour afficher des cartes qui montrent un titre, un compte, une etape et un nombre de versions.
 */
export function useRecommandationsListe() {
  return useQuery({
    queryKey: ['recommandations', 'liste'],
    queryFn: () => fetchRecommandations(undefined, undefined, true),
  })
}

export function useRecommandations() {
  return useQuery({ queryKey: ['recommandations'], queryFn: () => fetchRecommandations() })
}

/** Recommandations d'un seul compte, cascade filtree cote serveur. A preferer sur toute fiche. */
export function useRecommandationsParCompte(compteId: string | undefined) {
  return useQuery({
    queryKey: ['recommandations', 'compte', compteId],
    queryFn: () => fetchRecommandations(compteId as string),
    enabled: !!compteId,
  })
}

/** Codes d'étape considérés "clos" -- un PDL rattaché uniquement à des recommandations dans ces
 * étapes est de nouveau éligible à une nouvelle opportunité (même règle que Tools). */
const ETAPES_CLOSES = new Set(['REFUSEE', 'CLOTUREE', 'CLOTURE'])

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
        etape: 'DIAGNOSTIC',
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

      // Compte rendu de la création des offres attendues, remonté au wizard : une création d'offres
      // qui échoue ne doit plus se contenter d'une ligne de console (voir plus bas).
      let offresCreees = 0
      let offresEchouees = 0
      let fournisseursSansFiche = 0

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
          // Les fournisseurs consultés. On récupère leurs identifiants : ils servent juste après
          // à créer l'offre attendue de chacun.
          const { data: consultes } = await supabase
            .from('optimisations_fournisseurs')
            .insert(input.fournisseur_ids.map((fournisseur_compte_id) => ({ optimisation_id: optimisationId, fournisseur_compte_id })))
            .select('id, fournisseur_compte_id')

          // Une OFFRE PAR FOURNISSEUR CONSULTÉ, créée dès la consultation (demande de Michel,
          // 16/08/2026). La table `offres_fournisseurs` existait avec la bonne clé étrangère
          // (`optimisation_fournisseur_id`) mais comptait ZÉRO ligne : personne ne la remplissait,
          // donc le statut d'une offre n'était visible nulle part et il fallait le déduire de
          // l'historique de consultation.
          //
          // Le statut de départ est ENVOYEE et non le défaut de la colonne (RECUE) : au moment de
          // la consultation, rien n'a encore été reçu. Marquer « reçue » d'emblée ferait croire à
          // une réponse fournisseur qui n'existe pas.
          //
          // Vocabulaire repris de `statuts_consultations_fournisseurs`
          // (ENVOYEE → ACCUSE_RECEPTION → RELANCEE → INFO_COMPLEMENTAIRE_DEMANDEE → RECUE /
          // REFUSEE) plutôt qu'un second jeu de codes à côté : `offres_fournisseurs.statut` est un
          // texte libre sans table de référence, et deux vocabulaires auraient divergé.
          const lignesConsultees = (consultes ?? []) as { id: string; fournisseur_compte_id: string }[]
          if (lignesConsultees.length > 0) {
            // `compte_fournisseur_id` est NOT NULL et référence `comptes_fournisseurs(compte_id)`,
            // PAS `comptes(id)`. Or au 16/08/2026 seuls 19 des 52 comptes de type fournisseur ont
            // une ligne dans `comptes_fournisseurs` : insérer une offre pour l'un des 33 autres
            // partirait en violation de clé étrangère et, en lot, ferait échouer TOUTES les offres
            // de la cotation. On ne crée donc l'offre que pour ceux qui peuvent en porter une.
            const { data: eligibles } = await supabase
              .from('comptes_fournisseurs')
              .select('compte_id')
              .in('compte_id', lignesConsultees.map((cf) => cf.fournisseur_compte_id))
            const idsEligibles = new Set(((eligibles ?? []) as { compte_id: string }[]).map((e) => e.compte_id))

            const avecOffre = lignesConsultees.filter((cf) => idsEligibles.has(cf.fournisseur_compte_id))
            const sansOffre = lignesConsultees.filter((cf) => !idsEligibles.has(cf.fournisseur_compte_id))
            if (sansOffre.length > 0) {
              // Tracé et non tu : le fournisseur reste bien consulté, mais son offre ne peut pas
              // être suivie tant que sa fiche fournisseur n'est pas complétée. Le silence ferait
              // croire à un oubli de l'application.
              console.warn(
                `${sansOffre.length} fournisseur(s) consulté(s) sans fiche dans comptes_fournisseurs : `
                + "aucune offre créée pour eux. Compléter leur fiche fournisseur pour pouvoir suivre l'offre.",
                sansOffre.map((cf) => cf.fournisseur_compte_id),
              )
            }

            fournisseursSansFiche = sansOffre.length

            if (avecOffre.length > 0) {
              /**
               * UNE OFFRE ATTENDUE PAR COMBINAISON DEMANDÉE, et non une seule par fournisseur.
               *
               * Demande de Michel du 17/08/2026 : « il faut qu'on voie sous chaque fournisseur
               * consulté la ou les offres différentes, sinon la version ne sert à rien. » Un
               * fournisseur consulté sur 24 et 36 mois, en fixe et en indexé, répond plusieurs
               * offres — c'est entre elles qu'on arbitre. La grille créée ici EST la consultation
               * envoyée : chaque ligne est une offre demandée, en attente de réponse, que le
               * conseiller complète quand elle arrive.
               *
               * Les durées sont l'union de celles demandées par PDL (au plus 3 par compteur), les
               * types de prix ceux cochés (« Fixe » et/ou « Indexé ») : en pratique 1 à 6 lignes
               * par fournisseur, pas une combinatoire folle.
               */
              const dureesDemandees = [...new Set(Object.values(input.durees_par_compteur).flat())].sort((a, b) => a - b)
              const typesDemandes = input.types_prix.length > 0 ? input.types_prix : [null]
              const combinaisons: { duree: number | null; typePrix: string | null }[] =
                dureesDemandees.length > 0
                  ? dureesDemandees.flatMap((duree) => typesDemandes.map((typePrix) => ({ duree, typePrix })))
                  // Sans durée demandée (cas qui ne devrait pas passer le wizard), une seule ligne
                  // d'attente plutôt que rien : le fournisseur est consulté, ça doit se voir.
                  : [{ duree: null, typePrix: typesDemandes[0] }]

              const lignes = avecOffre.flatMap((cf) =>
                combinaisons.map((c, i) => ({
                  optimisation_id: optimisationId,
                  optimisation_fournisseur_id: cf.id,
                  compte_fournisseur_id: cf.fournisseur_compte_id,
                  // `nom` est NOT NULL SANS valeur par défaut. C'est ce qui faisait échouer toutes
                  // les insertions depuis le 16/08 (erreur 23502), en silence puisque l'échec
                  // n'était que journalisé : `offres_fournisseurs` est restée à 0 ligne. Le libellé
                  // dit ce qui a été demandé, c'est aussi ce que l'écran affiche.
                  nom: [c.duree ? `${c.duree} mois` : null, c.typePrix].filter(Boolean).join(' — ') || 'Offre attendue',
                  duree_mois: c.duree,
                  type_prix: c.typePrix,
                  // « En attente » et non « envoyée » : la demande, elle, est portée par le
                  // fournisseur consulté ; l'offre attend de savoir si ce fournisseur accepte de
                  // coter CETTE durée (réunion du 17/08/2026, statuts à deux étages).
                  statut: 'EN_ATTENTE',
                  est_offre_recommandee: false,
                  ordre_classement: i + 1,
                })),
              )

              const { error: eOffres } = await supabase.from('offres_fournisseurs').insert(lignes)
              if (eOffres) {
                // `type_prix` vient d'une migration du 17/08/2026. Si le code est déployé avant
                // qu'elle soit appliquée, PostgREST rejette la colonne inconnue (PGRST204 / 42703)
                // et TOUTES les offres repartiraient à zéro — exactement la panne qu'on vient de
                // corriger. On retente donc sans la colonne, en le disant.
                const colonneAbsente = eOffres.code === 'PGRST204' || eOffres.code === '42703'
                if (colonneAbsente) {
                  const { error: eRepli } = await supabase.from('offres_fournisseurs').insert(
                    lignes.map(({ type_prix, ...reste }) => {
                      void type_prix
                      return reste
                    }),
                  )
                  if (eRepli) {
                    offresEchouees = lignes.length
                    console.error('Création des offres fournisseurs échouée', eRepli)
                  } else {
                    offresCreees = lignes.length
                    console.warn(
                      "offres_fournisseurs.type_prix absent : offres créées sans le type de prix. "
                      + 'Appliquer la migration 20260817140000_offres_fournisseurs_type_prix.sql.',
                    )
                  }
                } else {
                  // Non bloquant : la cotation est déjà créée à ce stade, on ne perd ni la version
                  // ni les fournisseurs consultés. Mais le compte est remonté à l'appelant, qui le
                  // dit au conseiller — c'est le silence qui a laissé le bug vivre une journée.
                  offresEchouees = lignes.length
                  console.error('Création des offres fournisseurs échouée', eOffres)
                }
              } else {
                offresCreees = lignes.length
              }
            }
          }
        }
      }

      // L'étape de l'opportunité ne passe à "En analyse" qu'à la toute première cotation.
      if (!estActualisation && input.etape_en_analyse_id) {
        await supabase.from('recommandations').update({ etape_id: input.etape_en_analyse_id }).eq('id', input.recommandation_id)
      }

      queryClient.invalidateQueries({ queryKey: ['recommandations'] })
      return { versionId, offresCreees, offresEchouees, fournisseursSansFiche }
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['recommandations'] }) },
  })
}

/**
 * Colonnes réellement modifiables de `recommandations`, pour l'édition en place.
 *
 * Le titre s'appelle `nom` en base et `titre` côté domaine : c'est le nom de la colonne qui
 * compte ici, et c'est le piège le plus facile de ce fichier.
 */
export type PatchRecommandation = Partial<{
  nom: string
  description: string | null
  commentaire_interne: string | null
  priorite: number
  proprietaire_id: string | null
  /** « Contexte de la demande » de l'onglet Commande du client. À ne pas confondre avec
   *  `commentaire_interne`, qui est une note de travail et n'a pas à sortir au client. */
  contexte_demande: string | null
  cout_prestation_estime: number | null
  cout_prestation_reel: number | null
  contact_signataire_id: string | null
}>

/**
 * Clôture d'une recommandation — le geste de la maquette « Fiche Opportunité ».
 *
 * Trois écritures d'un coup, et c'est justement pourquoi ça ne passe pas par l'édition en place :
 * l'étape bascule sur CLOTURE, la finalité est enregistrée, et le motif -- obligatoire -- explique
 * pourquoi. Jusqu'ici on pouvait clore une recommandation sans que personne ne sache pourquoi.
 *
 * `date_cloture` n'est posée que si elle est vide : une recommandation rouverte puis reclôturée ne
 * doit pas perdre sa date d'origine, et c'est exactement ce genre d'écrasement silencieux qui a
 * produit les 1471 dates fausses du 12/08.
 */
export function useCloturerRecommandation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      finalite: 'ACCEPTEE' | 'REFUSEE' | 'EXPIREE'
      motif: string
      dateReactivation?: string | null
      etapeClotureId: string | null
    }) => {
      const motif = input.motif.trim()
      if (motif === '') throw new Error('Le motif est obligatoire.')

      const { data: existant, error: eLecture } = await supabase
        .from('recommandations')
        .select('date_cloture')
        .eq('id', input.id)
        .single()
      if (eLecture) throw new Error(eLecture.message)

      const { error } = await supabase
        .from('recommandations')
        .update({
          finalite_cloture: input.finalite,
          motif_cloture: motif,
          date_reactivation: input.dateReactivation || null,
          date_cloture: existant?.date_cloture ?? new Date().toISOString().slice(0, 10),
          ...(input.etapeClotureId ? { etape_id: input.etapeClotureId } : {}),
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

/**
 * Réouverture — « ↻ Recommandation rouverte » dans la maquette.
 *
 * La finalité et le motif sont effacés (le dossier repart ouvert) mais `date_cloture` est
 * conservée : elle dit quand le dossier a été fermé la première fois, et c'est une information
 * qu'on ne récupère pas si on l'efface.
 */
export function useRouvrirRecommandation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; etapeReouvertureId: string | null }) => {
      const { error } = await supabase
        .from('recommandations')
        .update({
          finalite_cloture: null,
          motif_cloture: null,
          date_reactivation: null,
          ...(input.etapeReouvertureId ? { etape_id: input.etapeReouvertureId } : {}),
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

/** Mise à jour d'un seul champ, sans réécrire toute la recommandation. */
export function useUpdateRecommandationPartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchRecommandation }) => {
      const { error } = await supabase.from('recommandations').update(patch).eq('id', id)
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['recommandations'] }) },
  })
}

/**
 * Statuts d'une OFFRE — une durée × un type de prix.
 *
 * « Sur chacune des durées type, j'aurais juste accepté ou refusé » (réunion du 17/08/2026). Le
 * fournisseur accepte-t-il de coter CETTE durée ? Puis, quand la demande aboutit, l'offre est reçue.
 * `EN_ATTENTE` est l'état de départ : la demande est partie, le fournisseur n'a pas encore dit s'il
 * répondrait sur cette durée-là.
 */
export const STATUTS_OFFRE = [
  { code: 'EN_ATTENTE', libelle: 'En attente' },
  { code: 'ACCEPTEE', libelle: 'Acceptée' },
  { code: 'REFUSEE', libelle: 'Refusée' },
  { code: 'RECUE', libelle: 'Reçue' },
] as const

/**
 * Statut d'un FOURNISSEUR CONSULTÉ, enregistré comme un événement de suivi.
 *
 * Le suivi est un objet d'activité et non un champ (« il faut que ce soit un objet pour qu'il y ait
 * une vraie activité ») : chaque changement ajoute une ligne datée dans
 * `suivis_consultations_fournisseurs`, on garde donc l'historique de la relance et non seulement
 * l'état final.
 *
 * LA RÈGLE MÉTIER DE LA RÉUNION est appliquée ici : « quand je vais basculer à offre reçue, il va
 * mettre en offre reçue QUE l'offre qui a été acceptée ». Les offres refusées restent refusées, et
 * celles encore en attente ne deviennent pas reçues par ricochet — sinon on croirait avoir reçu un
 * prix pour une durée que le fournisseur n'a jamais acceptée de coter.
 */
export function useChangerStatutConsultation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      optimisationFournisseurId: string
      statutId: string
      statutCode: string
      commentaire?: string | null
    }) => {
      const { error } = await supabase.from('suivis_consultations_fournisseurs').insert({
        optimisation_fournisseur_id: input.optimisationFournisseurId,
        statut_id: input.statutId,
        commentaire: input.commentaire ?? null,
      })
      if (error) throw new Error(error.message)

      if (input.statutCode !== 'RECUE') return

      // Seules les offres acceptées passent en reçue.
      const { error: eOffres } = await supabase
        .from('offres_fournisseurs')
        .update({ statut: 'RECUE', date_reception: new Date().toISOString().slice(0, 10), date_modification: new Date().toISOString() })
        .eq('optimisation_fournisseur_id', input.optimisationFournisseurId)
        .eq('statut', 'ACCEPTEE')
      if (eOffres) throw new Error(eOffres.message)
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['recommandations'] }) },
  })
}

/**
 * « Étape suivante » du rail de cycle de vie.
 *
 * Le rail de la maquette compte quatre crans : Diagnostic → Consultation → Décision → Clôture.
 * Ce sont EXACTEMENT les quatre étapes utilisées en base (1573 en Clôture, 93 en Consultation,
 * 31 en Diagnostic, 6 en Décision) ; les neuf autres lignes de `etapes_recommandation` sont
 * l'ancien cycle et n'ont plus aucune recommandation dessus.
 *
 * L'avancée est calculée sur la liste des étapes reçue plutôt que sur des codes en dur : la table
 * a déjà changé une fois (12/08/2026). La clôture n'est jamais atteinte par ce bouton — elle
 * demande une finalité et un motif, c'est `useCloturerRecommandation` qui s'en charge.
 */
export function useAvancerEtapeRecommandation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; etapeSuivanteId: string }) => {
      const { error } = await supabase
        .from('recommandations')
        .update({ etape_id: input.etapeSuivanteId })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

/**
 * Édition en place d'une case du comparatif des versions.
 *
 * Seules les colonnes réellement portées par `versions_recommandation` passent par ici. Le
 * fournisseur, le budget, le prix au MWh et la durée d'engagement du comparatif n'y sont pas :
 * ils appartiennent à l'OFFRE retenue (`offres_fournisseurs` et son détail par compteur), pas à
 * la version. Les rendre modifiables depuis le comparatif reviendrait à réécrire une offre depuis
 * un tableau de comparaison, ou à les écrire nulle part.
 */
export function useUpdateVersionPartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      versionId: string
      patch: Partial<{
        nom: string
        gain_estime_annuel: number | null
        economie_estimee_pourcentage: number | null
        niveau_confiance: number | null
        date_expiration: string | null
      }>
    }) => {
      const { error } = await supabase
        .from('versions_recommandation')
        .update({ ...input.patch, date_modification: new Date().toISOString() })
        .eq('id', input.versionId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

/**
 * Suppression d'une version — « si tu en crées une sans faire exprès » (réunion du 17/08/2026).
 *
 * La cascade est tenue par la base et vérifiée : supprimer la version emporte ses optimisations, ses
 * fournisseurs consultés, leurs offres, leurs suivis, ses compteurs et ses durées. La clé
 * `offres_fournisseurs.optimisation_fournisseur_id` est en NO ACTION et non RESTRICT : la
 * vérification est repoussée à la fin de l'instruction, donc les offres supprimées par l'autre
 * chemin de cascade ne bloquent pas. Testé en transaction annulée avant d'écrire ce code.
 *
 * CE QUE LA BASE NE FAIT PAS ET QU'IL FAUT FAIRE ICI : si la version supprimée était la version
 * actuelle, la recommandation se retrouve sans aucune version active — état incohérent, où la fiche
 * n'a plus de version de référence et où le badge « EN COURS · V… ACTIVE » n'affiche plus rien. On
 * promeut donc la plus haute version restante.
 */
export function useDeleteVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { versionId: string; recommandationId: string }) => {
      const { data: avant, error: eLecture } = await supabase
        .from('versions_recommandation')
        .select('id, version_actuelle')
        .eq('id', input.versionId)
        .maybeSingle()
      if (eLecture) throw new Error(eLecture.message)
      const etaitActuelle = Boolean((avant as { version_actuelle?: boolean } | null)?.version_actuelle)

      const { error } = await supabase.from('versions_recommandation').delete().eq('id', input.versionId)
      if (error) throw new Error(error.message)

      if (!etaitActuelle) return
      const { data: restantes } = await supabase
        .from('versions_recommandation')
        .select('id, numero_version')
        .eq('recommandation_id', input.recommandationId)
        .order('numero_version', { ascending: false })
        .limit(1)
      const remplacante = ((restantes ?? []) as { id: string }[])[0]
      // Aucune version restante : la recommandation repart à l'état d'avant la première cotation,
      // ce qui est cohérent. Rien à promouvoir.
      if (!remplacante) return
      const { error: ePromotion } = await supabase
        .from('versions_recommandation')
        .update({ version_actuelle: true, date_modification: new Date().toISOString() })
        .eq('id', remplacante.id)
      if (ePromotion) throw new Error(ePromotion.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

/**
 * Offres reçues d'un fournisseur consulté — ajouter, corriger, retirer, retenir.
 *
 * « Il faut qu'on voie sous chaque fournisseur consulté la ou les offres différentes, sinon la
 * version ne sert à rien » (Michel, 17/08/2026). Une grille d'offres attendues est créée à la
 * consultation (voir `useCreateVersion`) ; ces mutations servent à la remplir au fil des réponses,
 * et à en ajouter quand un fournisseur propose plus que ce qu'on lui demandait.
 */
export interface PatchOffre {
  nom?: string
  reference_offre?: string | null
  statut?: string
  duree_mois?: number | null
  type_prix?: string | null
  prix_moyen_mwh?: number | null
  montant_annuel_ht?: number | null
  economie_annuelle_estimee?: number | null
  economie_pourcentage?: number | null
  date_reception?: string | null
  date_validite?: string | null
  commentaire_interne?: string | null
}

/** Libellé d'une offre : ce qui la distingue des autres du même fournisseur. */
export function libelleOffre(duree: number | null | undefined, typePrix: string | null | undefined): string {
  return [duree ? `${duree} mois` : null, typePrix].filter(Boolean).join(' — ') || 'Offre'
}

export function useAjouterOffre() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      optimisationId: string
      optimisationFournisseurId: string
      fournisseurCompteId: string
      duree_mois: number | null
      type_prix: string | null
    }) => {
      // `nom` est NOT NULL sans défaut — l'oublier est exactement ce qui a fait échouer en silence
      // toutes les créations d'offres du 16/08/2026.
      const ligne = {
        optimisation_id: input.optimisationId,
        optimisation_fournisseur_id: input.optimisationFournisseurId,
        compte_fournisseur_id: input.fournisseurCompteId,
        nom: libelleOffre(input.duree_mois, input.type_prix),
        duree_mois: input.duree_mois,
        type_prix: input.type_prix,
        statut: 'EN_ATTENTE',
        est_offre_recommandee: false,
      }
      const { error } = await supabase.from('offres_fournisseurs').insert(ligne)
      if (!error) return
      // Repli si la migration 20260817140000 n'est pas encore appliquée : on crée l'offre sans le
      // type de prix plutôt que de refuser la saisie.
      if (error.code === 'PGRST204' || error.code === '42703') {
        const { type_prix, ...sansTypePrix } = ligne
        void type_prix
        const { error: eRepli } = await supabase.from('offres_fournisseurs').insert(sansTypePrix)
        if (eRepli) throw new Error(eRepli.message)
        return
      }
      throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

export function useUpdateOffrePartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ offreId, patch }: { offreId: string; patch: PatchOffre }) => {
      const { error } = await supabase
        .from('offres_fournisseurs')
        .update({ ...patch, date_modification: new Date().toISOString() })
        .eq('id', offreId)
      if (!error) return
      // Une modification n'a pas de repli possible : la valeur n'aurait nulle part où aller. On dit
      // franchement ce qui manque, au lieu de laisser remonter « Could not find the column in the
      // schema cache », que personne ne peut interpréter côté métier.
      if (error.code === 'PGRST204') {
        throw new Error(
          "Le type de prix et le prix au MWh ne sont pas encore en base : appliquer la migration "
          + '20260817140000_offres_fournisseurs_type_prix.sql.',
        )
      }
      throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

export function useSupprimerOffre() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (offreId: string) => {
      const { error } = await supabase.from('offres_fournisseurs').delete().eq('id', offreId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

/**
 * Désigne l'offre retenue de l'optimisation — c'est elle que lit le comparatif des versions.
 *
 * Exclusive dans l'optimisation : les autres repassent à `false` d'abord. Deux offres retenues ne
 * voudraient rien dire, et le comparatif en prendrait une au hasard.
 */
export function useRetenirOffre() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { optimisationId: string; offreId: string | null }) => {
      const { error: eRetrait } = await supabase
        .from('offres_fournisseurs')
        .update({ est_offre_recommandee: false, date_modification: new Date().toISOString() })
        .eq('optimisation_id', input.optimisationId)
        .eq('est_offre_recommandee', true)
      if (eRetrait) throw new Error(eRetrait.message)

      if (!input.offreId) return

      const { error } = await supabase
        .from('offres_fournisseurs')
        .update({ est_offre_recommandee: true, date_modification: new Date().toISOString() })
        .eq('id', input.offreId)
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['recommandations'] }) },
  })
}

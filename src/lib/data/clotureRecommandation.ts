import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { annoncerLeDealGagne, echeanceDansLAnnee } from '@/lib/data/recommandations'
import type { DatesContrat } from '@/lib/contratsProspects'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CLÔTURER UNE RECOMMANDATION — TROIS ISSUES, TROIS PARCOURS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « Quand je clôture une opportunité via le bouton "Clôturer", on doit me
 * proposer les 3 possibilités "Acceptée", "Refusée" ou "Expirée" » — chacune avec sa fenêtre et
 * ses deux étapes. Ce fichier est ce que les trois fenêtres écrivent.
 *
 *   ACCEPTÉE   les montants, puis la date. Pas de motif : « inutile quand on gagne ». Exige un
 *              contrat VALIDÉ, plus seulement signé.
 *   REFUSÉE    un contrat prospect par compteur du périmètre (même saisie que « Éditer
 *              l'échéance »), puis le motif. L'opportunité de suivi de Michel (20/09/2026) reste :
 *              elle naît quand l'échéance tombe dans les douze mois.
 *   EXPIRÉE    une tâche de rappel facultative pour le propriétaire, puis le motif.
 *
 * DANS LES TROIS CAS, LES VERSIONS ENCORE OUVERTES SE FERMENT AVEC LE MÊME RÉSULTAT que la
 * recommandation (décision de William du 01/10/2026). Celles qui étaient déjà closes gardent le
 * leur : une V1 expirée avant que la V2 soit acceptée reste expirée.
 *
 * ══ L'ORDRE DES ÉCRITURES ══
 *
 * Les montants d'abord : l'annonce Slack du deal gagné lit `marge_nette_coeff` au moment de la
 * clôture. La clôture ensuite, puis les versions. Ce qui suit — contrats prospects, opportunité,
 * tâche — vient APRÈS et séparément : la clôture est un fait acquis dès qu'elle est écrite, et un
 * échec sur la suite ne doit pas pousser à recliquer sur « Clôturer ». Les échecs remontent dans
 * `erreurs`, la fenêtre les dit.
 */

/** Les statuts de version qui disent qu'une version est déjà close. Les autres se ferment. */
const STATUTS_VERSION_CLOS = ['CLOTUREE', 'ACCEPTEE', 'REFUSEE', 'REMPLACEE', 'EXPIREE', 'ARCHIVEE']

export interface ProspectApresRefus {
  compteur_id: string
  fournisseur_compte_id: string | null
  date_debut: string | null
  date_fin: string | null
  duree_mois: number | null
}

/** Les colonnes de montant qu'écrit la clôture acceptée. N'y figure que ce qui a changé. */
export type MontantsCloture = Partial<{
  marge_brute: number | null
  commission_intermediaire: number | null
  marge_apporteur: number | null
  marge_nette: number | null
  chiffre_affaires: number | null
  marge_nette_coeff: number | null
}>

export type IssueCloture =
  | { finalite: 'ACCEPTEE'; montants: MontantsCloture }
  | {
      finalite: 'REFUSEE'
      motif: string
      prospects: ProspectApresRefus[]
      /** L'échéance saisie, ou null si elle est indéterminée. Elle décide de l'opportunité. */
      echeance: string | null
    }
  | { finalite: 'EXPIREE'; motif: string; rappel: { titre: string; date: string } | null }

export interface BilanCloture {
  versionsFermees: number
  prospectsCrees: number
  opportuniteId: string | null
  tacheCreee: boolean
  erreurs: string[]
}

export function useCloturerRecommandationParcours() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; dateCloture: string; issue: IssueCloture }): Promise<BilanCloture> => {
      const { id, dateCloture, issue } = input
      if (!dateCloture) throw new Error('La date de clôture est obligatoire.')
      const motif = issue.finalite === 'ACCEPTEE' ? null : issue.motif.trim()
      if (motif === '') throw new Error('Le motif est obligatoire.')

      /* LE MÊME CONTRÔLE QU'À L'ÉCRAN, refait ici contre la base : un bouton désactivé empêche le
         clic, pas l'appel — et le contrat a pu changer depuis le chargement de la fiche. */
      if (issue.finalite === 'ACCEPTEE') {
        const { count, error } = await supabase
          .from('contrats')
          .select('id', { count: 'exact', head: true })
          .eq('recommandation_id', id)
          .eq('actif', true)
          .not('date_validation', 'is', null)
        if (error) throw new Error(error.message)
        if (!count) throw new Error('Le contrat lié doit être validé avant de clôturer en « Acceptée ».')

        if (Object.keys(issue.montants).length > 0) {
          const { error: eMontants } = await supabase.from('recommandations').update(issue.montants).eq('id', id)
          if (eMontants) throw new Error(eMontants.message)
        }
      }

      const { error } = await supabase
        .from('recommandations')
        .update({
          finalite_cloture: issue.finalite,
          motif_cloture: motif,
          date_cloture: dateCloture,
          /* La date du rappel, quand il y en a un : la fiche l'affiche (« à reprendre le … »). */
          date_reactivation: issue.finalite === 'EXPIREE' ? (issue.rappel?.date ?? null) : null,
          /* CE QUI FERME VRAIMENT LE DOSSIER — voir `useCloturerRecommandation`. */
          date_cloture_manuelle: new Date().toISOString(),
          /* UNE ÉTAPE POSÉE À LA MAIN BLOQUERAIT LA CLÔTURE : le calcul de statut sort sans rien
             faire tant qu'elle existe (`recalculer_statut_recommandation`). Clôturer est le geste
             manuel le plus récent ; c'est lui qui doit tenir. Rouvrir l'efface aussi. */
          date_etape_manuelle: null,
        })
        .eq('id', id)
      if (error) throw new Error(error.message)

      const bilan: BilanCloture = { versionsFermees: 0, prospectsCrees: 0, opportuniteId: null, tacheCreee: false, erreurs: [] }

      try {
        bilan.versionsFermees = await fermerLesVersions(id, issue.finalite)
      } catch (e) {
        bilan.erreurs.push(`Versions non clôturées : ${message(e)}`)
      }

      if (issue.finalite === 'ACCEPTEE') {
        /* Sans `await` : la félicitation ne retarde pas la fermeture de la fenêtre. */
        void annoncerLeDealGagne(id)
      }

      if (issue.finalite === 'REFUSEE') {
        if (issue.prospects.length > 0) {
          const { error: eProspects } = await supabase.from('contrats_prospects').insert(issue.prospects)
          if (eProspects) bilan.erreurs.push(`Contrats prospects non créés : ${eProspects.message}`)
          else bilan.prospectsCrees = issue.prospects.length
        }
        /* LA RÈGLE DES DOUZE MOIS DE MICHEL : une échéance proche rouvre la porte, une lointaine
           n'a rien à suivre avant longtemps. Une échéance indéterminée se suit — on ne sait pas
           quand le client se libère, donc on ne le laisse pas filer. */
        if (!issue.echeance || echeanceDansLAnnee(issue.echeance)) {
          try {
            bilan.opportuniteId = await creerOpportuniteDeSuivi(id, issue.echeance, issue.prospects.map((p) => p.compteur_id))
          } catch (e) {
            bilan.erreurs.push(`Opportunité de suivi non créée : ${message(e)}`)
          }
        }
      }

      if (issue.finalite === 'EXPIREE' && issue.rappel) {
        try {
          await creerRappel(id, issue.rappel)
          bilan.tacheCreee = true
        } catch (e) {
          bilan.erreurs.push(`Tâche de rappel non créée : ${message(e)}`)
        }
      }

      return bilan
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recommandations'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunites'] })
      void queryClient.invalidateQueries({ queryKey: ['compteurs'] })
      void queryClient.invalidateQueries({ queryKey: ['contrats_prospects'] })
      void queryClient.invalidateQueries({ queryKey: ['actions'] })
      void queryClient.invalidateQueries({ queryKey: ['tableau-de-bord', 'mes-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['kanban-serveur'] })
      void queryClient.invalidateQueries({ queryKey: ['offres-du-jour'] })
      void queryClient.invalidateQueries({ queryKey: ['totaux-offres'] })
    },
  })
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Ferme les versions encore ouvertes avec le résultat de la recommandation. Rend leur nombre. */
async function fermerLesVersions(recommandationId: string, resultat: 'ACCEPTEE' | 'REFUSEE' | 'EXPIREE'): Promise<number> {
  const { data: statuts, error: eStatuts } = await supabase
    .from('statuts_versions_recommandation')
    .select('id, code')
  if (eStatuts) throw new Error(eStatuts.message)
  const liste = (statuts ?? []) as { id: string; code: string }[]
  const cloturee = liste.find((s) => s.code === 'CLOTUREE')
  if (!cloturee) throw new Error('Statut « Clôturée » introuvable.')
  const clos = new Set(liste.filter((s) => STATUTS_VERSION_CLOS.includes(s.code)).map((s) => s.id))

  const { data: versions, error: eVersions } = await supabase
    .from('versions_recommandation')
    .select('id, statut_version_id')
    .eq('recommandation_id', recommandationId)
  if (eVersions) throw new Error(eVersions.message)
  /* Une version SANS statut est ouverte : rien ne dit qu'elle a été close. */
  const ouvertes = ((versions ?? []) as { id: string; statut_version_id: string | null }[])
    .filter((v) => !v.statut_version_id || !clos.has(v.statut_version_id))
    .map((v) => v.id)
  if (ouvertes.length === 0) return 0

  const { error } = await supabase
    .from('versions_recommandation')
    .update({ statut_version_id: cloturee.id, resultat, date_modification: new Date().toISOString() })
    .in('id', ouvertes)
  if (error) throw new Error(error.message)
  return ouvertes.length
}

/** L'opportunité de suivi après une perte — la règle de Michel du 20/09/2026, sur les compteurs du périmètre. */
async function creerOpportuniteDeSuivi(recommandationId: string, echeance: string | null, compteurIds: string[]): Promise<string> {
  const { data: reco } = await supabase
    .from('recommandations')
    .select('compte_id, contact_principal_id, contact_signataire_id, nom, proprietaire_id')
    .eq('id', recommandationId)
    .maybeSingle()
  const { data: statutNouvelle } = await supabase
    .from('statuts_opportunites').select('id').eq('code', 'NOUVELLE').maybeSingle()

  const { data: creee, error } = await supabase
    .from('opportunites')
    .insert({
      compte_id: reco?.compte_id ?? null,
      contact_id: reco?.contact_principal_id ?? reco?.contact_signataire_id ?? null,
      origine: 'PORTEFEUILLE',
      type_opportunite: 'Renouvellement',
      ...(statutNouvelle ? { statut_id: statutNouvelle.id } : {}),
      ...(reco?.proprietaire_id ? { proprietaire_id: reco.proprietaire_id } : {}),
      recommandation_origine_id: recommandationId,
      commentaire: `Suivi après la recommandation perdue « ${reco?.nom ?? ''} »`
        + (echeance ? ` — échéance au ${echeance}` : ' — échéance inconnue'),
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const opportuniteId = (creee as { id: string }).id
  if (compteurIds.length > 0) {
    await supabase
      .from('opportunites_compteurs')
      .insert(compteurIds.map((k) => ({ opportunite_id: opportuniteId, compteur_id: k })))
  }
  return opportuniteId
}

/**
 * La tâche de rappel d'une recommandation expirée. ELLE VA AU PROPRIÉTAIRE DU DOSSIER, pas à celui
 * qui clique : c'est lui qui rappellera le client. Sans propriétaire, elle revient à l'auteur —
 * une tâche sans responsable n'apparaît dans aucune journée (voir `useCreateAction`).
 */
async function creerRappel(recommandationId: string, rappel: { titre: string; date: string }): Promise<void> {
  const { data: reco } = await supabase
    .from('recommandations')
    .select('compte_id, proprietaire_id, contact_principal_id, contact_signataire_id')
    .eq('id', recommandationId)
    .maybeSingle()
  const { data: utilisateur } = await supabase.auth.getUser()
  const moi = utilisateur?.user?.id ?? null
  const { data: aFaire } = await supabase.from('statuts_actions').select('id').eq('code', 'A_FAIRE').maybeSingle()
  const responsable = reco?.proprietaire_id ?? moi

  const { error } = await supabase.from('actions').insert({
    titre: rappel.titre.trim(),
    date_prevue: rappel.date,
    priorite: 50,
    recommandation_id: recommandationId,
    compte_id: reco?.compte_id ?? null,
    contact_id: reco?.contact_principal_id ?? reco?.contact_signataire_id ?? null,
    commentaire: 'Créée à la clôture de la recommandation en « Expirée ».',
    ...(moi ? { proprietaire_id: moi } : {}),
    ...(responsable ? { responsable_profil_id: responsable } : {}),
    ...(aFaire ? { statut_id: aFaire.id } : {}),
  })
  if (error) throw new Error(error.message)
}

/**
 * LES CONTRATS DÉJÀ CONNUS DE CHAQUE COMPTEUR du périmètre, clients et prospects confondus. C'est
 * parmi eux que se trouve celui dont le nouveau contrat prospect prend la suite : sa fin donne le
 * début, et la durée proposée.
 */
export function useContratsConnusDesCompteurs(compteurIds: string[]) {
  return useQuery({
    queryKey: ['contrats_prospects', 'cloture', [...compteurIds].sort().join(',')],
    enabled: compteurIds.length > 0,
    queryFn: async (): Promise<Record<string, DatesContrat[]>> => {
      const [clients, prospects] = await Promise.all([
        supabase
          .from('contrats_compteurs')
          .select('compteur_id, contrat:contrats(date_debut, date_fin, actif)')
          .in('compteur_id', compteurIds),
        supabase
          .from('contrats_prospects')
          .select('compteur_id, date_debut, date_fin')
          .in('compteur_id', compteurIds),
      ])
      if (clients.error) throw new Error(clients.error.message)
      if (prospects.error) throw new Error(prospects.error.message)

      const parCompteur: Record<string, DatesContrat[]> = Object.fromEntries(compteurIds.map((k) => [k, []]))
      type LienClient = { compteur_id: string; contrat: { date_debut: string | null; date_fin: string | null; actif: boolean } | { date_debut: string | null; date_fin: string | null; actif: boolean }[] | null }
      for (const l of (clients.data ?? []) as unknown as LienClient[]) {
        const c = Array.isArray(l.contrat) ? l.contrat[0] : l.contrat
        if (c && c.actif) parCompteur[l.compteur_id]?.push({ date_debut: c.date_debut, date_fin: c.date_fin })
      }
      for (const p of (prospects.data ?? []) as { compteur_id: string; date_debut: string | null; date_fin: string | null }[]) {
        parCompteur[p.compteur_id]?.push({ date_debut: p.date_debut, date_fin: p.date_fin })
      }
      return parCompteur
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { enregistrerPrixCompteur, fetchRecommandationUnique } from '@/lib/data/recommandations'
import type { Compteur, OffreFournisseur, Recommandation, VersionRecommandation } from '@/types/domain'
import type { CircuitFournisseur, ModeReponse } from '@/lib/parcoursPrix/etatOffres'
import { calculerOffre } from '@/lib/parcoursPrix/calcul'
import { recupererPrixTradeo, type RapportTradeo } from '@/lib/parcoursPrix/sourceTradeo'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PARCOURS DE PRIX D'UNE VERSION — LECTURES ET ÉCRITURES
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Michel, 28/09/2026 : créer la version → chaque offre « Prix disponible » ou « En attente pour le
 * … » → « Calculer » → les prix arrivent, on relance → valider et générer le document.
 *
 * TOUTES LES ÉCRITURES PASSENT PAR LES MUTATIONS EXISTANTES quand elles existent — la saisie d'un
 * prix par compteur (`enregistrerPrixCompteur`), le statut d'une offre, celui d'une version. Une
 * seconde manière d'écrire un prix finirait par diverger de la première, et c'est la fiche qui
 * afficherait autre chose que le parcours.
 */

/** Le circuit de chaque fournisseur consulté : son mode de réponse et son délai. */
export function useCircuitsFournisseurs(compteIds: string[]) {
  const cle = [...new Set(compteIds)].sort()
  return useQuery({
    queryKey: ['parcours-prix', 'circuits', cle],
    enabled: cle.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, CircuitFournisseur>> => {
      const { data, error } = await supabase
        .from('comptes_fournisseurs')
        .select('compte_id, mode_reponse, response_delay_days')
        .in('compte_id', cle)
      if (error) throw new Error(error.message)
      return new Map(
        ((data ?? []) as { compte_id: string; mode_reponse: ModeReponse | null; response_delay_days: number | null }[])
          .map((l) => [l.compte_id, { mode_reponse: l.mode_reponse, response_delay_days: l.response_delay_days }]),
      )
    },
  })
}

/** Le SIRET du compte : c'est par lui que Tradeo retrouve les compteurs. */
export function useSiretCompte(compteId: string | null | undefined) {
  return useQuery({
    queryKey: ['parcours-prix', 'siret', compteId],
    enabled: Boolean(compteId),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('comptes').select('siret').eq('id', compteId as string).maybeSingle()
      return (data as { siret: string | null } | null)?.siret ?? null
    },
  })
}

export function useMajDateDebutFourniture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { versionId: string; date: string | null }) => {
      const { error } = await supabase
        .from('versions_recommandation')
        .update({ date_debut_fourniture: input.date, date_modification: new Date().toISOString() })
        .eq('id', input.versionId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

/** Toutes les offres d'une version, avec le compte du fournisseur qui les porte. */
export function offresDeLaVersion(version: VersionRecommandation): { offre: OffreFournisseur; fournisseurCompteId: string | null; optimisationId: string }[] {
  return version.optimisations.flatMap((op) =>
    op.offres.map((offre) => ({
      offre,
      optimisationId: op.id,
      fournisseurCompteId: op.fournisseurs_consultes.find((f) => f.id === offre.optimisation_fournisseur_id)?.fournisseur_compte_id ?? null,
    })),
  )
}

export interface CompteRenduCalcul {
  tradeo: RapportTradeo | null
  prixTradeoEcrits: number
  lignesEcrites: number
  offresDisponibles: number
  erreurs: string[]
}

/**
 * « CALCULER ». Deux temps, dans cet ordre :
 *
 *   1. RÉCUPÉRER : les fournisseurs TRADEO sont interrogés par l'API ; leurs P0 s'écrivent. Les
 *      autres circuits (mail, plateforme, grille) n'ont pas d'API : leur « processus prévu », c'est la
 *      saisie par le pricing — on lit ce qui a déjà été saisi.
 *   2. CALCULER : chaque offre est recalculée sur les prix RELUS en base (ceux du temps 1 compris),
 *      avec la marge de chaque ligne ou celle qu'on impose ; budgets et prix présentés s'écrivent par
 *      la même mutation que la saisie, et le total se reporte sur l'offre.
 *
 * RELANÇABLE À VOLONTÉ, comme Michel le décrit : un second clic ne fait que réécrire les mêmes
 * valeurs, ou les nouvelles si des prix sont arrivés entre-temps.
 *
 * L'offre passe « DISPONIBLE » en base quand tous ses compteurs sont chiffrés : c'est ce que lisent
 * la page Pricing et la journée d'Erwan. Une offre refusée n'est jamais touchée.
 */
export function useCalculerVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      recommandationId: string
      versionId: string
      compteurs: Compteur[]
      siret: string | null
      circuits: Map<string, CircuitFournisseur>
      /** Une marge par offre (marge ciblée), ou une seule pour toutes. Absentes : chaque ligne garde la sienne. */
      margeParOffre?: Map<string, number>
      margeUnique?: number | null
    }): Promise<CompteRendu> => {
      const erreurs: string[] = []
      const parId = new Map(input.compteurs.map((c) => [c.id, c]))
      const lire = async (): Promise<{ reco: Recommandation; version: VersionRecommandation }> => {
        const reco = await fetchRecommandationUnique(input.recommandationId)
        const version = reco?.versions.find((v) => v.id === input.versionId)
        if (!reco || !version) throw new Error('Version introuvable.')
        return { reco, version }
      }

      // ① Récupérer
      let { version } = await lire()
      const tradeoOffres = offresDeLaVersion(version)
        .filter((o) => o.offre.statut !== 'INDISPONIBLE' && o.fournisseurCompteId && input.circuits.get(o.fournisseurCompteId)?.mode_reponse === 'TRADEO')
        .map((o) => o.offre)
      let tradeo: RapportTradeo | null = null
      let prixTradeoEcrits = 0
      if (tradeoOffres.length > 0) {
        tradeo = await recupererPrixTradeo({ siret: input.siret, version, offres: tradeoOffres, compteurs: parId })
        for (const e of tradeo.ecritures) {
          try {
            await enregistrerPrixCompteur({ offreId: e.offreId, versionCompteurId: e.lienId, energie: e.energie, prix: e.prix })
            prixTradeoEcrits += 1
          } catch (err) {
            erreurs.push(`Prix Tradeo non écrit : ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        if (prixTradeoEcrits > 0) ({ version } = await lire())
      }

      // ② Calculer
      let lignesEcrites = 0
      let offresDisponibles = 0
      for (const { offre } of offresDeLaVersion(version)) {
        if (offre.statut === 'INDISPONIBLE') continue
        const marge = input.margeParOffre?.get(offre.id) ?? (input.margeUnique ?? undefined)
        const calcul = calculerOffre(offre, version, parId, marge)
        for (const l of calcul.lignes) {
          if (!l.ecriture) continue
          try {
            await enregistrerPrixCompteur({ offreId: offre.id, versionCompteurId: l.lienId, energie: l.gaz ? 'gaz' : 'electricite', prix: l.ecriture })
            lignesEcrites += 1
          } catch (err) {
            erreurs.push(`${offre.fournisseur_nom}, ${l.libelle} : ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        if (calcul.complete) {
          offresDisponibles += 1
          if (offre.statut !== 'DISPONIBLE') {
            const { error } = await supabase.from('offres_fournisseurs').update({ statut: 'DISPONIBLE', date_modification: new Date().toISOString() }).eq('id', offre.id)
            if (error) erreurs.push(`${offre.fournisseur_nom} : statut non mis à jour (${error.message})`)
          }
        }
      }
      return { tradeo, prixTradeoEcrits, lignesEcrites, offresDisponibles, erreurs }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}
type CompteRendu = CompteRenduCalcul

/**
 * LE PASSAGE EN « DISPONIBLE », proposé et non imposé (William, 18/09/2026, migration
 * 20260918130000) : l'écran le propose quand toutes les offres ont répondu, une personne valide.
 */
export function useValiderVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { data: statut, error: e1 } = await supabase.from('statuts_versions_recommandation').select('id').eq('code', 'DISPONIBLE').single()
      if (e1) throw new Error(e1.message)
      const { error } = await supabase
        .from('versions_recommandation')
        .update({ statut_version_id: (statut as { id: string }).id, date_modification: new Date().toISOString() })
        .eq('id', versionId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recommandations'] })
      void queryClient.invalidateQueries({ queryKey: ['kanban-serveur'] })
    },
  })
}

/**
 * LE DOSSIER D'ESSAI. Naoëlle, 28/09/2026, mise devant le choix : le banc n'écrit que sur les
 * recommandations du compte KIWEE ENERGIE FRANCE. Créer une version sur un vrai dossier fait expirer
 * celle sur laquelle le commercial travaille.
 */
export const COMPTE_D_ESSAI_ID = 'a05fa38d-8de9-4643-b8b4-c3a7cb4ac01b'

export interface RecoChoisissable {
  id: string
  nom: string
  compte_nom: string | null
  compte_id: string | null
  /** Le SIRET du compte : c'est par lui qu'une demande Tradeo retrouve son dossier. */
  siret: string | null
  ecriture: boolean
}

export function useRecommandationsPourParcours() {
  return useQuery({
    queryKey: ['parcours-prix', 'recommandations'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<RecoChoisissable[]> => {
      const [essai, ouvertes] = await Promise.all([
        supabase.from('recommandations').select('id, nom, compte_id, compte:comptes!recommandations_compte_id_fkey(nom, siret)').eq('compte_id', COMPTE_D_ESSAI_ID).order('date_creation', { ascending: false }),
        /* TOUS LES DOSSIERS NON CLÔTURÉS, et non la seule vue du Pricing : elle écarte les versions
           closes, donc les 84 dossiers « À réactiver » — ceux qu'on relance pour redemander des prix
           (Naoëlle, 29/09/2026, sur DIMOTRANS - GT: 1 rue de FERCHAUD CREVIN). */
        supabase.from('recommandations').select('id, nom, compte_id, compte:comptes!recommandations_compte_id_fkey(nom, siret), etape:etapes_recommandation!inner(code)').neq('etape.code', 'CLOTUREE'),
      ])
      if (essai.error) throw new Error(essai.error.message)
      if (ouvertes.error) throw new Error(ouvertes.error.message)
      const liste: RecoChoisissable[] = ((essai.data ?? []) as unknown as { id: string; nom: string; compte_id: string; compte: { nom: string; siret: string | null } | null }[])
        .map((r) => ({ id: r.id, nom: r.nom, compte_id: r.compte_id, compte_nom: r.compte?.nom ?? null, siret: r.compte?.siret ?? null, ecriture: true }))
      const vus = new Set(liste.map((r) => r.id))
      for (const r of (ouvertes.data ?? []) as unknown as { id: string; nom: string; compte_id: string | null; compte: { nom: string; siret: string | null } | null }[]) {
        if (vus.has(r.id)) continue
        vus.add(r.id)
        liste.push({ id: r.id, nom: r.nom, compte_id: r.compte_id, compte_nom: r.compte?.nom ?? null, siret: r.compte?.siret ?? null, ecriture: r.compte_id === COMPTE_D_ESSAI_ID })
      }
      liste.sort((a, b) => Number(b.ecriture) - Number(a.ecriture) || `${a.compte_nom ?? ''}${a.nom}`.localeCompare(`${b.compte_nom ?? ''}${b.nom}`, 'fr'))
      return liste
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMonProfil } from '@/lib/data/roles'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE COCKPIT — LA PROSPECTION EN UN SEUL ENDROIT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 14 et 15/09/2026 : « créer et centraliser la prospection sur Kimatch dans un outil
 * dédié Cockpit ». Deux zones, et elles ne font pas le même travail :
 *
 *   LE PIPE DU JOUR   soixante actions, figées le matin, sur des pistes et des opportunités
 *   LE VIVIER         illimité, sur des contacts — ce qu'on transforme pour alimenter le pipe
 *
 * Tout le calcul est en base (migrations 20260915090000 à 20260915093000). Ce fichier ne fait que
 * lire et déclencher : pas un seau, pas un filtre, pas un périmètre n'est décidé ici.
 *
 * ══ POURQUOI LE PÉRIMÈTRE N'EST PAS PASSÉ EN PARAMÈTRE ══
 *
 * `lister_pipe_du_jour` et `construire_pipe_du_jour` lisent `auth.uid()` elles-mêmes. Un filtre
 * passé depuis le navigateur se change dans la console ; lu en base, il ne se contourne pas. C'est
 * la règle posée pour `compter_cartes_du_jour` (migration 20260910290000) et elle vaut ici deux
 * fois plus : le Cockpit montre des numéros de téléphone.
 *
 * La seule exception est le vivier, dont la vue est volontairement NEUTRE — comme
 * `v_echeances_a_traiter`, elle sert aussi à des lectures qui ne sont pas « les miennes ». C'est
 * donc ici qu'on filtre sur `compte_proprietaire_id`, et le filtre est explicite plutôt que caché.
 *
 * ══ LA MIGRATION PEUT N'ÊTRE PAS ENCORE APPLIQUÉE ══
 *
 * Entre le push et l'application du SQL par Naoëlle ou Michel, les fonctions n'existent pas. On
 * rend alors une liste vide et un drapeau `pretMigration: false`, que l'écran affiche — plutôt que
 * de faire blanchir la page ou, pire, de prétendre que le pipe est vide. Même garde que
 * `fileAppels.ts` et `echeancesATraiter.ts`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ABSENTE = /does not exist|schema cache|404|Could not find the function/i

function estAbsente(message: string): boolean {
  return ABSENTE.test(message)
}

/** Une ligne du pipe, telle que `lister_pipe_du_jour` la rend. */
export interface LignePipe {
  ligne_id: string
  cible_type: 'PISTE' | 'OPPORTUNITE'
  cible_id: string
  source: SourcePipe
  rang: number
  nom_complet: string | null
  fonction: string | null
  compte_nom: string | null
  segment: string | null
  telephone: string | null
  telephone_mobile: string | null
  /** `null` veut dire « pas d'heure » : une tâche à minuit n'en a pas (voir `heureTache.ts`). */
  heure: string | null
  en_retard: boolean
  compte_id: string | null
  contact_id: string | null
  compteurs: number
  mwh_annuels: number | null
  echeance: string | null
  nature_echeance: string | null
  taches_ouvertes: number
  commentaire: string | null
  /** Le dernier échange enregistré AVEC LE CONTACT — pas avec l'objet. */
  dernier_echange: string | null
  /** Ce qui s'est dit : le résumé du commercial, ou celui d'Allo à défaut. */
  dernier_resume: string | null
}

export type SourcePipe =
  | 'INBOUND'
  | 'RAPPEL_HEURE'
  | 'RAPPEL_JOUR'
  | 'OPPORTUNITE_DORMANTE'
  | 'VIVIER'
  | 'PISTE_FROIDE'
  | 'INBOUND_LIVE'
  | 'AJOUT_MANUEL'

/** Ce que chaque source veut dire à l'écran. Les libellés vivent ici et nulle part ailleurs. */
export const LIBELLE_SOURCE: Record<SourcePipe, string> = {
  INBOUND: 'Lead entrant',
  RAPPEL_HEURE: 'Rappel à l’heure',
  RAPPEL_JOUR: 'Rappel du jour',
  OPPORTUNITE_DORMANTE: 'Sans tâche depuis',
  VIVIER: 'Transformé du vivier',
  PISTE_FROIDE: 'Piste froide',
  INBOUND_LIVE: 'Lead entrant, à l’instant',
  AJOUT_MANUEL: 'Ajouté à la main',
}

export interface Pipe {
  lignes: LignePipe[]
  /** Faux quand les fonctions n'existent pas encore : l'écran le dit au lieu d'afficher « vide ». */
  pretMigration: boolean
}

const PIPE_VIDE: Pipe = { lignes: [], pretMigration: false }

/**
 * Le pipe du jour, construit puis lu.
 *
 * LA CONSTRUCTION EST DANS LA LECTURE, et c'est ce qui rend le pipe figé sans qu'aucun traitement
 * planifié n'existe : la première ouverture de la journée l'arrête, les suivantes ne font rien.
 * `construire_pipe_du_jour` est idempotente — appelée quinze fois, elle rend quinze fois le même
 * effectif sans rien réécrire.
 */
export function usePipeDuJour() {
  return useQuery({
    queryKey: ['cockpit', 'pipe'],
    retry: false,
    staleTime: 0,
    queryFn: async (): Promise<Pipe> => {
      const construction = await supabase.rpc('construire_pipe_du_jour')
      if (construction.error && estAbsente(construction.error.message)) return PIPE_VIDE
      if (construction.error) throw new Error(construction.error.message)

      const { data, error } = await supabase.rpc('lister_pipe_du_jour')
      if (error) {
        if (estAbsente(error.message)) return PIPE_VIDE
        throw new Error(error.message)
      }
      return { lignes: (data ?? []) as LignePipe[], pretMigration: true }
    },
  })
}

/** Une ligne du vivier : un contact, son compte, et pourquoi il est éligible. */
export interface LigneVivier {
  contact_id: string
  compte_id: string | null
  compte_nom: string | null
  compte_segment: string | null
  compte_proprietaire_id: string | null
  nom_complet: string | null
  fonction: string | null
  roles: string[] | null
  telephone: string | null
  telephone_mobile: string | null
  compteurs_total: number
  compteurs_qualifiants: number
  mwh_annuels: number | null
  echeance_min: string | null
  compteurs_sans_echeance: number
  critere: 'ECHEANCE_18_MOIS' | 'SANS_PERIMETRE'
  echeance_depassee: boolean
}

export const LIBELLE_CRITERE: Record<LigneVivier['critere'], string> = {
  ECHEANCE_18_MOIS: 'Échéance < 18 mois',
  SANS_PERIMETRE: 'Sans périmètre',
}

export interface Vivier {
  lignes: LigneVivier[]
  pretMigration: boolean
}

/**
 * Mon vivier, trié comme la fiche compte trie ses échéances : l'urgence d'abord, le volume
 * ensuite — « à urgence égale, c'est le montant en jeu qui départage » (migration 20260911150000).
 *
 * LES LIGNES « SANS PÉRIMÈTRE » N'ONT NI ÉCHÉANCE NI VOLUME : elles passent après, dans un ordre
 * stable. Les mêler au tri d'urgence les ferait remonter ou descendre au hasard des nuls.
 */
export function useVivier() {
  const { data: profil } = useMonProfil()
  const moi = profil?.id
  return useQuery({
    queryKey: ['cockpit', 'vivier', moi],
    enabled: Boolean(moi),
    retry: false,
    queryFn: async (): Promise<Vivier> => {
      const { data, error } = await supabase
        .from('v_vivier_cockpit')
        .select('*')
        .eq('compte_proprietaire_id', moi)
        .order('echeance_min', { ascending: true, nullsFirst: false })
        .order('mwh_annuels', { ascending: false, nullsFirst: false })
        .limit(1000)
      if (error) {
        if (estAbsente(error.message)) return { lignes: [], pretMigration: false }
        throw new Error(error.message)
      }
      return { lignes: (data ?? []) as LigneVivier[], pretMigration: true }
    },
  })
}

/**
 * Les quatre nombres du seuil — ce qui attend le conseiller avant qu'il entre.
 *
 * ILS SE COMPTENT DANS LE PIPE DÉJÀ CONSTRUIT, et non par quatre requêtes de plus. Le seuil
 * s'affiche après la construction : compter les seaux une seconde fois donnerait deux chiffres pour
 * la même chose, qui divergeraient dès qu'une règle de seau bouge.
 */
export interface Attente {
  inbound: number
  rappelsHeure: number
  rappelsJour: number
  aTransformer: number
  total: number
  traitees: number
}

export function compterAttente(lignes: LignePipe[], placeVivier: number): Attente {
  const par = (s: SourcePipe) => lignes.filter((l) => l.source === s).length
  return {
    inbound: par('INBOUND') + par('INBOUND_LIVE'),
    rappelsHeure: par('RAPPEL_HEURE'),
    rappelsJour: par('RAPPEL_JOUR'),
    /* Ce qu'il reste à transformer, c'est la place libre dans le pipe — pas la taille du vivier.
       Annoncer « 214 à transformer » quand dix-sept entreront aujourd'hui serait un chiffre juste
       et une information fausse. */
    aTransformer: placeVivier,
    total: lignes.length,
    traitees: 0,
  }
}

/** Compléter le pipe : tire au hasard dans le vivier et crée les opportunités. */
export function useCompleterPipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (combien?: number) => {
      const { data, error } = await supabase.rpc('completer_pipe_du_jour', {
        p_combien: combien ?? null,
      })
      if (error) throw new Error(error.message)
      return (data ?? 0) as number
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit'] })
      void qc.invalidateQueries({ queryKey: ['opportunites'] })
    },
  })
}

/** Ajouter des contacts choisis : crée leurs opportunités et passe outre le plafond. */
export function useAjouterAuPipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (contacts: string[]) => {
      const { data, error } = await supabase.rpc('ajouter_au_pipe_depuis_vivier', {
        p_contacts: contacts,
      })
      if (error) throw new Error(error.message)
      return (data ?? 0) as number
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit'] })
      void qc.invalidateQueries({ queryKey: ['opportunites'] })
    },
  })
}

/** Faire sortir une ligne du pipe. La ligne reste en base, avec son motif et son horodatage. */
export function useSortirDuPipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ligne, motif }: { ligne: string; motif: 'APPELE' | 'REPORTE' | 'ECARTE' | 'PURGE' }) => {
      const { error } = await supabase.rpc('sortir_du_pipe', { p_ligne_id: ligne, p_motif: motif })
      if (error) throw new Error(error.message)
    },
    onMutate: async ({ ligne }) => {
      /* MUTATION OPTIMISTE, comme partout dans Kimatch : la ligne disparaît tout de suite. Dans un
         sprint, attendre l'aller-retour ferait clignoter la fiche qu'on vient de traiter. */
      await qc.cancelQueries({ queryKey: ['cockpit', 'pipe'] })
      const avant = qc.getQueryData<Pipe>(['cockpit', 'pipe'])
      if (avant) {
        qc.setQueryData<Pipe>(['cockpit', 'pipe'], {
          ...avant,
          lignes: avant.lignes.filter((l) => l.ligne_id !== ligne),
        })
      }
      return { avant }
    },
    onError: (_e, _v, contexte) => {
      if (contexte?.avant) qc.setQueryData(['cockpit', 'pipe'], contexte.avant)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit', 'pipe'] })
    },
  })
}

/** Le glisser-déposer : on envoie l'ordre voulu, du premier au dernier. */
export function useReordonnerPipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (lignes: string[]) => {
      const { error } = await supabase.rpc('reordonner_pipe', { p_lignes: lignes })
      if (error) throw new Error(error.message)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit', 'pipe'] })
    },
  })
}

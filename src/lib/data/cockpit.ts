import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { authHeaderJson } from '@/lib/data/authHeader'
import { useMonProfil } from '@/lib/data/roles'
import type { Valence } from '@/lib/santeRelation'
import type { Interlocuteur, IssueAppel, Qualification } from '@/lib/data/appelEnCours'

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
  /** L'adresse du contact — celle de la piste, ou celle du contact rattaché à l'opportunité. */
  email: string | null
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
  /**
   * LA TÂCHE QUI A FAIT ENTRER CETTE LIGNE, en toutes lettres (migration du 22/09/2026).
   *
   * `taches_ouvertes` en donnait le NOMBRE, et « 1 tâche ouverte » ne dit pas quoi faire. C'est
   * pourtant la seule chose qu'on a besoin de savoir avant de décrocher, et le sprint devait
   * ouvrir la fiche pour l'obtenir.
   */
  tache_titre: string | null
  /** L'instant complet, pas une date : `heureTache.ts` sait dire s'il porte une heure. */
  tache_echeance: string | null
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

/**
 * Compléter le pipe depuis le vivier : Kimatch calcule la place libre jusqu'au plafond et la
 * remplit lui-même, en servant D'ABORD LE PLUS DE PÉRIMÈTRE (migration du 21/09/2026).
 *
 * Le tri est en base et non ici : c'est la même requête qui compte la place et qui choisit, donc
 * elle ne peut pas se tromper de nombre, et le classement ne dépend pas de ce que l'écran a
 * chargé — la liste affichée est paginée, le gisement ne l'est pas.
 */
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

/**
 * Compléter le pipe depuis SES pistes, jusqu'au plafond, sans rien créer.
 *
 * Le pendant exact du bouton « vivier », avec l'autre priorité voulue par William : une piste qui
 * porte une liste de copropriétés passe devant. 3 603 pistes actives sur 4 882 en portent une —
 * le critère trie vraiment, il n'est pas décoratif.
 */
export function useCompleterPipeDepuisPistes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (combien?: number) => {
      const { data, error } = await supabase.rpc('completer_pipe_du_jour_depuis_pistes', {
        p_combien: combien ?? null,
      })
      if (error) throw new Error(error.message)
      return (data ?? 0) as number
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit'] })
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

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * MES PISTES — LA TROISIÈME ZONE DU COCKPIT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 21/09/2026 : « j'aimerais aussi y retrouver la liste de toutes mes pistes (uniquement
 * MES pistes) ».
 *
 * ══ LE FILTRE EST EN BASE, ET IL LE DOIT ══
 *
 * `usePistes()` rend les 4 750 pistes de la base pour que la page Prospection les trie elle-même.
 * Le Cockpit n'en veut qu'une part — Thomas en a 1 687, Marie 1 010 — et surtout il s'ouvre en
 * pleine séance d'appels : charger dix fois ce qu'on affiche, à chaque ouverture, se paierait sur
 * le temps de la personne qui attend pour composer un numéro.
 *
 * ══ LES CLOSES SORTENT PAR DÉFAUT ══
 *
 * Converties et disqualifiées n'ont plus rien à donner : 318 lignes sur 4 750, qui n'apparaissent
 * qu'à la demande. Le Cockpit est un écran de travail, pas un historique.
 *
 * ══ L'ORDRE EST CELUI DE L'APPEL, PAS CELUI DE LA CRÉATION ══
 *
 * Les pistes JAMAIS APPELÉES d'abord, les plus anciennes en tête : une piste qui dort depuis trois
 * mois sans qu'on l'ait jamais eue au téléphone est le premier gisement d'une séance. Trier par
 * date de création aurait mis en avant celles d'hier, qu'on vient justement de traiter.
 *
 * ══ UNE PISTE NE PEUT PAS REJOINDRE LE PIPE, ET C'EST UN FAIT DE LA BASE ══
 *
 * `ajouter_au_pipe_depuis_vivier` prend des CONTACTS. Or seules les 15 pistes converties portent un
 * `contact_id` : une piste vit avant le contact, c'est même sa définition. L'écran ne propose donc
 * pas de les pousser dans le pipe — il propose de les APPELER, ce que 3 231 d'entre elles
 * permettent, numéro en main.
 */
export interface PisteDuCockpit {
  id: string
  societe: string | null
  contact_nom: string | null
  fonction: string | null
  ville: string | null
  telephone: string | null
  telephone_mobile: string | null
  segment: string | null
  source: string | null
  statut_code: string | null
  statut_libelle: string | null
  statut_clos: boolean
  date_creation: string | null
  date_premier_appel: string | null
  date_derniere_activite: string | null
}

interface RawPisteCockpit extends Omit<PisteDuCockpit, 'statut_code' | 'statut_libelle' | 'statut_clos'> {
  statut: { code: string; libelle: string; est_cloture: boolean } | null
}

export function useMesPistes(avecCloses = false) {
  const { data: profil } = useMonProfil()
  const moi = profil?.id
  return useQuery({
    queryKey: ['cockpit', 'mes-pistes', moi, avecCloses],
    enabled: Boolean(moi),
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PisteDuCockpit[]> => {
      const q = supabase
        .from('pistes')
        .select(
          'id, societe, contact_nom, fonction, ville, telephone, telephone_mobile, segment, source,'
          + ' date_creation, date_premier_appel, date_derniere_activite,'
          + ' statut:statuts_pistes(code, libelle, est_cloture)',
        )
        .eq('proprietaire_id', moi as string)
        /* JAMAIS APPELÉES D'ABORD, puis les plus anciennes : voir l'en-tête. */
        .order('date_premier_appel', { ascending: true, nullsFirst: true })
        .order('date_creation', { ascending: true })
        .limit(600)
      const { data, error } = await q
      if (error) throw new Error(error.message)

      const lignes = ((data ?? []) as unknown as RawPisteCockpit[]).map((p) => ({
        id: p.id,
        societe: p.societe,
        contact_nom: p.contact_nom,
        fonction: p.fonction,
        ville: p.ville,
        telephone: p.telephone,
        telephone_mobile: p.telephone_mobile,
        segment: p.segment,
        source: p.source,
        statut_code: p.statut?.code ?? null,
        statut_libelle: p.statut?.libelle ?? null,
        /* LE DRAPEAU VIENT DU RÉFÉRENTIEL, jamais d'une liste de codes écrite ici : `statuts_pistes`
           a déjà changé une fois, et un code oublié ferait réapparaître des pistes mortes. */
        statut_clos: p.statut?.est_cloture ?? false,
        date_creation: p.date_creation,
        date_premier_appel: p.date_premier_appel,
        date_derniere_activite: p.date_derniere_activite,
      }))
      /* LE FILTRE DES CLOSES SE FAIT ICI et non en base : `est_clos` vit sur la table de référence,
         donc PostgREST ne peut pas le filtrer sans une vue. Six cents lignes au plus se filtrent
         sans qu'on le sente, et une vue de plus pour ça ne se justifie pas. */
      return avecCloses ? lignes : lignes.filter((l) => !l.statut_clos)
    },
  })
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉTAIL DE LA LIGNE CHOISIE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 21/09/2026, a donné champ par champ ce que le volet doit montrer : l'identité, deux
 * cartouches, le téléphone, le mail, puis le compte — SIREN, adresse complète, NAF et APE — puis le
 * commentaire et l'échéance, puis les copropriétés ou les compteurs.
 *
 * ══ POURQUOI UNE SECONDE REQUÊTE, ET NON DES COLONNES DE PLUS DANS LE PIPE ══
 *
 * `v_pipe_du_jour` porte ce qu'il faut pour DÉCIDER dans la liste : un nom, une fonction, un
 * numéro, une heure. Y ajouter l'adresse, le SIREN, le code NAF, les copropriétés et les compteurs
 * de chaque ligne multiplierait par cinq le poids d'un pipe de soixante lignes — pour n'en afficher
 * qu'une à la fois, celle qu'on a cliquée.
 *
 * Le détail se charge donc à la sélection, et le cache de React Query le garde : revenir sur une
 * fiche déjà ouverte ne redemande rien.
 *
 * ══ DEUX OBJETS, UNE SEULE FORME ══
 *
 * Une piste porte son identité en propre — elle vit avant le contact. Une opportunité la tient de
 * son contact rattaché. Les deux chemins se rejoignent ici sur une même forme, pour que le volet
 * n'ait pas à savoir d'où vient ce qu'il affiche.
 */
export interface FicheDetaillee {
  statut: string | null
  /** Le CODE du statut, pas son libellé : c'est lui qui commande le parcours de prospection. */
  statut_code: string | null
  /** Le propriétaire de l'enregistrement — c'est lui qui devient responsable des tâches créées. */
  proprietaire_id: string | null
  civilite: string | null
  prenom: string | null
  nom: string | null
  fonction: string | null
  email: string | null
  telephone: string | null
  telephone_mobile: string | null
  commentaire: string | null
  echeance: string | null
  /** Le compte rattaché, quand il y en a un : une piste peut n'en avoir aucun. */
  compte: {
    id: string
    nom: string
    siren: string | null
    /* Demandé nommément par William pour l'onglet Société : le SIREN identifie l'entreprise, le
       SIRET l'établissement. Sur un syndic multi-agences, c'est le second qui dit lequel. */
    siret: string | null
    site_web: string | null
    rue: string | null
    code_postal: string | null
    ville: string | null
    code_naf: string | null
    libelle_ape: string | null
    segment: string | null
  } | null
  /** Le segment de l'objet lui-même, qui prime sur celui du compte quand il est renseigné. */
  segment: string | null
  /** Syndic : ce que la piste déclare de son parc. */
  nombre_coproprietes: number | null
  nombre_de_lots: number | null
  liste_coproprietes: string | null
  /**
   * Opportunité : les points de livraison de son périmètre.
   *
   * William, 22/09/2026, sur l'onglet Périmètre : « des cards pour chaque compteur avec le
   * libellé, le numéro, l'énergie, la consommation annuelle, client ou prospect, l'échéance et le
   * fournisseur ». `est_client` se lit sur la nature de l'échéance — même définition que le vivier
   * et que l'onglet Périmètre d'une recommandation : PROUVEE veut dire qu'un contrat Kiwee actif
   * couvre ce point.
   */
  compteurs: {
    id: string
    numero_point: string
    libelle: string | null
    energie: string | null
    consommation: number | null
    est_client: boolean
    date_echeance: string | null
    fournisseur: string | null
  }[]
  /**
   * ══ LA TÂCHE QUI A MIS CETTE LIGNE DANS LE PLAN DU JOUR ══
   *
   * William, 22/09/2026 : « ajoute la tâche qui est censée être faite ce jour. Je veux que tu
   * m'affiches le libellé ainsi que l'échéance. »
   *
   * C'EST EXACTEMENT LA MÊME RÈGLE QUE `lister_pipe_du_jour` : ouverte, à moi ou à personne, prévue
   * aujourd'hui ou en retard, la plus ancienne d'abord. Depuis la migration du 21/09/2026, aucune
   * ligne du pipe n'existe sans elle — c'est ce qui rend l'affichage fiable plutôt que décoratif.
   *
   * La comparaison de jour se fait EN HEURE LOCALE, jamais sur la chaîne ISO : une échéance sans
   * heure vaut minuit à Paris, donc 22 h UTC la veille, et `slice(0, 10)` la daterait de J-1.
   */
  tache: { id: string; titre: string; date_prevue: string | null; type: string | null } | null
}

export function useFichePipe(ligne: LignePipe | null) {
  return useQuery({
    queryKey: ['cockpit', 'fiche', ligne?.cible_type, ligne?.cible_id],
    enabled: Boolean(ligne),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FicheDetaillee | null> => {
      if (!ligne) return null

      const vide = {
        statut: null, statut_code: null, proprietaire_id: null,
        civilite: null, prenom: null, nom: null, fonction: null, email: null,
        telephone: null, telephone_mobile: null, commentaire: null, echeance: null, compte: null,
        segment: null, nombre_coproprietes: null, nombre_de_lots: null, liste_coproprietes: null,
        compteurs: [], tache: null,
      } as FicheDetaillee

      let base: FicheDetaillee = vide
      let compteId: string | null = ligne.compte_id

      if (ligne.cible_type === 'PISTE') {
        const { data } = await supabase
          .from('pistes')
          .select(
            'civilite, prenom, nom, contact_nom, fonction, email, telephone, telephone_mobile,'
            + ' commentaire, echeance_actuelle, segment, societe, siren, siret, site_internet,'
            + ' site_web, rue, code_postal, ville, code_naf,'
            + ' nombre_coproprietes, nombre_de_lots, liste_coproprietes, compte_id, proprietaire_id,'
            + ' statut:statuts_pistes(code, libelle)',
          )
          .eq('id', ligne.cible_id)
          .maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = data as any
        if (!p) return vide
        compteId = p.compte_id ?? ligne.compte_id
        base = {
          ...vide,
          statut: p.statut?.libelle ?? null,
          statut_code: p.statut?.code ?? null,
          proprietaire_id: p.proprietaire_id ?? null,
          civilite: p.civilite ?? null,
          /* `contact_nom` EST LE REPLI : 4 490 pistes viennent d'imports qui n'ont jamais séparé le
             prénom du nom. Afficher « — » là où le nom existe en un seul morceau serait absurde. */
          prenom: p.prenom ?? null,
          nom: p.nom ?? (p.prenom ? null : p.contact_nom ?? null),
          fonction: p.fonction ?? null,
          email: p.email ?? null,
          telephone: p.telephone ?? null,
          telephone_mobile: p.telephone_mobile ?? null,
          commentaire: p.commentaire ?? null,
          echeance: p.echeance_actuelle ?? null,
          segment: p.segment ?? null,
          nombre_coproprietes: p.nombre_coproprietes ?? null,
          nombre_de_lots: p.nombre_de_lots ?? null,
          liste_coproprietes: p.liste_coproprietes ?? null,
          /* SANS COMPTE, LA PISTE PORTE ELLE-MÊME SON ADRESSE ET SON SIREN : c'est le cas ordinaire,
             une piste vit avant que le compte n'existe. On les présente au même endroit. */
          compte: p.compte_id ? null : (p.societe || p.siren || p.siret || p.rue || p.ville || p.code_naf)
            ? {
              id: '', nom: p.societe ?? '—', siren: p.siren ?? null, siret: p.siret ?? null,
              site_web: p.site_internet ?? p.site_web ?? null, rue: p.rue ?? null,
              code_postal: p.code_postal ?? null, ville: p.ville ?? null,
              code_naf: p.code_naf ?? null, libelle_ape: null, segment: p.segment ?? null,
            }
            : null,
        }
      } else {
        const { data } = await supabase
          .from('opportunites')
          .select(
            'commentaire, prochaine_action_echeance, compte_id, contact_id, proprietaire_id,'
            + ' statut:statuts_opportunites(code, libelle),'
            + ' contact:contacts(civilite, prenom, nom, fonction, email, telephone, telephone_mobile)',
          )
          .eq('id', ligne.cible_id)
          .maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const o = data as any
        if (!o) return vide
        compteId = o.compte_id ?? ligne.compte_id
        base = {
          ...vide,
          statut: o.statut?.libelle ?? null,
          statut_code: o.statut?.code ?? null,
          proprietaire_id: o.proprietaire_id ?? null,
          civilite: o.contact?.civilite ?? null,
          prenom: o.contact?.prenom ?? null,
          nom: o.contact?.nom ?? null,
          fonction: o.contact?.fonction ?? null,
          email: o.contact?.email ?? null,
          telephone: o.contact?.telephone ?? ligne.telephone,
          telephone_mobile: o.contact?.telephone_mobile ?? ligne.telephone_mobile,
          commentaire: o.commentaire ?? null,
          echeance: o.prochaine_action_echeance ?? ligne.echeance,
        }

        /* ── LE PÉRIMÈTRE, COMPTEUR PAR COMPTEUR ──

           Il ne se lit que sur l'opportunité : une piste n'a pas de compteurs, elle n'a pas encore
           de parc connu — c'est même la raison d'être du cockpit sur une piste, obtenir la facture
           qui le fera exister.

           ON PASSE PAR `v_echeances_a_traiter` ET NON PAR `compteurs` : la vue porte déjà le code
           énergie, l'échéance retenue et surtout SA NATURE, d'où se déduit client ou prospect. La
           calculer ici en aurait fait une seconde définition, qui aurait fini par diverger de celle
           du vivier et de l'onglet Périmètre d'une recommandation. Le fournisseur sortant, lui, vit
           sur `compteurs` et demande la seconde lecture (voir `useCompteursEligibles`). */
        const { data: liaisons } = await supabase
          .from('opportunites_compteurs')
          .select('compteur_id')
          .eq('opportunite_id', ligne.cible_id)
          .limit(60)
        const idsCompteurs = ((liaisons ?? []) as { compteur_id: string }[])
          .map((l) => l.compteur_id)
          .filter(Boolean)

        if (idsCompteurs.length > 0) {
          const [{ data: pdl }, { data: sortants }] = await Promise.all([
            supabase
              .from('v_echeances_a_traiter')
              .select('compteur_id, numero_point, site_nom, type_energie_code, consommation_annuelle_mwh, date_echeance, nature_echeance')
              .in('compteur_id', idsCompteurs),
            supabase
              .from('compteurs')
              .select('id, libelle, fournisseur:comptes!compteurs_fournisseur_actuel_compte_id_fkey(nom)')
              .in('id', idsCompteurs),
          ])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const annexe = new Map(((sortants ?? []) as any[]).map((c) => [
            c.id as string,
            { libelle: (c.libelle ?? null) as string | null, fournisseur: (c.fournisseur?.nom ?? null) as string | null },
          ]))

          base.compteurs = ((pdl ?? []) as Record<string, unknown>[])
            .map((c) => {
              const plus = annexe.get(c.compteur_id as string)
              return {
                id: c.compteur_id as string,
                numero_point: (c.numero_point as string) ?? '—',
                libelle: (c.site_nom as string) ?? plus?.libelle ?? null,
                energie: (c.type_energie_code as string) ?? null,
                consommation: (c.consommation_annuelle_mwh as number) ?? null,
                est_client: c.nature_echeance === 'PROUVEE',
                date_echeance: (c.date_echeance as string) ?? null,
                fournisseur: plus?.fournisseur ?? null,
              }
            })
            /* L'ÉCHÉANCE LA PLUS PROCHE D'ABORD : c'est elle qui décide de l'urgence du périmètre.
               Celles qu'on ignore ferment la marche — elles ne pressent pas, elles manquent. */
            .sort((a, b) => (a.date_echeance ?? '9999').localeCompare(b.date_echeance ?? '9999'))
        }
      }

      if (compteId) {
        const { data: cp } = await supabase
          .from('comptes')
          .select('id, nom, siren, siret, site_web, rue, code_postal, ville, code_naf, libelle_ape, segment')
          .eq('id', compteId)
          .maybeSingle()
        if (cp) base.compte = cp as FicheDetaillee['compte']
      }

      /* ── LA TÂCHE DU JOUR ──
         `moi` sert à écarter la tâche d'un collègue : le plan du jour est personnel. Une tâche sans
         responsable compte pour tout le monde — 276 des 762 tâches ouvertes sont dans ce cas, les
         ignorer aurait laissé la zone vide sur un tiers des lignes. */
      const moi = (await supabase.auth.getUser()).data.user?.id ?? null
      const colonne = ligne.cible_type === 'PISTE' ? 'piste_id' : 'opportunite_id'
      const { data: taches } = await supabase
        .from('actions')
        .select('id, titre, date_prevue, responsable_profil_id, type_action:types_actions(libelle), statut:statuts_actions(code)')
        .eq(colonne, ligne.cible_id)
        .eq('actif', true)
        .not('date_prevue', 'is', null)
        .order('date_prevue', { ascending: true })
        .limit(20)

      const finDuJour = new Date()
      finDuJour.setHours(23, 59, 59, 999)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retenue = ((taches ?? []) as any[]).find(
        (t) =>
          !['TERMINEE', 'ANNULEE'].includes(t.statut?.code ?? '')
          && (t.responsable_profil_id == null || t.responsable_profil_id === moi)
          && new Date(t.date_prevue).getTime() <= finDuJour.getTime(),
      )
      if (retenue) {
        base.tache = {
          id: retenue.id as string,
          titre: (retenue.titre as string) ?? 'Tâche sans titre',
          date_prevue: (retenue.date_prevue as string) ?? null,
          type: (retenue.type_action?.libelle as string) ?? null,
        }
      }

      return base
    },
  })
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES COMPTEURS QUI RENDENT UN CONTACT ÉLIGIBLE AU VIVIER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 21/09/2026 : « quand je clique sur une ligne, dans le volet de droite, tu dois afficher
 * le ou les compteurs qui rendent ce contact éligible ».
 *
 * ══ CE SONT EXACTEMENT LES LIGNES QUI L'ONT FAIT ENTRER ══
 *
 * `v_vivier_cockpit` compte ces compteurs pour décider de l'éligibilité : ceux dont le contact est
 * responsable, SANS opportunité vivante ni recommandation ouverte, et dont l'échéance tombe dans
 * les dix-huit mois — ou manque. On relit donc `v_echeances_a_traiter` avec les MÊMES trois
 * filtres, et non « tous les compteurs du contact » : montrer un compteur déjà travaillé
 * expliquerait mal pourquoi le contact est là, et ferait douter du chiffre de la colonne.
 *
 * ══ LE FOURNISSEUR EN PLACE N'EST PAS DANS LA VUE ══
 *
 * Elle porte le point de livraison, son énergie, sa consommation, son échéance et la nature de
 * celle-ci — tout ce qui sert à décider QUAND consulter. Le fournisseur sortant vit sur
 * `compteurs`, et c'est une seconde lecture : il sert à décider QUI démarcher, ce que la vue
 * n'avait pas à savoir. Une jointure de plus dans la vue l'aurait alourdie pour tous ses lecteurs.
 *
 * ══ CLIENT OU PROSPECT SE LIT SUR LA NATURE DE L'ÉCHÉANCE ══
 *
 * Même règle que l'onglet Périmètre d'une recommandation : une échéance PROUVÉE veut dire qu'un
 * contrat Kiwee actif couvre ce point — donc un client. Les autres sont des prospects. Une seule
 * définition pour toute l'application, plutôt que deux qui finiraient par diverger.
 */
export interface CompteurEligible {
  compteur_id: string
  numero_point: string
  libelle: string | null
  energie: string | null
  est_client: boolean
  date_echeance: string | null
  nature_echeance: string | null
  fournisseur_nom: string | null
  consommation_annuelle_mwh: number | null
}

export function useCompteursEligibles(contactId: string | null) {
  return useQuery({
    queryKey: ['cockpit', 'vivier', 'compteurs', contactId],
    enabled: Boolean(contactId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CompteurEligible[]> => {
      const limite = new Date()
      limite.setMonth(limite.getMonth() + 18)

      const { data, error } = await supabase
        .from('v_echeances_a_traiter')
        .select('compteur_id, numero_point, site_nom, type_energie_code, consommation_annuelle_mwh, date_echeance, nature_echeance')
        .eq('responsable_contact_id', contactId as string)
        .eq('a_opportunite_vivante', false)
        .eq('a_recommandation_ouverte', false)
        /* `or` reprend la clause de la vue : sans échéance OU dans les dix-huit mois. Une échéance
           inconnue est une raison d'appeler, pas une raison d'exclure. */
        .or(`date_echeance.is.null,date_echeance.lte.${limite.toISOString().slice(0, 10)}`)
        .order('date_echeance', { ascending: true, nullsFirst: false })
        .limit(60)
      if (error) throw new Error(error.message)

      const lignes = (data ?? []) as Record<string, unknown>[]
      if (lignes.length === 0) return []

      /* LE FOURNISSEUR SORTANT, en une seule lecture pour tous les compteurs de la fiche. */
      const ids = lignes.map((l) => l.compteur_id as string)
      const { data: sortants } = await supabase
        .from('compteurs')
        .select('id, fournisseur:comptes!compteurs_fournisseur_actuel_compte_id_fkey(nom)')
        .in('id', ids)
      const parCompteur = new Map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((sortants ?? []) as any[]).map((c) => [c.id as string, (c.fournisseur?.nom ?? null) as string | null]),
      )

      return lignes.map((l) => ({
        compteur_id: l.compteur_id as string,
        numero_point: (l.numero_point as string) ?? '—',
        libelle: (l.site_nom as string) ?? null,
        energie: (l.type_energie_code as string) ?? null,
        est_client: l.nature_echeance === 'PROUVEE',
        date_echeance: (l.date_echeance as string) ?? null,
        nature_echeance: (l.nature_echeance as string) ?? null,
        fournisseur_nom: parCompteur.get(l.compteur_id as string) ?? null,
        consommation_annuelle_mwh: (l.consommation_annuelle_mwh as number) ?? null,
      }))
    },
  })
}

/**
 * Faire entrer des pistes dans le pipe du jour, telles quelles.
 *
 * SANS CRÉER NI CONTACT NI OPPORTUNITÉ — voir la migration du 21/09/2026 : qualifier une piste
 * avant de lui avoir parlé salirait le portefeuille de comptes vides si la séance ne donne rien.
 * Le pipe sait porter une piste depuis l'origine ; il lui manquait cette porte.
 */
export function useAjouterPistesAuPipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pistes: string[]) => {
      const { data, error } = await supabase.rpc('ajouter_au_pipe_depuis_pistes', { p_pistes: pistes })
      if (error) throw new Error(error.message)
      return (data ?? 0) as number
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit'] })
    },
  })
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CORRIGER UNE FICHE SANS QUITTER LE SPRINT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « dans Cockpit, depuis le sprint, tous les champs doivent être
 * modifiables ! »
 *
 * C'EST LE MOMENT OÙ L'ON APPREND LA VÉRITÉ. Au téléphone, l'interlocuteur corrige son prénom,
 * donne son mail, dit qu'il a changé de fonction. Si Kimatch n'accepte pas la correction là,
 * maintenant, elle ne sera jamais faite : ouvrir la fiche dans un autre onglet pendant qu'on parle
 * n'arrive pas. C'est la même règle que les rattachements modifiables partout, appliquée à
 * l'écran où la donnée se vérifie pour de bon.
 *
 * ══ DEUX TABLES DERRIÈRE UN SEUL GESTE ══
 *
 * Une piste porte son identité en propre ; une opportunité la tient de son CONTACT rattaché. Le
 * même champ « fonction » s'écrit donc dans `pistes` ou dans `contacts` selon la ligne. L'écran
 * n'a pas à le savoir — il dit quel champ, cette fonction dit où.
 *
 * `societe` N'A PAS D'ÉQUIVALENT SUR UNE OPPORTUNITÉ : le nom affiché y est celui du COMPTE, et un
 * compte n'est pas un champ de la fiche — le renommer depuis un écran d'appel renommerait le
 * client pour toute l'entreprise. Il reste donc en lecture sur les opportunités, et modifiable sur
 * les pistes, où il n'est qu'une déclaration de l'interlocuteur.
 */
export type ChampFicheSprint =
  | 'nom_complet' | 'fonction' | 'email'
  | 'telephone' | 'telephone_mobile' | 'societe' | 'commentaire'
  /* Écrits par les gestes d'après-appel, pas par un champ modifiable de l'écran. */
  | 'motif_disqualification' | 'echeance_actuelle'

/** Les civilités qu'on reconnaît en tête d'un nom saisi. Comparaison sans accent ni point. */
const CIVILITES = ['m', 'mr', 'monsieur', 'mme', 'madame', 'mlle', 'mademoiselle', 'dr', 'me']

/**
 * ══ LE NOM COMPLET EST TROIS COLONNES, PAS UNE ══
 *
 * `lister_pipe_du_jour` rend `trim(concat_ws(' ', civilite, prenom, nom))`. Écrire « Anne-Françoise
 * Dos Santos » dans le seul `nom` d'une fiche qui porte déjà `prenom = 'Anne-Françoise'` afficherait
 * « Anne-Françoise Anne-Françoise Dos Santos » à la seconde suivante — et le rendrait pire à chaque
 * correction.
 *
 * ON REDÉCOUPE DONC CE QUI A ÉTÉ TAPÉ, et on réécrit les TROIS colonnes : une civilité reconnue en
 * tête, le premier mot restant en prénom, tout le reste en nom. « Dos Santos », « De La Vaissière »
 * restent donc entiers, ce qu'un découpage sur le dernier espace aurait cassé.
 *
 * VIDER LES COLONNES NON RENSEIGNÉES est indispensable : sans ça, retirer un prénom laisserait
 * l'ancien en base et il réapparaîtrait à l'écran.
 */
export function decouperNomComplet(saisi: string): { civilite: string | null; prenom: string | null; nom: string | null } {
  const mots = saisi.trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return { civilite: null, prenom: null, nom: null }

  let civilite: string | null = null
  const sansAccent = (m: string) => m.toLowerCase().replace(/\./g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (mots.length > 1 && CIVILITES.includes(sansAccent(mots[0]))) civilite = mots.shift() ?? null

  if (mots.length === 1) return { civilite, prenom: null, nom: mots[0] }
  return { civilite, prenom: mots[0], nom: mots.slice(1).join(' ') }
}

export function useMajFicheSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      ligne, champ, valeur,
    }: { ligne: LignePipe; champ: ChampFicheSprint; valeur: string }) => {
      const v = valeur.trim() || null
      const quand = new Date().toISOString()
      /* Le nom se répartit sur trois colonnes ; tous les autres champs vont dans la leur. */
      const colonnes: Record<string, unknown> =
        champ === 'nom_complet' ? { ...decouperNomComplet(valeur) } : { [champ]: v }

      if (ligne.cible_type === 'PISTE') {
        /* `contact_nom` PORTE LE NOM DES IMPORTS qui n'ont jamais séparé prénom et nom — 4 490
           pistes. Le laisser en place après une correction ferait réapparaître l'ancienne
           orthographe partout où il sert de repli. */
        if (champ === 'nom_complet') colonnes.contact_nom = null
        const { error } = await supabase
          .from('pistes')
          .update({ ...colonnes, date_modification: quand })
          .eq('id', ligne.cible_id)
        if (error) throw new Error(error.message)
        return
      }

      /* LE COMMENTAIRE EST LE SEUL CHAMP QUI VIT SUR L'OPPORTUNITÉ elle-même : c'est la note du
         dossier, pas une propriété de la personne. Tout le reste appartient au contact. */
      if (champ === 'commentaire') {
        const { error } = await supabase
          .from('opportunites')
          .update({ commentaire: v, date_modification: quand })
          .eq('id', ligne.cible_id)
        if (error) throw new Error(error.message)
        return
      }

      if (champ === 'societe' || champ === 'motif_disqualification' || champ === 'echeance_actuelle') {
        throw new Error('Ce champ n’existe que sur une piste.')
      }
      if (!ligne.contact_id) throw new Error('Aucun contact rattaché : la correction n’a pas où s’écrire.')

      const { error } = await supabase
        .from('contacts')
        .update({ ...colonnes, date_modification: quand })
        .eq('id', ligne.contact_id)
      if (error) throw new Error(error.message)
    },
    /* LE PIPE SE RELIT, ET LA FICHE AUSSI : le sprint affiche les deux — le nom et les numéros
       viennent de `lister_pipe_du_jour`, le reste de `useFichePipe`. N'en invalider qu'une
       laisserait la moitié de l'écran sur l'ancienne valeur. */
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit'] })
      void qc.invalidateQueries({ queryKey: ['pistes'] })
      void qc.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE FIL D'ACTIVITÉ — TOUT CE QU'ON S'EST DIT, DU PLUS RÉCENT AU PLUS ANCIEN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « l'historique complet (appels, mails, notes avec la capacité d'en
 * écrire), trois traitements visuellement distincts, en date décroissante ».
 *
 * ══ TROIS CLÉS, PARCE QU'UNE PISTE DEVIENT UNE OPPORTUNITÉ ══
 *
 * « La piste est forcément antérieure à l'opportunité » (William, 22/09/2026). Un fil qui ne lirait
 * que `opportunite_id` commencerait donc le jour de la conversion et perdrait tout le travail qui
 * l'a rendue possible — c'est-à-dire précisément ce qu'on cherche avant de rappeler. On lit donc :
 *
 *   `opportunite_id`  ce qui a été fait SUR l'opportunité
 *   `contact_id`      ce qui a été fait AVEC la personne, quel que soit l'objet
 *   `piste_id`        ce qui a été fait sur la ou les pistes dont l'opportunité est née
 *
 * L'union peut ramener deux fois la même ligne : on déduplique sur l'identifiant.
 *
 * ══ LA QUALIFICATION D'UN APPEL N'EST PAS DANS `interactions` ══
 *
 * Qui a décroché, l'aura et l'issue sont saisis dans la fenêtre d'appel et vivent sur
 * `appels_en_cours` (migration 20260922120000). On les rapproche par `source_externe_id`,
 * l'identifiant d'Allô, qui est le seul point commun des deux tables.
 */
export type NatureEvenement = 'APPEL' | 'MAIL' | 'NOTE'

export interface EvenementFil {
  id: string
  nature: NatureEvenement
  quand: string
  /** ENTRANT ou SORTANT : c'est ce qui distingue une réponse d'une relance. */
  sens: string | null
  objet: string | null
  resume: string | null
  auteur: string | null
  /* ── Propre aux appels ── */
  duree_secondes: number | null
  enregistrement_url: string | null
  manque: boolean
  messagerie: boolean
  /** Ce qu'Allô a compris de l'appel, rattrapé sur tout l'historique. */
  etiquettes: string[]
  /* ── SAISI DANS LA FENÊTRE D'APPEL (`appels_en_cours`, migration 20260922120000) ──
     DEUX COLONNES, DEUX QUESTIONS, et je les avais confondues en écrivant ce fil :
       `qualification` QUI a décroché — HUMAIN, REPONDEUR, SERVEUR_VOCAL, PAS_DE_REPONSE
       `interlocuteur` LEQUEL, quand c'est un humain — CONTACT ou AUTRE
     Les contraintes de la base l'imposent ; lire l'une pour l'autre rendait `null` en silence, donc
     un appel abouti sans qualification et un score qui ne bougeait jamais. */
  qualification: Qualification | null
  interlocuteur: Interlocuteur | null
  interlocuteur_nom: string | null
  aura: number | null
  /** Un CODE, pas un libellé : `LIBELLE_ISSUE` le traduit à l'affichage. */
  issue: IssueAppel | null
  /* ── LE SENS DE L'ÉCHANGE (migration 20260922140000) ──
     POSITIF / NEUTRE / NEGATIF, avec sa source et la phrase qui le justifie. C'est cette valence,
     et non le fait qu'un échange ait eu lieu, qui fait bouger le score de santé. */
  /* ── L'OUVERTURE DU MAIL ──
     William, 23/09/2026 : « j'aimerais que chaque mail envoyé soit tracké et qu'une mention lu ou
     non lu apparaisse sur chaque mail dans le fil ».

     LA PLOMBERIE EXISTAIT DÉJÀ et personne ne la lisait : `api/gmail/send.ts` pose un jeton sur
     tout mail parti en HTML, `api/gmail/pixel.ts` l'encaisse. Quinze mails portent un jeton, les
     quinze ont été ouverts — le dernier ce matin à 08 h 38. Il ne manquait que de le montrer.

     LE JETON DIT SI LE SUIVI ÉTAIT POSSIBLE. Sans lui — mail d'avant le suivi, mail importé de
     Salesforce, mail envoyé en texte brut — on n'écrit PAS « non lu » : on ne sait pas. 42 144
     mails sortants sont dans ce cas, et les marquer non lus serait un mensonge de masse. */
  jeton_ouverture: string | null
  premiere_ouverture_le: string | null
  derniere_ouverture_le: string | null
  nb_ouvertures: number
  sentiment: Valence | null
  sentiment_source: 'IA' | 'HUMAIN' | null
  sentiment_motif: string | null
}

const CODES_FIL: Record<string, NatureEvenement> = {
  APPEL: 'APPEL',
  EMAIL: 'MAIL',
  NOTE_INTERNE: 'NOTE',
  AUTRE: 'NOTE',
  RENDEZ_VOUS: 'NOTE',
  COURRIER: 'NOTE',
  VISITE_SITE: 'NOTE',
  VISIO: 'NOTE',
  SMS: 'NOTE',
  WHATSAPP: 'NOTE',
}

export function useFilActivite(ligne: LignePipe | null) {
  return useQuery({
    queryKey: ['cockpit', 'fil', ligne?.cible_type, ligne?.cible_id, ligne?.contact_id],
    enabled: Boolean(ligne),
    staleTime: 60 * 1000,
    queryFn: async (): Promise<EvenementFil[]> => {
      if (!ligne) return []

      /* LES PISTES D'ORIGINE, quand on est sur une opportunité. Une opportunité peut en avoir
         plusieurs : deux contacts d'un même syndic démarchés séparément, puis réunis. */
      let pistesOrigine: string[] = []
      if (ligne.cible_type === 'OPPORTUNITE') {
        const { data } = await supabase
          .from('pistes')
          .select('id')
          .eq('opportunite_id', ligne.cible_id)
          .limit(20)
        pistesOrigine = ((data ?? []) as { id: string }[]).map((p) => p.id)
      } else {
        pistesOrigine = [ligne.cible_id]
      }

      const clauses: string[] = []
      if (ligne.cible_type === 'OPPORTUNITE') clauses.push(`opportunite_id.eq.${ligne.cible_id}`)
      if (ligne.contact_id) clauses.push(`contact_id.eq.${ligne.contact_id}`)
      if (pistesOrigine.length > 0) clauses.push(`piste_id.in.(${pistesOrigine.join(',')})`)
      if (clauses.length === 0) return []

      const { data, error } = await supabase
        .from('interactions')
        .select(
          'id, date_interaction, sens, objet, resume, resume_ia, duree_appel_secondes,'
          + ' enregistrement_url, appel_manque, messagerie_vocale, etiquettes_allo,'
          + ' sentiment, sentiment_source, sentiment_motif,'
          + ' jeton_ouverture, premiere_ouverture_le, derniere_ouverture_le, nb_ouvertures,'
          + ' source_externe_id, type:types_interactions(code), auteur:profils!interactions_auteur_profil_id_fkey(prenom, nom)',
        )
        .or(clauses.join(','))
        .eq('actif', true)
        .order('date_interaction', { ascending: false })
        .limit(80)
      if (error) throw new Error(error.message)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const brutes = (data ?? []) as any[]
      if (brutes.length === 0) return []

      /* LA QUALIFICATION SAISIE À LA MAIN, pour les appels qui en ont une. */
      const refs = brutes.map((i) => i.source_externe_id).filter(Boolean) as string[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let qualifs: any[] = []
      if (refs.length > 0) {
        const { data: q } = await supabase
          .from('appels_en_cours')
          .select('source_externe_id, qualification, interlocuteur, interlocuteur_nom, aura, issue')
          .in('source_externe_id', refs)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qualifs = (q ?? []) as any[]
      }
      const parRef = new Map(qualifs.map((q) => [q.source_externe_id as string, q]))

      const vus = new Set<string>()
      return brutes
        .filter((i) => (vus.has(i.id) ? false : (vus.add(i.id), true)))
        .map((i) => {
          const q = i.source_externe_id ? parRef.get(i.source_externe_id) : undefined
          return {
            id: i.id as string,
            nature: CODES_FIL[i.type?.code ?? ''] ?? 'NOTE',
            quand: i.date_interaction as string,
            sens: (i.sens as string) ?? null,
            objet: (i.objet as string) ?? null,
            /* LE RÉSUMÉ DU COMMERCIAL PRIME SUR CELUI D'ALLÔ : quand quelqu'un a pris la peine de
               réécrire, c'est qu'il avait quelque chose à corriger. */
            resume: (i.resume as string) ?? (i.resume_ia as string) ?? null,
            auteur: [i.auteur?.prenom, i.auteur?.nom].filter(Boolean).join(' ') || null,
            duree_secondes: (i.duree_appel_secondes as number) ?? null,
            enregistrement_url: (i.enregistrement_url as string) ?? null,
            manque: Boolean(i.appel_manque),
            messagerie: Boolean(i.messagerie_vocale),
            etiquettes: Array.isArray(i.etiquettes_allo) ? (i.etiquettes_allo as string[]) : [],
            qualification: (q?.qualification as Qualification) ?? null,
            interlocuteur: (q?.interlocuteur as Interlocuteur) ?? null,
            interlocuteur_nom: (q?.interlocuteur_nom as string) ?? null,
            aura: (q?.aura as number) ?? null,
            issue: (q?.issue as IssueAppel) ?? null,
            jeton_ouverture: (i.jeton_ouverture as string) ?? null,
            premiere_ouverture_le: (i.premiere_ouverture_le as string) ?? null,
            derniere_ouverture_le: (i.derniere_ouverture_le as string) ?? null,
            nb_ouvertures: (i.nb_ouvertures as number) ?? 0,
            sentiment: (i.sentiment as Valence) ?? null,
            sentiment_source: (i.sentiment_source as 'IA' | 'HUMAIN') ?? null,
            sentiment_motif: (i.sentiment_motif as string) ?? null,
          }
        })
    },
  })
}

/**
 * Écrire une note depuis le sprint.
 *
 * ELLE S'ACCROCHE À L'OBJET ET AU CONTACT À LA FOIS : rattachée au seul contact, elle
 * disparaîtrait de l'opportunité ; rattachée à la seule opportunité, elle ne suivrait pas la
 * personne sur son prochain dossier. Le fil relit les deux clés, la note doit porter les deux.
 */
export function useEcrireNote() {
  const qc = useQueryClient()
  const { data: profil } = useMonProfil()
  return useMutation({
    mutationFn: async ({ ligne, texte }: { ligne: LignePipe; texte: string }) => {
      const propre = texte.trim()
      if (!propre) throw new Error('Une note vide ne s’écrit pas.')

      /* `type_interaction_id` EST OBLIGATOIRE EN BASE. On le lit plutôt que de le coder en dur —
         les tables de référence portent des identifiants différents d'un environnement à l'autre —
         et on refuse proprement s'il manque, au lieu de laisser remonter une violation de
         contrainte que personne ne saurait lire. */
      const { data: type } = await supabase
        .from('types_interactions')
        .select('id')
        .eq('code', 'NOTE_INTERNE')
        .maybeSingle()
      const typeId = (type as { id: string } | null)?.id
      if (!typeId) throw new Error('Le type « Note interne » est absent des tables de référence.')

      const { error } = await supabase.from('interactions').insert({
        type_interaction_id: typeId,
        auteur_profil_id: profil?.id ?? null,
        contact_id: ligne.contact_id,
        compte_id: ligne.compte_id,
        opportunite_id: ligne.cible_type === 'OPPORTUNITE' ? ligne.cible_id : null,
        piste_id: ligne.cible_type === 'PISTE' ? ligne.cible_id : null,
        date_interaction: new Date().toISOString(),
        sens: 'INTERNE',
        resume: propre,
        actif: true,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit', 'fil'] })
    },
  })
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CORRIGER LE SENS D'UN ÉCHANGE, D'UN CLIC
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un score qui ne se corrige pas dérive. L'analyse se trompera — sur une ironie, sur un « on verra »
 * qui voulait dire non — et c'est le commercial qui était au téléphone qui le sait.
 *
 * LA CORRECTION EST DÉFINITIVE : elle pose `sentiment_source = 'HUMAIN'`, et l'analyse ne repasse
 * jamais dessus (voir `api/cockpit/conseil.ts`).
 */
export function usePoserValence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ interaction, valence }: { interaction: string; valence: Valence | null }) => {
      const { error } = await supabase
        .from('interactions')
        .update({
          sentiment: valence,
          sentiment_source: valence ? 'HUMAIN' : null,
          /* LE MOTIF DE L'IA SAUTE AVEC SA VALENCE : garder « ton agacé » sous un POSITIF corrigé à
             la main donnerait une ligne qui se contredit elle-même. */
          sentiment_motif: null,
          date_modification: new Date().toISOString(),
        })
        .eq('id', interaction)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit', 'fil'] })
    },
  })
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'AVIS DE KIMATCH — RENDU DÈS QUE LA FICHE S'AFFICHE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « je veux que cet avis soit évalué en temps réel, ou quand la fiche
 * s'affiche dans le sprint, je veux pas avoir besoin de cliquer ».
 *
 * J'AVAIS MIS UN BOUTON POUR ÉCONOMISER DES APPELS. C'était un mauvais arbitrage : dans un sprint,
 * on enchaîne les fiches le combiné en main, et un conseil qui demande un clic arrive après la
 * décision qu'il devait éclairer. Il part donc avec la fiche.
 *
 * ══ CE QUI EMPÊCHE LA FACTURE DE S'EMBALLER ══
 *
 * `staleTime: Infinity` : revenir sur une fiche déjà lue ne redemande rien de la séance. La clé
 * porte le NOMBRE d'échanges — pas la liste : le fil se relit après chaque analyse (les valences
 * viennent d'être écrites), et une clé dépendant du contenu relancerait l'analyse en boucle.
 *
 * `retry: false` : un refus d'Anthropic se lit à l'écran, il ne se retente pas trois fois.
 *
 * Une fiche sans aucun échange ne déclenche rien : il n'y aurait rien à lire.
 */
export interface AvisFiche {
  titre: string
  texte: string
  risque: string | null
}

export interface EntreeAvis {
  fiche: { type: string; nom: string | null; societe: string | null; statut: string | null; perimetre: string | null; tache: string | null }
  echanges: unknown[]
}

export function useAvisFiche(ligne: LignePipe | null, entree: EntreeAvis | null) {
  return useQuery({
    queryKey: ['cockpit', 'avis', ligne?.cible_type, ligne?.cible_id, entree?.echanges.length ?? 0],
    enabled: Boolean(ligne && entree && entree.echanges.length > 0),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AvisFiche | null> => {
      const res = await fetch('/api/cockpit/conseil', {
        method: 'POST',
        headers: await authHeaderJson(),
        body: JSON.stringify(entree),
      })

      /* SI `api/` N'EST PAS SERVI, le repli du SPA rend l'index HTML — ou rien du tout — et
         `res.json()` échouerait sur « Unexpected token < ». Le dire en toutes lettres évite dix
         minutes à chercher une panne qui n'existe pas. Depuis le 22/09/2026, `vite.config.ts` sert
         `api/` en local : ce message ne devrait plus apparaître qu'en cas de vrai incident. */
      const texte = await res.text()
      let data: { success?: boolean; error?: string; conseil?: AvisFiche }
      try {
        data = JSON.parse(texte)
      } catch {
        throw new Error(
          res.status === 404 || texte.trimStart().startsWith('<')
            ? 'Les fonctions serveur ne répondent pas ici.'
            : `Réponse illisible du serveur (${res.status}).`,
        )
      }
      if (!res.ok || !data.success) throw new Error(data.error ?? `Erreur ${res.status}`)
      return data.conseil ?? null
    },
  })
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PARCOURS D'UNE PISTE, TEL QUE LE COCKPIT LE FAIT AVANCER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 :
 *
 *   « Dès que je lance une action de prospection dans cockpit (appel), la piste au statut nouvelle
 *     passe à "En cours de qualification". Si elle est déjà à ce statut, elle reste à ce statut.
 *     Le passage à "En attente de facture" n'est possible (depuis cockpit) qu'avec le bouton
 *     d'action "Demande de facture". Ce statut indique qu'on est désormais en attente de réception.
 *     La conversion se fait lors du clic sur le bouton et n'est possible que lorsque j'ai reçu une
 *     facture. »
 *
 * ══ LA GARDE EST DANS LA REQUÊTE, PAS DANS UN `if` ══
 *
 * « Si elle est déjà à ce statut, elle reste à ce statut » — et, plus largement, on ne fait jamais
 * RECULER une piste. Un commercial qui rappelle une piste déjà en attente de facture ne doit pas la
 * ramener en qualification. La condition est donc posée en base, sur le statut de départ : deux
 * onglets ouverts sur la même fiche ne peuvent pas se contredire, là où un test lu en JavaScript
 * aurait travaillé sur une valeur vieille de quelques secondes.
 */
export type StatutPiste = 'NOUVELLE' | 'EN_QUALIFICATION' | 'EN_ATTENTE_FACTURE' | 'CONVERTIE' | 'DISQUALIFIEE'

async function idStatutPiste(code: StatutPiste): Promise<string | null> {
  const { data } = await supabase.from('statuts_pistes').select('id').eq('code', code).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export function useAvancerStatutPiste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ piste, vers, depuis }: {
      piste: string
      vers: StatutPiste
      /** Les statuts de départ acceptés. Vide : on avance quel que soit le point de départ. */
      depuis?: StatutPiste[]
    }) => {
      const cible = await idStatutPiste(vers)
      if (!cible) throw new Error(`Le statut « ${vers} » est absent des tables de référence.`)

      let requete = supabase
        .from('pistes')
        .update({ statut_id: cible, date_modification: new Date().toISOString() })
        .eq('id', piste)

      if (depuis && depuis.length > 0) {
        const ids: string[] = []
        for (const code of depuis) {
          const id = await idStatutPiste(code)
          if (id) ids.push(id)
        }
        if (ids.length === 0) return
        requete = requete.in('statut_id', ids)
      }

      const { error } = await requete
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit'] })
      void qc.invalidateQueries({ queryKey: ['pistes'] })
    },
  })
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * OUVRIR UNE BOÎTE DE DÉPÔT, ET RÉCUPÉRER SON LIEN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026 : « lors de l'envoi du mail de demande de facture, j'aimerais que ça ajoute
 * dans ce mail un lien unique qui ouvre une boîte de dépôt ».
 *
 * LE LIEN EST DEMANDÉ À L'OUVERTURE DE L'ÉDITEUR, pas à l'envoi : il doit être DANS le corps du
 * mail quand le commercial le relit, sinon il écrit autour d'un trou. Et le jeton naît côté serveur
 * — c'est la seule clé d'accès à une boîte où atterriront des factures, elle ne se fabrique pas
 * dans un navigateur.
 */
export interface LienDepot { jeton: string; lien: string; reutilise: boolean }

/**
 * ══ UN LIEN QUI MANQUE DOIT SE DIRE, PAS SE TAIRE ══
 *
 * William, 23/09/2026 : « quand je clique sur Demander les factures, je ne vois pas le lien intégré
 * dans le mail, c'est normal ? »
 *
 * NON, ET MA PREMIÈRE VERSION AVAIT UN DÉFAUT PIRE QUE LA PANNE. Elle rendait `null` sur n'importe
 * quel échec et l'éditeur s'ouvrait sans le lien, SANS RIEN DIRE. Le commercial écrivait « le plus
 * simple est de les déposer ici » — phrase qui n'était plus dans le modèle — ou pire, envoyait un
 * mail en croyant que le client pourrait déposer. On ne s'en apercevait qu'en ne recevant jamais
 * rien.
 *
 * ON REND DONC LA RAISON. L'éditeur s'ouvre toujours — une demande de factures sans lien reste une
 * demande de factures, et refuser de l'ouvrir coûterait l'appel en cours — mais l'écran affiche ce
 * qui manque, et le modèle se passe de sa phrase d'invitation.
 */
export type ResultatDepot = { lien: LienDepot } | { erreur: string }

export function useOuvrirDepot() {
  return useMutation({
    mutationFn: async (cible: {
      pisteId?: string | null
      opportuniteId?: string | null
      contactId?: string | null
      compteId?: string | null
    }): Promise<ResultatDepot> => {
      const res = await fetch('/api/depot/ouvrir', {
        method: 'POST',
        headers: await authHeaderJson(),
        body: JSON.stringify(cible),
      })
      const texte = await res.text()
      let data: { ok?: boolean; erreur?: string; error?: string } & Partial<LienDepot>
      try {
        data = JSON.parse(texte)
      } catch {
        return {
          erreur: texte.trimStart().startsWith('<')
            ? 'les fonctions serveur ne répondent pas ici'
            : `réponse illisible du serveur (${res.status})`,
        }
      }
      if (!res.ok || !data.ok || !data.jeton || !data.lien) {
        return { erreur: data.erreur ?? data.error ?? `erreur ${res.status}` }
      }
      return { lien: { jeton: data.jeton, lien: data.lien, reutilise: Boolean(data.reutilise) } }
    },
  })
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CORRIGER LA SOCIÉTÉ PENDANT L'APPEL
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « dans Cockpit, pendant un sprint, sur le volet de droite dans l'onglet
 * Société, il faut que tous les champs soient modifiables. »
 *
 * ══ POURQUOI UNE MUTATION À PART ══
 *
 * `useMajFicheSprint` écrit sur la PERSONNE — la piste ou le contact. L'onglet Société écrit sur le
 * COMPTE, une autre table, et les deux ne peuvent pas se confondre : renommer une société n'est pas
 * corriger l'orthographe d'un prénom entendu au téléphone, cela change ce que voit toute l'équipe.
 *
 * ══ LA FICHE DU SPRINT DOIT SE RELIRE, PAS SEULEMENT LA LISTE DES COMPTES ══
 *
 * `useUpdateCompteField` existe et fait la même écriture, mais il n'invalide que `['comptes']`. La
 * fiche ouverte à droite vit sous `['cockpit', 'fiche', …]` : sans l'invalider, on verrait la
 * valeur corrigée revenir à l'ancienne au premier rafraîchissement — le genre de chose qui fait
 * douter d'un enregistrement qui a pourtant eu lieu.
 *
 * ══ CE QUI SE VIDE, ET CE QUI NE PEUT PAS ══
 *
 * Toutes ces colonnes acceptent NULL, sauf `nom` : la base le refuse, et un compte sans nom
 * n'apparaîtrait nulle part. Effacer le champ est donc refusé, avec la raison, plutôt qu'écrit puis
 * rejeté par une erreur de contrainte que personne ne saurait lire.
 */
export type ChampSocieteSprint =
  | 'nom' | 'siren' | 'siret' | 'code_naf' | 'libelle_ape'
  | 'site_web' | 'rue' | 'code_postal' | 'ville' | 'segment'

/** Ce que le segment vaut en base, du plus courant au plus rare — mesuré le 25/09/2026. */
export const SEGMENTS_COMPTE = [
  'Entreprise',
  'Syndic professionnel',
  'Syndic non professionnel',
  'Fournisseur',
  'Partenaire',
  'Courtier',
] as const

export function useMajSocieteSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ compteId, champ, valeur }: { compteId: string; champ: ChampSocieteSprint; valeur: string }) => {
      const v = valeur.trim() || null
      if (champ === 'nom' && !v) {
        throw new Error('Le nom de la société ne peut pas être vide.')
      }
      const { error } = await supabase
        .from('comptes')
        .update({ [champ]: v, date_modification: new Date().toISOString() })
        .eq('id', compteId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cockpit'] })
      void qc.invalidateQueries({ queryKey: ['comptes'] })
    },
  })
}

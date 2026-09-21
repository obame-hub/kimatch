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
  /** Opportunité : les points de livraison de son périmètre. */
  compteurs: { id: string; numero_point: string; libelle: string | null; consommation: number | null }[]
}

export function useFichePipe(ligne: LignePipe | null) {
  return useQuery({
    queryKey: ['cockpit', 'fiche', ligne?.cible_type, ligne?.cible_id],
    enabled: Boolean(ligne),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FicheDetaillee | null> => {
      if (!ligne) return null

      const vide = {
        statut: null, civilite: null, prenom: null, nom: null, fonction: null, email: null,
        telephone: null, telephone_mobile: null, commentaire: null, echeance: null, compte: null,
        segment: null, nombre_coproprietes: null, nombre_de_lots: null, liste_coproprietes: null,
        compteurs: [],
      } as FicheDetaillee

      let base: FicheDetaillee = vide
      let compteId: string | null = ligne.compte_id

      if (ligne.cible_type === 'PISTE') {
        const { data } = await supabase
          .from('pistes')
          .select(
            'civilite, prenom, nom, contact_nom, fonction, email, telephone, telephone_mobile,'
            + ' commentaire, echeance_actuelle, segment, siren, rue, code_postal, ville, code_naf,'
            + ' nombre_coproprietes, nombre_de_lots, liste_coproprietes, compte_id,'
            + ' statut:statuts_pistes(libelle)',
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
          compte: p.compte_id ? null : (p.siren || p.rue || p.ville || p.code_naf)
            ? {
              id: '', nom: '—', siren: p.siren ?? null, rue: p.rue ?? null,
              code_postal: p.code_postal ?? null, ville: p.ville ?? null,
              code_naf: p.code_naf ?? null, libelle_ape: null, segment: p.segment ?? null,
            }
            : null,
        }
      } else {
        const { data } = await supabase
          .from('opportunites')
          .select(
            'commentaire, prochaine_action_echeance, compte_id, contact_id,'
            + ' statut:statuts_opportunites(libelle),'
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

        /* LE PÉRIMÈTRE, à la demande de William. Il ne se lit que sur l'opportunité : une piste n'a
           pas de compteurs, elle n'a pas encore de parc connu. */
        const { data: pdl } = await supabase
          .from('opportunites_compteurs')
          .select('compteur:compteurs(id, numero_point, localisation_site, libelle_site, consommation_annuelle_mwh)')
          .eq('opportunite_id', ligne.cible_id)
          .limit(60)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        base.compteurs = ((pdl ?? []) as any[])
          .map((l) => l.compteur)
          .filter(Boolean)
          .map((c: Record<string, unknown>) => ({
            id: c.id as string,
            numero_point: (c.numero_point as string) ?? '—',
            libelle: (c.localisation_site as string) ?? (c.libelle_site as string) ?? null,
            consommation: (c.consommation_annuelle_mwh as number) ?? null,
          }))
      }

      if (compteId) {
        const { data: cp } = await supabase
          .from('comptes')
          .select('id, nom, siren, rue, code_postal, ville, code_naf, libelle_ape, segment')
          .eq('id', compteId)
          .maybeSingle()
        if (cp) base.compte = cp as FicheDetaillee['compte']
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

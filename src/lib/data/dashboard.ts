import { useMemo } from 'react'
import { useSignaux } from '@/lib/data/signaux'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { useActions } from '@/lib/data/actions'
import { useContratsListe } from '@/lib/data/contrats'
import { useMandatsListe } from '@/lib/data/mandats'
import { usePistes } from '@/lib/data/prospection'
import { useOpportunites, statutDerive } from '@/lib/data/opportunites'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { fetchMonPortefeuille, filtrerMesElements } from '@/lib/data/visibility'
import { useMonProfil } from '@/lib/data/roles'

const SIGNAUX_FERMES = ['CONVERTI', 'ECARTE']
const ACTIONS_FERMEES = ['TERMINEE', 'ANNULEE']

/**
 * Les listes ci-dessous couvrent DEUX modèles de statuts à la fois : celui d'avant la refonte du
 * 12/08/2026 et celui d'après (migration 20260812090000_statuts_cycles_de_vie.sql). Le tableau de
 * bord est la page d'arrivée de tout le monde ; il ne doit pas se vider entre le déploiement du
 * code et l'application de la migration. Les anciens codes seront retirés une fois la migration
 * passée en production et vérifiée.
 */
const RECOS_FERMEES = ['ACCEPTEE', 'REFUSEE', 'ABANDONNEE']
/** Un contrat « à suivre » n'est ni actif, ni terminé : il reste quelque chose à faire dessus. */
const CONTRATS_A_SUIVRE = ['NOUVEAU', 'EN_PREPARATION', 'A_SIGNER', 'SIGNE', 'BROUILLON', 'DEMANDE', 'RECEPTIONNE', 'ENVOYE']
/**
 * « les prêtes à présenter, ça veut dire des recommandations avec une version disponible »
 * (William, 12/08/2026). Le critère porte donc sur la VERSION, pas sur l'étape de la
 * recommandation : « Disponible, ça veut dire prête à être envoyée ». VALIDEE est son équivalent
 * dans l'ancien référentiel.
 */
const VERSIONS_PRETES = ['DISPONIBLE', 'VALIDEE']

/**
 * LE PATRIMOINE À RÉACTIVER — diapositive 7 : « détecter les échéances inexploitables : le contact
 * est déjà dans le patrimoine, mais toutes les dates liées à ses sites et compteurs sont ABSENTES OU
 * DÉPASSÉES ».
 *
 * DEUX COMPTAGES ET DOUZE LIGNES, PAS 7 899 COMPTEURS. Le tableau de bord est la page que tout le
 * monde ouvre en premier : y ajouter le chargement complet des compteurs coûterait à chaque visite
 * de chaque poste. `count: exact, head: true` ne rend qu'un nombre, sans une seule ligne, et les
 * exemples affichés sont bornés à six par groupe — ce que la section montre de toute façon.
 *
 * Mesuré en production le 24/08/2026 : 588 compteurs sans aucune échéance, 3 861 déjà dépassées.
 */
function useEcheancesAReprendre() {
  return useQuery({
    queryKey: ['tableau-de-bord', 'echeances-a-reprendre'],
    queryFn: async () => {
      const jour = new Date()
      const iso = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`
      const colonnes = 'id, numero_point, date_echeance, site:sites(nom)'

      const [absentes, depassees, exAbsentes, exDepassees] = await Promise.all([
        supabase.from('compteurs').select('id', { count: 'exact', head: true }).is('date_echeance', null).eq('actif', true),
        supabase.from('compteurs').select('id', { count: 'exact', head: true }).lt('date_echeance', iso).eq('actif', true),
        supabase.from('compteurs').select(colonnes).is('date_echeance', null).eq('actif', true).limit(6),
        // Les plus anciennes d'abord : une échéance dépassée depuis trois ans est un contact perdu
        // de vue, pas un oubli de la semaine.
        supabase.from('compteurs').select(colonnes).lt('date_echeance', iso).eq('actif', true).order('date_echeance').limit(6),
      ])

      type Ligne = { id: string; numero_point: string; date_echeance: string | null; site: { nom: string } | { nom: string }[] | null }
      const nomDuSite = (l: Ligne) => (Array.isArray(l.site) ? l.site[0]?.nom : l.site?.nom) ?? 'Site inconnu'

      return {
        nbAbsentes: absentes.count ?? 0,
        nbDepassees: depassees.count ?? 0,
        absentes: ((exAbsentes.data ?? []) as Ligne[]).map((l) => ({ id: l.id, pdl: l.numero_point, site: nomDuSite(l), echeance: null as string | null })),
        depassees: ((exDepassees.data ?? []) as Ligne[]).map((l) => ({ id: l.id, pdl: l.numero_point, site: nomDuSite(l), echeance: l.date_echeance })),
      }
    },
  })
}

/** Nombre de jours écoulés depuis une date ISO. */
function joursDepuis(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / 86_400_000)
}

export interface LigneAction {
  id: string
  titre: string
  sousTitre: string
  /** Compte à rebours ou ancienneté, affiché à droite en police à chasse fixe. */
  echeance: string
  /** Vrai quand la ligne mérite d'être traitée en priorité (rouge plutôt qu'ambre). */
  urgent: boolean
  to: string
}

export interface GroupeAction {
  libelle: string
  lignes: LigneAction[]
  /** Message affiché quand le groupe est vide — plus utile qu'une liste vide. */
  siVide: string
}

export interface SectionAction {
  /**
   * LES QUATRE ACTIVITÉS DE LA DIAPOSITIVE 12 — « le commercial pilote quatre activités » :
   * PISTES (qualifier les nouveaux contacts), PATRIMOINE (actualiser les contacts existants),
   * OPPORTUNITÉS (faire avancer les projets), RECOMMANDATIONS (conclure avec le client).
   *
   * AVANT, LES BLOCS ÉTAIENT contrat · reco · mandat · signal — un découpage par objet, pas par
   * activité. Deux de ces objets ne sont pas des activités mais des étapes : le mandat est le
   * palier 3 de l'opportunité (« Couverture mandat »), et le contrat est l'exécution de la
   * décision. Ils n'ont donc pas disparu, ils ont rejoint l'activité dont ils font partie — rien
   * de ce qui était à traiter ne sort de l'écran.
   */
  cle: 'piste' | 'patrimoine' | 'opportunite' | 'reco'
  titre: string
  precision: string
  total: number
  groupes: GroupeAction[]
}

/**
 * Données du tableau de bord, organisées comme la maquette de William (11/08/2026) : quatre
 * indicateurs en tête, puis les listes d'actions à mener, regroupées par urgence.
 *
 * Les hooks utilisés chargent des tables entières, filtrées ensuite sur « ce qui est à moi ». Le
 * tableau de bord est une page d'arrivée et ces données servent aussi aux autres écrans : le cache
 * les y retrouve. Ne pas reproduire ce motif sur les fiches de détail.
 *
 * En revanche, les variantes `…Liste` s'arrêtent à l'en-tête. Cette page ne lit d'un contrat que
 * son statut, et d'un mandat que son compte, ses dates et son statut — jamais leurs PDL ni leurs
 * courtiers. Les charger coûtait quinze requêtes sur l'écran que tout le monde ouvre en premier.
 */
export function useDashboardStats() {
  const signaux = useSignaux()
  const recommandations = useRecommandationsListe()
  const actions = useActions()
  const contrats = useContratsListe()
  const mandats = useMandatsListe()
  const pistes = usePistes()
  const opportunites = useOpportunites()
  const echeances = useEcheancesAReprendre()
  const { data: monProfil } = useMonProfil()
  // « t'es censé voir uniquement les contrats qui sont à toi » (William, 12/08/2026). Le tableau de
  // bord répond à « qu'ai-je à traiter ? », pas à « qu'ai-je le droit de voir ? » : la règle vaut
  // pour tout le monde, administrateurs compris.
  const { data: portefeuille } = useQuery({ queryKey: ['mon-portefeuille'], queryFn: fetchMonPortefeuille })

  const isLoading =
    signaux.isLoading ||
    recommandations.isLoading ||
    actions.isLoading ||
    contrats.isLoading ||
    mandats.isLoading ||
    pistes.isLoading ||
    opportunites.isLoading ||
    portefeuille === undefined

  const data = useMemo(() => {
    const mesSignaux = filtrerMesElements(signaux.data ?? [], portefeuille, monProfil?.id, {
      proprietaireId: (s) => s.proprietaire_id,
      siteId: (s) => s.site_id,
    })
    const mesRecos = filtrerMesElements(recommandations.data ?? [], portefeuille, monProfil?.id, {
      proprietaireId: (r) => r.proprietaire_id,
      compteId: (r) => r.compte_id,
    })
    const mesContrats = filtrerMesElements(contrats.data ?? [], portefeuille, monProfil?.id, {
      proprietaireId: (c) => c.proprietaire_id,
      compteId: (c) => c.compte_id,
      siteId: (c) => c.site_id,
    })
    // Pour le mandat, la responsabilité est portée par le créateur, pas par un propriétaire :
    // « connaître qui a créé et envoyé le mandat est plus important » (William, 12/08/2026).
    const mesMandats = filtrerMesElements(mandats.data ?? [], portefeuille, monProfil?.id, {
      proprietaireId: (m) => m.proprietaire_id ?? m.cree_par_id,
      compteId: (m) => m.compte_id,
    })

    // ── Mandats à relancer : envoyés, jamais signés, et ça traîne ──────────────────────────
    const mandatsEnAttente = mesMandats
      .filter((m) => !m.date_signature && m.statut !== 'EXPIRE')
      .map((m) => ({ ...m, age: joursDepuis(m.date_envoi) }))
      .filter((m) => m.age !== null && m.age >= 7)
      .sort((a, b) => (b.age ?? 0) - (a.age ?? 0))

    const ligneMandat = (m: (typeof mandatsEnAttente)[number]): LigneAction => ({
      id: m.id,
      titre: m.compte_nom || 'Compte inconnu',
      sousTitre: m.date_envoi ? `Envoyé le ${new Date(m.date_envoi).toLocaleDateString('fr-FR')}` : 'Date d’envoi inconnue',
      echeance: `${m.age} j`,
      urgent: (m.age ?? 0) > 14,
      to: `/mandats/${m.id}`,
    })

    // ── Recommandations à traiter ──────────────────────────────────────────────────────────
    const recosOuvertes = mesRecos.filter((r) => !RECOS_FERMEES.includes(r.etape))
    // Une recommandation est prête à présenter dès qu'une de ses versions est disponible. Le repli
    // sur l'étape « Prête » ne sert que le temps que la migration des référentiels soit appliquée.
    const estPrete = (r: (typeof recosOuvertes)[number]) =>
      r.versions.some((v) => VERSIONS_PRETES.includes(v.statut)) || r.etape === 'PRETE'
    const recosPretes = recosOuvertes.filter(estPrete)
    const recosEnCours = recosOuvertes.filter((r) => !estPrete(r))

    const ligneReco = (r: (typeof recosOuvertes)[number], prete: boolean): LigneAction => ({
      id: r.id,
      titre: r.titre,
      sousTitre: r.compte_nom,
      echeance: prete ? 'Prête' : r.etape.replace(/_/g, ' ').toLowerCase(),
      urgent: prete,
      to: `/recommandations/${r.id}`,
    })

    // ── Contrats à suivre ─────────────────────────────────────────────────────────────────
    const contratsASuivre = mesContrats.filter((c) => CONTRATS_A_SUIVRE.includes(c.statut))
    const contratsASigner = contratsASuivre.filter((c) => c.statut === 'A_SIGNER')

    const ligneContrat = (c: (typeof contratsASuivre)[number], aSigner: boolean): LigneAction => ({
      id: c.id,
      titre: c.compte_nom || c.site_nom || 'Contrat',
      sousTitre: [c.fournisseur_nom, c.type_energie === 'gaz' ? 'Gaz' : 'Électricité'].filter(Boolean).join(' · '),
      echeance: aSigner ? 'À signer' : c.statut.replace(/_/g, ' ').toLowerCase(),
      urgent: aSigner,
      to: `/contrats/${c.id}`,
    })

    // ── Signaux à traiter ─────────────────────────────────────────────────────────────────
    const signauxOuvertsList = mesSignaux.filter((s) => !SIGNAUX_FERMES.includes(s.statut))
    const signauxNouveaux = signauxOuvertsList.filter((s) => s.statut === 'NOUVEAU')

    const ligneSignal = (s: (typeof signauxOuvertsList)[number], nouveau: boolean): LigneAction => ({
      id: s.id,
      titre: s.site_nom || 'Signal',
      sousTitre: s.type_signal || 'Signal',
      echeance: nouveau ? 'Nouveau' : s.statut.replace(/_/g, ' ').toLowerCase(),
      urgent: nouveau,
      to: `/signaux/${s.id}`,
    })

    // ── Pistes à qualifier — « appeler après l'Agent Pistes et confirmer le passage en
    //    patrimoine » (diapositive 12) ─────────────────────────────────────────────────────────
    //
    // Une piste est finie quand elle a produit son opportunité. Les cinq validations de la piste
    // disent où elle en est : société, contact, e-mail, portable, décisionnaire.
    const pistesOuvertes = (pistes.data ?? []).filter((p) => !p.opportunite_id)
    const validations = (p: (typeof pistesOuvertes)[number]) =>
      [p.societe_validee, p.contact_valide, p.email_valide, p.portable_valide, p.est_decisionnaire].filter(Boolean).length
    const pistesPretes = pistesOuvertes.filter((p) => validations(p) === 5)
    const pistesACompleter = pistesOuvertes.filter((p) => validations(p) < 5)

    const lignePiste = (p: (typeof pistesOuvertes)[number], prete: boolean): LigneAction => ({
      id: p.id,
      titre: p.societe || p.contact_nom || 'Piste sans nom',
      sousTitre: [p.contact_nom, p.telephone].filter(Boolean).join(' · ') || 'Coordonnées à compléter',
      echeance: prete ? 'Prête' : `${validations(p)}/5`,
      urgent: prete,
      to: '/prospection',
    })

    // ── Opportunités à faire avancer — « qualifier le périmètre, la couverture du mandat et la
    //    conversion » ─────────────────────────────────────────────────────────────────────────
    const mesOpportunites = filtrerMesElements(opportunites.data ?? [], portefeuille, monProfil?.id, {
      proprietaireId: (o) => o.proprietaire_id,
      compteId: (o) => o.compte_id ?? undefined,
    })
    const oppOuvertes = mesOpportunites.filter((o) => {
      const palier = statutDerive(o, mandats.data ?? []).code
      return palier !== 'CONVERTIE' && palier !== 'ABANDONNEE'
    })

    const ligneOpportunite = (o: (typeof oppOuvertes)[number]): LigneAction => {
      const d = statutDerive(o, mandats.data ?? [])
      return {
        id: o.id,
        titre: o.compte_nom || o.reference || 'Opportunité',
        // Le palier ne suffit pas : c'est la TÂCHE qui dit quoi faire, et c'est ce que le
        // commercial vient chercher sur cette page.
        sousTitre: d.tache,
        echeance: d.libelle,
        urgent: d.code === 'PRETE_A_CONVERTIR',
        to: `/opportunites/${o.id}`,
      }
    }

    // Les listes sont bornées à 6 lignes : au-delà, l'écran devient une liste et non un tableau
    // de bord. Le compteur de la section indique le total, et un lien mène à la liste complète.
    const LIMITE = 6

    const dateFr = (iso: string | null) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '—')

    const sections: SectionAction[] = [
      // ══ 1 · PISTES — « qualifier les nouveaux contacts » ══════════════════════════════════
      {
        cle: 'piste',
        titre: 'Pistes à qualifier',
        precision: 'appeler, vérifier, faire passer en patrimoine',
        total: pistesOuvertes.length,
        groupes: [
          {
            libelle: 'Prêtes à passer en patrimoine',
            lignes: pistesPretes.slice(0, LIMITE).map((p) => lignePiste(p, true)),
            siVide: 'Aucune piste entièrement vérifiée.',
          },
          {
            libelle: 'À compléter',
            lignes: pistesACompleter.slice(0, LIMITE).map((p) => lignePiste(p, false)),
            siVide: 'Aucune piste en cours de vérification.',
          },
        ],
      },
      // ══ 2 · PATRIMOINE — « rappeler les contacts aux échéances vides ou dépassées » ════════
      {
        cle: 'patrimoine',
        titre: 'Patrimoine à actualiser',
        precision: 'échéances absentes ou dépassées',
        total: (echeances.data?.nbAbsentes ?? 0) + (echeances.data?.nbDepassees ?? 0),
        groupes: [
          {
            libelle: `Échéance dépassée${echeances.data ? ` — ${echeances.data.nbDepassees}` : ''}`,
            lignes: (echeances.data?.depassees ?? []).map((l) => ({
              id: l.id,
              titre: l.site,
              sousTitre: `PDL ${l.pdl}`,
              echeance: dateFr(l.echeance),
              urgent: true,
              to: `/compteurs/${l.id}`,
            })),
            siVide: 'Aucune échéance dépassée.',
          },
          {
            libelle: `Sans échéance${echeances.data ? ` — ${echeances.data.nbAbsentes}` : ''}`,
            lignes: (echeances.data?.absentes ?? []).map((l) => ({
              id: l.id,
              titre: l.site,
              sousTitre: `PDL ${l.pdl}`,
              echeance: 'inconnue',
              urgent: false,
              to: `/compteurs/${l.id}`,
            })),
            siVide: 'Toutes les échéances sont renseignées.',
          },
        ],
      },
      // ══ 3 · OPPORTUNITÉS — « faire avancer les projets » ══════════════════════════════════
      //
      // LE SIGNAL ET LE MANDAT VIVENT ICI. Le signal est l'entrée de l'opportunité (diapositive 9,
      // « valider et créer l'opportunité »), et le mandat en est le palier 3 (« Couverture
      // mandat »). Ils avaient chacun leur bloc ; ils sont maintenant dans l'activité dont ils
      // font partie, sans rien perdre.
      {
        cle: 'opportunite',
        titre: 'Opportunités et signaux',
        precision: 'du signal détecté à la conversion',
        total: signauxOuvertsList.length + oppOuvertes.length + mandatsEnAttente.length,
        groupes: [
          {
            libelle: 'Signaux à qualifier',
            // Les nouveaux ET ceux déjà pris en qualification : « le signal arrive en À qualifier »
            // (diapositive 9), c'est l'état dans lequel il attend une décision. N'afficher que les
            // « Nouveau » cachait précisément ceux que le commercial avait pris en main.
            lignes: signauxOuvertsList.slice(0, LIMITE).map((sig) => ligneSignal(sig, sig.statut === 'NOUVEAU')),
            siVide: 'Aucun signal en attente de qualification.',
          },
          {
            libelle: 'Opportunités à faire avancer',
            lignes: oppOuvertes.slice(0, LIMITE).map(ligneOpportunite),
            siVide: 'Aucune opportunité en cours.',
          },
          {
            libelle: 'Mandats sans signature',
            lignes: mandatsEnAttente.slice(0, LIMITE).map(ligneMandat),
            siVide: 'Aucun mandat en souffrance.',
          },
        ],
      },
      // ══ 4 · RECOMMANDATIONS — « conclure avec le client » ═════════════════════════════════
      //
      // Le contrat rejoint cette activité : il est l'exécution de la décision (diapositive 5,
      // « Contrat — décision exécutée »).
      {
        cle: 'reco',
        titre: 'Recommandations à conclure',
        precision: 'comparer, présenter, enregistrer la décision',
        total: recosOuvertes.length + contratsASigner.length,
        groupes: [
          {
            libelle: 'Prêtes à présenter',
            lignes: recosPretes.slice(0, LIMITE).map((r) => ligneReco(r, true)),
            siVide: 'Aucune recommandation prête.',
          },
          {
            libelle: 'En préparation',
            lignes: recosEnCours.slice(0, LIMITE).map((r) => ligneReco(r, false)),
            siVide: 'Aucune recommandation en préparation.',
          },
          {
            libelle: 'Contrats à signer',
            lignes: contratsASigner.slice(0, LIMITE).map((c) => ligneContrat(c, true)),
            siVide: 'Aucun contrat à signer.',
          },
        ],
      },
    ]

    return {
      // Indicateurs de tête — un par activité de la diapositive 12.
      pistesAQualifier: pistesOuvertes.length,
      pistesPretes: pistesPretes.length,
      patrimoineAReprendre: (echeances.data?.nbAbsentes ?? 0) + (echeances.data?.nbDepassees ?? 0),
      echeancesDepassees: echeances.data?.nbDepassees ?? 0,
      opportunitesOuvertes: oppOuvertes.length,
      opportunitesPretes: oppOuvertes.filter((o) => statutDerive(o, mandats.data ?? []).code === 'PRETE_A_CONVERTIR').length,
      signauxOuverts: signauxOuvertsList.length,
      signauxNouveaux: signauxNouveaux.length,
      recommandationsEnCours: recosOuvertes.length,
      recosPretes: recosPretes.length,
      mandatsARelancer: mandatsEnAttente.length,
      mandatsTresEnRetard: mandatsEnAttente.filter((m) => (m.age ?? 0) > 14).length,
      contratsASuivre: contratsASuivre.length,
      contratsASigner: contratsASigner.length,
      actionsEnAttente: (actions.data ?? []).filter((a) => !ACTIONS_FERMEES.includes(a.statut)).length,

      sections,
      // Conservés pour les écrans qui s'en servent déjà.
      actionsPrioritaires: (actions.data ?? []).slice(0, 4),
      signauxRecents: signauxOuvertsList.slice(0, 5),
    }
    // `portefeuille` arrive en asynchrone : sans lui en dépendance, le filtre resterait figé sur
    // son état initial (vide) et le tableau de bord n'afficherait jamais rien.
  }, [signaux.data, recommandations.data, actions.data, contrats.data, mandats.data, pistes.data, opportunites.data, echeances.data, portefeuille, monProfil?.id])

  return { data, isLoading }
}

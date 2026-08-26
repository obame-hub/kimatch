import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * LES CHIFFRES DE LA MAQUETTE DE MICHEL, ET RIEN QUE CE QUE LA BASE SAIT VRAIMENT.
 *
 * Il a envoyé l'écran du tableau de bord le 25/08/2026 : un bandeau « Marge générée », quatre tuiles
 * chiffrées, puis « Ma journée ». J'ai audité la base avant d'écrire une ligne de rendu, parce qu'un
 * tableau de bord de chiffres inventés est pire que pas de tableau de bord — c'est sur ces nombres
 * qu'un commercial décide de son après-midi.
 *
 * CE QUE L'AUDIT A DONNÉ (25/08/2026) :
 *
 * · `recommandations.marge_nette` est renseignée sur 1 608 lignes sur 1 708, et `date_cloture` sur
 *   1 706. La marge du mois est donc un vrai chiffre : 42 recommandations acceptées en août pour
 *   69 190 €, contre 26 et 69 769 € en juillet.
 * · `date_cloture` porte la date de l'affaire, pas un état : elle est remplie même sur des étapes
 *   ouvertes (38 Consultation, 15 Brouillon en août). C'est la CloseDate reprise de Salesforce. On
 *   croise donc TOUJOURS date_cloture AVEC l'étape Acceptée — sans quoi on compterait comme gagnée
 *   une affaire encore en consultation.
 * · `actions` EST VIDE — zéro ligne. « Ma journée » affichera donc un état vide, et c'est la vérité :
 *   la table se remplira quand les commerciaux créeront des actions. La structure existe et suffit
 *   (`date_prevue` est un timestamp, donc l'heure de la maquette est possible, et `priorite` existe).
 * · `signaux.gravite` est nulle PARTOUT : le badge « 3 prioritaires » de la maquette n'a aucune
 *   source. Il est remplacé par les signaux détectés depuis sept jours, qui eux existent.
 * · `opportunites` n'a AUCUNE colonne de montant. Le « montant du pipe » vient donc des
 *   recommandations ouvertes (`montant`), seul endroit où un montant d'affaire est stocké.
 * · `remunerations` est vide et `versions_recommandation.gain_estime_annuel` n'est renseignée sur
 *   aucune des 2 024 lignes : ni l'un ni l'autre ne peut alimenter quoi que ce soit.
 *
 * CE QUE JE N'AI PAS PU FAIRE, ET POURQUOI JE NE L'AI PAS DEVINÉ. Sa maquette découpe la marge en
 * « Commercial 60 % » et « Kiwee 40 % ». Deux colonnes existent — `commission_interne` et
 * `commission_nette`, étiquetée « Commission nette KiWee » ailleurs dans l'app — mais elles ne
 * peuvent pas produire ce partage : sur mars, commission_interne (154 315 €) est SUPÉRIEURE à
 * commission_nette (148 996 €), donc l'une n'est pas une part de l'autre ; et sur août les deux sont
 * nulles. Un camembert 60/40 bâti là-dessus serait un chiffre faux affiché avec autorité. Les trois
 * emplacements de son bandeau sont donc tenus par des grandeurs vérifiables — recommandations
 * acceptées, marge moyenne, taux d'acceptation — en attendant qu'il dise quelles colonnes portent son
 * partage.
 *
 * LES CHIFFRES SONT CEUX DE L'ÉQUIPE, PAS DU SEUL UTILISATEUR. C'est cohérent avec la règle de
 * Naoëlle du 14/08 (« tous les commerciaux voient tous les comptes »), et le sous-titre le dit. Seule
 * « Ma journée » est personnelle : ce sont les actions dont on est responsable.
 */

/** Premier jour du mois, décalé de `mois` mois, en ISO court. */
function debutDeMois(mois = 0): string {
  const d = new Date()
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + mois, 1)).toISOString().slice(0, 10)
}

function ilYAJours(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

/** Les identifiants d'une table de référence, par code. */
async function idsParCode(table: string): Promise<Record<string, string>> {
  const { data } = await supabase.from(table).select('id, code')
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as { id: string; code: string }[]) out[r.code] = r.id
  return out
}

/** Somme d'une colonne numérique, en ignorant les lignes non renseignées. */
function somme(lignes: { [k: string]: unknown }[], colonne: string): number {
  let t = 0
  for (const l of lignes) {
    const v = l[colonne]
    if (typeof v === 'number') t += v
  }
  return t
}

export interface ChiffresTableauDeBord {
  /** Marge nette des recommandations acceptées dont l'affaire se clôt dans le mois courant. */
  margeMois: number
  margeMoisPrecedent: number
  /** Variation en points de pourcentage, `null` si le mois précédent est à zéro. */
  variationPct: number | null
  nbAcceptees: number
  nbAccepteesMoisPrecedent: number
  /** Marge moyenne par recommandation acceptée du mois. */
  margeMoyenne: number | null
  /** Acceptées ÷ décidées (acceptées + refusées + abandonnées) sur le mois. */
  tauxAcceptation: number | null
  nbRefusees: number
  nbAbandonnees: number

  signauxATraiter: number
  signauxRecents: number

  opportunitesActives: number
  opportunitesRecentes: number

  recosOuvertes: number
  recosAPresenter: number

  montantPipe: number
  /** Nombre de recommandations ouvertes dont le montant est renseigné — le pipe est partiel sinon. */
  pipeRenseigne: number
}

export function useChiffresTableauDeBord() {
  return useQuery({
    queryKey: ['tableau-de-bord', 'chiffres'],
    // Cinq minutes : ce sont des agrégats de gestion, pas un compteur temps réel.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ChiffresTableauDeBord> => {
      const [etapes, statutsSignaux, statutsOpp] = await Promise.all([
        idsParCode('etapes_recommandation'),
        idsParCode('statuts_signaux'),
        idsParCode('statuts_opportunites'),
      ])

      const moisCourant = debutDeMois(0)
      const moisSuivant = debutDeMois(1)
      const moisPrecedent = debutDeMois(-1)

      const ouvertes = ['BROUILLON', 'CONSULTATION', 'OFFRES_RECUES', 'A_PRESENTER', 'PRESENTEE']
        .map((c) => etapes[c])
        .filter(Boolean)
      const nonClos = ['NOUVEAU', 'A_QUALIFIER'].map((c) => statutsSignaux[c]).filter(Boolean)
      const oppVivantes = ['NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR']
        .map((c) => statutsOpp[c])
        .filter(Boolean)

      const acceptees = (debut: string, fin: string) =>
        supabase
          .from('recommandations')
          .select('marge_nette')
          .eq('actif', true)
          .eq('etape_id', etapes.ACCEPTEE)
          .gte('date_cloture', debut)
          .lt('date_cloture', fin)

      const compteEtape = (etape: string | undefined, debut?: string, fin?: string) => {
        let q = supabase
          .from('recommandations')
          .select('id', { count: 'exact', head: true })
          .eq('actif', true)
        if (etape) q = q.eq('etape_id', etape)
        if (debut) q = q.gte('date_cloture', debut)
        if (fin) q = q.lt('date_cloture', fin)
        return q
      }

      const [
        rMois,
        rPrecedent,
        rRefusees,
        rAbandonnees,
        rPipe,
        rAPresenter,
        rSignaux,
        rSignauxRecents,
        rOpp,
        rOppRecentes,
      ] = await Promise.all([
        acceptees(moisCourant, moisSuivant),
        acceptees(moisPrecedent, moisCourant),
        compteEtape(etapes.REFUSEE, moisCourant, moisSuivant),
        compteEtape(etapes.ABANDONNEE, moisCourant, moisSuivant),
        // Le pipe se somme sur les lignes : PostgREST ne fait pas de SUM, et 114 lignes d'une seule
        // colonne coûtent moins qu'une vue à créer et à faire appliquer.
        supabase.from('recommandations').select('montant').eq('actif', true).in('etape_id', ouvertes),
        compteEtape(etapes.A_PRESENTER),
        supabase.from('signaux').select('id', { count: 'exact', head: true }).eq('actif', true).in('statut_id', nonClos),
        supabase
          .from('signaux')
          .select('id', { count: 'exact', head: true })
          .eq('actif', true)
          .gte('date_detection', ilYAJours(7)),
        supabase
          .from('opportunites')
          .select('id', { count: 'exact', head: true })
          .eq('actif', true)
          .in('statut_id', oppVivantes),
        supabase
          .from('opportunites')
          .select('id', { count: 'exact', head: true })
          .eq('actif', true)
          .gte('date_creation', ilYAJours(7)),
      ])

      const lignesMois = (rMois.data ?? []) as { marge_nette: number | null }[]
      const lignesPrecedent = (rPrecedent.data ?? []) as { marge_nette: number | null }[]
      const lignesPipe = (rPipe.data ?? []) as { montant: number | null }[]

      const margeMois = somme(lignesMois, 'marge_nette')
      const margeMoisPrecedent = somme(lignesPrecedent, 'marge_nette')
      const nbAcceptees = lignesMois.length
      const nbRefusees = rRefusees.count ?? 0
      const nbAbandonnees = rAbandonnees.count ?? 0
      const decidees = nbAcceptees + nbRefusees + nbAbandonnees

      return {
        margeMois,
        margeMoisPrecedent,
        variationPct:
          margeMoisPrecedent > 0 ? ((margeMois - margeMoisPrecedent) / margeMoisPrecedent) * 100 : null,
        nbAcceptees,
        nbAccepteesMoisPrecedent: lignesPrecedent.length,
        margeMoyenne: nbAcceptees > 0 ? margeMois / nbAcceptees : null,
        tauxAcceptation: decidees > 0 ? (nbAcceptees / decidees) * 100 : null,
        nbRefusees,
        nbAbandonnees,
        signauxATraiter: rSignaux.count ?? 0,
        signauxRecents: rSignauxRecents.count ?? 0,
        opportunitesActives: rOpp.count ?? 0,
        opportunitesRecentes: rOppRecentes.count ?? 0,
        recosOuvertes: lignesPipe.length,
        recosAPresenter: rAPresenter.count ?? 0,
        montantPipe: somme(lignesPipe, 'montant'),
        pipeRenseigne: lignesPipe.filter((l) => l.montant != null).length,
      }
    },
  })
}

export type GroupeJournee = 'SIGNAL' | 'OPPORTUNITE' | 'MANDAT' | 'RECOMMANDATION' | 'AUTRE'

export interface ActionAFaire {
  id: string
  titre: string
  /** Le client ou le site concerné — la deuxième ligne de ses cartes. */
  contexte: string | null
  groupe: GroupeJournee
  /** Fait ou non : c'est l'état de la case à cocher. */
  faite: boolean
  /** Jours restants avant l'échéance. Négatif quand elle est passée, `null` sans date. */
  joursRestants: number | null
  /** `priorite` de la base, 0 à 100. Au-delà de 70, la ligne est signalée comme prioritaire. */
  priorite: number | null
}

/** Ce que porte le badge de droite : la couleur dit l'urgence, le texte dit pourquoi. */
export function badgeAction(a: ActionAFaire): { texte: string; ton: 'rouge' | 'ambre' | 'neutre' } | null {
  if (a.faite) return null
  if (a.joursRestants != null && a.joursRestants < 0) return { texte: 'En retard', ton: 'rouge' }
  if (a.joursRestants === 0) return { texte: "Aujourd'hui", ton: 'ambre' }
  if (a.priorite != null && a.priorite >= 70) return { texte: 'Prioritaire', ton: 'ambre' }
  if (a.joursRestants != null) return { texte: `${a.joursRestants} jour${a.joursRestants > 1 ? 's' : ''}`, ton: 'neutre' }
  return null
}

export const LIBELLE_GROUPE: Record<GroupeJournee, string> = {
  SIGNAL: 'Signaux',
  OPPORTUNITE: 'Opportunités',
  MANDAT: 'Mandats',
  RECOMMANDATION: 'Recommandations',
  AUTRE: 'Autres',
}

/**
 * MES ACTIONS, GROUPÉES PAR OBJET — « Ma journée » de sa maquette du 25/08/2026.
 *
 * Il l'a redessinée le soir même : plus d'agenda horaire, mais une LISTE À COCHER groupée par objet,
 * avec un badge d'urgence à droite et un basculement à réaliser / réalisé / tout. C'est un plan de
 * travail, pas un emploi du temps — et c'est plus juste, parce qu'une relance n'a pas d'heure.
 *
 * SON GROUPE « OPPORTUNITÉS » EXISTE DEPUIS LE 27/08/2026. Il manquait la colonne : `actions`
 * portait un lien vers un signal, un mandat, une recommandation, une version, un site et un contact,
 * mais aucun vers une opportunité. Naoëlle a tranché — « crée les liens de tâche vers opportunité » —
 * et la migration 20260827100000 l'a ajoutée.
 *
 * L'ORDRE DES GROUPES SUIT LA CHAÎNE : signal, opportunité, mandat, recommandation. C'est celui de
 * son pipeline, et il rend la lecture prévisible — on descend le tunnel de gauche à droite, du plus
 * amont au plus aval, comme sur la page 5 de sa présentation.
 *
 * LA PORTÉE N'EST PAS « AUJOURD'HUI » MAIS « À FAIRE ». Ses badges disent « 3 jours », « 2 jours » :
 * il ne montre pas la journée au sens de l'agenda, il montre ce qui attend. On prend donc tout ce qui
 * n'est pas fait et qui est dû — échéance passée, aujourd'hui, ou dans les sept jours — plus les
 * actions sans date, qui sinon n'apparaîtraient jamais nulle part.
 */
export function useMesActions(profilId: string | null | undefined) {
  return useQuery({
    queryKey: ['tableau-de-bord', 'mes-actions', profilId],
    enabled: !!profilId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ActionAFaire[]> => {
      const jour = new Date()
      const finDeSemaine = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate() + 8).toISOString()
      const debutDuJour = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate()).toISOString()

      const colonnes =
        'id, titre, priorite, date_prevue, date_realisation, signal_id, opportunite_id, mandat_id, recommandation_id, version_recommandation_id, type_action:types_actions(libelle), contact:contacts(prenom, nom), site:sites(nom)'

      // Deux requêtes plutôt qu'un `or` : ce qui reste à faire, et ce qui a été fait aujourd'hui —
      // le basculement « Réalisé » de sa maquette montre la journée écoulée, pas tout l'historique.
      const [aFaire, faites] = await Promise.all([
        supabase
          .from('actions')
          .select(colonnes)
          .eq('actif', true)
          .eq('responsable_profil_id', profilId)
          .is('date_realisation', null)
          .or(`date_prevue.lt.${finDeSemaine},date_prevue.is.null`)
          .order('date_prevue', { nullsFirst: false })
          .limit(60),
        supabase
          .from('actions')
          .select(colonnes)
          .eq('actif', true)
          .eq('responsable_profil_id', profilId)
          .gte('date_realisation', debutDuJour)
          .order('date_realisation', { ascending: false })
          .limit(30),
      ])

      type Ligne = {
        id: string
        titre: string | null
        priorite: number | null
        date_prevue: string | null
        date_realisation: string | null
        signal_id: string | null
        opportunite_id: string | null
        mandat_id: string | null
        recommandation_id: string | null
        version_recommandation_id: string | null
        type_action: { libelle: string } | null
        contact: { prenom: string | null; nom: string | null } | null
        site: { nom: string | null } | null
      }

      const lire = (a: Ligne): ActionAFaire => {
        /* L'ORDRE DES TESTS EST L'ORDRE DE LA CHAÎNE, et il compte : une tâche peut porter
           plusieurs liens — un mandat naît d'une opportunité. On retient alors l'objet le plus
           AMONT, celui qui explique pourquoi la tâche existe, plutôt que le dernier rattaché. */
        const groupe: GroupeJournee = a.signal_id
          ? 'SIGNAL'
          : a.opportunite_id
            ? 'OPPORTUNITE'
            : a.mandat_id
              ? 'MANDAT'
              : a.recommandation_id || a.version_recommandation_id
                ? 'RECOMMANDATION'
                : 'AUTRE'

        // Le nombre de jours se compte sur des jours de calendrier, pas sur des millisecondes : une
        // échéance ce soir à 18 h doit dire « aujourd'hui » et non « dans 0,3 jour ».
        let joursRestants: number | null = null
        if (a.date_prevue) {
          const d = new Date(a.date_prevue)
          const aJour = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
          const auj = Date.UTC(jour.getFullYear(), jour.getMonth(), jour.getDate())
          joursRestants = Math.round((aJour - auj) / 86_400_000)
        }

        return {
          id: a.id,
          titre: a.titre || a.type_action?.libelle || 'Action',
          contexte:
            [a.contact?.prenom, a.contact?.nom].filter(Boolean).join(' ') || a.site?.nom || null,
          groupe,
          faite: !!a.date_realisation,
          joursRestants,
          priorite: a.priorite,
        }
      }

      const toutes = [
        ...((aFaire.data ?? []) as unknown as Ligne[]),
        ...((faites.data ?? []) as unknown as Ligne[]),
      ]
      return toutes.map(lire)
    },
  })
}

export interface MaPerformance {
  margeMois: number
  nbAcceptees: number
  nbDecidees: number
  /** Acceptées ÷ décidées, en pourcentage. `null` quand rien n'a été décidé ce mois. */
  tauxTransformation: number | null
  margeMoyenne: number | null
  /** La même moyenne sur toute l'équipe — la seule référence que la base sache produire. */
  margeMoyenneEquipe: number | null
}

/**
 * MA PERFORMANCE — le second bloc de sa maquette révisée du 25/08/2026.
 *
 * Il sépare désormais deux échelles de la MÊME mesure : « Performance globale Kiwee » et
 * « Ma performance ». Ce faisant il a réglé sa propre question du matin — il n'y a plus de partage
 * « Commercial 60 % / Kiwee 40 % » à calculer, il y a une équipe et un commercial.
 *
 * L'AFFAIRE EST CRÉDITÉE AU PROPRIÉTAIRE, PAS AU RESPONSABLE, et ce n'est pas un choix de style :
 * `responsable_profil_id` n'est renseigné que sur 10 recommandations sur 1 708, contre 1 696 pour
 * `proprietaire_id` (mesuré le 26/08/2026). Sur le responsable, chacun aurait vu zéro.
 *
 * CHAQUE TUILE PORTE SA RÉFÉRENCE, comme sur sa maquette — mais seulement celles que la base sait
 * produire. Ses objectifs chiffrés (33 000 € par commercial, 520 000 € pour Kiwee) n'existent nulle
 * part : aucune table ne les porte. Les tuiles montrent donc ce qui est vérifiable — la moyenne de
 * l'équipe, le dénominateur du taux — et aucune barre ne prétend mesurer un objectif absent.
 *
 * « ACCEPTÉES SUR PRÉSENTÉES » DEVIENT « SUR DÉCIDÉES ». Sa maquette dit « 12 acceptées sur 50
 * présentées », mais la base ne garde pas la trace d'un passage par « Présentée » : une affaire
 * acceptée porte l'étape Acceptée, et rien ne dit qu'elle a été présentée. Le dénominateur honnête
 * est donc l'ensemble des affaires DÉCIDÉES sur le mois — acceptées, refusées, abandonnées — qui
 * forment une partition et se comptent sans supposition.
 */
export function useMaPerformance(profilId: string | null | undefined) {
  return useQuery({
    queryKey: ['tableau-de-bord', 'ma-performance', profilId],
    enabled: !!profilId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MaPerformance> => {
      const etapes = await idsParCode('etapes_recommandation')
      const debut = debutDeMois(0)
      const fin = debutDeMois(1)

      const surLeMois = (colonnes: string) =>
        supabase
          .from('recommandations')
          .select(colonnes)
          .eq('actif', true)
          .gte('date_cloture', debut)
          .lt('date_cloture', fin)

      const decidees = [etapes.ACCEPTEE, etapes.REFUSEE, etapes.ABANDONNEE].filter(Boolean)

      const [mes, mesDecidees, equipe] = await Promise.all([
        surLeMois('marge_nette').eq('proprietaire_id', profilId).eq('etape_id', etapes.ACCEPTEE),
        surLeMois('id').eq('proprietaire_id', profilId).in('etape_id', decidees),
        // La moyenne de l'équipe : toutes les affaires acceptées du mois, tous propriétaires.
        surLeMois('marge_nette').eq('etape_id', etapes.ACCEPTEE),
      ])

      const lignes = (mes.data ?? []) as unknown as { marge_nette: number | null }[]
      const lignesEquipe = (equipe.data ?? []) as unknown as { marge_nette: number | null }[]

      const margeMois = somme(lignes, 'marge_nette')
      const nbAcceptees = lignes.length
      const nbDecidees = ((mesDecidees.data ?? []) as unknown[]).length
      const margeEquipe = somme(lignesEquipe, 'marge_nette')

      return {
        margeMois,
        nbAcceptees,
        nbDecidees,
        tauxTransformation: nbDecidees > 0 ? (nbAcceptees / nbDecidees) * 100 : null,
        margeMoyenne: nbAcceptees > 0 ? margeMois / nbAcceptees : null,
        margeMoyenneEquipe: lignesEquipe.length > 0 ? margeEquipe / lignesEquipe.length : null,
      }
    },
  })
}

export interface ObjectifsDuMois {
  /** Objectif d'équipe : la SOMME des objectifs individuels, jamais une valeur saisie à part. */
  equipe: number | null
  /** Objectif du commercial connecté. */
  personnel: number | null
}

/**
 * LES OBJECTIFS DU MOIS — Michel, Slack du 26/08/2026 à 20 h 24.
 *
 * « On part sur un objectif de 115 k par mois, soit 1 380 k en 2026 », puis Marie 35 k, Guillaume
 * 35 k, Matthieu 25 k, Thomas 20 k.
 *
 * L'OBJECTIF D'ÉQUIPE EST LA SOMME DES INDIVIDUELS, et ce n'est pas une interprétation :
 * 35 + 35 + 25 + 20 = 115, exactement le chiffre qu'il annonce. Le stocker séparément aurait créé
 * deux vérités — un objectif individuel révisé laisserait un total d'équipe faux, sans qu'on sache
 * lequel croire.
 *
 * PAS D'OBJECTIF, PAS DE BARRE. Le hook rend `null` plutôt que zéro : une barre à 0 % laisse croire
 * qu'on n'a rien fait, alors qu'elle dit qu'on ne sait pas à quoi comparer.
 */
export function useObjectifsDuMois(profilId: string | null | undefined) {
  return useQuery({
    queryKey: ['tableau-de-bord', 'objectifs', profilId],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<ObjectifsDuMois> => {
      const { data, error } = await supabase
        .from('objectifs_mensuels')
        .select('profil_id, objectif_marge')
        .eq('mois', debutDeMois(0))
      if (error) return { equipe: null, personnel: null }

      const lignes = (data ?? []) as unknown as { profil_id: string | null; objectif_marge: number }[]
      if (lignes.length === 0) return { equipe: null, personnel: null }

      let equipe = 0
      let personnel: number | null = null
      for (const l of lignes) {
        equipe += Number(l.objectif_marge) || 0
        if (profilId && l.profil_id === profilId) personnel = Number(l.objectif_marge) || 0
      }
      return { equipe, personnel }
    },
  })
}

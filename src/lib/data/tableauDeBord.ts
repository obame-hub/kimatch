import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { heureDe } from '@/lib/heureTache'

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
 * · LES SIGNAUX NE SONT PLUS COMPTÉS ICI depuis le 02/09/2026 : le sujet a quitté toute
 *   l'application (voir `cycleNavItems`). Les deux requêtes sur `signaux` sont retirées — pas
 *   seulement leurs tuiles : un agrégat qu'aucun écran ne lit reste un aller-retour réseau à
 *   chaque chargement du tableau de bord.
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
      const [etapes, statutsOpp] = await Promise.all([
        idsParCode('etapes_recommandation'),
        idsParCode('statuts_opportunites'),
      ])

      const moisCourant = debutDeMois(0)
      const moisSuivant = debutDeMois(1)
      const moisPrecedent = debutDeMois(-1)

      // TROIS CODES AU LIEU DE CINQ (Michel, 28/08/2026) : un dossier non clos est Brouillon,
      // Active ou À réactiver. « À réactiver » compte parmi les ouverts — c'est même la colonne la
      // plus chargée aujourd'hui, 86 dossiers contre 46 actifs : l'oublier masquerait l'essentiel
      // du travail restant.
      const ouvertes = ['BROUILLON', 'ACTIVE', 'A_REACTIVER']
        .map((c) => etapes[c])
        .filter(Boolean)
      const oppVivantes = ['NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR']
        .map((c) => statutsOpp[c])
        .filter(Boolean)

      /* LE MONTANT D'UNE RECOMMANDATION, C'EST `marge_nette_coeff`.
         William, 10/09/2026 : « partout dans Kimatch où on marque le montant d'une recommandation,
         c'est le champ marge_nette_coeff qui doit être pris en compte ». Le tableau de bord sommait
         `marge_nette`, une étape intermédiaire de la cascade — d'où un chiffre plus faible ici que
         sur la fiche et que dans le rapport Salesforce. */
      const acceptees = (debut: string, fin: string) =>
        supabase
          .from('recommandations')
          .select('marge_nette_coeff')
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

      const lignesMois = (rMois.data ?? []) as { marge_nette_coeff: number | null }[]
      const lignesPrecedent = (rPrecedent.data ?? []) as { marge_nette_coeff: number | null }[]
      const lignesPipe = (rPipe.data ?? []) as { montant: number | null }[]

      const margeMois = somme(lignesMois, 'marge_nette_coeff')
      const margeMoisPrecedent = somme(lignesPrecedent, 'marge_nette_coeff')
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

/**
 * ══ LES GROUPES SUIVENT LA CHAÎNE RÉELLE, DEPUIS LE 08/09/2026 ══
 *
 * Les quatre groupes d'origine — opportunité, mandat, recommandation, autres — venaient de la
 * maquette de Michel du 25/08/2026, avant que les pistes et les suivis de contrat ne produisent des
 * tâches. Mesuré le 08/09/2026 sur les 337 tâches ouvertes de la base :
 *
 *   suivi de contrat  167      → tombait dans « Autres »
 *   piste             154      → tombait dans « Autres »
 *   opportunité        10
 *   recommandation      6
 *   requête             0
 *   mandat              0      → le bloc n'a JAMAIS rien contenu
 *
 * 321 tâches sur 337 s'entassaient donc sous « Autres », et le seul bloc toujours vide avait son
 * titre. William, 08/09/2026, en demandant une cartouche d'objet sur chaque carte : une étiquette
 * « Piste » dans un bloc « Autres » se contredit elle-même — il fallait refaire les groupes avant.
 *
 * MANDAT RESTE DANS LA LISTE malgré ses zéro tâches : la colonne `actions.mandat_id` existe et se
 * remplira. Un groupe vide ne s'affiche pas, il ne coûte donc rien ; l'absence de groupe, elle,
 * enverrait ces tâches dans « Autres » sans qu'on s'en aperçoive.
 */
export type GroupeJournee =
  | 'PISTE'
  | 'OPPORTUNITE'
  | 'RECOMMANDATION'
  | 'MANDAT'
  | 'SUIVI_CONTRAT'
  | 'REQUETE'
  | 'AUTRE'

/** L'objet d'où vient la tâche, tel que la cartouche l'annonce et tel qu'on y retourne. */
export interface ObjetTache {
  groupe: Exclude<GroupeJournee, 'AUTRE'>
  id: string
  /** Ce que la cartouche écrit : le nom de l'objet, pas son type. */
  nom: string
  /** La route de la fiche, avec la tâche en paramètre pour qu'elle s'y surligne. */
  chemin: string
}

export interface ActionAFaire {
  id: string
  titre: string
  /** Le client ou le site concerné — la deuxième ligne de ses cartes. */
  contexte: string | null
  groupe: GroupeJournee
  /** `null` seulement pour le groupe « Autres ». */
  objet: ObjetTache | null
  /** Le contact rattaché, cliquable sur la carte. 175 tâches sur 337 en ont un. */
  contact: { id: string; nom: string } | null
  /** Fait ou non : c'est l'état de la case à cocher. */
  faite: boolean
  /** Jours restants avant l'échéance. Négatif quand elle est passée, `null` sans date. */
  joursRestants: number | null
  /** `priorite` de la base, 0 à 100. Au-delà de 70, la ligne est signalée comme prioritaire. */
  priorite: number | null
  /** L'échéance brute, pour trier et pour reporter. */
  echeance: string | null
  /** Affiché en entier sur la carte, et modifiable par le crayon (William, 08/09/2026). */
  commentaire: string | null
  /** L'heure de l'échéance, `null` quand elle tombe à minuit local — c'est-à-dire sans heure. */
  heure: string | null
}

/** Ce que porte le badge de droite : la couleur dit l'urgence, le texte dit pourquoi. */
export function badgeAction(a: ActionAFaire): { texte: string; ton: 'rouge' | 'ambre' | 'neutre' } | null {
  if (a.faite) return null
  if (a.joursRestants != null && a.joursRestants < 0) return { texte: 'En retard', ton: 'rouge' }
  if (a.joursRestants === 0) return { texte: a.heure ? a.heure : "Aujourd'hui", ton: 'ambre' }
  if (a.priorite != null && a.priorite >= 70) return { texte: 'Prioritaire', ton: 'ambre' }
  if (a.joursRestants != null) return { texte: `${a.joursRestants} jour${a.joursRestants > 1 ? 's' : ''}`, ton: 'neutre' }
  return null
}

export const LIBELLE_GROUPE: Record<GroupeJournee, string> = {
  PISTE: 'Pistes',
  OPPORTUNITE: 'Opportunités',
  RECOMMANDATION: 'Recommandations',
  MANDAT: 'Mandats',
  SUIVI_CONTRAT: 'Suivis de contrat',
  REQUETE: 'Requêtes',
  AUTRE: 'Autres',
}

/**
 * ══ L'ORDRE DE LA JOURNÉE ══
 *
 * William, 08/09/2026 : « affiche en priorité les tâches en retard, puis les tâches disposant d'une
 * heure de rappel, puis le reste des tâches ouvertes ».
 *
 * Sa deuxième couche a failli être du bruit. Sur les 156 tâches qui portaient une heure le
 * 08/09/2026, 150 étaient à midi UTC — l'import Salesforce posait `ActivityDate + T12:00:00Z` pour
 * qu'un décalage de fuseau ne fasse pas basculer l'échéance d'un jour. L'intention était juste, mais
 * la convention de l'application est l'inverse (minuit local = pas d'heure, voir `heureTache.ts`),
 * et ces tâches annonçaient donc un rendez-vous « à 13:00 » ou « à 14:00 » que personne n'avait fixé.
 *
 * L'AFFICHAGE A D'ABORD NEUTRALISÉ CES HEURES, le temps d'un arbitrage. Ce contournement est parti
 * le jour même : William a tranché pour la source. Le script pose désormais minuit à Paris et la
 * migration 20260908200000 a repris les 150 lignes. La couche du milieu ne contient donc plus que
 * des rendez-vous réellement posés — et une heure saisie APRÈS l'import s'affiche, ce que le
 * contournement, lui, aurait masquée.
 */
export function rangJournee(a: ActionAFaire): number {
  if (a.joursRestants != null && a.joursRestants < 0) return 0
  if (a.joursRestants === 0) return a.heure ? 1 : 2
  if (a.joursRestants != null) return a.heure ? 3 : 4
  return 5
}

/**
 * MES ACTIONS, GROUPÉES PAR OBJET — « Ma journée » de sa maquette du 25/08/2026.
 *
 * Il l'a redessinée le soir même : plus d'agenda horaire, mais une LISTE À COCHER groupée par objet,
 * avec un badge d'urgence à droite et un basculement à réaliser / réalisé / tout. C'est un plan de
 * travail, pas un emploi du temps — et c'est plus juste, parce qu'une relance n'a pas d'heure.
 *
 * LE GROUPE « SIGNAUX » EN TÊTE A DISPARU LE 02/09/2026 avec le reste du sujet (voir
 * `cycleNavItems`). Les tâches qui ne portent qu'un `signal_id` ne sont PAS perdues : elles
 * retombent dans « Autres » et restent cochables. Rien n'est supprimé en base, ni la colonne, ni
 * les liens.
 *
 * ══ LA PORTÉE EST LE JOUR ET LE RETARD, ET RIEN D'AUTRE ══
 *
 * William, 08/09/2026 : « seules les tâches du jour et en retard sont censées apparaître dans Vue
 * d'ensemble ». Le bloc prenait jusqu'ici tout ce qui échoyait dans les huit jours, plus les tâches
 * sans date. Mesuré le même jour : cela remontait 168 tâches futures pour Fabien et 70 pour Matthieu
 * — un plan de travail qui contient la semaine entière ne dit plus quoi faire ce matin.
 *
 * LES TÂCHES SANS ÉCHÉANCE SORTENT AVEC LE RESTE, et c'est la conséquence assumée de la règle : sans
 * date, une tâche n'est ni du jour ni en retard. Elles sont trois dans toute la base (deux à Thomas,
 * une à Matthieu) et restent visibles sur la page Tâches. `date_prevue < demain` les écarte de
 * lui-même : en SQL, `null < x` ne vaut pas « vrai ».
 *
 * LE PLAFOND EST PASSÉ DE 60 À 300 LE 08/09/2026. Il n'avait jamais servi tant que la base comptait
 * trois tâches ; le resserrement au jour et au retard le rend confortable, mais on le garde haut :
 * un retard s'accumule sans prévenir, et une liste tronquée en silence est pire qu'une liste
 * longue. Le bloc n'affiche de toute façon que dix lignes par groupe et fait défiler le reste.
 */
export function useMesActions(profilId: string | null | undefined) {
  return useQuery({
    queryKey: ['tableau-de-bord', 'mes-actions', profilId],
    enabled: !!profilId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ActionAFaire[]> => {
      const jour = new Date()
      // Minuit LOCAL du lendemain : une échéance à 23 h ce soir est encore « du jour ».
      const finDuJour = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate() + 1).toISOString()
      const debutDuJour = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate()).toISOString()

      /* Sept jointures pour sept objets possibles. C'est le prix de la cartouche : elle nomme
         l'objet — « Piste · Groupe Solstice » — et un identifiant ne se lit pas. PostgREST les
         résout en une seule requête, et le plafond de 300 lignes borne le coût. */
      const colonnes =
        'id, titre, priorite, date_prevue, date_realisation, commentaire,' +
        ' opportunite_id, mandat_id, recommandation_id, version_recommandation_id, piste_id, requete_id, suivi_contrat_id,' +
        ' type_action:types_actions(libelle),' +
        ' contact:contacts(id, prenom, nom),' +
        ' site:sites(nom),' +
        ' piste:pistes!actions_piste_id_fkey(id, societe, contact_nom, reference),' +
        ' opportunite:opportunites!actions_opportunite_id_fkey(id, reference, compte:comptes(nom)),' +
        ' recommandation:recommandations!actions_recommandation_id_fkey(id, nom),' +
        ' version:versions_recommandation!actions_version_recommandation_id_fkey(id, nom, recommandation_id),' +
        ' requete:requetes!actions_requete_id_fkey(id, objet, reference),' +
        /* `suivis_contrats` POINTE DEUX FOIS VERS `comptes` — le client (`compte_id`) et le
           fournisseur (`fournisseur_compte_id`). Sans le nom de la contrainte, PostgREST ne peut pas
           choisir et refuse la requête entière : le groupe « Suivis de contrat », 167 tâches, serait
           tombé en panne. C'est aussi pourquoi les six autres jointures nomment la leur — une
           colonne ajoutée demain rendrait ambiguë une jointure qui ne l'est pas aujourd'hui. */
        ' suivi:suivis_contrats!actions_suivi_contrat_id_fkey(id, reference, compte:comptes!suivis_contrats_compte_id_fkey(nom)),' +
        ' mandat:mandats!actions_mandat_id_fkey(id, reference)'

      // Deux requêtes plutôt qu'un `or` : ce qui reste à faire, et ce qui a été fait aujourd'hui —
      // le basculement « Réalisé » de sa maquette montre la journée écoulée, pas tout l'historique.
      const [aFaire, faites] = await Promise.all([
        supabase
          .from('actions')
          .select(colonnes)
          .eq('actif', true)
          .eq('responsable_profil_id', profilId)
          .is('date_realisation', null)
          .lt('date_prevue', finDuJour)
          .order('date_prevue')
          .limit(300),
        supabase
          .from('actions')
          .select(colonnes)
          .eq('actif', true)
          .eq('responsable_profil_id', profilId)
          .gte('date_realisation', debutDuJour)
          .order('date_realisation', { ascending: false })
          .limit(50),
      ])

      type Lien = { id: string } & Record<string, unknown>
      type Ligne = {
        id: string
        titre: string | null
        priorite: number | null
        date_prevue: string | null
        date_realisation: string | null
        commentaire: string | null
        opportunite_id: string | null
        mandat_id: string | null
        recommandation_id: string | null
        version_recommandation_id: string | null
        piste_id: string | null
        requete_id: string | null
        suivi_contrat_id: string | null
        type_action: { libelle: string } | null
        contact: { id: string; prenom: string | null; nom: string | null } | null
        site: { nom: string | null } | null
        piste: ({ societe: string | null; contact_nom: string | null; reference: string | null } & Lien) | null
        opportunite: ({ reference: string | null; compte: { nom: string | null } | null } & Lien) | null
        recommandation: ({ nom: string | null } & Lien) | null
        version: ({ nom: string | null; recommandation_id: string | null } & Lien) | null
        requete: ({ objet: string | null; reference: string | null } & Lien) | null
        suivi: ({ reference: string | null; compte: { nom: string | null } | null } & Lien) | null
        mandat: ({ reference: string | null } & Lien) | null
      }

      /**
       * L'OBJET D'ORIGINE, NOMMÉ ET ADRESSÉ.
       *
       * L'ORDRE DES TESTS EST L'ORDRE DE LA CHAÎNE, et il compte : une tâche peut porter plusieurs
       * liens — un mandat naît d'une opportunité, elle-même née d'une piste. On retient alors
       * l'objet le plus AMONT, celui qui explique pourquoi la tâche existe, plutôt que le dernier
       * rattaché. Aucune des 337 tâches ouvertes n'en portait deux le 08/09/2026 ; la règle vaut
       * pour le jour où cela changera.
       *
       * `signal_id` n'est plus testé depuis le 02/09/2026 : une tâche qui ne porte que ce lien-là
       * tombe dans « Autres », elle ne disparaît pas de la liste.
       *
       * LE PARAMÈTRE `?tache=` N'EST PAS DÉCORATIF : il fait surligner la tâche dans le volet
       * d'activité de la fiche d'arrivée. Sans lui, on atterrit sur une fiche en se demandant où
       * regarder — William, 08/09/2026 : « je dois pouvoir être renvoyé en un clic vers la
       * recommandation dans laquelle la tâche s'affiche dans le flux d'activité ».
       */
      const objetDe = (a: Ligne): ObjetTache | null => {
        const vers = (groupe: ObjetTache['groupe'], base: string, id: string, nom: string | null | undefined) => ({
          groupe,
          id,
          nom: nom && nom.trim() ? nom.trim() : 'Sans nom',
          chemin: `/${base}/${id}?tache=${a.id}`,
        })
        if (a.piste)
          return vers('PISTE', 'pistes', a.piste.id, a.piste.societe || a.piste.contact_nom || a.piste.reference)
        if (a.opportunite)
          return vers('OPPORTUNITE', 'opportunites', a.opportunite.id, a.opportunite.compte?.nom || a.opportunite.reference)
        if (a.recommandation) return vers('RECOMMANDATION', 'recommandations', a.recommandation.id, a.recommandation.nom)
        // Une version appartient à sa recommandation : c'est la fiche mère qui porte le fil d'activité.
        if (a.version?.recommandation_id)
          return vers('RECOMMANDATION', 'recommandations', a.version.recommandation_id, a.version.nom)
        if (a.mandat) return vers('MANDAT', 'mandats', a.mandat.id, a.mandat.reference)
        if (a.suivi)
          return vers('SUIVI_CONTRAT', 'suivis-contrats', a.suivi.id, a.suivi.compte?.nom || a.suivi.reference)
        if (a.requete) return vers('REQUETE', 'requetes', a.requete.id, a.requete.objet || a.requete.reference)
        return null
      }

      const lire = (a: Ligne): ActionAFaire => {
        const objet = objetDe(a)

        // Le nombre de jours se compte sur des jours de calendrier, pas sur des millisecondes : une
        // échéance ce soir à 18 h doit dire « aujourd'hui » et non « dans 0,3 jour ».
        let joursRestants: number | null = null
        if (a.date_prevue) {
          const d = new Date(a.date_prevue)
          const aJour = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
          const auj = Date.UTC(jour.getFullYear(), jour.getMonth(), jour.getDate())
          joursRestants = Math.round((aJour - auj) / 86_400_000)
        }

        const nomContact = [a.contact?.prenom, a.contact?.nom].filter(Boolean).join(' ')

        return {
          id: a.id,
          titre: a.titre || a.type_action?.libelle || 'Action',
          contexte: nomContact || a.site?.nom || null,
          groupe: objet?.groupe ?? 'AUTRE',
          objet,
          contact: a.contact && nomContact ? { id: a.contact.id, nom: nomContact } : null,
          faite: !!a.date_realisation,
          joursRestants,
          priorite: a.priorite,
          echeance: a.date_prevue,
          commentaire: a.commentaire,
          heure: heureDe(a.date_prevue),
        }
      }

      const toutes = [
        ...((aFaire.data ?? []) as unknown as Ligne[]),
        ...((faites.data ?? []) as unknown as Ligne[]),
      ]

      /* Le tri de William : le retard d'abord, puis les rendez-vous du jour, puis le reste. À rang
         égal, la plus proche échéance passe devant, et à échéance égale la plus prioritaire. */
      return toutes.map(lire).sort((x, y) => {
        const r = rangJournee(x) - rangJournee(y)
        if (r !== 0) return r
        if (x.echeance && y.echeance && x.echeance !== y.echeance) return x.echeance < y.echeance ? -1 : 1
        return (y.priorite ?? 0) - (x.priorite ?? 0)
      })
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
        surLeMois('marge_nette_coeff').eq('proprietaire_id', profilId).eq('etape_id', etapes.ACCEPTEE),
        surLeMois('id').eq('proprietaire_id', profilId).in('etape_id', decidees),
        // La moyenne de l'équipe : toutes les affaires acceptées du mois, tous propriétaires.
        surLeMois('marge_nette_coeff').eq('etape_id', etapes.ACCEPTEE),
      ])

      const lignes = (mes.data ?? []) as unknown as { marge_nette_coeff: number | null }[]
      const lignesEquipe = (equipe.data ?? []) as unknown as { marge_nette_coeff: number | null }[]

      const margeMois = somme(lignes, 'marge_nette_coeff')
      const nbAcceptees = lignes.length
      const nbDecidees = ((mesDecidees.data ?? []) as unknown[]).length
      const margeEquipe = somme(lignesEquipe, 'marge_nette_coeff')

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

export interface ContexteJournee {
  /** Tâches ouvertes assignées à quelqu'un d'autre. */
  ailleurs: number
  /** Tâches ouvertes que personne n'a prises. */
  sansResponsable: number
  /** Total de tâches en base, toutes personnes et tous états confondus. */
  total: number
}

/**
 * POURQUOI « MA JOURNÉE » EST VIDE — et non pas seulement le fait qu'elle l'est.
 *
 * Naoëlle, 27/08/2026 : « tu ne m'as toujours pas expliqué pourquoi je vois rien dans Ma journée ».
 * Elle a raison de le redemander : j'avais corrigé la cause pour l'avenir sans traiter l'existant, et
 * surtout l'écran ne disait rien.
 *
 * UN BLOC VIDE A TROIS CAUSES POSSIBLES, et elles ne se ressemblent pas : il n'y a aucune tâche en
 * base, il y en a mais elles sont à quelqu'un d'autre, ou il y en a et personne ne les a prises. La
 * première se règle en créant une tâche, la deuxième n'est pas un problème, la troisième est un oubli
 * d'attribution. Afficher « Rien à réaliser » dans les trois cas laisse chercher.
 *
 * Ce hook rend donc de quoi le dire. Il ne s'exécute QUE quand la journée est vide — inutile de
 * compter les tâches des autres quand on a les siennes sous les yeux.
 */
export function useContexteJournee(profilId: string | null | undefined, actif: boolean) {
  return useQuery({
    queryKey: ['tableau-de-bord', 'contexte-journee', profilId],
    enabled: !!profilId && actif,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ContexteJournee> => {
      const base = () => supabase.from('actions').select('id', { count: 'exact', head: true }).eq('actif', true)
      const [ailleurs, sans, total] = await Promise.all([
        base().is('date_realisation', null).not('responsable_profil_id', 'is', null).neq('responsable_profil_id', profilId as string),
        base().is('date_realisation', null).is('responsable_profil_id', null),
        supabase.from('actions').select('id', { count: 'exact', head: true }),
      ])
      return {
        ailleurs: ailleurs.count ?? 0,
        sansResponsable: sans.count ?? 0,
        total: total.count ?? 0,
      }
    },
  })
}

import type { VersionPricing } from '@/lib/data/pricingVersions'
import type { ContratPricing } from '@/lib/data/pricingContrats'
import { estJourOuvreFR } from '@/lib/joursFeries'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ERWAN DOIT FAIRE, ET QUAND
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026, en décrivant tout le process : « le but est que Kimatch travaille pour Erwan,
 * qu'il lui dise ce qu'il doit demander, envoyer, relancer, auprès de qui, au bon moment ».
 *
 * ══ POURQUOI CES RÈGLES SONT ICI ET NON DANS L'ÉCRAN ══
 *
 * Elles sont le métier, pas de l'affichage. Neuf gestes, chacun avec sa condition de déclenchement et
 * son moment — et la suggestion de relance des recommandations a montré en septembre ce que coûte
 * une règle enfouie dans un composant : elle s'est cassée deux fois en silence, personne ne l'a vu
 * pendant trois semaines, et il a fallu la mesurer en base pour s'en apercevoir. Une règle qui décide
 * du travail de quelqu'un se teste.
 *
 * ══ TOUT SE COMPTE EN JOURS OUVRÉS ══
 *
 * William : « il doit être impossible de demander une offre pour le samedi ou le dimanche puisque les
 * commerciaux, et même les fournisseurs, ne travaillent que du lundi au vendredi ». Les vingt-quatre
 * heures de confirmation et les quinze heures du jour J suivent la même règle : une demande partie le
 * vendredi à 16 h n'est pas en retard le samedi.
 *
 * LES JOURS FÉRIÉS EN FONT PARTIE. William, 18/09/2026 : « il faut que ce soit le cas » — et il
 * l'avait déjà dit en réunion, dans les mêmes termes : « si tu demandes quelque chose le 15 août,
 * aucun fournisseur ne bosse le 15 août, donc tu ne pourras pas recevoir le 15 août. Ça peut
 * paraître optionnel, mais ça ne l'est pas du tout. »
 *
 * LE CALCUL EXISTAIT DÉJÀ : `joursFeries.ts` calcule les onze fériés de la métropole, Pâques
 * comprise, depuis le flot contrat. On le réutilise — un second calendrier des fériés aurait fini
 * par diverger du premier, et c'est exactement le genre d'écart que personne ne voit.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'heure à laquelle une offre non arrivée devient une relance (William, 18/09/2026). */
export const HEURE_LIMITE = 15

export type Urgence = 'retard' | 'aujourdhui' | 'a_lancer'

export type Geste =
  | 'ECRIRE_DEMANDE'
  | 'SAISIR_TRADEO'
  | 'RELEVER_PRIX'
  | 'RELANCER_CONFIRMATION'
  | 'RELANCER_OFFRE'
  | 'EDITER_PROPOSITION'
  | 'DEMANDER_CONTRAT'
  | 'RELANCER_CONTRAT'
  | 'TRANSMETTRE_CONTRAT'

export interface ActionJournee {
  /** Stable d'un rendu à l'autre : le geste et l'objet qu'il vise. */
  id: string
  geste: Geste
  urgence: Urgence
  /** Ce qu'il faut faire, en une phrase. */
  titre: string
  /** Le dossier, la version, l'échéance — de quoi décider sans ouvrir la fiche. */
  contexte: string
  /** Où va le clic sur le titre. */
  lien: string
  /** La consultation visée, quand le geste porte sur un fournisseur : l'écran y pose le statut. */
  consultationId?: string
  fournisseurNom?: string
  /** Le compte du fournisseur : c'est par lui que l'écran va chercher un destinataire. */
  fournisseurCompteId?: string | null
  versionId?: string
  contratId?: string
  /** Pour l'ordre : plus c'est petit, plus c'est urgent. */
  rang: number
}

/**
 * Un jour ouvré : ni week-end, ni férié.
 *
 * ELLE DÉLÈGUE PLUTÔT QUE DE DÉCIDER : `estJourOuvreFR` est la seule porte par laquelle passent
 * toutes les règles de délai de Kimatch — le flot contrat s'en sert déjà — si bien qu'une fermeture
 * d'entreprise ou un calendrier local s'ajoutera à un seul endroit.
 */
export function estOuvre(d: Date): boolean {
  return estJourOuvreFR(d)
}

/**
 * Le nombre de jours ouvrés écoulés entre deux instants.
 *
 * On compte les JOURS, pas les heures : une demande envoyée vendredi 16 h et relue lundi 9 h a passé
 * un jour ouvré — le lundi — ce qui suffit à réclamer une confirmation. Compter en heures aurait
 * donné dix-sept heures et laissé passer le lundi entier.
 */
export function joursOuvresEcoules(depuis: Date, jusqua: Date): number {
  const a = new Date(depuis.getFullYear(), depuis.getMonth(), depuis.getDate())
  const b = new Date(jusqua.getFullYear(), jusqua.getMonth(), jusqua.getDate())
  if (b <= a) return 0
  let n = 0
  const curseur = new Date(a)
  while (curseur < b) {
    curseur.setDate(curseur.getDate() + 1)
    if (estJourOuvreFR(curseur)) n += 1
  }
  return n
}

/** Le jour d'une date ISO, à midi — voir le commentaire de `DetailVersion` sur le fuseau. */
function jour(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

/** Combien de jours séparent aujourd'hui de cette date : négatif = passé. */
function ecartJours(date: Date, maintenant: Date): number {
  const a = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** Les deux modes qui reçoivent une demande. Les deux autres se relèvent le jour J. */
const MODES_QUI_RECOIVENT = ['MAIL', 'TRADEO']
const MODES_A_RELEVER = ['PLATEFORME', 'GRILLE']

function libelleVersion(v: VersionPricing): string {
  return v.version_nom || `V${v.numero_version ?? '?'}`
}

function echeance(v: VersionPricing): string {
  if (!v.date_souhaitee) return 'sans date de livraison'
  const d = new Date(String(v.date_souhaitee).slice(0, 10) + 'T12:00:00')
  return `livraison souhaitée le ${d.toLocaleDateString('fr-FR')}`
}

/**
 * ══════════ LES GESTES D'UNE VERSION ══════════
 *
 * Un fournisseur ne produit qu'UN geste à la fois, et c'est délibéré : un fournisseur à « Demande
 * envoyée » dont l'échéance est passée doit être relancé sur l'OFFRE, pas sur la confirmation. Les
 * empiler donnerait deux lignes pour un seul appel téléphonique.
 */
function gestesDeLaVersion(v: VersionPricing, maintenant: Date): ActionJournee[] {
  const actions: ActionJournee[] = []
  const lien = `/recommandations/${v.recommandation_id}`
  const dateLivraison = jour(v.date_souhaitee)
  const ecart = dateLivraison ? ecartJours(dateLivraison, maintenant) : null
  const apres15h = maintenant.getHours() >= HEURE_LIMITE

  /* ── La proposition commerciale : le geste qui clôt la version ──
     Tous les fournisseurs ont répondu et au moins une proposition est là. C'est le moment où Erwan
     est le plus attendu, et il passe hors de Kimatch — d'où une ligne qui le réclame. */
  if (v.version_statut === 'EN_CONSTRUCTION' && v.nb_attendus === 0 && v.nb_recues > 0) {
    actions.push({
      id: `proposition:${v.version_id}`,
      geste: 'EDITER_PROPOSITION',
      urgence: ecart != null && ecart < 0 ? 'retard' : 'aujourdhui',
      titre: `Éditer la proposition commerciale — tout est arrivé`,
      contexte: `${v.recommandation_nom} · ${libelleVersion(v)} · ${v.nb_recues} offre${v.nb_recues > 1 ? 's' : ''} sur ${v.nb_fournisseurs} · ${echeance(v)}`,
      lien,
      versionId: v.version_id,
      rang: ecart != null && ecart < 0 ? 5 : 20,
    })
  }

  for (const f of v.fournisseurs) {
    if (f.statut_code === 'DISPONIBLE' || f.statut_code === 'REFUSEE') continue

    const mode = f.mode_reponse
    const commun = {
      lien,
      consultationId: f.id,
      fournisseurNom: f.fournisseur_nom,
      fournisseurCompteId: f.fournisseur_compte_id,
      versionId: v.version_id,
    }

    /* ── Un mode inconnu se signale plutôt que de se deviner ──
       Dix-huit partenaires sont renseignés ; un fournisseur consulté hors de cette liste n'a pas de
       circuit connu, et l'inventer ferait envoyer un mail à quelqu'un qui n'en attend pas. */
    if (!mode) {
      actions.push({
        ...commun,
        id: `mode:${f.id}`,
        geste: 'ECRIRE_DEMANDE',
        urgence: 'a_lancer',
        titre: `Mode de réponse inconnu pour ${f.fournisseur_nom}`,
        contexte: `${v.recommandation_nom} · ${libelleVersion(v)} — renseignez son mode sur la fiche fournisseur`,
        rang: 60,
      })
      continue
    }

    /* ── Les fournisseurs qu'on relève soi-même ──
       Rien ne part, donc rien à relancer : le seul geste est d'aller chercher les prix, le jour de
       la livraison souhaitée. Cinq partenaires sur dix-huit sont dans ce cas. */
    if (MODES_A_RELEVER.includes(mode)) {
      if (ecart != null && ecart <= 0) {
        actions.push({
          ...commun,
          id: `relever:${f.id}`,
          geste: 'RELEVER_PRIX',
          urgence: ecart < 0 ? 'retard' : 'aujourdhui',
          titre: `Relever les prix de ${f.fournisseur_nom}`,
          contexte: `${v.recommandation_nom} · ${libelleVersion(v)} · ${mode === 'GRILLE' ? 'grille' : 'plateforme'} · ${echeance(v)}`,
          rang: ecart < 0 ? 10 : 30,
        })
      }
      continue
    }

    if (!MODES_QUI_RECOIVENT.includes(mode)) continue

    /* ── La demande n'est pas partie ──
       Elle part LE JOUR DE LA CRÉATION de la version. Au-delà d'un jour ouvré, c'est un retard. */
    if (f.statut_code === 'A_TRAITER') {
      const ne = jour(v.version_date_creation)
      const attente = ne ? joursOuvresEcoules(ne, maintenant) : 0
      actions.push({
        ...commun,
        id: `demande:${f.id}`,
        geste: mode === 'TRADEO' ? 'SAISIR_TRADEO' : 'ECRIRE_DEMANDE',
        urgence: attente >= 1 ? 'retard' : 'a_lancer',
        titre: mode === 'TRADEO'
          ? `Saisir la demande Tradéo pour ${f.fournisseur_nom}`
          : `Demander l'offre à ${f.fournisseur_nom}`,
        contexte: `${v.recommandation_nom} · ${libelleVersion(v)} · ${echeance(v)}${attente >= 1 ? ` — version créée il y a ${attente} jour${attente > 1 ? 's' : ''} ouvré${attente > 1 ? 's' : ''}` : ''}`,
        rang: attente >= 1 ? 15 : 40,
      })
      continue
    }

    /* ── L'offre devait arriver aujourd'hui, et il est passé 15 h ──
       Prioritaire sur la relance de confirmation : c'est l'offre qu'on attend, pas l'accusé. */
    if (ecart != null && (ecart < 0 || (ecart === 0 && apres15h))) {
      actions.push({
        ...commun,
        id: `relance-offre:${f.id}`,
        geste: 'RELANCER_OFFRE',
        urgence: ecart < 0 ? 'retard' : 'aujourdhui',
        titre: `Relancer ${f.fournisseur_nom} — l'offre ${ecart < 0 ? 'était attendue' : 'est attendue'} ${ecart === 0 ? "aujourd'hui" : ecart === -1 ? 'hier' : `depuis ${-ecart} jours`}`,
        contexte: `${v.recommandation_nom} · ${libelleVersion(v)} · ${f.statut_libelle}`,
        rang: ecart < 0 ? 1 : 12,
      })
      continue
    }

    /* ── La confirmation n'est jamais arrivée ──
       « Il est censé recevoir en moins de 24 h une confirmation. S'il ne reçoit rien, il doit faire
       une relance. » Un jour ouvré écoulé depuis l'envoi suffit. */
    if (f.statut_code === 'ENVOYEE') {
      const envoi = f.date_evenement ? new Date(f.date_evenement) : null
      const attente = envoi ? joursOuvresEcoules(envoi, maintenant) : 0
      if (attente >= 1) {
        actions.push({
          ...commun,
          id: `relance-confirmation:${f.id}`,
          geste: 'RELANCER_CONFIRMATION',
          urgence: 'retard',
          titre: `${f.fournisseur_nom} n'a jamais confirmé la demande`,
          contexte: `${v.recommandation_nom} · ${libelleVersion(v)} · envoyée il y a ${attente} jour${attente > 1 ? 's' : ''} ouvré${attente > 1 ? 's' : ''} · ${echeance(v)}`,
          rang: 3,
        })
      }
    }
  }

  return actions
}

/**
 * ══════════ LES GESTES D'UN CONTRAT ══════════
 *
 * « Cette demande de contrat doit déclencher un mail + notification à Erwan afin qu'il s'en occupe
 * PRIORITAIREMENT » — d'où un rang meilleur que les offres à échéance égale.
 */
function gestesDuContrat(c: ContratPricing, maintenant: Date): ActionJournee[] {
  const actions: ActionJournee[] = []
  const lien = `/contrats/${c.contrat_id}`
  const dateReception = jour(c.date_reception_souhaitee)
  const ecart = dateReception ? ecartJours(dateReception, maintenant) : null
  const apres15h = maintenant.getHours() >= HEURE_LIMITE
  const qui = c.fournisseur_nom || 'fournisseur non renseigné'
  const ou = c.compte_nom || c.recommandation_nom || 'compte non renseigné'

  /* ── La demande n'est pas partie ── */
  if (!c.avancement_code || c.avancement_code === 'BROUILLON') {
    actions.push({
      id: `contrat-demande:${c.contrat_id}`,
      geste: 'DEMANDER_CONTRAT',
      urgence: ecart != null && ecart < 0 ? 'retard' : 'a_lancer',
      titre: `Demander le contrat à ${qui}`,
      contexte: `${ou}${dateReception ? ` · réception souhaitée le ${dateReception.toLocaleDateString('fr-FR')}` : ' · sans date de réception'}`,
      lien,
      contratId: c.contrat_id,
      fournisseurNom: c.fournisseur_nom ?? undefined,
      fournisseurCompteId: c.fournisseur_compte_id,
      rang: ecart != null && ecart < 0 ? 2 : 25,
    })
    return actions
  }

  /* ── Le contrat n'est pas arrivé ──
     L'EXCEPTION DE WILLIAM : « sauf si la demande a elle-même été faite après 15 h et que la date de
     livraison souhaitée est le jour J — dans ce cas ce serait débile de lui proposer une relance
     alors qu'il vient juste d'envoyer la demande. » On regarde donc l'heure de la demande. */
  if (c.avancement_code === 'DEMANDE' && ecart != null && (ecart < 0 || (ecart === 0 && apres15h))) {
    const demandeLe = c.date_creation ? new Date(c.date_creation) : null
    const demandeTardiveLeJourMeme =
      ecart === 0
      && demandeLe != null
      && demandeLe.getHours() >= HEURE_LIMITE
      && ecartJours(demandeLe, maintenant) === 0
    if (!demandeTardiveLeJourMeme) {
      actions.push({
        id: `contrat-relance:${c.contrat_id}`,
        geste: 'RELANCER_CONTRAT',
        urgence: ecart < 0 ? 'retard' : 'aujourdhui',
        titre: `Relancer ${qui} — le contrat ${ecart < 0 ? 'était attendu' : 'est attendu'} ${ecart === 0 ? "aujourd'hui" : ecart === -1 ? 'hier' : `depuis ${-ecart} jours`}`,
        contexte: `${ou} · demandé${c.date_creation ? ` le ${new Date(c.date_creation).toLocaleDateString('fr-FR')}` : ''}`,
        lien,
        contratId: c.contrat_id,
        fournisseurNom: c.fournisseur_nom ?? undefined,
        fournisseurCompteId: c.fournisseur_compte_id,
        rang: ecart < 0 ? 2 : 14,
      })
    }
    return actions
  }

  /* ── Le client a signé : il reste à le transmettre au fournisseur ──
     « Erwan reçoit un mail lui indiquant qu'il doit envoyer ce contrat au fournisseur pour que ce
     dernier valide la prise en charge. C'est là que son périmètre s'arrête. » */
  if (c.avancement_code === 'SIGNE') {
    actions.push({
      id: `contrat-transmettre:${c.contrat_id}`,
      geste: 'TRANSMETTRE_CONTRAT',
      urgence: 'aujourdhui',
      titre: `Transmettre le contrat signé à ${qui}`,
      contexte: `${ou}${c.date_signature ? ` · signé le ${new Date(c.date_signature).toLocaleDateString('fr-FR')}` : ''} — pour qu'il valide la prise en charge`,
      lien,
      contratId: c.contrat_id,
      fournisseurNom: c.fournisseur_nom ?? undefined,
      fournisseurCompteId: c.fournisseur_compte_id,
      rang: 22,
    })
  }

  return actions
}

/**
 * La journée d'Erwan : tous les gestes, du plus urgent au plus lointain.
 *
 * L'ORDRE EST CELUI DE L'ACTION, pas celui des objets : une relance d'offre en retard passe avant
 * une demande de contrat qui n'a pas encore d'échéance, quel que soit l'objet dont elle vient.
 */
export function journeeDuPricing(
  versions: VersionPricing[],
  contrats: ContratPricing[],
  maintenant: Date = new Date(),
): ActionJournee[] {
  const actions = [
    ...versions.flatMap((v) => gestesDeLaVersion(v, maintenant)),
    ...contrats.flatMap((c) => gestesDuContrat(c, maintenant)),
  ]
  return actions.sort((a, b) => a.rang - b.rang || a.titre.localeCompare(b.titre))
}

/**
 * ══════════ LE CALENDRIER DE PRODUCTION ══════════
 *
 * William, 18/09/2026 : « un calendrier avec pour chaque jour le nombre et le détail des offres qui
 * sont attendues ce jour, correspondant à la date de livraison souhaitée ».
 *
 * IL RÉPOND À UNE AUTRE QUESTION QUE LA LISTE. La liste dit « que faire maintenant » ; le calendrier
 * dit « quand ça va tomber ». Un mardi à sept livraisons se prépare le vendredi d'avant, et c'est la
 * seule vue qui le montre — le reste de l'écran ne parle que d'aujourd'hui.
 */
export interface JourDeProduction {
  /** AAAA-MM-JJ, la clé du jour. */
  cle: string
  date: Date
  versions: VersionPricing[]
  /** Le nombre d'offres attendues ce jour-là, tous fournisseurs confondus. */
  offresAttendues: number
}

export function calendrierDeProduction(versions: VersionPricing[]): Map<string, JourDeProduction> {
  const jours = new Map<string, JourDeProduction>()
  for (const v of versions) {
    if (!v.date_souhaitee) continue
    const cle = String(v.date_souhaitee).slice(0, 10)
    const deja = jours.get(cle)
    /* LES OFFRES ENCORE ATTENDUES, pas le nombre de fournisseurs : une version dont deux réponses
       sur trois sont arrivées ne pèse qu'une offre sur la journée du jeudi. */
    const attendues = v.nb_attendus
    if (deja) {
      deja.versions.push(v)
      deja.offresAttendues += attendues
    } else {
      jours.set(cle, {
        cle,
        date: new Date(cle + 'T12:00:00'),
        versions: [v],
        offresAttendues: attendues,
      })
    }
  }
  return jours
}

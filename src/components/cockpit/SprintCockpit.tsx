import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, ChevronUp, Mail, Phone, PhoneOff, SkipForward, StickyNote, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { numeroInternational } from '@/lib/telephonie'
import { lancerAppelBureau, ouvrirAlloBureau } from '@/lib/alloBureau'
import { echeanceLisible, instantTache } from '@/lib/heureTache'
import {
  dureeLisible,
  etatDeLAppel,
  secondesDepuisDecroche,
  useAppelEnCours,
  useEcarterAppel,
  useQualifierAppel,
} from '@/lib/data/appelEnCours'
import { useCreateAction, useUpdateActionPartiel } from '@/lib/data/actions'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { LIBELLE_SOURCE, useAvancerStatutPiste, useFichePipe, useMajFicheSprint, useOuvrirDepot, type ChampFicheSprint, type LignePipe } from '@/lib/data/cockpit'
import { QUALIFICATIONS_FIN } from '@/lib/data/opportunites'
import { supabase } from '@/lib/supabase'
import { ChampSprint } from '@/components/cockpit/ChampSprint'
import { QualifierAppel } from '@/components/cockpit/QualifierAppel'
import { PanneauApresAppel, type GesteApresAppel } from '@/components/cockpit/PanneauApresAppel'
import { EditeurMailSprint } from '@/components/cockpit/EditeurMailSprint'
import { MorphDepuis } from '@/components/cockpit/MorphDepuis'
import { OngletsFiche } from '@/components/cockpit/OngletsFiche'
import { BannieresSprint } from '@/components/cockpit/BannieresSprint'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE SPRINT — UNE FICHE, UN APPEL, UNE SUITE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 15/09/2026 : « je rentre alors dans un process très particulier, chronométré, qui
 * affiche les fiches du pool dans l'ordre les unes après les autres. La fiche doit être exhaustive
 * mais montrer absolument les infos pertinentes. Quand la fiche s'affiche, je dois l'appeler. À la
 * fin de l'appel, le call est enregistré, la prochaine action est à prévoir et je passe à la fiche
 * suivante. »
 *
 * ══ UN RECOUVREMENT PLEIN ÉCRAN, ET NON UNE ROUTE ══
 *
 * Le sprint est un `fixed inset-0` par-dessus l'application. C'est ce qui fait disparaître le rail
 * de gauche et la barre du haut sans toucher à `AppLayout` — donc sans risque pour les quarante
 * autres écrans. Et c'est fidèle à l'intention : on ne navigue pas vers le sprint, on y entre.
 *
 * ══ LES TONS SOMBRES SONT CEUX DU RAIL, PAS UNE PALETTE ÉTRANGÈRE ══
 *
 * `km-side`, `km-side-line`, `km-side-text`… existent déjà : ce sont les couleurs du rail de
 * gauche. Les réutiliser fait que le sprint appartient visiblement à Kimatch au lieu de ressembler
 * à un autre produit posé par-dessus. Aucune couleur nouvelle n'est introduite.
 *
 * ══ LA FICHE EST COUPÉE PAR UNE QUESTION, PAS PAR UN TYPE DE DONNÉE ══
 *
 * À gauche : QUI j'appelle et comment. À droite : CE QU'IL FAUT SAVOIR AVANT DE PARLER — périmètre,
 * échéance et sa nature, tâches ouvertes, note. C'est l'information qui évite d'ouvrir trois
 * onglets pendant que ça sonne.
 *
 * ══ CLORE L'APPEL REMPLACE LA COLONNE DE DROITE, PAS L'ÉCRAN ══
 *
 * La personne reste visible à gauche pendant qu'on qualifie. Une boîte de dialogue aurait effacé le
 * nom de celui à qui on vient de parler — au moment précis où l'on écrit son commentaire.
 *
 * ══ SANS PROCHAINE ACTION, LA FICHE NE PART PAS ══
 *
 * C'est le seul verrou de l'écran, et il a une raison chiffrable : une opportunité ouverte sans
 * aucune tâche est un dossier que personne ne pousse, et le pipe du jour doit aller les repêcher
 * (seau `OPPORTUNITE_DORMANTE`). Le sprint ferme la fuite à sa source plutôt que de la rattraper
 * tous les matins.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * LES MOTIFS DE DISQUALIFICATION PROPOSÉS.
 *
 * Quatre suffisent, et c'est délibéré : une liste longue se lit mal au téléphone, et le champ libre
 * juste en dessous accueille tout le reste. Ils reprennent les raisons réellement invoquées dans
 * `pistes.motif_disqualification`.
 */
const MOTIFS_DISQUALIFICATION = [
  'Ne veut plus être contacté',
  'Hors cible',
  'Injoignable après plusieurs essais',
  'Doublon',
] as const

/**
 * ══ LES DEUX MAILS QU'ON ÉCRIT TOUS LES JOURS ══
 *
 * William, 22/09/2026, liste des actions rapides : « Demander les factures » sur les deux natures
 * de fiche, « Envoyer un mandat » sur les opportunités.
 *
 * ILS DISENT LE MÉTIER, PAS UNE FORMULE DE POLITESSE. Sur une piste, une facture n'est pas une
 * pièce administrative : c'est ce qui crée le périmètre et rend la conversion possible. Sur une
 * opportunité, le mandat est ce qui autorise Kiwee à consulter les fournisseurs. Le corps le dit,
 * parce que c'est l'argument qui obtient la pièce.
 *
 * LES CROCHETS RESTENT À COMPLÉTER, à dessein : un mail entièrement écrit part tel quel et se voit.
 * Ce qu'on fait gagner, c'est la frappe — pas la relecture.
 */
function modeleFactures(lienDepot: string | null) {
  return {
    objet: 'Vos factures d’énergie pour l’étude comparative',
    corps:
      '<p>Bonjour,</p>'
      + '<p>Comme convenu, pouvez-vous me transmettre <b>une facture récente d’électricité et de gaz</b> '
      + 'pour chacun des sites concernés ? Une simple copie suffit.</p>'
      /* ══ LE LIEN REMPLACE LA PIÈCE JOINTE EN RETOUR ══
         William, 23/09/2026. Une facture demandée par mail revient en pièce jointe, dans une boîte
         de réception, et n'atteint jamais la fiche : c'est ainsi qu'une seule piste sur 4 734 porte
         un document. Déposée par ce lien, elle arrive SUR la piste, datée, et prévient son
         propriétaire. Le lien n'apparaît que si la boîte a pu s'ouvrir — un mail sans lien reste un
         mail utile, un mail avec un lien mort ne l'est pas. */
      + (lienDepot
        ? `<p>Le plus simple est de les déposer ici, en une fois : <a href="${lienDepot}">${lienDepot}</a><br>`
          + '<span style="color:#69716C">Aucun compte à créer — le lien vous est personnel et reste valable trente jours.</span></p>'
        : '')
      + '<p>Elles me permettent de relever les points de livraison, les consommations et les dates '
      + 'd’échéance — c’est ce qui me permet de construire un comparatif chiffré, et non une estimation.</p>'
      + '<p>Je reviens vers vous dès réception.</p>',
  }
}

/** Sert à reconnaître ce modèle après coup, pour poser le statut et la relance qui vont avec. */
const OBJET_FACTURES = 'Vos factures d’énergie pour l’étude comparative'

/** Une date locale à J+n, au format court. `instantTache` en fait ensuite un instant complet. */
function dansNJoursISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MODELE_MANDAT = {
  objet: 'Mandat de représentation à signer',
  corps:
    '<p>Bonjour,</p>'
    + '<p>Vous trouverez ci-joint le <b>mandat de représentation</b> à signer.</p>'
    + '<p>Il nous autorise à interroger les fournisseurs en votre nom et à obtenir leurs offres. '
    + 'Il ne vous engage sur aucun contrat : la décision reste entièrement la vôtre, offres en main.</p>'
    + '<p>Dès qu’il est signé, je lance la consultation.</p>',
}



function chrono(secondes: number): string {
  const h = Math.floor(secondes / 3600)
  const m = Math.floor(secondes / 60) % 60
  const s = secondes % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export function SprintCockpit({
  lignes,
  onSortir,
  onFermer,
}: {
  lignes: LignePipe[]
  onSortir: (ligne: string, motif: 'APPELE' | 'REPORTE' | 'ECARTE') => void
  onFermer: () => void
}) {
  const [index, setIndex] = useState(0)
  const [secondes, setSecondes] = useState(0)
  /* Le numéro à composer quand la fiche en porte deux. Remis à zéro en changeant de fiche —
     sinon le second numéro d'un contact deviendrait le premier du suivant. */
  const [choixNumero, setChoixNumero] = useState(0)
  /* ══ L'APPEL COMMENCE AU CLIC, PAS AU WEBHOOK (William, 22/09/2026) ══
     « Je veux que le bouton raccrocher soit proposé dès que j'ai appuyé sur Appeler. »
     Le webhook d'Allô met quelques secondes à nous parvenir, et il peut ne jamais venir si le
     protocole n'a pas ouvert l'application. Attendre sa confirmation laissait donc « Appeler »
     cliquable pendant que la ligne sonnait déjà. C'est la leçon de sa spécification Lovable : la
     fenêtre d'appel s'ouvre sur le CLIC, et le webhook ne fait que l'enrichir ensuite. */
  const [appelLance, setAppelLance] = useState<{ numero: string; depuis: number } | null>(null)
  /**
   * ══ LA TÂCHE DU JOUR EST TERMINÉE, ET IL FAUT DIRE LA SUITE ══
   *
   * William, 22/09/2026 : « quand j'appelle, par définition je finalise la tâche qui était ouverte
   * à la date du jour (raison pour laquelle ça apparaît dans le pool du jour en réalité). Je dois
   * également prévoir une autre tâche, sauf si je finalise un parcours. »
   *
   * CE DRAPEAU EST LE VERROU DU PROCESSUS. Une fois la tâche du jour terminée, l'enregistrement
   * n'a plus rien qui le ramène dans le plan : sans une nouvelle tâche ou une fin de parcours, il
   * sort du pool ET N'Y REVIENT JAMAIS — sans que personne s'en aperçoive, parce qu'un
   * enregistrement qui disparaît ne réclame rien. C'est exactement le trou que le Cockpit était
   * censé boucher.
   *
   * Il se lève dans trois cas et trois seulement : une nouvelle tâche est créée, la piste est
   * disqualifiée, l'opportunité est close. La conversion aussi, mais indirectement — la piste
   * cesse d'être ouverte, et l'opportunité qui naît reçoit sa propre tâche automatique
   * (migration 20260921130000).
   */
  const [suiteAPrevoir, setSuiteAPrevoir] = useState(false)
  /** Pour ne pas terminer deux fois la même tâche si on rappelle le second numéro. */
  const [tacheFaite, setTacheFaite] = useState(false)
  const [appels, setAppels] = useState(0)
  /* ABOUTI N'EST PAS APPELÉ. Trois messages sur répondeur font trois appels et zéro abouti, et
     c'est la seule des deux mesures qui dit si la journée a servi à quelque chose. */
  const [aboutis, setAboutis] = useState(0)

  const creerAction = useCreateAction()
  const majAction = useUpdateActionPartiel()
  const avancerStatut = useAvancerStatutPiste()
  const ouvrirDepot = useOuvrirDepot()
  /* ══ L'APPEL EN COURS VIENT D'ALLO, PAS DE NOUS ══
     `appels_en_cours` est rempli par le webhook (`api/allo/webhook.ts`) : c'est la seule source qui
     sache qu'une ligne sonne, qu'on a décroché et quand. Kimatch ne peut pas le deviner — voir la
     longue note de `FenetreAppel` sur ce qu'Allo n'expose pas. */
  const { data: appelEnCours } = useAppelEnCours()
  const ecarterAppel = useEcarterAppel()
  const qualifier = useQualifierAppel()
  /* Le geste choisi après l'appel remplace le contenu de la fenêtre — mail, relance, échéance…
     `null` : on est encore dans la qualification. */
  const [geste, setGeste] = useState<GesteApresAppel | null>(null)
  /* Le seul message de l'écran : ce que l'envoi d'un mail a donné. Il s'efface tout seul — un
     bandeau qui reste occuperait une hauteur permanente pour une information d'une seconde. */
  const [messageSprint, setMessageSprint] = useState<string | null>(null)
  /* ══ D'OÙ PART L'ÉDITEUR ══
     Le rectangle de la carte « Contacter », mesuré AU CLIC — c'est-à-dire pendant qu'elle est
     encore à l'écran. Une mesure faite après le changement d'état tomberait sur une carte déjà
     démontée, et rendrait un rectangle vide. */
  const [origineMorph, setOrigineMorph] = useState<DOMRect | null>(null)
  /* Vrai pendant la sortie : l'éditeur reste monté le temps de se refermer sur la carte. */
  const [mailSort, setMailSort] = useState(false)

  /**
   * Ouvre l'éditeur en le faisant naître de la carte « Contacter ».
   *
   * Un modèle facultatif quand l'ouverture vient d'une action rapide : « Demander les factures »
   * et « Envoyer un mandat » sont les deux mails qu'on écrit le plus souvent, et toujours de la
   * même façon.
   */
  const [modeleMail, setModeleMail] = useState<{ objet: string; corps: string } | undefined>(undefined)

  /**
   * ══ TOUS LES GESTES OCCUPENT LE MÊME EMPLACEMENT ══
   *
   * William, 22/09/2026 : « la création de la nouvelle tâche doit prendre exactement la même place
   * que l'éditeur mail ».
   *
   * IL AVAIT RAISON, ET C'ÉTAIT UNE INCOHÉRENCE DE MA PART : l'éditeur recouvrait les trois cartes
   * en naissant de l'une d'elles, pendant que les quatre autres gestes s'ouvraient SOUS les cartes,
   * dans la place de la fenêtre d'appel. Deux emplacements pour une même famille d'actions — donc
   * deux endroits où chercher, et une mise en page qui sautait selon le geste choisi.
   *
   * L'ORIGINE DU MORPHING EST CELLE DE LA CARTE QUI PARLE : la carte « Contacter » pour un mail, la
   * carte « Tâche du jour » pour une tâche, le menu lui-même pour les gestes qui n'ont pas de carte.
   * C'est ce qui fait qu'on voit d'où le panneau sort, plutôt qu'un cadre qui surgit.
   */
  function ouvrirGeste(g: GesteApresAppel, idOrigine: string, modele?: { objet: string; corps: string }) {
    const source = document.getElementById(idOrigine)
    setOrigineMorph(source ? source.getBoundingClientRect() : null)
    setModeleMail(modele)
    setMailSort(false)
    setGeste(g)
  }

  const ouvrirEditeurMail = (modele?: { objet: string; corps: string }) =>
    ouvrirGeste('mail', 'carte-contacter', modele)

  /**
   * ══ LA BOÎTE S'OUVRE AVANT L'ÉDITEUR, PAS À L'ENVOI ══
   *
   * Le lien doit être DANS le corps quand le commercial le relit : glissé à l'envoi, il écrirait
   * autour d'un trou, et un modèle qu'on ne voit pas en entier ne se relit pas.
   *
   * L'ÉDITEUR S'OUVRE MÊME SI LA BOÎTE ÉCHOUE. Une demande de factures sans lien reste une demande
   * de factures ; un éditeur qui refuse de s'ouvrir coûte l'appel en cours.
   */
  async function ouvrirDemandeDeFactures() {
    const resultat = await ouvrirDepot.mutateAsync({
      pisteId: estPiste ? fiche.cible_id : null,
      opportuniteId: estPiste ? null : fiche.cible_id,
      contactId: fiche.contact_id,
      compteId: fiche.compte_id,
    }).catch((e: unknown) => ({ erreur: e instanceof Error ? e.message : 'appel impossible' }))

    if ('erreur' in resultat) {
      /* LE MAIL PART QUAND MÊME, ET L'ÉCRAN DIT CE QUI MANQUE. Un lien absent en silence est pire
         qu'une panne : on envoie le mail en croyant que le client pourra déposer, et on ne s'en
         aperçoit qu'en ne recevant jamais rien. */
      setMessageSprint(`Sans lien de dépôt — ${resultat.erreur}. Le client devra répondre en pièce jointe.`)
      window.setTimeout(() => setMessageSprint(null), 9000)
      ouvrirEditeurMail(modeleFactures(null))
      return
    }
    ouvrirEditeurMail(modeleFactures(resultat.lien.lien))
  }

  const majFiche = useMajFicheSprint()
  const { data: typesActions } = useReferenceTable('types_actions')
  const { data: statutsActions } = useReferenceTable('statuts_actions')

  /* Le chrono ne sert pas à surveiller : il rend le temps visible à celui qui prospecte, ce qui
     est la seule façon de tenir une cadence sans regarder une horloge. */
  useEffect(() => {
    const t = setInterval(() => setSecondes((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const fiche = lignes[index]
  /* LE DÉTAIL DE LA FICHE alimente les trois onglets du volet de droite. Il est volontairement
     SÉPARÉ de la ligne du pipe : `lister_pipe_du_jour` rend ce qu'il faut pour appeler, cette
     requête ce qu'il faut pour comprendre — périmètre, société, parc. La charger pour les soixante
     lignes du plan aurait coûté soixante requêtes pour une seule fiche lue. */
  const { data: detail } = useFichePipe(fiche ?? null)

  const avancer = useCallback(() => {
    setChoixNumero(0)
    setAppelLance(null)
    setGeste(null)
    setSuiteAPrevoir(false)
    setTacheFaite(false)
    setIndex((i) => i + 1)
  }, [])

  /* ══ PASSER TOURNE, IL NE SORT PAS ══
     William, 22/09/2026 : « Passer passe à la prochaine cible mais ne disparaît pas du sprint ».
     À la dernière fiche on revient donc à la première : une fiche passée doit pouvoir se reprendre
     en fin de séance, et c'est tout l'intérêt de la distinguer d'« Écarter », qui n'existe plus. */
  const passer = useCallback(() => {
    setChoixNumero(0)
    setAppelLance(null)
    setGeste(null)
    setSuiteAPrevoir(false)
    setTacheFaite(false)
    setIndex((i) => (i + 1 >= lignes.length ? 0 : i + 1))
  }, [lignes.length])

  /**
   * La fiche est traitée : elle sort du plan du jour et on passe à la suivante.
   *
   * ELLE NE CRÉE PLUS DE TÂCHE AUTOMATIQUE. L'ancienne clôture imposait de choisir une « suite »
   * parmi quatre — rappeler demain, dans trois jours, dans une semaine, écrire — et la créait.
   * C'était un verrou utile tant que rien d'autre ne permettait de programmer la suite ; depuis
   * que « Nouvelle tâche » est une action rapide, il ne faisait plus que forcer un choix par
   * défaut sur les fiches où la suite était déjà posée.
   */
  const terminerFiche = useCallback(() => {
    if (!fiche) return
    onSortir(fiche.ligne_id, 'APPELE')
    avancer()
  }, [fiche, onSortir, avancer])

  /* ══ LE SPRINT SE MÈNE À LA SOURIS (16/09/2026) ══
     Ce panneau était pensé clavier d'abord : F pour « appel terminé », P pour « pas joignable »,
     A pour composer, flèche droite pour passer, Entrée pour clore. William : « oublie les
     raccourcis clavier, même pour le Cockpit et pour tout le reste de l'app qui reste à coder. La
     navigation se fera au clic uniquement. »

     RIEN N'EST DEVENU INATTEIGNABLE, et c'est ce qui a rendu la décision applicable sans rien
     réécrire : chacune de ces cinq touches doublait un bouton déjà présent à l'écran. Les pastilles
     qui les annonçaient partent avec elles — une aide qui désigne une touche morte est pire que pas
     d'aide.

     ÉCHAP RESTE : sortir d'un panneau plein écran n'est pas un raccourci, c'est la porte. */
  useEffect(() => {
    function surEchap(e: KeyboardEvent) {
      if (e.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', surEchap)
    return () => window.removeEventListener('keydown', surEchap)
  }, [onFermer])

  if (!fiche) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-km-side px-6 text-center text-km-side-text">
        <p className="font-mono text-km-label font-semibold uppercase tracking-[0.3em] text-km-side-faint">
          Sprint terminé · {chrono(secondes)}
        </p>
        <p className="text-km-sprint font-bold text-km-side-text">
          {appels} appel{appels > 1 ? 's' : ''} passé{appels > 1 ? 's' : ''}, plus rien dans la pile.
        </p>
        <button
          onClick={onFermer}
          className="rounded-km bg-km-side-green px-6 py-3 text-km-name font-bold text-[#0B241C] transition-[filter] hover:brightness-110"
        >
          Revenir au plan du jour
        </button>
      </div>
    )
  }

  const estPiste = fiche.cible_type === 'PISTE'
  const tag = estPiste ? 'Piste' : 'Opportunité'

  /* Fixe puis mobile, sans doublon : beaucoup de fiches portent deux fois le même numéro, et
     l'afficher deux fois ferait douter de celui qu'il faut composer. */
  const numeros = [
    { numero: fiche.telephone, libelle: 'Ligne fixe' },
    { numero: fiche.telephone_mobile, libelle: 'Mobile' },
  ]
    .filter((n): n is { numero: string; libelle: string } => Boolean(n.numero))
    .filter((n, i, tous) => tous.findIndex((a) => a.numero === n.numero) === i)

  /* ══ EST-CE BIEN L'APPEL DE CETTE FICHE ? ══
     Le webhook rattache l'appel à un contact ou une piste, mais un commercial peut très bien
     décrocher un entrant pendant qu'une autre fiche est à l'écran. On compare donc le NUMÉRO, au
     format international des deux côtés — c'est la seule identité qu'un appel porte à coup sûr. */
  const numerosE164 = numeros.map((n) => numeroInternational(n.numero)).filter(Boolean)
  const appelDeLaFiche =
    appelEnCours && !appelEnCours.termine_le
      && numerosE164.includes(numeroInternational(appelEnCours.numero))
      ? appelEnCours
      : null
  /* TROIS ÉTATS, DE DEUX SOURCES. Le clic ouvre « lancé » tout de suite ; le webhook, quand il
     arrive, dit « ça sonne » puis « on parle ». Le second raffine le premier, il ne le remplace
     pas — si Allô ne nous rappelle jamais, la fenêtre reste ouverte et le chrono tourne depuis le
     clic, ce qui est toujours vrai. */
  const etatAppel: 'lance' | 'sonne' | 'en_ligne' | null =
    appelDeLaFiche ? etatDeLAppel(appelDeLaFiche) as 'sonne' | 'en_ligne' : appelLance ? 'lance' : null
  const enCommunication = etatAppel === 'en_ligne'
  const appelOuvert = Boolean(appelDeLaFiche || appelLance)
  /* `Date.now()` suffit à faire avancer le chrono : le composant se redessine à chaque seconde,
     poussé par le compteur de séance juste au-dessus. Un second `setInterval` pour la même
     horloge ferait deux rendus par seconde et deux sources de vérité qui dérivent. */
  const secondesAppel = appelDeLaFiche
    ? secondesDepuisDecroche(appelDeLaFiche, Date.now())
    : appelLance
      ? Math.max(0, Math.floor((Date.now() - appelLance.depuis) / 1000))
      : null

  /* Un seul point d'entrée pour toutes les corrections de l'écran : la fiche courante est
     implicite, l'appelant ne dit que le champ. */
  function corriger(champ: ChampFicheSprint) {
    return (valeur: string) => majFiche.mutateAsync({ ligne: fiche, champ, valeur }).catch(() => {})
  }

  /* ══ LANCER : L'APPLICATION DE BUREAU, ET RIEN D'AUTRE ══
     William, 22/09/2026 : « je ne veux pas utiliser la fenêtre Allô ou quoi que ce soit ». Le
     sprint n'ouvre donc NI le volet d'Allô NI la fenêtre d'appel de Kimatch — il vise les deux
     protocoles de bureau, et ouvre sa propre fenêtre, ici, dans la place libre.

     LE PROTOCOLE PART EN PREMIER, avant tout état : c'est le piège numéro un de la spécification
     que William a fournie — un `tel:` déclenché après une opération asynchrone n'ouvre pas Allô
     sur Safari et iOS. Rien ne doit s'intercaler entre le clic et le lancement. */
  function lancerAppel(indice = choixNumero) {
    const choisi = numeros[indice]
    const e164 = numeroInternational(choisi?.numero)
    if (!e164) return
    lancerAppelBureau(e164)
    setAppelLance({ numero: choisi.numero, depuis: Date.now() })
    /* APPELER TERMINE LA TÂCHE, et c'est le clic qui fait foi, pas le décroché : la tâche disait
       « appeler aujourd'hui », et on vient d'appeler. Tomber sur un répondeur ne rend pas la tâche
       à faire — elle est faite, c'est la SUITE qui reste à poser. */
    void terminerTacheDuJour()

    /* ══ APPELER, C'EST QUALIFIER ══
       William, 22/09/2026 : « dès que je lance une action de prospection dans cockpit (appel), la
       piste au statut nouvelle passe à "En cours de qualification" ». La garde `depuis` fait le
       reste de la phrase — « si elle est déjà à ce statut, elle reste à ce statut » — et empêche
       surtout de faire RECULER une piste déjà en attente de facture. */
    if (estPiste) {
      avancerStatut.mutate({ piste: fiche.cible_id, vers: 'EN_QUALIFICATION', depuis: ['NOUVELLE'] })
    }
  }

  /* ══ RACCROCHER : ON ROUVRE ALLÔ, ET ON CLÔT CHEZ NOUS ══
     William sait qu'on ne coupe pas la ligne depuis Kimatch — il l'écrit lui-même. Ce qu'il
     demande, c'est que le bouton rouge « ouvre l'application Allô afin de me permettre de
     raccrocher depuis l'app ». Le protocole sans paramètre l'active ; le reste du geste —
     horodater la fin, compter l'appel, passer à la qualification — se fait ici. */
  /**
   * Clore l'opportunité depuis le sprint.
   *
   * ON ÉCRIT EXACTEMENT LES MÊMES COLONNES que la boîte de dialogue de `OpportuniteDetail` —
   * qualification, motif, date. Une opportunité close depuis le sprint doit être indiscernable
   * d'une opportunité close depuis sa fiche, sinon l'état du portefeuille dépend de l'écran par
   * lequel on est passé. Le statut de clôture, lui, est laissé aux déclencheurs : c'est eux qui le
   * tiennent, et le poser d'ici ferait une seconde source de vérité.
   */
  async function cloreOpportunite(qualification: string, motif: string) {
    if (!fiche || fiche.cible_type !== 'OPPORTUNITE') return
    const { error } = await supabase
      .from('opportunites')
      .update({
        qualification_fin: qualification,
        motif_cloture: motif || null,
        date_cloture: new Date().toISOString(),
        date_modification: new Date().toISOString(),
      })
      .eq('id', fiche.cible_id)
    if (error) { setMessageSprint(`Clôture impossible : ${error.message}`); return }
    setSuiteAPrevoir(false)
    setGeste(null)
    terminerFiche()
  }

  /* ══ LES TROIS ÉCRITURES QUE LES GESTES D'APRÈS-APPEL DÉCLENCHENT ══
     Elles vivent ici et non dans le panneau : le panneau dessine et collecte, la page écrit. C'est
     ce qui lui permet de rester utilisable ailleurs sans traîner quatre mutations. */
  /**
   * Terminer la tâche qui a fait entrer cette fiche dans le plan du jour.
   *
   * C'EST BIEN CELLE-LÀ, et pas une autre : `useFichePipe` retient exactement la même que
   * `lister_pipe_du_jour` — ouverte, à moi ou à personne, prévue aujourd'hui ou en retard, la plus
   * ancienne d'abord. S'il en reste d'autres ouvertes ce jour-là, la fiche reste dans le plan, et
   * c'est juste : il reste quelque chose à y faire.
   */
  async function terminerTacheDuJour() {
    const tache = detail?.tache
    if (!tache || tacheFaite) return
    const terminee = statutsActions?.find((st) => st.code === 'TERMINEE')
    if (!terminee) return
    setTacheFaite(true)
    setSuiteAPrevoir(true)
    await majAction.mutateAsync({
      id: tache.id,
      /* Le statut suffit : `lister_pipe_du_jour` écarte TERMINEE et ANNULEE, et la date de
         réalisation est posée par le déclencheur qui suit le statut. */
      patch: { statut_id: terminee.id },
    }).catch(() => { /* une tâche qu'on n'a pas pu fermer se rouvrira au prochain plan : pas de perte */ })
  }

  /**
   * Poser la suite : une tâche, et la fiche reviendra dans le plan à son échéance.
   *
   * ══ ELLE TERMINE TOUJOURS CELLE DU JOUR ══
   *
   * William, 22/09/2026 : « poser une nouvelle tâche termine toujours celle du jour, appel ou pas.
   * Oui je suis d'accord. » Sans cela, décider « pas aujourd'hui, jeudi » sans décrocher laissait
   * DEUX tâches ouvertes : la fiche restait dans le plan du jour et revenait jeudi.
   *
   * ══ LE RESPONSABLE EST LE PROPRIÉTAIRE DE L'ENREGISTREMENT ══
   *
   * William : « toutes les tâches doivent avoir le propriétaire de l'enregistrement comme
   * responsable ». C'est ce qui répare les 276 tâches sans responsable relevées le 21/09 : une
   * tâche qui n'est à personne compte pour tout le monde, donc n'est faite par personne.
   */
  async function creerRelance(titreTache: string, instant: string, codeType: 'APPELER' | 'ENVOYER_EMAIL' = 'APPELER') {
    await terminerTacheDuJour()
    const type = typesActions?.find((t) => t.code === codeType)
    const aFaire = statutsActions?.find((st) => st.code === 'A_FAIRE')
    await creerAction.mutateAsync({
      titre: titreTache,
      responsable_profil_id: detail?.proprietaire_id ?? null,
      type_action_id: type?.id ?? null,
      type_action_libelle: type?.libelle ?? (codeType === 'APPELER' ? 'Appel' : 'Mail'),
      site_id: null,
      site_nom: '',
      contact_id: fiche.contact_id,
      contact_nom: fiche.nom_complet ?? '',
      priorite: 2,
      echeance: instant,
      commentaire: null,
      statut_id: aFaire?.id ?? null,
      opportunite_id: fiche.cible_type === 'OPPORTUNITE' ? fiche.cible_id : null,
      piste_id: fiche.cible_type === 'PISTE' ? fiche.cible_id : null,
    })
    /* LA SUITE EST POSÉE : la fiche reviendra d'elle-même dans le plan du jour à l'échéance de
       cette tâche. C'est tout le processus, et c'est la seule sortie qui ne perd rien. */
    setSuiteAPrevoir(false)
  }

  /**
   * ══ CHAQUE ACTION LAISSE UNE TÂCHE ══
   *
   * William, 22/09/2026 : « chaque action doit suivre avec une tâche, sauf les actions de
   * conversion / disqualification / clôture ».
   *
   * UN MAIL PARTI N'EST PAS UNE SUITE. Il ne ramène rien : c'est notre geste, pas le sien. Sans la
   * tâche qui suit, une demande de factures envoyée un lundi disparaît du plan et personne ne sait
   * plus qu'on attend quelque chose — 4 734 pistes sont déjà dans cet état.
   *
   * ET IL FAIT AVANCER LE PARCOURS. William : « le passage à "En attente de facture" n'est possible
   * depuis cockpit qu'avec le bouton d'action "Demande de facture" ». On ne change donc le statut
   * que pour ce modèle-là, et seulement une fois le mail RÉELLEMENT PARTI : le statut dit qu'on
   * attend une réception, pas qu'on a eu l'intention de la demander.
   */
  async function apresEnvoiMail() {
    const demandeDeFactures = modeleMail?.objet === OBJET_FACTURES
    if (estPiste && demandeDeFactures) {
      avancerStatut.mutate({
        piste: fiche.cible_id,
        vers: 'EN_ATTENTE_FACTURE',
        depuis: ['NOUVELLE', 'EN_QUALIFICATION'],
      })
    }
    const titre = demandeDeFactures
      ? `Relancer ${fiche.nom_complet ?? 'ce contact'} sur les factures`
      : modeleMail?.objet === MODELE_MANDAT.objet
        ? `Relancer ${fiche.nom_complet ?? 'ce contact'} sur le mandat`
        : `Relancer ${fiche.nom_complet ?? 'ce contact'}`
    const instant = instantTache(dansNJoursISO(3), null)
    if (instant) await creerRelance(titre, instant)
  }

  async function disqualifierPiste(motif: string) {
    if (!estPiste) return
    await majFiche.mutateAsync({ ligne: fiche, champ: 'motif_disqualification', valeur: motif })
    /* LE STATUT SUIT LE MOTIF. Sans lui, la piste gardait « En cours de qualification » avec un
       motif de disqualification en travers : deux écrans en désaccord sur la même ligne. */
    await avancerStatut.mutateAsync({ piste: fiche.cible_id, vers: 'DISQUALIFIEE' }).catch(() => {})
    await terminerTacheDuJour()
    setSuiteAPrevoir(false)
    onSortir(fiche.ligne_id, 'ECARTE')
    avancer()
  }

  async function poserEcheance(jour: string) {
    if (!estPiste) return
    await majFiche.mutateAsync({ ligne: fiche, champ: 'echeance_actuelle', valeur: jour })
  }

  function raccrocher() {
    ouvrirAlloBureau()
    if (appelDeLaFiche) ecarterAppel.mutate(appelDeLaFiche.id)
    setAppelLance(null)
    setAppels((n) => n + 1)
    if (enCommunication) setAboutis((n) => n + 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-km-side text-km-side-text">
      {/* ── LE RAIL DE PROGRESSION : la seule trace de la journée entière ── */}
      <div className="flex h-[3px] gap-[2px]" aria-hidden="true">
        {lignes.map((l, i) => (
          <span
            key={l.ligne_id}
            className={cn('flex-1', i < index ? 'bg-km-side-green/55' : i === index ? 'bg-km-side-green' : 'bg-km-side-line')}
          />
        ))}
      </div>

      {/* ── LA BARRE DE SÉANCE ── */}
      {/* ══ LA BARRE DE SÉANCE, SUR DEUX FOIS SA HAUTEUR (William, 22/09/2026) ══
          Elle porte le seul repère de la journée entière — le temps passé, où l'on en est, ce
          qu'on a obtenu. À 42 px elle se lisait comme une barre d'outils ; à 84 elle se lit comme
          un tableau de bord, et le chrono peut prendre la taille qu'il mérite. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-km-side-line bg-km-side-bas px-4 py-3.5 font-mono text-km-label font-semibold uppercase tracking-[0.12em] text-km-side-muted sm:px-8 xl:py-5">
        <span className="text-km-sprint font-bold tracking-[0.01em] text-km-side-green tabular-nums">{chrono(secondes)}</span>
        <span>
          Fiche <b className="text-km-sprint-val font-bold text-km-side-text">{index + 1}</b> sur {lignes.length}
        </span>
        <span>
          Appels <b className="text-km-sprint-val font-bold text-km-side-text">{appels}</b>
        </span>
        <span>
          Aboutis <b className="text-km-sprint-val font-bold text-km-side-text">{aboutis}</b>
        </span>
        <button
          onClick={onFermer}
          className="ml-auto inline-flex items-center gap-2 rounded-km border border-km-side-line px-3 py-1.5 uppercase tracking-[0.12em] hover:border-km-side-muted hover:text-km-side-text"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Quitter · Échap
        </button>
      </div>

      {messageSprint ? (
        <p className="animate-km-fade shrink-0 border-b border-km-side-green/30 bg-km-side-green/10 px-4 py-2 text-km-body font-medium text-km-side-green sm:px-8">
          {messageSprint}
        </p>
      ) : null}

      {/* ══ LES BANNIÈRES POUSSENT, ELLES NE RECOUVRENT PAS ══
          Le sprint est déjà un recouvrement plein écran : une notification flottante par-dessus
          ferait un troisième étage et cacherait le nom de celui à qui l'on parle. Elles s'insèrent
          sous la barre de séance et décalent le contenu de quelques dizaines de pixels. */}
      <div className="shrink-0">
        <BannieresSprint
          actif
          onOuvrir={(a) => {
            /* SI LA FICHE EST DANS LE PLAN, ON Y VA SANS QUITTER LA SÉANCE. Sinon seulement, on
               ouvre sa fiche dans un onglet — le sprint ne se ferme jamais d'un clic de bannière. */
            const rang = lignes.findIndex((l) => l.cible_type === a.cible_type && l.cible_id === a.cible_id)
            if (rang >= 0) { setIndex(rang); setGeste(null); setAppelLance(null); return }
            if (a.lien) window.open(a.lien, '_blank', 'noopener')
          }}
        />
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1.05fr_0.95fr]">
        {/* ══ GAUCHE · QUI J'APPELLE ══

            LA `key` EST CELLE DE LA FICHE, et c'est ce qui rend l'enchaînement fluide : React
            remonte la colonne à chaque passage, donc l'animation rejoue. Sans elle, il réutilise
            les mêmes nœuds et le contenu change d'un coup sec — on ne voit pas qu'on a changé
            d'interlocuteur, ce qui est le pire défaut possible dans un écran d'appel.

            LA LARGEUR DE LECTURE EST BORNÉE à 42 rem. Sur un 27 pouces, la colonne fait 900 px et
            un nom de 44 px y flotterait au milieu d'un désert ; la borne garde le bloc compact et
            l'ancre à gauche, là où l'œil revient. */}
        <div
          key={fiche.ligne_id}
          className="animate-km-fade-slide flex w-full max-w-[64rem] flex-col gap-5 px-4 py-6 [container-type:inline-size] sm:px-8 xl:gap-8 xl:py-10"
        >
          {/* ── LA CARTOUCHE DE CONTEXTE : d'où vient la fiche, et à quel titre ── */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-km-pill bg-km-side-green/15 px-3 py-1 font-mono text-km-label font-semibold uppercase tracking-[0.12em] text-km-side-green">
              <span className="h-1.5 w-1.5 rounded-full bg-km-side-green" aria-hidden="true" />
              {LIBELLE_SOURCE[fiche.source]}
              {fiche.heure ? ` · ${fiche.heure}` : ''}
            </span>
            {fiche.en_retard ? (
              <span className="rounded-km-pill bg-km-amber/20 px-3 py-1 font-mono text-km-label font-semibold uppercase tracking-[0.12em] text-km-amber">
                En retard
              </span>
            ) : null}
            <span className="rounded-km-pill border border-km-side-line px-3 py-1 font-mono text-km-label font-semibold uppercase tracking-[0.12em] text-km-side-muted">
              {tag}
            </span>
            {fiche.segment ? (
              <span className="truncate rounded-km-pill border border-km-side-line px-3 py-1 font-mono text-km-label font-semibold uppercase tracking-[0.12em] text-km-side-muted">
                {fiche.segment}
              </span>
            ) : null}
          </div>

          {/* ══════════ LE NOM, ET RIEN QUI LE CONCURRENCE ══════════

              William, 22/09/2026 : « le nom du contact doit être écrit en beaucoup plus gros. En
              dessous on doit y retrouver sa fonction ainsi que le nom de la société. »

              44 PX CONTRE 16 AVANT. Le sprint ne se lit pas comme une fiche : on le regarde à un
              mètre, le combiné déjà en main, et on doit savoir en une fraction de seconde à qui
              l'on s'apprête de parler. `km-title` faisait la même taille que le reste de la page —
              donc rien ne dominait, et l'œil devait chercher.

              GRAS ET NON MEDIUM : sur fond sombre, une graisse moyenne s'amincit optiquement — le
              fond « mange » les jambages clairs. Ce qui passe sur blanc ne passe pas ici. */}
          <div>
            {/* LE NOM SE CORRIGE ICI, et c'est le champ le plus souvent faux : 4 490 pistes
                viennent d'imports qui n'ont jamais séparé le prénom du nom. Au téléphone, la
                personne se présente — c'est le seul instant où l'on sait vraiment comment elle
                s'appelle. On écrit dans `nom`, qui est le champ que la frise lit en dernier
                recours ; le prénom garde sa place quand il existe. */}
            <h2 className="text-km-sprint-xl font-bold leading-none tracking-tight text-balance text-km-side-text">
              <ChampSprint
                valeur={fiche.nom_complet}
                ariaLabel="le nom du contact"
                placeholder="Sans nom"
                className="text-km-sprint-xl font-bold leading-none tracking-tight"
                onCommit={corriger('nom_complet')}
              />
            </h2>
            {/* 44 PUIS 20, ET NON 44 PUIS 30. Au premier essai le sous-titre était à 30 px : il
                pesait presque autant que le nom, les deux se disputaient l'œil, et « beaucoup plus
                gros » n'était plus vrai. L'écart doit être franc pour qu'il n'y ait rien à
                arbitrer en regardant. */}
            <p className="mt-2.5 flex flex-wrap items-baseline text-km-sprint-val font-medium text-km-side-muted">
              <ChampSprint
                valeur={fiche.fonction}
                ariaLabel="la fonction"
                placeholder="Fonction inconnue"
                className="text-km-sprint-val font-medium"
                onCommit={corriger('fonction')}
              />
              <span className="mx-2 text-km-side-line" aria-hidden="true">/</span>
              {/* LA SOCIÉTÉ NE SE CORRIGE QUE SUR UNE PISTE. Sur une opportunité, ce nom est celui
                  du COMPTE : le changer d'ici le renommerait pour toute l'entreprise, depuis un
                  écran d'appel. Il reste donc en lecture, et la fiche du compte est à un clic. */}
              {estPiste ? (
                <ChampSprint
                  valeur={fiche.compte_nom}
                  ariaLabel="la société"
                  placeholder="Société inconnue"
                  className="text-km-sprint-val font-semibold"
                  classeLecture="text-km-side-text"
                  onCommit={corriger('societe')}
                />
              ) : (
                <b className="font-semibold text-km-side-text">{fiche.compte_nom ?? 'Société inconnue'}</b>
              )}
            </p>
          </div>

          {/* ══════════ LA NOTE PERMANENTE, PLEINE LARGEUR AU-DESSUS DES CARTES ══════════

              William, 22/09/2026, après l'avoir essayée en colonne : « mauvaise idée de ma part,
              en fait tu mets la card en full largeur comme avant ».

              IL A RAISON, ET LA RAISON EST DANS LE CONTENU : une note est une PHRASE, pas une
              donnée. Sur un tiers de largeur elle tombait à quatre mots par ligne et il fallait
              faire défiler pour lire deux phrases ; sur toute la largeur elle se lit d'un trait.
              Les trois cartes en dessous portent des valeurs courtes — un numéro, une adresse, un
              libellé — et supportent d'être étroites. Pas elle.

              ELLE GARDE LE DESSIN DE LA CARTE « TÂCHE » — même rayon, même fond, même en-tête,
              même filet vert de 3 px — pour rester de la même famille que la rangée qu'elle coiffe.

              ELLE RESTE HORS DE LA ZONE QUE L'ÉDITEUR RECOUVRE : quand on écrit un mail, ce qu'elle
              dit est précisément ce qu'on a besoin d'avoir sous les yeux.

              À NE PAS CONFONDRE AVEC LES NOTES DU FIL : celle-ci est unique et toujours à jour, les
              autres sont datées et s'empilent. */}
          <div className="flex flex-col rounded-km-lg border border-l-[3px] border-km-side-line border-l-km-side-green bg-km-side-bas/60 p-4 xl:p-5">
            <div className="mb-2 flex items-center gap-2">
              <StickyNote className="h-3.5 w-3.5 shrink-0 text-km-side-green" aria-hidden="true" />
              <span className="truncate font-mono text-km-label font-semibold uppercase tracking-[0.16em] text-km-side-green">
                Note permanente
              </span>
            </div>
            {/* ══ ELLE REVIENT À LA LIGNE, ET DÉFILE SI ELLE DÉBORDE ══

                William, 22/09/2026 : « le contenu doit revenir à la ligne pour s'afficher
                entièrement, scroll interne si trop long ».

                Une note tronquée est pire qu'une note absente : on croit l'avoir lue. La hauteur est
                donc bornée à cinq lignes et c'est le CONTENU qui défile à l'intérieur, pas la carte
                qui s'allonge — sinon une note de dix lignes repousserait les trois cartes hors de
                l'écran. */}
            <div className="max-h-[7rem] overflow-y-auto">
              <ChampSprint
                valeur={fiche.commentaire}
                ariaLabel="la note"
                placeholder="ajouter une note"
                multiligne
                className="whitespace-pre-wrap break-words text-km-lead font-medium leading-snug"
                onCommit={corriger('commentaire')}
              />
            </div>
          </div>

          {/* ══════════ APPELER ET CONTACTER — DEUX COMPOSANTS, DEUX GESTES ══════════

              William, 22/09/2026 : « deux composants bien précis, un composant "Appeler" avec le
              numéro de téléphone + mobile si existant et un composant "Contacter" avec le mail du
              contact ».

              CÔTE À CÔTE ET DE MÊME HAUTEUR : ce sont deux façons d'atteindre la même personne, et
              l'une ne passe pas avant l'autre — c'est le numéro disponible qui décide, pas une
              hiérarchie décidée d'avance. La grille les tient alignés même quand l'un porte deux
              numéros et l'autre une seule adresse.

              LES COORDONNÉES SONT EN TOUTES LETTRES, en chiffres tabulaires : c'est l'extension
              Chrome d'Allo qui détecte le numéro dans la page pour proposer l'appel. Caché dans
              une infobulle, elle n'a rien à voir et le conseiller conclut que ça ne marche pas
              (voir `telephonie.tsx`). */}
          {/* ══════════ LA ZONE QUE L'ÉDITEUR RECOUVRE ══════════

              William, 22/09/2026, deux demandes qui n'en font qu'une : « l'éditeur recouvre les
              cards Appeler, Contacter et Tâche », puis « quand je ferme, l'éditeur devrait se
              résorber dans la card ».

              MA PREMIÈRE VERSION DÉMONTAIT LES CARTES et posait l'éditeur à leur place. À
              l'ouverture le résultat était juste ; à la fermeture il ne l'était pas — l'éditeur se
              refermait sur un rectangle VIDE, et les cartes réapparaissaient d'un coup une fois
              l'animation finie. On ne voyait pas une résorption, on voyait une disparition suivie
              d'un surgissement.

              LES CARTES RESTENT DONC MONTÉES, et l'éditeur passe AU-DESSUS en recouvrement absolu.
              Il les masque entièrement une fois ouvert — donc la place gagnée est la même — mais
              pendant les 560 ms de la fermeture, la carte « Contacter » est déjà là, sous lui, à
              l'endroit exact où le cadre se referme. La carte n'apparaît pas : elle se découvre.

              LE NOM ET LA FONCTION RESTENT VISIBLES, eux : on écrit à quelqu'un, et son nom est ce
              qui évite le « Bonjour Monsieur » adressé à Madame. */}
          <div className="relative flex min-h-0 flex-1 flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <CarteSprint
              titre="Appeler"
              icone={Phone}
              /* PLUS DE CAS « VIDE » SUR CETTE CARTE : un écran qui dit « aucun numéro » et
                 n'offre pas de l'ajouter est exactement ce que William fait corriger. Le champ
                 s'affiche toujours, avec son invite. */
              texteVide="Aucun numéro sur cette fiche"
              action={
                /* ══ LE MÊME BOUTON DIT LES DEUX TEMPS DE L'APPEL ══
                   Tant que rien ne sonne, il compose. Dès qu'Allo signale la ligne, il devient
                   rouge et raccroche — au sens de Kimatch, voir la fenêtre plus bas. Deux boutons
                   distincts auraient laissé « Appeler » cliquable pendant la communication, ce qui
                   aurait relancé un second appel sur le même numéro. */
                appelOuvert ? (
                  <button
                    type="button"
                    onClick={raccrocher}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-km bg-km-side-red text-km-name font-bold text-[#2A0F0C] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-side-red focus-visible:ring-offset-2 focus-visible:ring-offset-km-side"
                  >
                    <PhoneOff className="h-4 w-4" aria-hidden="true" />
                    Raccrocher
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={numeros.length === 0}
                    onClick={() => lancerAppel()}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-km bg-km-side-green text-km-name font-bold text-[#0B241C] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-side-green focus-visible:ring-offset-2 focus-visible:ring-offset-km-side disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    Appeler
                  </button>
                )
              }
            >
              {/* ══ UN SEUL NUMÉRO À L'ÉCRAN, LE SECOND DANS UNE LISTE ══

                  William, 22/09/2026 : « affiche un numéro de tél, et s'il y en a 2, propose une
                  liste ». Empiler les deux coûtait une ligne de hauteur sur CHAQUE fiche, alors
                  qu'une fiche sur combien en porte deux ? Et surtout : on ne compose qu'un numéro.
                  Montrer les deux oblige à choisir avant même d'avoir décroché.

                  LE SÉLECTEUR N'APPARAÎT QUE S'IL Y A UN CHOIX. Un menu déroulant à une seule
                  entrée est un ornement qui promet une décision inexistante. */}
              {/* LE NUMÉRO SEUL SUR SA LIGNE, l'étiquette dessous. Vu à l'écran : côte à côte,
                  « 01 45 67 89 12 » en 20 px plus le sélecteur dépassaient les 306 px que fait
                  une carte sur trois, et le numéro se cassait en deux lignes — le seul contenu
                  de tout l'écran qui ne doit jamais se casser, puisqu'on le lit pour le composer
                  ou le vérifier pendant que ça sonne. */}
              {/* LE NUMÉRO AFFICHÉ EST CELUI QU'ON CORRIGE : si deux existent, c'est celui que le
                  sélecteur a retenu. On écrit dans la colonne qui le porte — fixe ou mobile — et
                  non dans la première venue, sinon corriger le mobile écraserait le fixe. */}
              <span className="block font-mono text-km-sprint-val font-semibold tabular-nums tracking-wide text-km-side-text">
                <ChampSprint
                  valeur={numeros[choixNumero]?.numero ?? ''}
                  ariaLabel={numeros[choixNumero]?.libelle === 'Mobile' ? 'le mobile' : 'le numéro fixe'}
                  placeholder="ajouter un numéro"
                  mono
                  className="font-mono text-km-sprint-val font-semibold tabular-nums tracking-wide"
                  onCommit={corriger(numeros[choixNumero]?.libelle === 'Mobile' ? 'telephone_mobile' : 'telephone')}
                />
              </span>
              {numeros.length > 1 ? (
                <select
                  aria-label="Choisir le numéro à composer"
                  value={choixNumero}
                  onChange={(e) => setChoixNumero(Number(e.target.value))}
                  className="mt-0.5 -ml-1 w-fit max-w-full cursor-pointer rounded-km-sm border border-transparent bg-transparent px-1 py-px font-mono text-km-micro uppercase tracking-[0.14em] text-km-side-muted hover:border-km-side-line hover:text-km-side-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-side-green"
                >
                  {numeros.map((n, i) => (
                    <option key={n.numero} value={i} className="bg-km-side text-km-side-text">
                      {n.libelle}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="mt-0.5 font-mono text-km-micro uppercase tracking-[0.14em] text-km-side-faint">
                  {numeros[0]?.libelle}
                </span>
              )}
            </CarteSprint>

            <CarteSprint
              id="carte-contacter"
              titre="Contacter"
              icone={Mail}
              texteVide="Aucune adresse e-mail"
              action={
                /* ══ IL OUVRE L'ÉDITEUR DE KIMATCH, PLUS LA MESSAGERIE DU SYSTÈME ══

                   William, 22/09/2026 : « quand j'appuie sur Contacter sous l'adresse mail, ça
                   ouvre l'app mail mais ça n'ouvre pas l'éditeur ».

                   C'était un `mailto:`, posé sur une erreur de ma part — j'avais écrit que le volet
                   s'ouvrirait derrière le sprint. Le vrai problème n'est pas là : un `mailto:` part
                   dans Apple Mail et Kimatch n'en sait JAMAIS rien. L'échange n'est consigné nulle
                   part, et au prochain appel on ignore qu'on a écrit.

                   L'éditeur prend maintenant la place de la fenêtre d'appel, comme demandé. */
                <button
                  type="button"
                  disabled={!fiche.email}
                  onClick={() => ouvrirEditeurMail()}
                  title={fiche.email ? 'Écrire depuis Kimatch' : 'Aucune adresse sur cette fiche'}
                  className={cn(
                    'inline-flex h-10 w-full items-center justify-center gap-2 rounded-km border text-km-name font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-side-green focus-visible:ring-offset-2 focus-visible:ring-offset-km-side',
                    fiche.email
                      ? 'border-km-side-green/60 text-km-side-green hover:bg-km-side-green/12'
                      : 'cursor-not-allowed border-km-side-line text-km-side-faint opacity-40',
                  )}
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Contacter
                </button>
              }
            >
              {/* `break-words` ET NON `break-all` : `break-all` coupait « cabinetmichau.fr » en
                  « cabinetmicha / u.fr », au milieu d'un mot. Une adresse se casse proprement sur
                  ses séparateurs. */}
              <span className="break-words text-km-lead font-medium text-km-side-text">
                <ChampSprint
                  valeur={fiche.email}
                  ariaLabel="l’adresse e-mail"
                  placeholder="ajouter une adresse"
                  className="text-km-lead font-medium"
                  onCommit={corriger('email')}
                />
              </span>
            </CarteSprint>

            {/* ══════════ LA TROISIÈME CARTE : CE QU'ON EST CENSÉ FAIRE ══════════

                William, 22/09/2026 : « tu peux mettre la tâche en mode card à droite de la card
                mail (il reste une place) ».

                ELLE OCCUPAIT UNE BANDE PLEINE LARGEUR sous les deux autres, pour trois lignes de
                texte — d'où la hauteur perdue qu'il a vue. À droite de « Contacter », elle
                complète la rangée au lieu de l'allonger, et les trois choses qu'on lit avant de
                décrocher tiennent sur une seule ligne du regard : par quel canal, et pourquoi.

                ELLE GARDE SON FILET DE COULEUR, à gauche comme avant : c'est ce qui la distingue
                des deux autres. Appeler et contacter sont des MOYENS ; celle-ci est la CONSIGNE.
                En retard, la carte entière vire à l'ambre.

                TROIS COLONNES SEULEMENT À PARTIR DE `xl`. En dessous, la tâche repasse sous les
                deux autres : à 1 024 px, trois cartes feraient 210 px chacune et le libellé s'y
                casserait en quatre lignes — on aurait regagné de la hauteur d'un côté pour en
                perdre de l'autre. */}
            {fiche.tache_titre ? (
              <div
                id="carte-tache"
                className={cn(
                  'flex flex-col rounded-km-lg border border-l-[3px] bg-km-side-bas/60 p-4 xl:p-5',
                  fiche.en_retard
                    ? 'border-km-amber/30 border-l-km-amber'
                    : 'border-km-side-line border-l-km-side-green',
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <CalendarClock
                    className={cn('h-3.5 w-3.5 shrink-0', fiche.en_retard ? 'text-km-amber' : 'text-km-side-green')}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'truncate font-mono text-km-label font-semibold uppercase tracking-[0.16em]',
                      fiche.en_retard ? 'text-km-amber' : 'text-km-side-green',
                    )}
                  >
                    {/* « Tâche du jour » et non « À faire aujourd'hui » : vu à l'écran, le
                        second repassait sur deux lignes dans une carte de 250 px et poussait le
                        libellé vers le bas. Les trois en-têtes doivent tenir sur une ligne, sinon
                        la rangée se désaligne. */}
                    Tâche du jour
                  </span>
                </div>
                <div className="flex min-h-[2.25rem] flex-1 flex-col justify-start">
                  <p className="text-km-lead font-semibold leading-snug text-km-side-text">
                    {fiche.tache_titre}
                  </p>
                </div>
                {/* LA HAUTEUR DE 40 PX EST CELLE DES BOUTONS des deux autres cartes : c'est ce
                    qui aligne les trois bas de carte sur la même ligne. Le texte est en 11 px et
                    serré pour tenir sur deux lignes dans cette hauteur — « 22/09/2026 à 09:30 —
                    en retard » ne rentre pas sur une seule dans une carte de 250 px. */}
                <p className="mt-2.5 flex h-10 items-center text-km-label font-medium leading-tight text-km-side-muted">
                  {/* `echeanceLisible` n'écrit l'heure que s'il y en a une : minuit local veut
                      dire « pas d'heure ». */}
                  <span className={cn(fiche.en_retard && 'text-km-amber')}>
                    {echeanceLisible(fiche.tache_echeance) || 'sans échéance'}
                    {fiche.en_retard ? ' — en retard' : ''}
                  </span>
                  {fiche.taches_ouvertes > 1 ? (
                    <span className="ml-1.5 text-km-side-faint">
                      · +{fiche.taches_ouvertes - 1}
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════════════
              L'APPEL EN DIRECT — CE QU'ON PEUT MONTRER, ET CE QU'ON NE PEUT PAS FAIRE
              ══════════════════════════════════════════════════════════════════════════════════

              William, 22/09/2026 : « à partir du moment où j'ai lancé l'appel, un chrono se lance,
              un statut "Live" indique que je suis en communication et surtout le bouton appeler est
              remplacé par un bouton "Raccrocher" rouge. […] dis-moi si c'est faisable ? »

              ══ CE QUI EST FAISABLE, ET QUI EST LÀ ══

              Tout l'affichage. `appels_en_cours` est rempli par le webhook d'Allo : il sait que la
              ligne sonne, qu'on a décroché, à quelle seconde, et quand ça s'arrête. Le chrono, le
              « Live » et la bascule du bouton sortent tous de cette table, relue toutes les quatre
              secondes.

              ══ CE QUI N'EST PAS FAISABLE, ET IL FAUT LE DIRE ══

              RACCROCHER LA LIGNE. Vérifié une nouvelle fois ce jour, en interrogeant l'API d'Allo
              avec notre propre clé : onze routes, toutes en lecture sur les conversations plus la
              gestion des webhooks. Aucune ne décroche, aucune ne raccroche, et la clé ne porte même
              pas de portée d'appel. S'y ajoutent les quatre portes déjà essayées et fermées, listées
              dans `FenetreAppel` — postMessage, REST, `allo://`, WebRTC.

              LE BOUTON ROUGE CLÔT DONC L'APPEL DANS KIMATCH, pas dans le téléphone : il horodate la
              fin, note qu'elle vient du commercial, ferme la fenêtre et enchaîne sur la
              qualification. La voix, elle, s'arrête quand on raccroche dans Allo. Le bouton le dit
              en toutes lettres plutôt que de promettre ce qu'il ne fait pas.

              ══ POURQUOI ELLE OCCUPE LA PLACE LIBRE ══

              Elle ne pousse rien : elle vit dans le vide sous les trois cartes, celui que William a
              vu. Elle se déplie en `grid-template-rows` de 0 à 1 — donc sans hauteur codée en dur,
              puisqu'on ne connaît pas d'avance celle d'une fenêtre dont l'état change. */}
          {/* ══════════ LA FENÊTRE D'APPEL PREND TOUTE LA PLACE ══════════

              William, 22/09/2026, une fois l'appel enfin lancé depuis Allô : « la fenêtre doit
              prendre tout l'espace disponible ! »

              `flex-1` PLUTÔT QU'UNE HAUTEUR : on ne connaît pas la place restante — elle dépend du
              nombre de pastilles, de la longueur du nom, de la présence d'une tâche. La fenêtre
              prend ce qui reste entre les cartes et les gestes du pied, quelle que soit la fiche.

              ET ELLE CHANGE DE NATURE EN GRANDISSANT. Dans un bandeau de 90 px, le chrono était un
              chiffre de plus ; dans la moitié de l'écran, il devient ce qu'on regarde pendant qu'on
              parle. Il passe donc au centre et à 44 px, avec l'état au-dessus et le geste en
              dessous — c'est la mise en page d'un écran d'appel, pas d'une notification.

              L'ANIMATION TIENT TOUJOURS : `grid-template-rows` de 0fr à 1fr fait pousser le
              contenu à l'intérieur de la hauteur que le flex vient de lui donner. Une hauteur
              codée en dur aurait saccadé la fin du mouvement — et elle aurait été fausse dès la
              fiche suivante. */}
          {/* ══ UN SEUL EMPLACEMENT, TROIS CONTENUS POSSIBLES ══
              Le geste choisi passe devant tout : « l'éditeur doit s'ouvrir à la place du composant
              d'appel » (William, 22/09/2026). Sinon, la fenêtre d'appel s'il y en a un. Sinon,
              rien — et le pied remonte. Un seul `flex-1` pour les trois, donc aucune secousse de
              mise en page quand on passe de l'un à l'autre. */}
          {appelOuvert && !geste ? (
            <div className="animate-km-appel-ouvre grid min-h-[13rem] flex-1">
              <div className="min-h-0 overflow-hidden">
                <div
                  className={cn(
                    'flex h-full flex-col rounded-km-lg border p-4 xl:p-6',
                    enCommunication
                      ? 'border-km-side-red/40 bg-km-side-red/10'
                      : 'border-km-side-green/40 bg-km-side-green/8',
                  )}
                >
                  {/* ── QUI, ET DANS QUEL ÉTAT ── */}
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        enCommunication ? 'animate-km-live bg-km-side-red' : 'animate-km-soft-pulse bg-km-side-green',
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block font-mono text-km-label font-semibold uppercase tracking-[0.16em]',
                          enCommunication ? 'text-km-side-red' : 'text-km-side-green',
                        )}
                      >
                        {enCommunication
                          ? 'Live — en communication'
                          : etatAppel === 'sonne'
                            ? 'La ligne sonne'
                            : 'Appel lancé — Allô prend la main'}
                      </span>
                      <span className="mt-1 block truncate text-km-lead font-medium text-km-side-text">
                        {fiche.nom_complet ?? 'Sans nom'}
                        <span className="ml-2 font-mono text-km-body text-km-side-muted">
                          {appelDeLaFiche?.numero ?? appelLance?.numero}
                        </span>
                      </span>
                    </span>
                    {/* LE CHRONO SE RANGE ICI dès que la qualification occupe le centre. */}
                    {appelDeLaFiche && (appelDeLaFiche.decroche_le || appelDeLaFiche.termine_le) ? (
                      <span
                        className={cn(
                          'ml-auto shrink-0 font-mono text-km-sprint font-bold tabular-nums',
                          enCommunication ? 'text-km-side-red' : 'text-km-side-muted',
                        )}
                      >
                        {secondesAppel != null ? dureeLisible(secondesAppel) : '—'}
                      </span>
                    ) : null}
                  </div>

                  {/* ══ LE CHRONO CÈDE LA PLACE À LA QUALIFICATION ══

                      Tant que ça sonne, il n'y a rien à saisir : le chrono occupe tout, en grand,
                      parce que c'est la seule chose à regarder. Dès qu'Allô signale le décroché, les
                      questions arrivent et le chrono se range en haut à droite — il continue de
                      tourner, mais il n'est plus le sujet.

                      C'est le même espace qui sert aux deux, et c'est voulu : ajouter une zone
                      aurait fait défiler la fenêtre au moment où l'on a besoin de tout voir. */}
                  {appelDeLaFiche && (appelDeLaFiche.decroche_le || appelDeLaFiche.termine_le) ? (
                    <div className="mt-4 flex min-h-0 flex-1 flex-col">
                      {(
                        <QualifierAppel
                          appel={appelDeLaFiche}
                          nomContact={fiche.nom_complet ?? ''}
                          estPiste={estPiste}
                          onPatch={(patch) => qualifier.mutate({ id: appelDeLaFiche.id, ...patch })}
                          gestes={{
                            aEmail: Boolean(fiche.email),
                            onEcrire: ouvrirEditeurMail,
                            onRelancer: () => setGeste('relance'),
                            onDisqualifier: () => setGeste('disqualifier'),
                            onConvertir: () => setGeste('convertir'),
                            onEcheance: () => setGeste('echeance'),
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-4">
                      <span
                        className={cn(
                          'font-mono text-km-sprint-xl font-bold tabular-nums leading-none',
                          enCommunication ? 'text-km-side-red' : 'text-km-side-text',
                        )}
                      >
                        {secondesAppel != null ? dureeLisible(secondesAppel) : '—'}
                      </span>
                      <span className="mt-2.5 font-mono text-km-label font-semibold uppercase tracking-[0.16em] text-km-side-faint">
                        {enCommunication ? 'depuis le décroché' : 'depuis le lancement'}
                      </span>
                    </div>
                  )}

                  {/* ── LE GESTE, AU PIED DE LA FENÊTRE ── */}
                  <div className="flex flex-wrap items-center gap-4 border-t border-km-side-line/60 pt-4">
                    <button
                      type="button"
                      onClick={raccrocher}
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-km bg-km-side-red px-6 text-km-name font-bold text-[#2A0F0C] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-side-red focus-visible:ring-offset-2 focus-visible:ring-offset-km-side"
                    >
                      <PhoneOff className="h-4 w-4" aria-hidden="true" />
                      Raccrocher
                    </button>
                    <p className="min-w-0 flex-1 text-km-label leading-snug text-km-side-muted">
                      <b className="font-semibold text-km-side-text">Ouvre Allô</b> pour que vous
                      raccrochiez, et clôt l’appel ici en ouvrant la qualification. Leur API n’expose
                      aucun contrôle d’appel : la ligne se coupe dans leur application, pas ailleurs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ══════════ L'ÉDITEUR, EN RECOUVREMENT ══════════

              `absolute inset-0` sur la zone qui contient les cartes ET le panneau : l'éditeur les
              couvre toutes, donc il dispose de la même hauteur que s'il les avait remplacées — mais
              elles restent là, dessous, pendant qu'il s'ouvre et qu'il se referme.

              LE FOND EST OPAQUE, et c'est indispensable : le cadre d'une carte est semi-transparent,
              et laisser transparaître les trois cartes sous le texte d'un mail le rendrait
              illisible. `bg-km-side` est la couleur exacte de la page — au premier pixel du
              mouvement, ce qu'on voit est donc bien la carte, pas un calque posé dessus. */}
          {geste ? (
            <div className="absolute inset-0 z-10 bg-km-side">
              <MorphDepuis
                origine={origineMorph}
                ferme={mailSort}
                onFerme={() => { setMailSort(false); setGeste(null) }}
              >
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-km-lg border border-km-side-line bg-km-side-bas/60 p-4">
                  {geste !== 'mail' ? (
                    <PanneauApresAppel
                      geste={geste}
                      nom={fiche.nom_complet ?? ''}
                      motifsDisqualification={MOTIFS_DISQUALIFICATION}
                      onFermer={() => setMailSort(true)}
                      onRelancer={(titre, instant) => { void creerRelance(titre, instant); setMailSort(true) }}
                      onDisqualifier={(motif) => { void disqualifierPiste(motif); setGeste(null) }}
                      onConvertir={() => {
                        /* NOUVEL ONGLET : le sprint est une séance, on n'en sort pas au milieu. La
                           fiche ne quitte pas le plan du jour — elle en sortira d'elle-même une
                           fois convertie, la piste n'étant alors plus ouverte. */
                        window.open(`/pistes/${fiche.cible_id}`, '_blank', 'noopener')
                        setMailSort(true)
                      }}
                      onEcheance={(jour) => { void poserEcheance(jour); setMailSort(true) }}
                      qualificationsFin={QUALIFICATIONS_FIN}
                      statutPiste={detail?.statut_code ?? null}
                      onClore={(qualification, motif) => { void cloreOpportunite(qualification, motif) }}
                    />
                  ) : (
                  <EditeurMailSprint
                    nom={fiche.nom_complet ?? ''}
                    email={fiche.email}
                    contexte={{
                      contactId: fiche.contact_id ?? undefined,
                      pisteId: estPiste ? fiche.cible_id : undefined,
                      compteId: fiche.compte_id ?? undefined,
                    }}
                    modele={modeleMail}
                    onFermer={() => setMailSort(true)}
                    onEnvoye={(m) => {
                      setMailSort(true)
                      setMessageSprint(m)
                      window.setTimeout(() => setMessageSprint(null), 6000)
                      void apresEnvoiMail()
                    }}
                  />
                  )}
                </div>
              </MorphDepuis>
            </div>
          ) : null}
          </div>

          {/* ══════════ LES TROIS COMMANDES ══════════

              William, 22/09/2026 : « supprime tous les boutons et remplace-les par : Appeler (si
              2 numéros, me demande quel numéro je souhaite contacter), Passer (passe à la prochaine
              cible mais ne disparaît pas du sprint), Action rapide ».

              CINQ BOUTONS DE MÊME POIDS NE DISENT PAS QUOI FAIRE. « Appel terminé », « Pas
              joignable », « Reporter », « Écarter », « Passer » : tous des états d'après-appel,
              alignés sur une ligne, et aucun ne disait ce qu'il fallait faire MAINTENANT. Trois
              commandes, une seule verte : on appelle, sinon on passe, et le reste est dans un menu.

              UN FILET ET UNE MARGE FRANCHE : au-dessus on lit, en dessous on agit. */}
          <div className="mt-auto flex flex-wrap items-center gap-2.5 border-t border-km-side-line pt-5 xl:pt-8">
            <BoutonAppeler
              numeros={numeros}
              enLigne={enCommunication || appelLance != null}
              onAppeler={(i: number) => { setChoixNumero(i); lancerAppel(i) }}
              onRaccrocher={raccrocher}
            />

            {/* PASSER NE SORT PAS LA FICHE DU PLAN. William : « passe à la prochaine cible mais ne
                disparaît pas du sprint ». À la dernière fiche, on revient donc à la première plutôt
                que de fermer la séance — une fiche passée doit pouvoir se reprendre à la fin. */}
            <button
              onClick={passer}
              className="inline-flex h-11 items-center gap-2 rounded-km border border-km-side-line px-5 text-km-name font-semibold text-km-side-text transition-colors hover:border-km-side-muted hover:bg-km-side-bas"
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              Passer
            </button>

            {/* ══ LE VERROU DU PROCESSUS, EN TOUTES LETTRES ══

                Une fois la tâche du jour terminée, plus rien ne ramène cette fiche dans le plan.
                Passer maintenant la ferait disparaître sans bruit — et un enregistrement qui
                disparaît ne réclame rien à personne. Le bandeau ne bloque pas le geste : il dit ce
                qui va se passer. Interdire aurait enfermé le commercial les jours où la bonne
                réponse est « on verra ». */}
            {suiteAPrevoir ? (
              <p className="order-last w-full text-km-label leading-snug text-km-amber">
                Tâche du jour terminée. <b className="font-semibold">Sans nouvelle tâche ni fin de
                parcours</b>, cette fiche sort du plan du jour et n’y reviendra pas.
              </p>
            ) : null}

            <MenuActionRapide
              id="menu-action-rapide"
              estPiste={estPiste}
              onAction={(a: ActionRapide) => {
                if (a === 'factures') { void ouvrirDemandeDeFactures(); return }
                if (a === 'mandat') { ouvrirEditeurMail(MODELE_MANDAT); return }
                /* LA TÂCHE NAÎT DE SA CARTE quand il y en a une — c'est celle-là même qu'on est en
                   train de terminer, et la voir se dérouler en panneau le dit sans un mot. */
                if (a === 'tache') { ouvrirGeste('relance', fiche.tache_titre ? 'carte-tache' : 'menu-action-rapide'); return }
                if (a === 'convertir') { ouvrirGeste('convertir', 'menu-action-rapide'); return }
                if (a === 'disqualifier') { ouvrirGeste('disqualifier', 'menu-action-rapide'); return }
                if (a === 'clore') { ouvrirGeste('clore', 'menu-action-rapide') }
              }}
            />
          </div>
        </div>

        {/* ══ DROITE · LE DÉTAIL DE LA FICHE, PUIS CLORE ══

            William, 22/09/2026 : « je veux qu'il affiche des détails de la fiche ouverte, une
            articulation en 3 onglets ». Les onglets occupent donc TOUTE la hauteur du volet — la
            marge du haut est réduite, la barre d'onglets se voulant elle-même l'en-tête. */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-t border-km-side-line bg-km-side-bas px-4 pb-7 pt-4 sm:px-6 lg:border-l lg:border-t-0">

              {/* ══ LES TROIS ONGLETS, ET RIEN AU-DESSUS ══

                  William, 22/09/2026 : « tout le bloc en haut "Ce qu'il faut savoir avant de
                  parler" doit disparaître ».

                  IL FAISAIT DOUBLON avec les onglets qu'on venait d'écrire : le périmètre et
                  l'échéance sont dans l'onglet Périmètre, le dernier échange en tête du fil. Cinq
                  lignes qui répétaient le volet entier lui prenaient sa hauteur. */}
              {/* `overflow-x-hidden` EN CEINTURE : dès qu'un axe défile, CSS rend l'autre
                  défilant aussi. Les causes du débordement sont corrigées une à une dans
                  `OngletsFiche`, mais un résumé collé depuis un mail apportera toujours une URL de
                  deux cents caractères — le volet ne doit jamais partir de côté pour autant. */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
                <OngletsFiche ligne={fiche} fiche={detail ?? undefined} />
              </div>

        </aside>
      </div>
    </div>
  )
}

/**
 * LA CARTE D'UN MOYEN DE JOINDRE — « Appeler » et « Contacter » en partagent le dessin.
 *
 * `flex flex-col` avec un corps en `flex-1` : c'est ce qui aligne les deux boutons sur la même
 * ligne quand l'une des cartes porte deux numéros et l'autre une seule adresse. Sans cela, le
 * bouton de la carte la plus courte remonterait, et la paire se lirait comme deux blocs sans
 * rapport.
 *
 * LE CAS VIDE GARDE LA CARTE, avec sa bordure en pointillés : une carte qui disparaît fait sauter
 * la grille d'une fiche à l'autre, et le sprint les enchaîne. On doit pouvoir poser l'œil au même
 * endroit à chaque passage.
 */
function CarteSprint({
  id, titre, icone: Icone, vide, texteVide, children, action,
}: {
  /** Sert au morphing : c'est par lui que l'éditeur retrouve le rectangle d'où il doit naître. */
  id?: string
  titre: string
  icone: typeof Phone
  vide?: boolean
  texteVide: string
  /** Le corps : les coordonnées. Remplacé par `texteVide` quand il n'y en a aucune. */
  children: React.ReactNode
  /** Le geste, toujours rendu — désactivé plutôt qu'absent, pour que la paire garde sa hauteur. */
  action: React.ReactNode
}) {
  return (
    <div
      id={id}
      className={cn(
        'flex flex-col rounded-km-lg border bg-km-side-bas/60 p-4 xl:p-5',
        vide ? 'border-dashed border-km-side-line' : 'border-km-side-line',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icone className="h-3.5 w-3.5 shrink-0 text-km-side-faint" aria-hidden="true" />
        <span className="truncate font-mono text-km-label font-semibold uppercase tracking-[0.16em] text-km-side-faint">
          {titre}
        </span>
      </div>
      <div className="flex min-h-[2.25rem] flex-1 flex-col justify-start">
        {vide ? <p className="text-km-body text-km-side-faint">{texteVide}</p> : children}
      </div>
      <div className="mt-2.5">{action}</div>
    </div>
  )
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * APPELER — ET, S'IL Y A DEUX NUMÉROS, DEMANDER LEQUEL
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « Appeler (si 2 numéros, me demande quel numéro je souhaite contacter) ».
 *
 * ══ UN SEUL NUMÉRO NE POSE AUCUNE QUESTION ══
 *
 * C'est le cas de la grande majorité des fiches. Faire choisir entre une seule option est une
 * question qui n'en est pas une, et elle coûte un clic à chaque appel de la journée.
 *
 * ══ LE MÊME BOUTON RACCROCHE ══
 *
 * Tant que rien ne sonne, il compose. Dès que la ligne est ouverte, il devient rouge — au sens de
 * Kimatch : Allô n'expose aucun contrôle d'appel, on rouvre donc leur application pour que le
 * commercial y raccroche, et on clôt de notre côté. Deux boutons distincts auraient laissé
 * « Appeler » cliquable pendant la communication, donc permis de relancer un second appel sur le
 * même numéro.
 */
function BoutonAppeler({
  numeros, enLigne, onAppeler, onRaccrocher,
}: {
  numeros: { numero: string; libelle: string }[]
  enLigne: boolean
  onAppeler: (indice: number) => void
  onRaccrocher: () => void
}) {
  const [choix, setChoix] = useState(false)

  if (enLigne) {
    return (
      <button
        onClick={onRaccrocher}
        className="inline-flex h-11 items-center gap-2 rounded-km bg-km-side-red px-6 text-km-name font-bold text-[#2A0F0C] transition-[filter] hover:brightness-110"
      >
        <PhoneOff className="h-4 w-4" aria-hidden="true" />
        Raccrocher
      </button>
    )
  }

  const aucun = numeros.length === 0
  return (
    <div className="relative">
      <button
        disabled={aucun}
        onClick={() => (numeros.length > 1 ? setChoix((c) => !c) : onAppeler(0))}
        aria-expanded={numeros.length > 1 ? choix : undefined}
        title={aucun ? 'Aucun numéro sur cette fiche' : undefined}
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-km px-6 text-km-name font-bold transition-[filter]',
          aucun
            ? 'cursor-not-allowed bg-km-side-line text-km-side-faint'
            : 'bg-km-side-green text-[#0B241C] hover:brightness-110',
        )}
      >
        <Phone className="h-4 w-4" aria-hidden="true" />
        Appeler
        {numeros.length > 1 ? <ChevronUp className={cn('h-3.5 w-3.5 transition-transform', !choix && 'rotate-180')} aria-hidden="true" /> : null}
      </button>

      {/* LE CHOIX S'OUVRE VERS LE HAUT : le bouton est au pied de la colonne, un menu vers le bas
          sortirait de l'écran. */}
      {choix && numeros.length > 1 ? (
        <>
        <div className="fixed inset-0 z-10" onClick={() => setChoix(false)} aria-hidden="true" />
        <div className="absolute bottom-full left-0 z-20 mb-2 w-max min-w-full overflow-hidden rounded-km border border-km-side-line bg-km-side-bas shadow-xl">
          {numeros.map((n, i) => (
            <button
              key={n.numero}
              onClick={() => { setChoix(false); onAppeler(i) }}
              className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors hover:bg-km-side-green/12"
            >
              <span className="font-mono text-km-name font-semibold tabular-nums text-km-side-text">{n.numero}</span>
              <span className="text-km-label text-km-side-muted">{n.libelle}</span>
            </button>
          ))}
        </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES ACTIONS RAPIDES — ET ELLES NE SONT PAS LES MÊMES SELON LA NATURE DE LA FICHE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 :
 *   PISTE        Demander les factures · Convertir · Disqualifier · Nouvelle tâche
 *   OPPORTUNITÉ  Demander les factures · Envoyer un mandat · Clore l'opportunité · Nouvelle tâche
 *
 * LA DIFFÉRENCE EST CELLE DU MÉTIER, pas une commodité d'écran. Sur une piste, le but est d'obtenir
 * une facture pour créer un périmètre et convertir ; sur une opportunité, le périmètre existe et le
 * but devient le mandat, puis l'appel d'offres. Proposer « Convertir » sur une opportunité n'aurait
 * aucun sens, et « Envoyer un mandat » sur une piste en aurait encore moins — on ne mandate pas
 * quelqu'un dont on ne connaît pas le parc.
 */
type ActionRapide = 'factures' | 'mandat' | 'tache' | 'convertir' | 'disqualifier' | 'clore'

const ACTIONS_PISTE: { cle: ActionRapide; libelle: string; danger?: boolean }[] = [
  { cle: 'factures', libelle: 'Demander les factures' },
  { cle: 'convertir', libelle: 'Convertir' },
  { cle: 'disqualifier', libelle: 'Disqualifier', danger: true },
  { cle: 'tache', libelle: 'Nouvelle tâche' },
]

const ACTIONS_OPPORTUNITE: { cle: ActionRapide; libelle: string; danger?: boolean }[] = [
  { cle: 'factures', libelle: 'Demander les factures' },
  { cle: 'mandat', libelle: 'Envoyer un mandat' },
  { cle: 'clore', libelle: 'Clore l’opportunité', danger: true },
  { cle: 'tache', libelle: 'Nouvelle tâche' },
]

function MenuActionRapide({ id, estPiste, onAction }: { id: string; estPiste: boolean; onAction: (a: ActionRapide) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const actions = estPiste ? ACTIONS_PISTE : ACTIONS_OPPORTUNITE

  return (
    <div className="relative" id={id}>
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="inline-flex h-11 items-center gap-2 rounded-km border border-km-side-line px-5 text-km-name font-semibold text-km-side-text transition-colors hover:border-km-side-muted hover:bg-km-side-bas"
      >
        <Zap className="h-4 w-4" aria-hidden="true" />
        Action rapide
        <ChevronUp className={cn('h-3.5 w-3.5 transition-transform', !ouvert && 'rotate-180')} aria-hidden="true" />
      </button>

      {ouvert ? (
        <>
          {/* UN VOILE TRANSPARENT FERME LE MENU AU PREMIER CLIC AILLEURS. Sans lui, il faut viser
              le bouton à nouveau — et on ne vise pas bien en tenant un combiné. */}
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} aria-hidden="true" />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-max min-w-full overflow-hidden rounded-km border border-km-side-line bg-km-side-bas shadow-xl">
            {actions.map((a) => (
              <button
                key={a.cle}
                onClick={() => { setOuvert(false); onAction(a.cle) }}
                className={cn(
                  'block w-full px-4 py-2.5 text-left text-km-name font-semibold transition-colors',
                  a.danger
                    ? 'text-km-side-red hover:bg-km-side-red/12'
                    : 'text-km-side-text hover:bg-km-side-green/12',
                )}
              >
                {a.libelle}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

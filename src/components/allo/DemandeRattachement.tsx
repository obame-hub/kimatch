/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * À LA FIN D'UN APPEL, ON DEMANDE À QUOI IL SE RAPPORTAIT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 23/09/2026 : « je ne veux pas que le bouton jaune en bas soit permanent. Je veux que ce
 * soit une modale au milieu de l'écran qui s'affiche pile à la fin de l'appel. Si la personne
 * quitte et ne rattache pas, on l'ajoute à la liste de rattachement. »
 *
 * ══ CE QUI REMPLACE QUOI ══
 *
 * Première version, écrite ce matin : un bouton posé en bas à droite, visible tant qu'un appel
 * récent n'était pas rattaché. Deux défauts qu'elle a vus avant moi — il occupait l'écran en
 * permanence pendant une prospection, et il fallait penser à le cliquer. Une question qu'on doit
 * penser à se poser ne se pose jamais.
 *
 * ══ QUAND EXACTEMENT — ET POURQUOI PAS « À LA FIN DE L'APPEL » ══
 *
 * On surveille l'APPARITION DE L'INTERACTION, pas la fin de l'appel.
 *
 * La première version guettait le passage de « en cours » à « terminé » sur `appels_en_cours`. Ce
 * signal N'ARRIVE PAS TOUJOURS : relevé le 23/09, dix-sept appels de la semaine sont restés « en
 * cours » pour toujours — douze de plus d'une heure, un depuis le 16 septembre. Allo n'envoie pas
 * `call.completed` à tous les coups, et un déclencheur suspendu à un événement qui n'arrive pas ne
 * peut pas marcher.
 *
 * L'interaction, elle, est écrite dans tous les cas, et c'est précisément l'objet qu'on veut
 * rattacher. Si elle est là, l'appel est fini — quoi qu'en dise `appels_en_cours`.
 *
 * UNE SEULE FOIS PAR APPEL, et c'est un `useRef` : sans lui, la modale se rouvrirait à chaque
 * sondage tant que l'appel reste le dernier non rattaché — donc toutes les dix secondes, y compris
 * après qu'on l'a fermée.
 *
 * ══ SI ON FERME SANS RIEN CHOISIR ══
 *
 * L'appel reste non rattaché, donc il paraît dans « Appels à rattacher » sur la vue d'ensemble.
 * C'est exactement la consigne, et c'est ce qui permet de fermer sans culpabilité : rien n'est
 * perdu, tout se reprend au calme.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMonProfil, emailAllo } from '@/lib/data/roles'
import { useAppelEnCours } from '@/lib/data/appelEnCours'
import { ecouterAppelsOuverts } from '@/lib/telephonie'
import { LierAppel } from '@/components/allo/LierAppel'
import { relancer } from '@/lib/data/erreurLecture'

interface DernierAppel {
  id: string
  contact_id: string | null
  compte_id: string | null
  nom: string | null
  /** Quand l'appel a eu lieu. Sert à savoir s'il PRÉCÈDE l'appel encore ouvert — voir le garde. */
  date: string
}

/**
 * Le dernier appel terminé qui n'est rattaché à rien.
 *
 * ON LIT `interactions` ET NON `appels_en_cours` : ce sont les interactions qui portent les quatre
 * liens, et c'est là que le rattachement s'écrit. La table des appels ne sert qu'à suivre l'appel
 * pendant qu'il se passe.
 */
async function fetchDernierNonLie(adresseAllo: string | null): Promise<DernierAppel | null> {
  if (!adresseAllo) return null
  try {
    /* ══ ON CHERCHE PAR L'ADRESSE ALLO, PAS PAR LE PROFIL KIMATCH ══
     *
     * Naoëlle : « la modale n'est toujours pas apparue », alors que ses quatre appels étaient bien
     * en base. Ils portaient `auteur_profil_id` = WILLIAM, parce qu'elle opère son compte Allo :
     * sept membres chez Allo, dix profils actifs dans Kimatch. Filtrer sur son profil ne trouvait
     * donc rien, et la modale ne s'ouvrait jamais sans que rien ne le signale.
     *
     * `useAppelEnCours` avait déjà résolu exactement ce problème le 08/09 — sa carte se cale sur le
     * compte Allo et non sur le profil. Deux écrans qui répondent à « quel est mon dernier appel »
     * et qui n'avaient pas la même définition de « mon ». */
    const { data: p } = await supabase
      .from('profils')
      .select('id')
      .ilike('email', adresseAllo)
      .maybeSingle()
    const profilId = (p as { id: string } | null)?.id
    if (!profilId) return null

    const { data, error } = await supabase
      .from('interactions')
      .select(`
        id, contact_id, compte_id, date_interaction,
        type:types_interactions!inner(code),
        contact:contacts(prenom, nom),
        compte:comptes(nom)
      `)
      .eq('type.code', 'APPEL')
      .eq('auteur_profil_id', profilId)
      .is('opportunite_id', null)
      .is('recommandation_id', null)
      .is('requete_id', null)
      .is('piste_id', null)
      /* ══ UNE QUESTION DÉJÀ REFUSÉE NE SE REPOSE PAS ══
       *
       * Naoëlle, 23/09/2026, capture à l'appui : « quand je refresh j'ai la modale qui s'affiche en
       * permanence ». Le drapeau qui l'en empêchait était un `useRef` — il meurt au rechargement,
       * donc chaque F5 reposait la même question sur la même interaction. Et tant qu'aucun appel
       * plus récent n'arrivait, c'était toujours celle-là.
       *
       * Le refus est désormais retenu en base (migration 20260923174500) : il suit sur le mobile
       * comme sur le PC, et l'appel reste malgré tout dans « Appels à rattacher ». */
      .is('rattachement_ecarte_le', null)
      /* ══ CINQ MINUTES, ET NON DEUX HEURES — 23/09/2026 ══
       *
       * Naoëlle : « quand je refresh j'ai la modale qui s'affiche en permanence ».
       *
       * LA FENÊTRE ÉTAIT DE DEUX HEURES, et c'était le défaut. Mesuré ce jour : 254 appels non
       * rattachés sur son compte Allo, 10 rien qu'aujourd'hui, 14 939 pour l'équipe. À chaque
       * rechargement la modale y puisait le plus récent — elle en écartait un, le suivant
       * paraissait. Un arriéré servi un par un, indéfiniment.
       *
       * LA MODALE SE POSE UNE SEULE QUESTION : « tu viens de raccrocher, c'était à propos de quoi ? »
       * Elle n'est pas là pour rattraper l'arriéré — c'est le rôle de « Appels à rattacher » sur la
       * vue d'ensemble, un écran qu'on ouvre quand on a le temps, et qui les montre TOUS.
       *
       * CINQ MINUTES parce que le webhook écrit l'interaction dans la foulée du raccroché quand Allo
       * répond vite, et que Kimatch l'écrit désormais lui-même au clic (migration 20260923173000).
       * Au-delà, on n'a plus « à l'instant » en tête, et la question devient une corvée. */
      .gte('date_interaction', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      /* ON BORNE AUSSI PAR LE HAUT. Une interaction datée de 2028 existe en base — reprise
         Salesforce, ou saisie fautive : sans ce garde, elle serait toujours « le dernier appel »
         et l'on proposerait éternellement de rattacher le mauvais. Constaté le 23/09/2026. */
      .lte('date_interaction', new Date().toISOString())
      .order('date_interaction', { ascending: false })
      .limit(1)
    if (error) throw error

    const i = (data ?? [])[0] as unknown as {
      id: string; contact_id: string | null; compte_id: string | null; date_interaction: string
      contact: { prenom: string | null; nom: string | null } | null
      compte: { nom: string | null } | null
    } | undefined
    if (!i) return null

    return {
      id: i.id,
      contact_id: i.contact_id,
      compte_id: i.compte_id,
      date: i.date_interaction,
      nom: i.contact
        ? `${i.contact.prenom ?? ''} ${i.contact.nom ?? ''}`.trim() || i.compte?.nom || null
        : i.compte?.nom ?? null,
    }
  } catch (error) {
    relancer('fetchDernierNonLie', error)
  }
}

/**
 * UNE INTERACTION PRÉCISE, celle que le clic « Appeler » vient d'écrire.
 *
 * `fetchDernierNonLie` cherche « la dernière » ; ici on sait laquelle, parce que
 * `ouvrir_appel_kimatch` vient de nous rendre son identifiant. On ne cherche donc pas, on lit —
 * et la modale n'attend plus le sondage suivant.
 */
async function fetchInteraction(id: string): Promise<DernierAppel | null> {
  try {
    const { data, error } = await supabase
      .from('interactions')
      .select(`
        id, contact_id, compte_id, date_interaction,
        contact:contacts(prenom, nom),
        compte:comptes(nom)
      `)
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    const i = data as unknown as {
      id: string; contact_id: string | null; compte_id: string | null; date_interaction: string
      contact: { prenom: string | null; nom: string | null } | null
      compte: { nom: string | null } | null
    } | null
    if (!i) return null
    return {
      id: i.id,
      contact_id: i.contact_id,
      compte_id: i.compte_id,
      date: i.date_interaction,
      nom: i.contact
        ? `${i.contact.prenom ?? ''} ${i.contact.nom ?? ''}`.trim() || i.compte?.nom || null
        : i.compte?.nom ?? null,
    }
  } catch (error) {
    relancer('fetchInteraction', error)
  }
}

export function DemandeRattachement() {
  const { data: profil } = useMonProfil()
  const { data: appelEnCours } = useAppelEnCours()
  const [ouvert, setOuvert] = useState(false)
  const queryClient = useQueryClient()

  const adresseAllo = emailAllo(profil)

  /* ══ ON SURVEILLE L'ARRIVÉE DE L'INTERACTION, PAS LA FIN DE L'APPEL ══
   *
   * Naoëlle, 23/09/2026 : « la modale ne s'affiche toujours pas, fais les tests toi-même. »
   *
   * MA PREMIÈRE VERSION ATTENDAIT LE PASSAGE DE « EN COURS » À « TERMINÉ » sur `appels_en_cours`.
   * Ce signal N'ARRIVE PAS TOUJOURS : relevé ce jour, DIX-SEPT appels de la semaine sont restés
   * « en cours » pour toujours, dont douze vieux de plus d'une heure et un remontant au 16
   * septembre. Allo n'envoie pas `call.completed` à tous les coups.
   *
   * Un déclencheur suspendu à un événement qui n'arrive pas ne peut pas marcher — et pire, tant
   * qu'un appel fantôme occupe la ligne, il masque le suivant.
   *
   * ON SURVEILLE DONC CE QUI EXISTE VRAIMENT : l'apparition d'une interaction d'appel non
   * rattachée. C'est le webhook qui l'écrit, à `call.completed` comme au raccrochage — et c'est
   * précisément l'objet qu'on veut rattacher. Si elle est là, l'appel est fini, quoi qu'en dise
   * `appels_en_cours`.
   *
   * ON SONDE TOUTES LES DIX SECONDES, tout le temps : la requête est légère — une ligne au plus,
   * sur un index — et c'est le prix d'une modale qui paraît quand il le faut plutôt qu'après un
   * geste qu'on oublie de faire. */
  const { data: dernier } = useQuery({
    queryKey: ['dernier-appel-non-lie', adresseAllo],
    enabled: Boolean(adresseAllo),
    refetchInterval: 10000,
    staleTime: 5000,
    queryFn: () => fetchDernierNonLie(adresseAllo),
  })

  /* UNE SEULE FOIS PAR APPEL. `useRef` et non un état : ce drapeau ne doit pas provoquer de rendu,
     et il doit survivre à la fermeture — sinon la modale se rouvrirait au sondage suivant, toutes
     les dix secondes, sur l'appel qu'on vient justement d'écarter. */
  /* ══ LE CLIC ANNONCE L'APPEL : LA MODALE N'ATTEND PLUS LE SONDAGE ══
   *
   * Naoëlle, 23/09/2026 : « je veux que la modale apparaisse au moment de l'appel, pas 10 secondes
   * après ».
   *
   * Depuis que Kimatch écrit l'appel lui-même au clic, il connaît l'interaction à rattacher à la
   * milliseconde près. On l'ouvre donc tout de suite, sur l'identifiant qu'on vient de recevoir.
   *
   * LE SONDAGE RESTE, en dessous, et ce n'est pas une hésitation : un appel passé depuis le mobile,
   * ou composé directement dans Allo, n'a pas de clic ici. Il arrive par le webhook, et la modale
   * doit s'ouvrir pour lui aussi. Le sondage cesse d'être le chemin normal pour devenir le filet. */
  const [annoncee, setAnnoncee] = useState<string | null>(null)
  useEffect(() => ecouterAppelsOuverts(setAnnoncee), [])

  const { data: surAnnonce } = useQuery({
    queryKey: ['interaction-annoncee', annoncee],
    enabled: Boolean(annoncee),
    staleTime: Infinity,
    queryFn: () => fetchInteraction(annoncee as string),
  })

  const dejaDemande = useRef<string | null>(null)
  /* L'ANNONCE PASSE DEVANT LE SONDAGE : quand les deux désignent le même appel, c'est l'annonce qui
     arrive la première, et le sondage ne fera que confirmer ce qui est déjà à l'écran. */
  const propose = surAnnonce ?? dernier

  useEffect(() => {
    if (!propose) return
    if (dejaDemande.current === propose.id) return
    dejaDemande.current = propose.id
    setOuvert(true)
  }, [propose])

  /* ══ ON NE SE TAIT QUE TANT QU'ON A QUELQU'UN AU BOUT DU FIL — 23/09/2026 ══
   *
   * Naoëlle, après quatre tentatives : « c'est bon l'appel est bien dans le fil d'activité mais
   * aucune modale ne s'active ». Ce garde est la seule chose qui la retenait, et il a fallu le
   * corriger trois fois parce que chaque version butait sur un fait que la précédente ignorait.
   *
   * ══ CE QUI A ÉTÉ ESSAYÉ, ET POURQUOI CHAQUE VERSION A ÉCHOUÉ ══
   *
   * ① « UN APPEL OUVERT DEPUIS MOINS DE 15 MINUTES » — mesuré en base : 20 lignes sur 827 n'ont
   *   jamais reçu de `call.completed`, Allo ne l'envoie pas à tous les coups. Un fantôme naît
   *   toutes les quelques dizaines de minutes en prospection et il est FRAIS pendant son premier
   *   quart d'heure : la fenêtre où la modale avait le droit de paraître était donc refermée en
   *   permanence par le fantôme suivant.
   *
   * ② « ...ET VERS LE MÊME CORRESPONDANT » — éprouvé à l'écran, toujours rien. Le fantôme de 13:45
   *   portait exactement le même contact que l'interaction de 13:20 : c'était un rappel, et
   *   rappeler deux fois le même client est le geste ordinaire de la prospection.
   *
   * ③ « ...ET L'INTERACTION POSTÉRIEURE AU DÉBUT DE L'APPEL » — c'était juste TANT QUE
   *   l'interaction arrivait après l'appel, c'est-à-dire tant qu'on attendait Allo. Depuis que
   *   Kimatch écrit l'appel ET son interaction au clic (migration 20260923173000), les deux
   *   naissent À LA MÊME SECONDE : 17:58:14 pour les deux, mesuré. Le garde voyait donc un appel
   *   en cours, même contact, interaction postérieure ou égale — et se taisait pour toujours,
   *   puisque Allo ne referme jamais cette ligne. Mon propre correctif se mordait la queue.
   *
   * ══ LE SEUL CRITÈRE QUI RESTE VRAI : A-T-ON DÉCROCHÉ ? ══
   *
   * La question « à quoi se rapportait cet appel » n'est gênante que pendant la CONVERSATION — la
   * modale recouvrirait l'écran au moment où l'on prend des notes. Or une conversation, ça
   * commence au décroché, et `decroche_le` est rempli par `call.answered` d'Allo.
   *
   * TANT QUE LA LIGNE SONNE, ON N'EST PAS EN TRAIN DE PARLER : la modale peut paraître, et c'est
   * même le bon moment puisqu'on a le dossier sous les yeux. Un appel ouvert par Kimatch au clic
   * n'a par construction pas encore décroché — il ne bloque donc plus rien, ce qui est exactement
   * ce qu'on veut.
   *
   * ET LE FANTÔME NE PEUT PLUS TOUT BLOQUER : on exige le décroché ET la fraîcheur. Un appel
   * décroché il y a deux heures et jamais refermé est un fantôme, pas une conversation. */
  const enLigne = Boolean(
    appelEnCours
      && propose
      && !appelEnCours.termine_le
      /* LE DÉCROCHÉ, ET LUI SEUL. Sans lui, un appel qui sonne — ou qu'on vient de lancer d'un
         clic — ferait taire la modale alors que personne ne parle. */
      && appelEnCours.decroche_le
      && ((appelEnCours.contact_id && appelEnCours.contact_id === propose.contact_id)
        || (appelEnCours.compte_id && appelEnCours.compte_id === propose.compte_id))
      && Date.now() - new Date(appelEnCours.decroche_le).getTime() < 15 * 60 * 1000,
  )

  if (!ouvert || !propose || enLigne) return null

  return (
    <LierAppel
      interactionId={propose.id}
      compteId={propose.compte_id}
      contactId={propose.contact_id}
      nomCorrespondant={propose.nom}
      onFerme={() => {
        setOuvert(false)
        /* ON RETIENT LE REFUS, SINON IL NE SURVIT PAS AU RECHARGEMENT. Le `useRef` ci-dessus suffit
           pour cet onglet-ci ; il ne suffit pas quand on recharge, ni quand on passe du PC au
           mobile. C'est le défaut que Naoëlle a vu — « la modale s'affiche en permanence ». */
        void supabase
          .from('interactions')
          .update({ rattachement_ecarte_le: new Date().toISOString() })
          .eq('id', propose.id)
          .then(() => queryClient.invalidateQueries({ queryKey: ['dernier-appel-non-lie'] }))
        /* ON NE MARQUE RIEN EN BASE : l'appel reste non rattache, donc il paraitra dans
           « Appels a rattacher » sur la vue d'ensemble. C'est la consigne — fermer sans choisir ne
           perd rien. Le drapeau  empeche seulement la modale de se rouvrir pour CET
           appel-la. */
      }}
    />
  )
}

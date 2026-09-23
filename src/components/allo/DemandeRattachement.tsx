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
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMonProfil, emailAllo } from '@/lib/data/roles'
import { useAppelEnCours } from '@/lib/data/appelEnCours'
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
      .gte('date_interaction', new Date(Date.now() - 2 * 3600 * 1000).toISOString())
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

export function DemandeRattachement() {
  const { data: profil } = useMonProfil()
  const { data: appelEnCours } = useAppelEnCours()
  const [ouvert, setOuvert] = useState(false)

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
  const dejaDemande = useRef<string | null>(null)
  useEffect(() => {
    if (!dernier) return
    if (dejaDemande.current === dernier.id) return
    dejaDemande.current = dernier.id
    setOuvert(true)
  }, [dernier])

  /* ══ ON NE SE TAIT QUE POUR L'APPEL QU'ON EST EN TRAIN DE PASSER — CORRIGÉ LE 23/09/2026 ══
   *
   * Naoëlle, après trois tentatives : « la modale ne s'ouvre toujours pas ». C'est ce garde qui
   * la retenait, et il a fallu le mesurer deux fois pour le voir en entier.
   *
   * ══ CE QUE FAISAIT L'ANCIENNE VERSION ══
   *
   * Elle se taisait dès QU'UN appel était ouvert depuis moins d'un quart d'heure, quel qu'il soit.
   * Relevé en base ce jour : 20 lignes de `appels_en_cours` sur 827 n'ont JAMAIS reçu de
   * `call.completed` — Allo ne l'envoie pas à tous les coups, et ces lignes restent ouvertes pour
   * toujours. L'une d'elles, ouverte à 13:45 sur le compte Allo de William, avait sept minutes :
   * `enLigne` valait vrai alors que la requête trouvait QUATRE appels à rattacher. Et comme un
   * fantôme naît toutes les quelques dizaines de minutes pendant une prospection, et qu'il est
   * FRAIS pendant son premier quart d'heure, la fenêtre où la modale avait le droit de paraître
   * était refermée en permanence par le fantôme suivant.
   *
   * ══ POURQUOI COMPARER LES CORRESPONDANTS NE SUFFIT PAS ══
   *
   * Ma première correction n'écartait que l'appel ouvert vers le MÊME correspondant. Éprouvée à
   * l'écran le même jour : la modale ne s'ouvrait toujours pas. Le fantôme de 13:45 portait
   * EXACTEMENT le même `contact_id` et le même `compte_id` que l'interaction de 13:20 proposée au
   * rattachement — c'est un rappel, et rappeler deux fois le même contact est le geste ordinaire
   * de la prospection, pas un cas limite.
   *
   * ══ LE BON CRITÈRE EST LA CHRONOLOGIE ══
   *
   * L'interaction qu'on propose de rattacher décrit un appel DÉJÀ FINI — c'est le webhook qui
   * l'écrit à la fin. Si elle est ANTÉRIEURE au début de l'appel encore ouvert, elle parle d'un
   * autre appel, plus ancien, et rien ne justifie de la taire : la demander pendant que la ligne
   * sonne est même le bon moment, puisqu'on a le dossier sous les yeux.
   *
   * ON NE SE TAIT DONC QUE POUR L'INTERACTION DE L'APPEL EN COURS LUI-MÊME : même correspondant ET
   * postérieure à son début. Là, oui, la modale recouvrirait l'écran au moment des notes. */
  const enLigne = Boolean(
    appelEnCours
      && dernier
      && !appelEnCours.termine_le
      && ((appelEnCours.contact_id && appelEnCours.contact_id === dernier.contact_id)
        || (appelEnCours.compte_id && appelEnCours.compte_id === dernier.compte_id))
      /* L'interaction est postérieure au début de l'appel ouvert : elle en est la trace, on parle
         donc encore. Antérieure, elle vient d'un appel précédent et ne doit rien bloquer. */
      && new Date(dernier.date).getTime() >= new Date(appelEnCours.demarre_le).getTime()
      /* ET L'APPEL OUVERT DOIT ÊTRE VRAISEMBLABLE. Au-delà d'un quart d'heure sans `call.completed`,
         c'est un des 20 fantômes : il ne doit plus rien retenir. */
      && Date.now() - new Date(appelEnCours.demarre_le).getTime() < 15 * 60 * 1000,
  )

  if (!ouvert || !dernier || enLigne) return null

  return (
    <LierAppel
      interactionId={dernier.id}
      compteId={dernier.compte_id}
      contactId={dernier.contact_id}
      nomCorrespondant={dernier.nom}
      onFerme={() => {
        setOuvert(false)
        /* ON NE MARQUE RIEN EN BASE : l'appel reste non rattache, donc il paraitra dans
           « Appels a rattacher » sur la vue d'ensemble. C'est la consigne — fermer sans choisir ne
           perd rien. Le drapeau  empeche seulement la modale de se rouvrir pour CET
           appel-la. */
      }}
    />
  )
}

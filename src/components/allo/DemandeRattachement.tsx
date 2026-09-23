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
 * ══ QUAND EXACTEMENT ══
 *
 * On surveille le passage de « en cours » à « terminé » sur l'appel courant — le même signal qui
 * fait déjà relire le fil d'activité (voir `useAppelEnCours`). Dès qu'Allo dit que l'appel est
 * fini, la modale s'ouvre.
 *
 * UNE SEULE FOIS PAR APPEL, et c'est un `useRef` : sans lui, la modale se rouvrirait à chaque
 * sondage tant que l'appel reste le dernier connu — donc toutes les quatre secondes, y compris
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
import { LierAppel } from '@/components/allo/LierAppel'
import { relancer } from '@/lib/data/erreurLecture'

interface DernierAppel {
  id: string
  contact_id: string | null
  compte_id: string | null
  nom: string | null
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
        id, contact_id, compte_id,
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
      id: string; contact_id: string | null; compte_id: string | null
      contact: { prenom: string | null; nom: string | null } | null
      compte: { nom: string | null } | null
    } | undefined
    if (!i) return null

    return {
      id: i.id,
      contact_id: i.contact_id,
      compte_id: i.compte_id,
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
  const queryClient = useQueryClient()
  const [ouvert, setOuvert] = useState(false)

  const adresseAllo = emailAllo(profil)

  /* ══ ON NE CHERCHE L'APPEL À RATTACHER QUE QUAND IL Y EN A UN ══
     Sans appel terminé récemment, cette requête ne sert à rien : on l'active au moment où la
     question se pose, et pas toutes les quinze secondes toute la journée. */
  const [aDemander, setADemander] = useState(false)

  const { data: dernier } = useQuery({
    queryKey: ['dernier-appel-non-lie', adresseAllo],
    enabled: Boolean(adresseAllo) && aDemander,
    staleTime: 5000,
    queryFn: () => fetchDernierNonLie(adresseAllo),
  })

  /* ══ LE PASSAGE DE « EN COURS » À « TERMINÉ » ══
   *
   * `useRef` et non un état : ce drapeau ne doit pas provoquer de rendu, et surtout il doit
   * survivre à la fermeture de la modale — sinon elle se rouvrirait au sondage suivant, toutes les
   * quatre secondes, sur le même appel qu'on vient d'écarter. */
  const dejaDemande = useRef<string | null>(null)
  useEffect(() => {
    if (!appelEnCours?.termine_le) return
    if (dejaDemande.current === appelEnCours.id) return
    dejaDemande.current = appelEnCours.id

    /* L'INTERACTION N'EXISTE PAS ENCORE À CET INSTANT. `call.completed` écrit d'abord la fin de
       l'appel, l'interaction suit — de deux secondes à plusieurs minutes, mesuré le 22/09. On
       demande donc la relecture, et la modale s'ouvre quand la ligne arrive. */
    setADemander(true)
    void queryClient.invalidateQueries({ queryKey: ['dernier-appel-non-lie'] })
  }, [appelEnCours?.id, appelEnCours?.termine_le, queryClient])

  /* LA MODALE S'OUVRE QUAND L'INTERACTION EST LÀ, et pas avant : ouvrir une fenêtre vide pendant
     qu'on attend le webhook ferait exactement ce que Naoëlle a refusé ce matin — un écran qui
     parle sans rien dire. */
  useEffect(() => {
    if (aDemander && dernier) setOuvert(true)
  }, [aDemander, dernier])

  if (!ouvert || !dernier) return null

  return (
    <LierAppel
      interactionId={dernier.id}
      compteId={dernier.compte_id}
      contactId={dernier.contact_id}
      nomCorrespondant={dernier.nom}
      onFerme={() => {
        setOuvert(false)
        /* ON CESSE DE CHERCHER, mais on ne marque rien : l'appel reste non rattaché, donc il
           paraîtra dans « Appels à rattacher » sur la vue d'ensemble. C'est la consigne — fermer
           sans choisir ne perd rien. */
        setADemander(false)
      }}
    />
  )
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'APPEL EN COURS, VU DEPUIS KIMATCH
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 08/09/2026 : « il faut qu'on puisse appeler depuis Kimatch, raccrocher etc. sans devoir
 * ouvrir Allo en externe. »
 *
 * ══ ON NE PEUT PAS RACCROCHER. ON PEUT SAVOIR ══
 *
 * L'API d'Allo n'expose aucun contrôle d'appel — vérifié le 08/09/2026 sur leur table complète
 * portée-par-endpoint. Ce qu'elle expose, ce sont trois événements que `api/allo/webhook.ts` reçoit
 * et écrit dans `appels_en_cours`. Ce module les relit, pour que la carte s'ouvre, se remplisse et
 * se ferme sans que personne aille voir dans Allo.
 *
 * ══ POURQUOI UNE INTERROGATION RÉGULIÈRE ET NON LE TEMPS RÉEL ══
 *
 * Relevé avant de choisir : `supabase_realtime` ne publiait AUCUNE table, et aucun écran de Kimatch
 * n'appelait `.channel()`. Le temps réel n'a jamais servi ici.
 *
 * Introduire une première dépendance websocket la veille d'un test, sur une application dont
 * l'équipe a été arrêtée une heure la veille, serait mal choisir son moment. On interroge donc
 * toutes les quatre secondes — et seulement quand l'onglet est visible, ce qui met à zéro le coût
 * des douze onglets oubliés d'une équipe de treize personnes.
 *
 * La table est DÉJÀ dans la publication (migration 20260908160000) : le jour où quatre secondes
 * gênent, le passage au temps réel ne demande plus de migration, seulement de remplacer
 * `refetchInterval` par un abonnement ici.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMonProfil, emailAllo } from '@/lib/data/roles'

/** Les quatre valeurs, bornées en base par `appels_en_cours_qualification_check`. */
export type Qualification = 'HUMAIN' | 'REPONDEUR' | 'SERVEUR_VOCAL' | 'PAS_DE_REPONSE'

export interface AppelEnCours {
  id: string
  user_email: string
  numero: string
  sens: 'ENTRANT' | 'SORTANT'
  contact_id: string | null
  compte_id: string | null
  piste_id: string | null
  demarre_le: string
  decroche_le: string | null
  termine_le: string | null
  termine_par: 'ALLO' | 'COMMERCIAL' | null
  resultat: string | null
  duree_secondes: number | null
  enregistrement_url: string | null
  transcription: string | null
  resume_allo: string | null
  ivr_touches: unknown[] | null
  qualification: Qualification | null
}

/** Quatre secondes : assez pour que la carte paraisse instantanée, assez peu pour ne rien coûter. */
const INTERVALLE_MS = 4000

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * L'APPEL QU'ON VIENT DE LANCER, AVANT QU'ALLO NE LE CONFIRME
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 22/09/2026 : « je veux qu'il apparaisse au moment de l'appel directement ».
 *
 * MESURÉ SUR LES APPELS DU JOUR : le webhook d'Allo écrit l'appel en 2 secondes… ou en 88, ou en
 * 170, ou en 372. Plus de six minutes dans le pire cas relevé. On ne peut pas accélérer Allo.
 *
 * MAIS KIMATCH SAIT QU'IL VIENT DE LANCER L'APPEL : c'est lui qui a cliqué. Il n'a donc aucune
 * raison d'attendre qu'on le lui raconte. On garde le numéro composé, et la carte s'affiche
 * immédiatement avec ce qu'on sait déjà — le numéro et l'heure de départ.
 *
 * DÈS QUE LE VRAI APPEL ARRIVE EN BASE, IL REMPLACE CELUI-CI. Le provisoire ne sert qu'à combler
 * l'attente : il n'est jamais écrit nulle part, ne porte pas d'identifiant réel, et disparaît au
 * premier appel authentique du même numéro.
 *
 * ON L'OUBLIE AU BOUT DE DEUX MINUTES. Si le webhook n'est toujours pas passé, c'est que l'appel
 * n'est pas parti — le protocole a pu échouer sur un poste sans notre installation. Laisser une
 * carte fantôme indéfiniment ferait croire à un appel qui n'a pas eu lieu.
 */
const OUBLI_PROVISOIRE_MS = 2 * 60 * 1000

let appelPresume: { numero: string; depuis: number } | null = null
let prevenirPresume: (() => void) | null = null

/** L'identifiant d'un appel présumé : reconnaissable, et impossible à confondre avec un vrai. */
export const ID_APPEL_PRESUME = 'presume'

/**
 * Kimatch vient de composer : la carte doit paraître maintenant.
 *
 * Appelée par `telephonie.tsx` au clic, avant même que le protocole ne parte.
 */
export function signalerAppelLance(numero: string) {
  appelPresume = { numero, depuis: Date.now() }
  prevenirPresume?.()
}

/** Le numéro comparé sur ses chiffres seuls : `+33 6…` et `+336…` sont le même correspondant. */
const chiffres = (n: string) => n.replace(/[^0-9]/g, '')

/**
 * L'onglet est-il regardé ?
 *
 * `document.visibilityState` et non le focus de la fenêtre : un commercial qui a Kimatch d'un côté
 * et Allo de l'autre n'a pas le focus sur Kimatch, mais il le VOIT — et c'est précisément le moment
 * où la carte doit vivre. Le focus aurait éteint l'interrogation au pire instant.
 */
function useOngletVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )
  useEffect(() => {
    const surChangement = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', surChangement)
    return () => document.removeEventListener('visibilitychange', surChangement)
  }, [])
  return visible
}

/**
 * Le dernier appel de la personne connectée qui mérite une carte.
 *
 * ON GARDE LES APPELS TERMINÉS RÉCENTS, et c'est tout l'intérêt. `call.completed` arrive environ
 * trente secondes après le raccrochage : si la carte disparaissait à `termine_le`, le commercial
 * n'aurait jamais le temps de qualifier. Elle reste donc dix minutes, le temps d'un clic — et
 * disparaît dès que la qualification est posée.
 */
export function useAppelEnCours() {
  const { data: profil } = useMonProfil()
  const visible = useOngletVisible()
  const queryClient = useQueryClient()

  /* ══ LA CARTE SUIT LE COMPTE ALLO, PAS LE PROFIL KIMATCH ══
   *
   * Elle interrogeait `profil_id`. Naoëlle, 08/09/2026 : « je suis connectée sur le compte de
   * Will », puis « pour le moment Will ne peut pas ajouter mon numéro, faut qu'on teste sans ».
   *
   * Sept membres dans l'espace Allo, dix profils actifs dans Kimatch : quelqu'un qui n'a pas de
   * compte Allo opère celui d'un collègue. Sur `profil_id`, sa carte ne s'ouvrirait jamais — les
   * appels sont attribués au profil du compte Allo qui les a passés.
   *
   * ET CE N'EST PAS UN ARRANGEMENT DE CIRCONSTANCE. La carte est une surface de travail éphémère :
   * elle répond à « quel appel se passe sur le compte que j'opère ». L'HISTORIQUE, lui, reste
   * attribué à `profils.email` par le webhook — un appel de William reste un appel de William, et
   * rien n'est falsifié. Deux questions différentes, deux clés différentes.
   *
   * Au passage, c'est plus robuste : sur `profil_id`, un appel venu d'une adresse Allo absente de
   * `profils` produisait une carte que personne ne voyait. */
  const adresseAllo = emailAllo(profil)

  const requete = useQuery({
    queryKey: ['appel-en-cours', adresseAllo],
    enabled: Boolean(adresseAllo),
    refetchInterval: visible ? INTERVALLE_MS : false,
    // Une carte d'appel périmée n'a aucun intérêt : on ne garde rien entre deux lectures.
    staleTime: 0,
    gcTime: 0,
    /* ══ L'APPEL EN COURS PASSE DEVANT CELUI QU'ON N'A PAS QUALIFIÉ ══
     *
     * Thomas, 21/09/2026 : « quand je finis un appel, j'ai le petit encadré en bas qui s'affiche
     * comme quoi je suis toujours en ligne alors que je suis déjà reparti sur un autre appel ».
     *
     * LA RÈGLE D'AVANT SUPPOSAIT QU'ON QUALIFIE AVANT D'ENCHAÎNER. Elle prenait « le dernier appel
     * non qualifié des dix dernières minutes » : l'appel précédent, resté sans réponse, occupait
     * donc la carte tant que le nouveau n'était pas écrit en base par le webhook d'Allo.
     *
     * Or l'équipe enchaîne toutes les DEUX MINUTES TRENTE-HUIT en moyenne, mesuré sur 231
     * enchaînements — pour une fenêtre de dix minutes. La carte était structurellement en retard
     * d'un appel pendant toute une session de prospection, et Thomas la fermait sans répondre : 262
     * appels non qualifiés en trente jours.
     *
     * On demande donc D'ABORD l'appel qui n'est pas terminé. Un appel en cours est unique et ne se
     * discute pas — c'est celui qu'on est en train de passer. À défaut seulement, on reprend le
     * dernier appel terminé et non qualifié, parce que `call.completed` arrive une trentaine de
     * secondes après le raccrochage et qu'il faut laisser le temps de répondre.
     */
    queryFn: async (): Promise<AppelEnCours | null> => {
      /* ══ UN APPEL EN COURS RESTE AFFICHÉ, MÊME QUALIFIÉ — 22/09/2026 ══
       *
       * Depuis que la qualification est offerte dès le décroché (voir `CarteAppel`), ce filtre
       * `.is('qualification', null)` faisait DISPARAÎTRE la carte au moment du clic : on répondait
       * « quelqu'un » et le chronomètre s'évanouissait alors qu'on était encore en ligne.
       *
       * Qualifier n'est pas raccrocher. Tant que `termine_le` est nul, l'appel se passe, et la
       * carte doit rester — c'est elle qui dit depuis combien de temps on parle. Elle se fermera
       * quand Allo annoncera la fin. */
      const enCours = await supabase
        .from('appels_en_cours')
        .select('*')
        .eq('user_email', adresseAllo as string)
        .is('termine_le', null)
        .order('demarre_le', { ascending: false })
        .limit(1)
      if (enCours.error) throw new Error(enCours.error.message)
      if (enCours.data?.[0]) return enCours.data[0] as AppelEnCours

      /* ══ LA CARTE NE PART PAS D'ELLE-MÊME — 22/09/2026 ══
       *
       * Naoëlle : « je veux qu'il apparaisse au moment de l'appel directement et que ça reste
       * jusqu'à ce qu'une personne clique sur quelque chose. »
       *
       * La fenêtre était de DIX MINUTES : passé ce délai, un appel non qualifié cessait d'être
       * proposé et la carte disparaissait sans que personne n'ait répondu. L'appel rejoignait
       * silencieusement les 262 non qualifiés du mois — exactement ce qu'on essaie de corriger.
       *
       * ON REMONTE À DEUX HEURES, et ce n'est pas un chiffre rond pris au hasard : c'est plus long
       * qu'une session de prospection ininterrompue, donc la carte survit à la pause café qui suit
       * le dernier appel. Au-delà, la question « qui as-tu eu ? » ne se répond plus de mémoire, et
       * une carte qui traîne d'un jour sur l'autre se ferme sans être lue.
       *
       * ON NE MET PAS « SANS LIMITE » pour cette raison précise : une carte éternelle deviendrait
       * du décor, et le décor, on l'ignore. */
      const ilYaDeuxHeures = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('appels_en_cours')
        .select('*')
        .eq('user_email', adresseAllo as string)
        .is('qualification', null)
        .gte('demarre_le', ilYaDeuxHeures)
        .order('demarre_le', { ascending: false })
        .limit(1)
      if (error) throw new Error(error.message)
      const reel = (data?.[0] as AppelEnCours | undefined) ?? null

      /* ══ LE PROVISOIRE NE SERT QUE TANT QUE LE VRAI N'EST PAS LÀ ══
       *
       * Trois conditions pour qu'il paraisse, et chacune évite une carte mensongère :
       *   · il est récent (voir `OUBLI_PROVISOIRE_MS`) ;
       *   · aucun appel réel du MÊME numéro n'est déjà revenu — sinon on afficherait deux fois le
       *     même appel, l'un sans chronomètre ;
       *   · aucun appel réel plus récent n'occupe la carte. */
      if (!appelPresume) return reel
      if (Date.now() - appelPresume.depuis > OUBLI_PROVISOIRE_MS) {
        appelPresume = null
        return reel
      }
      if (reel && chiffres(reel.numero).endsWith(chiffres(appelPresume.numero).slice(-9))) {
        // Le vrai appel est arrivé : le provisoire a fini son office.
        appelPresume = null
        return reel
      }
      if (reel && new Date(reel.demarre_le).getTime() > appelPresume.depuis) return reel

      return {
        id: ID_APPEL_PRESUME,
        user_email: adresseAllo as string,
        numero: appelPresume.numero,
        sens: 'SORTANT',
        contact_id: null,
        compte_id: null,
        piste_id: null,
        demarre_le: new Date(appelPresume.depuis).toISOString(),
        /* PAS DE `decroche_le` : on ne sait pas si ça a décroché, et le prétendre afficherait un
           chronomètre qui ne correspond à rien. La carte dira « Ça sonne ». */
        decroche_le: null,
        termine_le: null,
        termine_par: null,
        source_externe_id: null,
        resultat: null,
        duree_secondes: null,
        enregistrement_url: null,
        transcription: null,
        resume_allo: null,
        ivr_touches: null,
        qualification: null,
      } as AppelEnCours
    },
  })

  /* LA CARTE PARAÎT AU CLIC, SANS ATTENDRE LE PROCHAIN SONDAGE. Sans ce rappel, elle mettrait
     jusqu'à quatre secondes à s'afficher — alors que Kimatch sait déjà tout ce qu'il lui faut. */
  useEffect(() => {
    prevenirPresume = () => {
      void queryClient.invalidateQueries({ queryKey: ['appel-en-cours'] })
    }
    return () => { prevenirPresume = null }
  }, [queryClient])

  /* ══ QUAND L'APPEL SE TERMINE, LE FIL D'ACTIVITÉ SE RELIT ══
   *
   * Naoëlle, 08/09/2026 : « je viens d'appeler à l'instant et je ne vois pas l'appel dans
   * l'activité. »
   *
   * Son appel ÉTAIT bien capté — écrit en base trois secondes après le départ. Mais l'interaction
   * n'est écrite qu'à `call.completed`, qui arrive une trentaine de secondes après le raccrochage,
   * et le fil d'activité de la fiche, lui, ne se relit jamais tout seul : il fallait recharger la
   * page pour voir apparaître l'appel.
   *
   * On surveille donc le passage de « en cours » à « terminé » — la carte interroge déjà toutes les
   * quatre secondes, ça ne coûte pas une requête de plus — et on invalide les interactions à ce
   * moment-là. L'appel apparaît alors dans le fil sans que personne ne recharge.
   *
   * `useRef` ET NON UN ÉTAT : ce drapeau ne doit pas provoquer de rendu, sinon il déclencherait le
   * cycle qu'il observe. */
  const etaitTermine = useRef<string | null>(null)
  useEffect(() => {
    const appel = requete.data
    if (!appel?.termine_le) return
    // Une seule invalidation par appel, même si la carte relit dix fois la même ligne terminée.
    if (etaitTermine.current === appel.id) return
    etaitTermine.current = appel.id
    void queryClient.invalidateQueries({ queryKey: ['interactions'] })
    void queryClient.invalidateQueries({ queryKey: ['activite'] })
  }, [requete.data, queryClient])

  return requete
}

/**
 * Le clic qui qualifie, et qui referme la carte.
 *
 * Michel, 08/09/2026 : « si c'est mettre "je l'ai eu, je l'ai pas eu" et que dans l'application
 * c'est obligatoire, ils le feront. Mais qu'à chaque fois ils mettent une note, ils ne le feront
 * quasiment jamais. » D'où un seul geste, et rien d'autre à remplir.
 *
 * On écrit AUSSI `termine_le` quand Allo ne l'a pas encore dit : qualifier, c'est déclarer l'appel
 * fini. Sans cela, la carte d'un appel qualifié pendant les trente secondes d'attente de
 * `call.completed` resterait « en cours » alors que la personne est déjà passée à la suite.
 */
export function useQualifierAppel() {
  const queryClient = useQueryClient()
  const { data: profil } = useMonProfil()

  return useMutation({
    mutationFn: async ({ id, qualification }: { id: string; qualification: Qualification }) => {
      /* ON N'ÉCRIT PAS SUR UN APPEL PRÉSUMÉ : son identifiant n'existe pas en base, et l'update
         porterait sur zéro ligne — un silence qui se lirait comme un succès. Le clic est donc
         ignoré tant qu'Allo n'a pas confirmé l'appel, ce qui prend quelques secondes. */
      if (id === ID_APPEL_PRESUME) {
        throw new Error('L’appel n’est pas encore enregistré — réessaie dans un instant.')
      }
      const { error } = await supabase
        .from('appels_en_cours')
        .update({
          qualification,
          qualifie_le: new Date().toISOString(),
          qualifie_par: (profil?.id as string | undefined) ?? null,
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    /* ══ LE CHOIX SE VOIT AVANT MÊME QUE LA BASE RÉPONDE ══
     *
     * Naoëlle, 22/09/2026, sur la prospection en chaîne : « il faut que ça apparaisse tout de suite
     * et que ça parte tout de suite ». Un commercial qui enchaîne ne doit pas attendre un
     * aller-retour réseau pour savoir que son clic est pris — sinon il reclique, ou il doute.
     *
     * On peint donc le cache tout de suite. `onSettled` relit ensuite : si l'écriture a échoué, la
     * relecture remet la vérité, et le bouton reprend son état. */
    onMutate: ({ id, qualification }) => {
      queryClient.setQueriesData<AppelEnCours | null>(
        { queryKey: ['appel-en-cours'] },
        (ancien) => (ancien && ancien.id === id ? { ...ancien, qualification } : ancien),
      )
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['appel-en-cours'] })
      // L'appel qualifié rejoint l'historique de la fiche : ces listes-là doivent se relire.
      void queryClient.invalidateQueries({ queryKey: ['interactions'] })
    },
  })
}

/** Fermer la carte sans qualifier — un appel raté, une fausse manœuvre. */
export function useEcarterAppel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      /* FERMER UN APPEL PRÉSUMÉ N'ÉCRIT RIEN : il n'existe qu'en mémoire. On l'oublie, la carte
         disparaît, et le vrai appel reprendra sa place quand Allo l'aura confirmé. */
      if (id === ID_APPEL_PRESUME) {
        appelPresume = null
        return
      }
      const { error } = await supabase
        .from('appels_en_cours')
        .update({
          qualification: 'PAS_DE_REPONSE',
          termine_le: new Date().toISOString(),
          termine_par: 'COMMERCIAL',
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appel-en-cours'] }),
  })
}

/**
 * Où en est l'appel, en un mot.
 *
 * Trois états seulement, parce qu'il n'y a que trois choses à savoir : ça sonne, on parle, c'est
 * fini. Le quatrième état — « Allo ne nous a encore rien dit » — est indistinguable du troisième
 * pendant trente secondes, et prétendre le contraire serait mentir à l'écran.
 */
export type EtatAppel = 'sonne' | 'en_ligne' | 'termine'

export function etatDeLAppel(a: AppelEnCours): EtatAppel {
  if (a.termine_le) return 'termine'
  if (a.decroche_le) return 'en_ligne'
  return 'sonne'
}

/**
 * ══ QUI EST AU BOUT DU FIL ══
 *
 * William : « savoir qui on appelle, le nom de la personne, si on a son nom, sinon son numéro en
 * brut ». Le webhook rattache déjà l'appel à un contact, un compte ou une piste par les neuf
 * derniers chiffres ; il ne restait plus qu'à aller chercher le nom.
 *
 * TROIS SOURCES, DANS L'ORDRE DE PRÉCISION : un contact nomme une personne, une piste nomme une
 * personne pas encore convertie, un compte ne nomme qu'une société. En l'absence des trois, on ne
 * met rien — l'écran affiche le numéro, qui est toujours là.
 */
export function useIdentiteAppel(appel: AppelEnCours | null | undefined) {
  const cle = appel ? [appel.contact_id, appel.piste_id, appel.compte_id, appel.numero].join('|') : 'aucun'
  return useQuery({
    queryKey: ['identite-appel', cle],
    /* ON CHERCHE MÊME SANS RATTACHEMENT, et c'est le cœur du problème de Thomas : sur 262 appels
       non qualifiés, 199 ne portaient QUE le numéro. La carte lui demandait « avez-vous eu
       quelqu'un ? » sans lui dire qui il appelait — impossible à renseigner de bonne foi.
       `qui_appelle` retrouve le propriétaire du numéro même quand le webhook n'a rien rattaché,
       parce qu'il comparait les chaînes brutes au lieu des chiffres. */
    enabled: Boolean(appel && (appel.contact_id || appel.piste_id || appel.compte_id || appel.numero)),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ nom: string | null; societe: string | null }> => {
      if (!appel) return { nom: null, societe: null }

      if (appel.contact_id) {
        const { data } = await supabase
          .from('contacts').select('civilite, prenom, nom, compte:comptes(nom)')
          .eq('id', appel.contact_id).maybeSingle()
        if (data) {
          const d = data as unknown as { civilite: string | null; prenom: string | null; nom: string | null; compte: { nom: string } | { nom: string }[] | null }
          const compte = Array.isArray(d.compte) ? d.compte[0] : d.compte
          const nom = [d.civilite, d.prenom, d.nom].filter(Boolean).join(' ').trim()
          return { nom: nom || null, societe: compte?.nom ?? null }
        }
      }

      if (appel.piste_id) {
        const { data } = await supabase
          .from('pistes').select('contact_nom, societe').eq('id', appel.piste_id).maybeSingle()
        if (data) {
          const d = data as unknown as { contact_nom: string | null; societe: string | null }
          return { nom: d.contact_nom || null, societe: d.societe || null }
        }
      }

      if (appel.compte_id) {
        const { data } = await supabase
          .from('comptes').select('nom').eq('id', appel.compte_id).maybeSingle()
        if (data) return { nom: null, societe: (data as unknown as { nom: string }).nom }
      }

      /* ══ RIEN N'ÉTAIT RATTACHÉ : ON CHERCHE PAR LE NUMÉRO ══
         C'est le cas de 199 appels sur 262. Le webhook n'avait rien trouvé parce qu'il comparait
         `telephone like '%612345678'` sur la chaîne brute, ce qui rate les 1 319 numéros écrits
         avec des espaces. `qui_appelle` compare les chiffres seuls (migration 20260921160000). */
      if (appel.numero) {
        const { data } = await supabase.rpc('qui_appelle', { p_numero: appel.numero })
        const ligne = (data as { nom: string | null; compte_id: string | null }[] | null)?.[0]
        if (ligne?.nom) {
          let societe: string | null = null
          if (ligne.compte_id) {
            const { data: c } = await supabase
              .from('comptes').select('nom').eq('id', ligne.compte_id).maybeSingle()
            societe = (c as unknown as { nom: string } | null)?.nom ?? null
          }
          return { nom: ligne.nom, societe }
        }
      }

      return { nom: null, societe: null }
    },
  })
}

/** Le serveur vocal qu'Allo compte comme un décroché — voir `ivr_touches`. */
export function aRencontreUnServeurVocal(a: AppelEnCours): boolean {
  return Array.isArray(a.ivr_touches) && a.ivr_touches.length > 0
}

/**
 * ══ LE COMPTEUR NE PART QU'AU DÉCROCHÉ ══
 *
 * William, 15/09/2026 : « il faudrait que le compteur de secondes commence quand ça a décroché —
 * que ce soit un répondeur, un serveur vocal ou une personne, mais seulement quand la tonalité
 * s'est arrêtée ».
 *
 * L'ANCIENNE VERSION COMPTAIT DEPUIS LA COMPOSITION tant que le décroché n'était pas connu, puis
 * repartait de zéro : le chiffre affiché RECULAIT au moment où quelqu'un répondait. Une durée
 * d'appel qui diminue, c'est une durée à laquelle on n'accorde plus jamais crédit.
 *
 * `null` pendant la sonnerie — et l'écran montre alors l'état, pas un nombre. Le webhook
 * `call.answered` d'Allo remplit `decroche_le` ; c'est lui, et lui seul, qui démarre le compte.
 */
export function secondesDepuisDecroche(a: AppelEnCours, maintenant: number): number | null {
  if (!a.decroche_le) return null
  return Math.max(0, Math.floor((maintenant - new Date(a.decroche_le).getTime()) / 1000))
}

/** « 2 min 14 s ». */
export function dureeLisible(secondes: number): string {
  const m = Math.floor(secondes / 60)
  const s = secondes % 60
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`
}

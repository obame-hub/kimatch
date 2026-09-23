/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LIER UN APPEL À CE SUR QUOI IL PORTAIT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, via Naoëlle, 23/09/2026 : « qu'on ait la possibilité de lier un appel à certains objets
 * — opportunité, piste, recommandation, requête. À la fin d'un appel, une petite modale qui propose
 * de lier. Et s'ils ne l'ont pas fait, une liste des appels non liés. »
 *
 * ══ POURQUOI ÇA MANQUE, MESURÉ ══
 *
 * Sur 699 appels des trente derniers jours :
 *
 *   236  liés à une piste          ← le webhook les rattache par le numéro
 *    28  liés à une recommandation
 *     0  liés à une opportunité
 *     0  liés à une requête
 *   435  LIÉS À RIEN
 *
 * Les deux zéros ne sont pas un hasard : `api/allo/webhook.ts` ne sait rattacher qu'à un contact,
 * un compte ou une piste — par les neuf derniers chiffres du numéro. Une opportunité et une requête
 * n'ont pas de numéro de téléphone, donc rien ne peut les deviner. Seul l'humain sait de quoi il
 * vient de parler.
 *
 * ══ AUCUNE MIGRATION : LA BASE EST DÉJÀ PRÊTE ══
 *
 * `interactions` porte DÉJÀ `opportunite_id`, `recommandation_id`, `requete_id` et `piste_id`. Rien
 * à créer — il n'y avait simplement aucun écran pour les renseigner après coup.
 *
 * ══ UN SEUL OBJET PAR APPEL ══
 *
 * Naoëlle a d'abord demandé plusieurs liens, puis tranché le même jour : « finalement on ne peut
 * lier l'appel qu'à un seul objet. »
 *
 * C'est ce que la base permettait déjà sans rien ajouter — quatre colonnes distinctes, une seule
 * remplie. Plusieurs liens auraient demandé une table de liaison, donc une migration, pour une
 * question qui ne se pose pas si souvent : sur les comptes appelés, la MÉDIANE est de deux objets
 * en tout. Le choix est rarement ambigu.
 *
 * CHOISIR UN AUTRE OBJET EFFACE LE PRÉCÉDENT, et délier est possible : on se trompe
 * d'opportunité, on s'aperçoit que l'appel portait sur la requête voisine.
 *
 * ══ JAMAIS OBLIGATOIRE ══
 *
 * Naoëlle : « ne le rends pas obligatoire, mais s'ils n'ont pas lié, ajoute-le à la liste des
 * appels non liés. » Une modale qu'on ne peut pas fermer, quarante fois par jour en prospection,
 * serait insupportable — et on apprendrait à cliquer n'importe quoi pour s'en débarrasser, ce qui
 * est pire que pas de lien du tout. Le rattrapage se fait dans la liste, au calme.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { relancer } from '@/lib/data/erreurLecture'

/** Les quatre objets auxquels un appel peut se rattacher, dans l'ordre où on les rencontre. */
export type TypeLien = 'opportunite' | 'recommandation' | 'requete' | 'piste'

export interface ObjetLiable {
  type: TypeLien
  id: string
  /** Ce qu'on lit dans la liste : une référence, un objet de requête, une société. */
  libelle: string
  /** La précision qui distingue deux lignes voisines — un statut, une date. */
  detail: string | null
}

/** Les quatre colonnes de `interactions`, dans le même ordre que `TypeLien`. */
const COLONNE: Record<TypeLien, string> = {
  opportunite: 'opportunite_id',
  recommandation: 'recommandation_id',
  requete: 'requete_id',
  piste: 'piste_id',
}

export interface AppelALier {
  /** L'identifiant de l'INTERACTION, pas de l'appel : c'est elle qui porte les liens. */
  id: string
  numero: string | null
  date_interaction: string
  contact_id: string | null
  compte_id: string | null
  contact_nom: string | null
  compte_nom: string | null
  opportunite_id: string | null
  recommandation_id: string | null
  requete_id: string | null
  piste_id: string | null
}

/**
 * Ce qu'on peut proposer de lier, pour le correspondant qu'on vient d'avoir.
 *
 * ON PART DU COMPTE ET DU CONTACT, jamais d'une recherche libre : au moment où la modale s'ouvre,
 * on sait à qui l'on vient de parler. Faire chercher « l'opportunité concernée » parmi 129 alors
 * qu'on en connaît trois est un travail qu'on peut épargner.
 *
 * REND UNE LISTE VIDE PLUTÔT QUE DE LEVER quand on ne connaît ni compte ni contact : la modale dira
 * « rien à proposer » et proposera la recherche. Un appel vers un numéro inconnu est le cas normal.
 */
async function fetchObjetsLiables(
  compteId: string | null,
  contactId: string | null,
): Promise<ObjetLiable[]> {
  if (!compteId && !contactId) return []

  try {
    const objets: ObjetLiable[] = []

    /* LES OPPORTUNITÉS DU COMPTE. On passe par le compte et non par le contact : une opportunité
       peut être portée par un autre interlocuteur du même syndic, et c'est bien d'elle qu'on parle. */
    if (compteId) {
      const { data, error } = await supabase
        .from('opportunites')
        .select('id, reference, date_creation, statut:statuts_opportunites(libelle)')
        .eq('compte_id', compteId)
        .order('date_creation', { ascending: false })
        .limit(20)
      if (error) throw error
      for (const o of (data ?? []) as unknown as {
        id: string; reference: string | null; date_creation: string
        statut: { libelle: string } | { libelle: string }[] | null
      }[]) {
        const s = Array.isArray(o.statut) ? o.statut[0] : o.statut
        objets.push({
          type: 'opportunite',
          id: o.id,
          libelle: o.reference ?? 'Opportunité',
          detail: s?.libelle ?? null,
        })
      }
    }

    if (compteId) {
      const { data, error } = await supabase
        .from('recommandations')
        .select('id, reference, date_creation')
        .eq('compte_id', compteId)
        .order('date_creation', { ascending: false })
        .limit(20)
      if (error) throw error
      for (const r of (data ?? []) as { id: string; reference: string | null; date_creation: string }[]) {
        objets.push({
          type: 'recommandation',
          id: r.id,
          libelle: r.reference ?? 'Recommandation',
          detail: r.date_creation ? new Date(r.date_creation).toLocaleDateString('fr-FR') : null,
        })
      }
    }

    if (compteId) {
      const { data, error } = await supabase
        .from('requetes')
        .select('id, objet, date_creation')
        .eq('compte_id', compteId)
        .order('date_creation', { ascending: false })
        .limit(20)
      if (error) throw error
      for (const q of (data ?? []) as { id: string; objet: string | null; date_creation: string }[]) {
        objets.push({
          type: 'requete',
          id: q.id,
          libelle: q.objet ?? 'Requête',
          detail: q.date_creation ? new Date(q.date_creation).toLocaleDateString('fr-FR') : null,
        })
      }
    }

    /* LES PISTES SE CHERCHENT PAR LE CONTACT : une piste n'a pas encore de compte — c'est
       précisément ce qui la distingue d'une opportunité. */
    if (contactId) {
      const { data, error } = await supabase
        .from('pistes')
        .select('id, societe, contact_nom, date_creation')
        .eq('contact_id', contactId)
        .eq('actif', true)
        .order('date_creation', { ascending: false })
        .limit(20)
      if (error) throw error
      for (const p of (data ?? []) as {
        id: string; societe: string | null; contact_nom: string | null; date_creation: string
      }[]) {
        objets.push({
          type: 'piste',
          id: p.id,
          libelle: p.societe ?? p.contact_nom ?? 'Piste',
          detail: p.date_creation ? new Date(p.date_creation).toLocaleDateString('fr-FR') : null,
        })
      }
    }

    return objets
  } catch (error) {
    relancer('fetchObjetsLiables', error)
  }
}

export function useObjetsLiables(compteId: string | null, contactId: string | null) {
  return useQuery({
    queryKey: ['objets-liables', compteId, contactId],
    enabled: Boolean(compteId || contactId),
    staleTime: 60 * 1000,
    queryFn: () => fetchObjetsLiables(compteId, contactId),
  })
}

/**
 * Les appels qui ne sont rattachés à rien.
 *
 * Naoëlle : « s'ils ne l'ont pas fait, ajoute-le à la liste des appels non liés. » C'est le
 * rattrapage de ceux passés depuis un mobile, où aucune modale ne peut s'ouvrir — et de ceux qu'on
 * a fermés sans répondre, ce qui doit rester possible.
 *
 * ON NE REMONTE PAS PLUS DE TRENTE JOURS : au-delà, on ne se souvient plus de quoi on a parlé, et
 * une liste qu'on ne peut pas traiter devient du décor. Voir `CarteAppel` : c'est la même leçon.
 */
async function fetchAppelsNonLies(profilId: string | null): Promise<AppelALier[]> {
  if (!profilId) return []
  try {
    const { data, error } = await supabase
      .from('interactions')
      .select(`
        id, date_interaction, contact_id, compte_id,
        opportunite_id, recommandation_id, requete_id, piste_id,
        type:types_interactions!inner(code),
        contact:contacts(prenom, nom, telephone),
        compte:comptes(nom)
      `)
      .eq('type.code', 'APPEL')
      .eq('auteur_profil_id', profilId)
      .is('opportunite_id', null)
      .is('recommandation_id', null)
      .is('requete_id', null)
      .is('piste_id', null)
      .gte('date_interaction', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      /* ON BORNE AUSSI PAR LE HAUT. Une interaction datee de 2028 existe en base — reprise
         Salesforce, ou saisie fautive : sans ce garde, elle serait toujours « le dernier appel »
         et le bouton proposerait eternellement de rattacher le mauvais. Constate le 23/09/2026. */
      .lte('date_interaction', new Date().toISOString())
      .order('date_interaction', { ascending: false })
      .limit(100)
    if (error) throw error

    return ((data ?? []) as unknown as {
      id: string; date_interaction: string; contact_id: string | null; compte_id: string | null
      opportunite_id: string | null; recommandation_id: string | null
      requete_id: string | null; piste_id: string | null
      contact: { prenom: string | null; nom: string | null; telephone: string | null } | null
      compte: { nom: string | null } | null
    }[]).map((i) => ({
      id: i.id,
      numero: i.contact?.telephone ?? null,
      date_interaction: i.date_interaction,
      contact_id: i.contact_id,
      compte_id: i.compte_id,
      contact_nom: i.contact
        ? `${i.contact.prenom ?? ''} ${i.contact.nom ?? ''}`.trim() || null
        : null,
      compte_nom: i.compte?.nom ?? null,
      opportunite_id: i.opportunite_id,
      recommandation_id: i.recommandation_id,
      requete_id: i.requete_id,
      piste_id: i.piste_id,
    }))
  } catch (error) {
    relancer('fetchAppelsNonLies', error)
  }
}

export function useAppelsNonLies(profilId: string | null) {
  return useQuery({
    queryKey: ['appels-non-lies', profilId],
    enabled: Boolean(profilId),
    staleTime: 30 * 1000,
    queryFn: () => fetchAppelsNonLies(profilId),
  })
}

/**
 * Rattache un appel à un ou plusieurs objets.
 *
 * ON ÉCRIT LES QUATRE COLONNES D'UN COUP, y compris celles qu'on met à `null` : sans ça, décocher
 * un objet ne le retirerait pas. Un rattachement se corrige — on se trompe d'opportunité, on
 * s'aperçoit que l'appel portait sur la requête voisine.
 */
export function useLierAppel() {
  const qc = useQueryClient()
  return useMutation({
    /**
     * UN SEUL OBJET PAR APPEL — Naoëlle a tranché le 23/09/2026, après avoir d'abord demandé
     * plusieurs : « finalement on ne peut lier l'appel qu'à un seul objet ».
     *
     * Passer `null` DÉLIE, et c'est le même geste : on se trompe d'opportunité, on s'aperçoit que
     * l'appel portait sur la requête voisine. Sans ça, une erreur serait définitive.
     */
    mutationFn: async ({ interactionId, lien }: {
      interactionId: string
      lien: { type: TypeLien; id: string } | null
    }) => {
      /* ON ÉCRIT LES QUATRE COLONNES, y compris celles qu'on remet à `null` : sinon, choisir une
         requête après avoir choisi une opportunité laisserait les deux liens en place, et l'appel
         se retrouverait rattaché à deux objets — exactement ce qu'on vient d'écarter. */
      const maj: Record<string, string | null> = {
        opportunite_id: null, recommandation_id: null, requete_id: null, piste_id: null,
      }
      if (lien) maj[COLONNE[lien.type]] = lien.id

      const { error } = await supabase.from('interactions').update(maj).eq('id', interactionId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appels-non-lies'] })
      void qc.invalidateQueries({ queryKey: ['interactions'] })
    },
  })
}

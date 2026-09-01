import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import type { LigneListe, Piste } from '@/types/domain'

/**
 * Le haut de l'entonnoir : la Liste, puis la Piste.
 *
 * Mémo de Michel, 23/08/2026 :
 *
 *   « LISTE — Au départ : une ligne avec un contact, une société, un email et un téléphone. La Liste
 *   devient une Piste uniquement lorsque nous avons validé : le contact, la société, l'email, le
 *   portable, et surtout que la personne est bien responsable ou décisionnaire des contrats
 *   d'énergie. Il n'est pas nécessaire à ce stade de connaître les compteurs ou les échéances. »
 *
 *   « PISTE — un contact fiable et joignable, identifié comme responsable des contrats d'énergie.
 *   Son objectif est de mûrir jusqu'à devenir une Opportunité. »
 *
 * DEUX OBJETS ET NON UN, parce que la bascule est une DÉCISION et non un état calculé : une ligne
 * peut rester en liste des mois faute d'avoir joint la bonne personne. Ce qui les sépare tient en
 * cinq cases, et ces cinq cases sont dans le schéma.
 *
 * PAS DE MAQUETTE POUR CES DEUX ÉCRANS. Le zip du 23/08 ne contient que la fiche Opportunité : ce qui
 * suit s'en tient à ce que le mémo décrit, sans rien ajouter qui n'y soit.
 */

/** Les cinq validations qui font passer une ligne de liste en piste. */
export const VALIDATIONS_PISTE = [
  { cle: 'contact_valide', libelle: 'Contact vérifié' },
  { cle: 'societe_validee', libelle: 'Société vérifiée' },
  { cle: 'email_valide', libelle: 'Email vérifié' },
  { cle: 'portable_valide', libelle: 'Portable vérifié' },
  { cle: 'est_decisionnaire', libelle: 'Responsable des contrats d’énergie' },
] as const

/** Une piste est mûre pour l'opportunité quand les cinq validations sont faites. */
export function pisteQualifiee(p: Piste): boolean {
  return VALIDATIONS_PISTE.every((v) => Boolean(p[v.cle]))
}

// ══ LISTES ══════════════════════════════════════════════════════════════════

export function useListes() {
  return useQuery({
    queryKey: ['listes'],
    queryFn: async (): Promise<LigneListe[]> => {
      try {
        // `*` : les colonnes viennent de la migration 20260823100000 et seraient absentes tant
        // qu'elle n'est pas appliquée.
        const lignes = await fetchAllRows<LigneListe>('listes', '*',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q: any) => q.order('date_creation', { ascending: false }))
        return lignes
      } catch (error) {
        console.error('useListes', error)
        return []
      }
    },
  })
}

export function useCreerLigneListe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { societe: string | null; contact_nom: string | null; email: string | null; telephone: string | null; source: string | null }) => {
      const { data, error } = await supabase.from('listes').insert(input).select('id').single()
      if (error) throw new Error(messageDErreur(error.message))
      return (data as { id: string }).id
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['listes'] }) },
  })
}

/**
 * Convertit une ligne de liste en piste.
 *
 * On recopie les quatre informations et on laisse les cinq validations à `false` : la conversion en
 * piste n'est pas la qualification. C'est justement le travail de la piste que de les cocher.
 */
export function useConvertirEnPiste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ligne: LigneListe) => {
      const { data, error } = await supabase
        .from('pistes')
        .insert({
          societe: ligne.societe,
          contact_nom: ligne.contact_nom,
          email: ligne.email,
          telephone: ligne.telephone,
          liste_id: ligne.id,
          commentaire: ligne.commentaire,
        })
        .select('id')
        .single()
      if (error) throw new Error(messageDErreur(error.message))
      const pisteId = (data as { id: string }).id
      await supabase.from('listes').update({ piste_id: pisteId }).eq('id', ligne.id)
      return pisteId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listes'] })
      qc.invalidateQueries({ queryKey: ['pistes'] })
    },
  })
}

// ══ PISTES ══════════════════════════════════════════════════════════════════

export function usePistes() {
  return useQuery({
    queryKey: ['pistes'],
    queryFn: async (): Promise<Piste[]> => {
      try {
        return await fetchAllRows<Piste>('pistes', '*',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q: any) => q.order('date_creation', { ascending: false }))
      } catch (error) {
        console.error('usePistes', error)
        return []
      }
    },
  })
}

/**
 * Une piste par son identifiant.
 *
 * Michel, 01/09/2026 : « que ce ne soit pas un volet à droite qui s'affiche quand on clique dessus
 * mais une page dédiée à la piste, affichée comme les opportunités ».
 *
 * La piste n'avait pas de lecture unitaire : le panneau recevait l'objet déjà chargé par le kanban.
 * Une page, elle, s'ouvre par son adresse — depuis un lien, un favori, un retour arrière — et doit
 * donc savoir se charger seule.
 */
export function usePiste(id: string | undefined) {
  return useQuery({
    queryKey: ['pistes', 'une', id],
    enabled: !!id,
    queryFn: async (): Promise<Piste | null> => {
      const { data, error } = await supabase.from('pistes').select('*').eq('id', id as string).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Piste | null) ?? null
    },
  })
}

export type PatchPiste = Partial<{
  societe: string | null
  contact_nom: string | null
  email: string | null
  telephone: string | null
  contact_valide: boolean
  societe_validee: boolean
  email_valide: boolean
  portable_valide: boolean
  est_decisionnaire: boolean
  compte_id: string | null
  contact_id: string | null
  commentaire: string | null
  opportunite_id: string | null
}>

export function useMajPiste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchPiste }) => {
      const { error } = await supabase
        .from('pistes')
        .update({ ...patch, date_modification: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(messageDErreur(error.message))
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pistes'] }) },
  })
}

export function useCreerPiste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { societe: string | null; contact_nom: string | null; email: string | null; telephone: string | null }) => {
      const { data, error } = await supabase.from('pistes').insert(input).select('id').single()
      if (error) throw new Error(messageDErreur(error.message))
      return (data as { id: string }).id
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pistes'] }) },
  })
}

/**
 * Convertit une piste en opportunité.
 *
 * « La Piste devient une Opportunité lorsqu'un signal positif est identifié. » L'opportunité naît
 * donc avec l'origine PISTE et le lien retour, et rien de plus : le compte, le périmètre et le mandat
 * se rassemblent ensuite, c'est le travail de l'opportunité.
 */
export function useConvertirPisteEnOpportunite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ piste, statutNouvelleId, signal, contactId, compteId }: {
      piste: Piste
      statutNouvelleId: string | null
      signal: string | null
      /** Le contact retenu au moment de la conversion : prerequis de Michel, il ne peut pas etre nul. */
      contactId?: string | null
      compteId?: string | null
    }) => {
      const base = {
        origine: 'PISTE',
        piste_id: piste.id,
        // Ce que le dialogue a retenu prime sur ce que la piste portait : une piste peut avoir ete
        // rattachee a un contact du patrimoine au moment meme de la conversion.
        compte_id: compteId ?? piste.compte_id,
        contact_id: contactId ?? piste.contact_id,
        ...(statutNouvelleId ? { statut_id: statutNouvelleId } : {}),
      }

      // LE SIGNAL A SON CHAMP DEPUIS LE 23/08/2026. Il partait dans `commentaire`, si bien que le
      // contrôle de prérequis se réduisait à « il y a un commentaire, donc il y a un signal » —
      // n'importe quelle note libre le validait. Repli sur le commentaire tant que la migration
      // 20260823150000 n'est pas appliquée : mieux vaut un signal mal rangé qu'une conversion qui
      // échoue.
      let reponse = await supabase
        .from('opportunites')
        .insert({ ...base, signal_libelle: signal })
        .select('id')
        .single()
      if (reponse.error && /signal_libelle/.test(reponse.error.message)) {
        reponse = await supabase.from('opportunites').insert({ ...base, commentaire: signal }).select('id').single()
      }
      const { data, error } = reponse
      if (error) throw new Error(messageDErreur(error.message))
      const oppId = (data as { id: string }).id
      // La piste garde la trace du contact retenu : sans cela l'information ne vivrait que sur
      // l'opportunite, et la piste continuerait d'afficher un contact en texte libre alors qu'on
      // vient de le rattacher au patrimoine.
      await supabase
        .from('pistes')
        .update({
          opportunite_id: oppId,
          ...(contactId ? { contact_id: contactId } : {}),
          ...(compteId ? { compte_id: compteId } : {}),
        })
        .eq('id', piste.id)
      return oppId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pistes'] })
      qc.invalidateQueries({ queryKey: ['opportunites'] })
    },
  })
}

/** Même traduction que partout : un refus de PostgREST doit dire quoi faire. */
function messageDErreur(brut: string): string {
  if (/relation .* does not exist|42P01/i.test(brut)) {
    return `La table n'existe pas encore : la migration 20260823100000 reste à appliquer. (${brut})`
  }
  if (/column .* does not exist|PGRST204|42703|schema cache/i.test(brut)) {
    return `Colonne absente : la migration 20260823100000 reste à appliquer. (${brut})`
  }
  return brut
}

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utilisateurCourant } from '@/lib/data/utilisateurCourant'
import {
  BUCKET_NOUVEAUTES,
  cheminsPrives,
  injecterUrlsSignees,
  nettoyerHtml,
  signerChemins,
} from '@/lib/htmlPublication'

export interface AuteurPublication {
  id: string
  prenom: string
  nom: string
  photo_url: string | null
}

export interface Publication {
  id: string
  titre: string
  contenu_html: string
  /** NULL = brouillon. Voir la migration 20260905100000 : la date EST la publication. */
  date_publication: string | null
  date_creation: string
  type_publication_id: string
  type_code: string
  type_libelle: string
  type_couleur: string | null
  auteur: AuteurPublication | null
}

/** Ce que la table renvoie avant mise à plat — les jointures arrivent en objet ou en tableau. */
interface LignePublication {
  id: string
  titre: string
  contenu_html: string | null
  date_publication: string | null
  date_creation: string
  type_publication_id: string
  type: { code: string; libelle: string; couleur: string | null } | { code: string; libelle: string; couleur: string | null }[] | null
  auteur: AuteurPublication | AuteurPublication[] | null
}

function premier<T>(valeur: T | T[] | null): T | null {
  if (Array.isArray(valeur)) return valeur[0] ?? null
  return valeur
}

const SELECTION =
  'id, titre, contenu_html, date_publication, date_creation, type_publication_id,' +
  ' type:types_publications(code, libelle, couleur),' +
  ' auteur:profils!publications_auteur_id_fkey(id, prenom, nom, photo_url)'

async function fetchPublications(): Promise<Publication[]> {
  // Les brouillons ne sont pas filtrés ici : c'est la politique RLS `publications_lecture` qui ne
  // les montre qu'aux administrateurs. Le faire aussi côté front les cacherait à ceux qui les
  // écrivent.
  const { data, error } = await supabase
    .from('publications')
    .select(SELECTION)
    .eq('actif', true)
    .order('date_publication', { ascending: false, nullsFirst: true })
    .order('date_creation', { ascending: false })

  if (error || !data) {
    console.error('fetchPublications', error)
    return []
  }

  return (data as unknown as LignePublication[]).map((ligne) => {
    const type = premier(ligne.type)
    return {
      id: ligne.id,
      titre: ligne.titre,
      contenu_html: ligne.contenu_html ?? '',
      date_publication: ligne.date_publication,
      date_creation: ligne.date_creation,
      type_publication_id: ligne.type_publication_id,
      type_code: type?.code ?? '',
      type_libelle: type?.libelle ?? '',
      type_couleur: type?.couleur ?? null,
      auteur: premier(ligne.auteur),
    }
  })
}

export function usePublications() {
  return useQuery({ queryKey: ['publications'], queryFn: fetchPublications })
}

/** Les identifiants des publications que J'AI lues. La politique RLS limite déjà aux miennes. */
async function fetchMesLectures(): Promise<string[]> {
  const { data, error } = await supabase.from('publications_lectures').select('publication_id')
  if (error || !data) {
    console.error('fetchMesLectures', error)
    return []
  }
  return (data as { publication_id: string }[]).map((l) => l.publication_id)
}

export function useMesLectures() {
  return useQuery({ queryKey: ['publications', 'mes-lectures'], queryFn: fetchMesLectures })
}

/**
 * Les publiées que je n'ai pas encore lues, la plus récente d'abord.
 *
 * UN BROUILLON N'EST JAMAIS « NON LU », même pour son auteur : la pastille annonce ce que l'équipe
 * doit savoir, et un texte que personne n'a encore publié n'en fait pas partie. Sans ce filtre, le
 * seul fait d'commencer une publication allumerait la pastille de celui qui l'écrit.
 */
export function useNouveautesNonLues() {
  const { data: publications } = usePublications()
  const { data: lectures } = useMesLectures()

  return useMemo(() => {
    if (!publications || !lectures) return []
    const lues = new Set(lectures)
    return publications.filter((p) => p.date_publication !== null && !lues.has(p.id))
  }, [publications, lectures])
}

export function useMarquerLues() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return
      const utilisateur = await utilisateurCourant()
      if (!utilisateur) throw new Error('Non connecté')
      // `upsert` avec `ignoreDuplicates` : rouvrir la popup ne doit pas échouer sur la clé primaire
      // du couple (publication, profil).
      const { error } = await supabase
        .from('publications_lectures')
        .upsert(
          ids.map((publication_id) => ({ publication_id, profil_id: utilisateur.id })),
          { onConflict: 'publication_id,profil_id', ignoreDuplicates: true },
        )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['publications', 'mes-lectures'] })
    },
  })
}

export interface EnregistrerPublicationInput {
  id?: string
  titre: string
  type_publication_id: string
  contenu_html: string
  /** Vrai au clic sur « Publier » : pose la date et déclenche la pastille de toute l'équipe. */
  publier?: boolean
}

export function useEnregistrerPublication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: EnregistrerPublicationInput) => {
      const utilisateur = await utilisateurCourant()
      if (!utilisateur) throw new Error('Non connecté')

      const champs = {
        titre: input.titre.trim(),
        type_publication_id: input.type_publication_id,
        // Nettoyé AVANT d'entrer en base, en plus du nettoyage à l'affichage.
        contenu_html: nettoyerHtml(input.contenu_html),
      }

      if (input.id) {
        // Republier une publication déjà publiée ne change pas sa date : elle marquerait la
        // correction d'une virgule comme une nouveauté du jour et rallumerait la pastille de tous.
        const { data: existante, error: erreurLecture } = await supabase
          .from('publications')
          .select('date_publication')
          .eq('id', input.id)
          .single()
        if (erreurLecture) throw new Error(erreurLecture.message)

        const dejaPubliee = (existante as { date_publication: string | null }).date_publication !== null
        const { error } = await supabase
          .from('publications')
          .update({
            ...champs,
            ...(input.publier && !dejaPubliee ? { date_publication: new Date().toISOString() } : {}),
          })
          .eq('id', input.id)
        if (error) throw new Error(error.message)
        return input.id
      }

      const { data, error } = await supabase
        .from('publications')
        .insert({
          ...champs,
          auteur_id: utilisateur.id,
          date_publication: input.publier ? new Date().toISOString() : null,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return (data as { id: string }).id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['publications'] })
    },
  })
}

export function useSupprimerPublication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // `actif = false` plutôt qu'un vrai effacement : une annonce retirée par erreur se récupère,
      // et les lectures déjà enregistrées ne partent pas avec elle.
      const { error } = await supabase.from('publications').update({ actif: false }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['publications'] })
    },
  })
}

export interface FichierDepose {
  chemin: string
  /** Adresse signée valable une heure — de quoi afficher l'image tout de suite après le dépôt. */
  url: string
  nom: string
}

/**
 * Dépose un fichier dans l'espace privé des nouveautés.
 *
 * Le nom est normalisé comme pour les documents (`useTeleverserDocuments`) : le chemin de stockage
 * supporte mal les accents et les espaces. L'horodatage évite qu'une capture nommée « ecran.png »
 * écrase celle d'une autre publication.
 */
export async function televerserFichierNouveaute(fichier: File): Promise<FichierDepose> {
  const nomSur = fichier.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
  const chemin = `${Date.now()}_${nomSur}`

  const { error } = await supabase.storage
    .from(BUCKET_NOUVEAUTES)
    .upload(chemin, fichier, { contentType: fichier.type || undefined, upsert: false })
  if (error) throw new Error(`« ${fichier.name} » : ${error.message}`)

  const urls = await signerChemins([chemin])
  return { chemin, url: urls[chemin] ?? '', nom: fichier.name }
}

/** Ouvre une pièce jointe : son adresse se signe au clic, elle n'est jamais stockée en clair. */
export async function ouvrirPieceJointe(chemin: string): Promise<void> {
  const urls = await signerChemins([chemin])
  const url = urls[chemin]
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Le contenu prêt à afficher : nettoyé, et dont les images privées portent une adresse valide.
 *
 * Les adresses signées vivent une heure ; le cache est gardé cinquante minutes pour ne pas
 * resigner à chaque rendu tout en laissant dix minutes de marge.
 */
export function useContenuAffichable(html: string) {
  const chemins = useMemo(() => cheminsPrives(html), [html])

  const { data: urls } = useQuery({
    queryKey: ['publications', 'urls-signees', ...chemins],
    queryFn: () => signerChemins(chemins),
    enabled: chemins.length > 0,
    staleTime: 50 * 60 * 1000,
  })

  return useMemo(
    () => injecterUrlsSignees(nettoyerHtml(html), urls ?? {}),
    [html, urls],
  )
}

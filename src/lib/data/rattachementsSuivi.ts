import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * TOUT CE QUE LA FICHE DE SUIVI MONTRE DE SES RATTACHEMENTS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « le but étant que Fabien, qui utilise ces enregistrements, puisse avoir
 * toutes les informations centralisées au même endroit ».
 *
 * ══ UNE LECTURE À PART, ET NON UN ÉLARGISSEMENT DE `useSuiviContrat` ══
 *
 * La liste des suivis lit 1 583 lignes. Y ajouter les pièces jointes, le périmètre et les
 * coordonnées du contact ferait payer à cette liste ce dont seule la fiche a besoin. Ici, tout est
 * lu pour UN suivi, et seulement quand on ouvre l'onglet.
 *
 * ══ CE QUI VIENT D'OÙ ══
 *
 *   le contrat        `contrats`, avec son énergie et son fournisseur nommés
 *   le périmètre      `v_perimetre_contrat` — la vue porte la règle captation / renouvellement
 *   les pièces        `documents`, pour le contrat ET pour chaque compteur
 *   le contact        `contacts`, coordonnées et rôles compris
 */

export interface PieceJointeSuivi {
  id: string
  nom: string
  nom_fichier: string | null
  url: string
  taille_octets: number | null
  date_creation: string
  /** L'objet auquel elle est attachée : le contrat, ou l'un des compteurs. */
  entite_id: string
}

export interface CompteurDuContrat {
  compteur_id: string
  numero_point: string
  libelle: string | null
  libelle_site: string | null
  consommation_annuelle_mwh: number | null
  date_echeance: string | null
  energie_code: string | null
  energie_libelle: string | null
  fournisseur_nom: string | null
  /** Un contrat antérieur portait déjà ce compteur : c'est ce qui fait le renouvellement. */
  deja_client: boolean
  pieces: PieceJointeSuivi[]
}

export interface ContratDuSuivi {
  id: string
  reference: string | null
  energie_code: string | null
  energie_libelle: string | null
  date_signature: string | null
  date_debut: string | null
  duree_mois: number | null
  date_fin: string | null
  fournisseur_nom: string | null
  fournisseur_compte_id: string | null
  pieces: PieceJointeSuivi[]
}

export interface ContactDuSuivi {
  id: string
  civilite: string | null
  prenom: string | null
  nom: string
  fonction: string | null
  roles: string[]
  telephone: string | null
  telephone_mobile: string | null
  email: string | null
}

/* PLUS DE RECOMMANDATION ICI. Elle avait sa carte ; William l'a retirée le 25/09/2026 — « la card
   recommandation est inutile ». On cesse donc aussi de la LIRE : une requête dont plus rien
   n'affiche le résultat est une requête de trop sur chaque ouverture de fiche. Le suivi garde son
   `recommandation_id`, et la fiche de la recommandation reste à un clic depuis le contrat. */

export interface RattachementsSuivi {
  contrat: ContratDuSuivi | null
  compteurs: CompteurDuContrat[]
  contact: ContactDuSuivi | null
  /**
   * `null` quand le contrat ne porte AUCUN compteur — 43 suivis sur 1 583 au 25/09/2026. Les
   * compter en captation par défaut serait une affirmation qu'on ne peut pas soutenir.
   */
  renouvellement: boolean | null
}

interface Entree {
  suiviId: string | undefined
  contratId: string | undefined
  contactId: string | null | undefined
}

async function lire({ contratId, contactId }: Entree): Promise<RattachementsSuivi> {
  const vide: RattachementsSuivi = {
    contrat: null, compteurs: [], contact: null, renouvellement: null,
  }
  if (!contratId) return vide

  /* ══ LE FOURNISSEUR SE NOMME PAR SA CONTRAINTE ══
     `contrats` a DEUX clés étrangères vers `comptes` — `compte_id` et `fournisseur_compte_id`.
     Un embed `comptes(nom)` est refusé par PostgREST (PGRST201, « more than one relationship »),
     et c'est l'erreur qui avait fait taire le message Slack « deal gagné » le 24/09/2026. */
  const [contratRes, perimetreRes, contactRes] = await Promise.all([
    supabase
      .from('contrats')
      .select(
        'id, reference, date_signature, date_debut, duree_mois, date_fin, fournisseur_compte_id,'
        + ' type_energie:types_energies(code, libelle),'
        + ' fournisseur:comptes!contrats_fournisseur_compte_id_fkey(nom)',
      )
      .eq('id', contratId)
      .maybeSingle(),
    supabase.from('v_perimetre_contrat').select('*').eq('contrat_id', contratId),
    contactId
      ? supabase
          .from('contacts')
          .select('id, civilite, prenom, nom, fonction, roles, telephone, telephone_mobile, email')
          .eq('id', contactId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  /* AUCUN ÉCHEC MUET. Une lecture qui rate rend une carte vide, et une carte vide se lit comme
     « il n'y a rien » — ce qui est faux, et coûte un appel au fournisseur pour rien. */
  for (const [quoi, res] of [
    ['contrat', contratRes], ['périmètre', perimetreRes], ['contact', contactRes],
  ] as const) {
    if (res.error) console.error(`rattachementsSuivi — ${quoi}`, res.error)
  }

  const lignes = (perimetreRes.data ?? []) as Omit<CompteurDuContrat, 'pieces'>[]

  /* Les pièces du contrat et celles de tous ses compteurs en UNE lecture : un contrat de quinze
     compteurs ferait sinon seize allers-retours pour afficher une seule carte. */
  const idsCompteurs = lignes.map((l) => l.compteur_id)
  const { data: docs, error: erreurDocs } = await supabase
    .from('documents')
    .select('id, nom, nom_fichier, url, taille_octets, date_creation, entite_id, entite_type')
    .eq('actif', true)
    .in('entite_id', [contratId, ...idsCompteurs])
    .in('entite_type', ['contrat', 'compteur'])
    .order('date_creation', { ascending: false })
  if (erreurDocs) console.error('rattachementsSuivi — pièces jointes', erreurDocs)

  const pieces = (docs ?? []) as (PieceJointeSuivi & { entite_type: string })[]
  const piecesDe = (id: string, type: string) => pieces.filter((p) => p.entite_id === id && p.entite_type === type)

  const brutContrat = contratRes.data as {
    id: string; reference: string | null; date_signature: string | null; date_debut: string | null
    duree_mois: number | null; date_fin: string | null; fournisseur_compte_id: string | null
    type_energie: { code: string; libelle: string } | null
    fournisseur: { nom: string } | null
  } | null

  return {
    contrat: brutContrat
      ? {
          id: brutContrat.id,
          reference: brutContrat.reference,
          energie_code: brutContrat.type_energie?.code ?? null,
          energie_libelle: brutContrat.type_energie?.libelle ?? null,
          date_signature: brutContrat.date_signature,
          date_debut: brutContrat.date_debut,
          duree_mois: brutContrat.duree_mois,
          date_fin: brutContrat.date_fin,
          fournisseur_nom: brutContrat.fournisseur?.nom ?? null,
          fournisseur_compte_id: brutContrat.fournisseur_compte_id,
          pieces: piecesDe(brutContrat.id, 'contrat'),
        }
      : null,
    compteurs: lignes.map((l) => ({ ...l, pieces: piecesDe(l.compteur_id, 'compteur') })),
    contact: (contactRes.data as ContactDuSuivi | null) ?? null,
    renouvellement: lignes.length === 0 ? null : lignes.some((l) => l.deja_client),
  }
}

export function useRattachementsSuivi(entree: Entree) {
  return useQuery({
    queryKey: ['suivi-contrat', 'rattachements', entree.suiviId, entree.contratId, entree.contactId],
    enabled: Boolean(entree.contratId),
    staleTime: 60 * 1000,
    queryFn: () => lire(entree),
  })
}

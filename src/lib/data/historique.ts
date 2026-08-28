import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface HistoriqueEntry {
  id: string
  champ: string
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  date_modification: string
  modifie_par_nom: string | null
  /**
   * QUI A FAIT QUOI, MEME QUAND CE N'ETAIT PERSONNE.
   *
   * 122 033 des 122 427 lignes d'historique n'ont pas d'auteur : le declencheur ecrit
   * `auth.uid()`, qui vaut NULL des qu'une migration, un script ou le webhook ecrit. L'ecran
   * affichait alors « Auteur inconnu », qui se lit comme un bug alors que c'est un fait — ce
   * n'etait personne. La colonne `origine` dit quoi : « migration 20260828190000 », « systeme ».
   */
  origine: string | null
  /** Ce qu'on affiche : le nom si on l'a, l'origine sinon. Jamais vide. */
  auteur: string
}

interface RawHistorique {
  id: string
  champ: string
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  date_modification: string
  origine: string | null
  modifie_par: { prenom: string; nom: string } | null
}

const CHAMPS_IGNORES = new Set(['date_modification', 'modifie_par_id', 'cree_par_id'])

/**
 * Le nom a afficher devant une ligne d'historique.
 *
 * Trois cas, et aucun ne doit produire un blanc :
 *  · une personne  -> son nom ;
 *  · une migration -> « Migration du 28/08/2026 », lisible plutot que l'horodatage brut du fichier ;
 *  · le reste      -> « Kimatch », qui est vrai : c'est l'application qui a ecrit, pas quelqu'un.
 */
function nommerAuteur(h: RawHistorique): string {
  if (h.modifie_par) return `${h.modifie_par.prenom} ${h.modifie_par.nom}`
  const o = h.origine ?? ''
  const migration = o.match(/^migration (\d{4})(\d{2})(\d{2})/)
  if (migration) {
    const [, a, m, j] = migration
    return `Migration du ${j}/${m}/${a}`
  }
  if (o && o !== 'systeme') return o
  return 'Kimatch'
}

async function fetchHistorique(tableNom: string, ligneId: string): Promise<HistoriqueEntry[]> {
  if (!ligneId) return []
  const { data, error } = await supabase
    .from('historique_modifications')
    .select('id, champ, ancienne_valeur, nouvelle_valeur, date_modification, origine, modifie_par:profils(prenom, nom)')
    .eq('table_nom', tableNom)
    .eq('ligne_id', ligneId)
    .order('date_modification', { ascending: false })
    .limit(50)
  if (error || !data) return []
  return (data as unknown as RawHistorique[])
    .filter((h) => !CHAMPS_IGNORES.has(h.champ))
    .map((h) => ({
      id: h.id,
      champ: h.champ,
      ancienne_valeur: h.ancienne_valeur,
      nouvelle_valeur: h.nouvelle_valeur,
      date_modification: h.date_modification,
      modifie_par_nom: h.modifie_par ? `${h.modifie_par.prenom} ${h.modifie_par.nom}` : null,
      origine: h.origine,
      auteur: nommerAuteur(h),
    }))
}

export function useHistorique(tableNom: string, ligneId: string | undefined) {
  return useQuery({
    queryKey: ['historique', tableNom, ligneId],
    queryFn: () => fetchHistorique(tableNom, ligneId ?? ''),
    enabled: !!ligneId,
  })
}

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
  /**
   * VRAI seulement quand une PERSONNE a fait la modification.
   *
   * Naoëlle, 29/08/2026 : « Kimatch n'est pas un utilisateur — si tu dis Kimatch a changé ça, nous
   * de notre côté on sait pas qui c'est, des 10 personnes travaillant chez KiWee, qui a modifié ».
   * Elle a raison, et « Kimatch » etait un mauvais mot : il ressemble à un nom, donc il se lit
   * comme un nom, alors qu'il designe l'absence de nom.
   *
   * Ce drapeau permet a l'ecran de traiter les deux cas differemment au lieu de les confondre :
   * une personne a des initiales et un nom, un traitement a un pictogramme et une etiquette.
   */
  estUnePersonne: boolean
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
 * Trois cas, et aucun ne doit se faire passer pour un autre :
 *  · une personne  -> son nom, et lui seul ;
 *  · une migration -> « Migration du 28/08/2026 » ;
 *  · le reste      -> « Traitement automatique ».
 *
 * SURTOUT PAS « Kimatch » : c'etait mon premier choix et il etait mauvais. Le mot ressemble a un
 * nom propre, donc il se lit comme quelqu'un — alors qu'il designe precisement le contraire.
 * Sur 122 428 lignes d'historique, 122 033 viennent des imports et des migrations : par paquets de
 * 10 000 a 35 000 en une seule journee, sur six tables a la fois. Personne ne les a faites a la
 * main, et aucun nom ne peut etre invente pour elles. Les 395 restantes, elles, portent bien le nom
 * de la personne — Matthieu 219, Naoelle 79, Michel 50, Fabien 26, Thomas 13, William 6, Marie 2.
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
  return 'Traitement automatique'
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
      estUnePersonne: h.modifie_par != null,
    }))
}

export function useHistorique(tableNom: string, ligneId: string | undefined) {
  return useQuery({
    queryKey: ['historique', tableNom, ligneId],
    queryFn: () => fetchHistorique(tableNom, ligneId ?? ''),
    enabled: !!ligneId,
  })
}

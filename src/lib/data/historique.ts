import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface HistoriqueEntry {
  id: string
  champ: string
  /** Le nom du champ en francais : « statut » plutot que « statut_id ». */
  champ_libelle: string
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
  ancienne_lisible: string | null
  nouvelle_lisible: string | null
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

/**
 * LE NOM DU CHAMP, EN FRANCAIS.
 *
 * Une poignee de cas ou le nom technique ne se devine pas, et une regle generale pour tout le
 * reste : retirer le `_id` final, remplacer les tirets bas par des espaces. Un champ ajoute demain
 * sera donc deja presque lisible sans qu'on touche a cette liste — c'est le but, une liste
 * exhaustive tenue a la main aurait vieilli des le lendemain.
 */
const LIBELLES_CHAMPS: Record<string, string> = {
  etape_id: 'étape',
  statut_id: 'statut',
  statut_vie_id: 'état du contrat',
  statut_avancement_id: 'avancement',
  statut_version_id: 'statut de la version',
  proprietaire_id: 'propriétaire',
  cree_par_id: 'créé par',
  responsable_profil_id: 'responsable',
  auteur_profil_id: 'auteur',
  contact_signataire_id: 'signataire',
  fournisseur_compte_id: 'fournisseur',
  type_energie_id: 'énergie',
  consommation_annuelle_mwh: 'consommation annuelle (MWh)',
  prix_molecule_eur_mwh: 'prix molécule (€/MWh)',
  preavis_resiliation_jours: 'préavis de résiliation (jours)',
  numero_point: 'point de livraison',
  date_echeance: 'échéance',
  synchro_eneo: 'synchronisation Enedis',
  date_derniere_synchro_eneo: 'dernière synchronisation Enedis',
  finalite_cloture: 'finalité de clôture',
  version_actuelle: 'version actuelle',
}

function libelleDuChamp(champ: string): string {
  return LIBELLES_CHAMPS[champ] ?? champ.replace(/_id$/, '').replace(/_/g, ' ')
}

/**
 * LA VALEUR, TELLE QU'ON LA LIT.
 *
 * Les identifiants sont deja resolus par la vue. Restent les formats bruts de Postgres, qui se
 * lisent mal : `2026-08-28T13:48:26.131+00:00` et `true`. Un historique qu'on doit dechiffrer
 * n'est pas consulte.
 */
function presenter(champ: string, valeur: string | null): string | null {
  if (valeur == null || valeur === '') return valeur
  if (valeur === 'true') return 'oui'
  if (valeur === 'false') return 'non'

  const horodatage = valeur.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (horodatage) {
    const [, a, m, j, hh, mm] = horodatage
    // Une date d'echeance ou de signature se lit sans l'heure ; un horodatage d'evenement la garde.
    return champ.startsWith('date_') && hh === '00' && mm === '00' ? `${j}/${m}/${a}` : `${j}/${m}/${a} ${hh}:${mm}`
  }
  const dateSeule = valeur.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateSeule) {
    const [, a, m, j] = dateSeule
    return `${j}/${m}/${a}`
  }
  return valeur
}

async function fetchHistorique(tableNom: string, ligneId: string): Promise<HistoriqueEntry[]> {
  if (!ligneId) return []
  const { data, error } = await supabase
    // LA VUE, PAS LA TABLE : elle resout les identifiants en libelles cote base, en suivant les
    // cles etrangeres. « statut_id : 57db1d85… -> 0f04d925… » y arrive deja ecrit
    // « Nouveau -> Converti ». Le faire ici aurait demande une liste de correspondances a tenir
    // a jour a la main, qui aurait vieilli au premier ajout de colonne.
    .from('v_historique_modifications')
    .select('id, champ, ancienne_valeur, nouvelle_valeur, ancienne_lisible, nouvelle_lisible, date_modification, origine, modifie_par:profils(prenom, nom)')
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
      champ_libelle: libelleDuChamp(h.champ),
      ancienne_valeur: presenter(h.champ, h.ancienne_lisible ?? h.ancienne_valeur),
      nouvelle_valeur: presenter(h.champ, h.nouvelle_lisible ?? h.nouvelle_valeur),
      date_modification: h.date_modification,
      modifie_par_nom: h.modifie_par ? `${h.modifie_par.prenom} ${h.modifie_par.nom}` : null,
      origine: h.origine,
      auteur: nommerAuteur(h),
      estUnePersonne: h.modifie_par != null,
    }))
}

/**
 * @param actif Ne demander l'historique que lorsqu'on le regarde. La fiche d'un compte ouvre neuf
 *              onglets et n'en montre qu'un : chargé d'office, l'historique coûtait **1 932 ms**
 *              sur CABINET MICHAU — mesuré le 31/08/2026, la requête la plus lente de la page —
 *              pour un onglet que personne n'avait ouvert. La table compte 122 683 lignes.
 *              Vaut `true` par défaut : les appelants qui affichent l'historique d'emblée n'ont
 *              rien à changer.
 */
export function useHistorique(tableNom: string, ligneId: string | undefined, actif = true) {
  return useQuery({
    queryKey: ['historique', tableNom, ligneId],
    queryFn: () => fetchHistorique(tableNom, ligneId ?? ''),
    enabled: !!ligneId && actif,
  })
}

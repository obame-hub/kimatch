import { supabase } from '@/lib/supabase'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE LE COMMERCIAL A RETENU, CONFRONTÉ À CE QUE LA FACTURE A DONNÉ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 29/09/2026 : « Tu dois apprendre des corrections apportées par les commerciaux afin
 * d'être de plus en plus performant sur les extractions propres à chaque modèle de facture. »
 *
 * À chaque compteur créé depuis une facture, une observation par champ appris — y compris quand la
 * lecture était juste : c'est ce qui permet à `v_lecons_extraction` de distinguer une correction
 * systématique d'un accident. L'API de lecture s'en sert ensuite (`api/ocr/_apprentissage.ts`).
 *
 * SEULEMENT DES CODES : énergie, fournisseur, segment, tension, utilisation, tarif, profil. Jamais
 * un PDL, une adresse ou une date — voir la migration `la_lecture_des_factures_apprend_des_corrections`.
 */

export type ChampAppris =
  | 'type_energie' | 'fournisseur_nom' | 'segment' | 'tension' | 'type_utilisation'
  | 'tarif_distribution' | 'profil_consommation'

/** La même clé que côté serveur (`normaliserFournisseur`) : les deux doivent désigner le même modèle. */
export function normaliserFournisseur(nom: unknown): string {
  if (nom == null) return ''
  return String(nom)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

const code = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).toUpperCase().replace(/\s+/g, ''))

/**
 * Enregistre les observations d'un compteur. Sans `await` bloquant chez l'appelant : c'est un
 * enrichissement, le compteur est déjà créé et un échec ici ne doit rien lui retirer.
 */
export async function enregistrerObservations({ compteurId, modele, lu, retenu }: {
  compteurId: string
  /** Le fournisseur tel que la facture le nomme, normalisé. */
  modele: string
  /** Ce que la lecture a donné, champ par champ (avant toute correction apprise). */
  lu: Partial<Record<ChampAppris, unknown>>
  /** Ce que le commercial a enregistré. */
  retenu: Partial<Record<ChampAppris, unknown>>
}): Promise<void> {
  const lignes = (Object.keys(retenu) as ChampAppris[]).flatMap((champ) => {
    const estFournisseur = champ === 'fournisseur_nom'
    const valeurRetenue = estFournisseur ? normaliserFournisseur(retenu[champ]) || null : code(retenu[champ])
    /* RIEN DE RETENU, RIEN À APPRENDRE : un champ laissé vide ne dit pas ce que la facture portait. */
    if (!valeurRetenue) return []
    const valeurLue = estFournisseur ? modele || null : code(lu[champ])
    return [{
      compteur_id: compteurId,
      fournisseur_lu: modele,
      champ,
      valeur_lue: champ === 'type_energie' ? valeurLue?.toLowerCase() ?? null : valeurLue,
      valeur_retenue: champ === 'type_energie' ? valeurRetenue.toLowerCase() : valeurRetenue,
    }]
  })
  if (lignes.length === 0) return
  const { data: session } = await supabase.auth.getUser()
  const moi = session.user?.id
  if (!moi) return
  await supabase.from('extraction_observations').insert(lignes.map((l) => ({ ...l, cree_par_id: moi })))
}

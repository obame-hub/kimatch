/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE LA LECTURE DES FACTURES A APPRIS DES COMMERCIAUX
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 29/09/2026 : « Pour le P012, il est possible que ce soit renseigné P12 dans la facture.
 * Pour le P017, P17. […] Tu dois apprendre des corrections apportées par les commerciaux afin d'être
 * de plus en plus performant sur les extractions propres à chaque modèle de facture des
 * fournisseurs. »
 *
 * Trois étages, du plus sûr au plus souple :
 *
 *   1. LES ÉCRITURES CONNUES, réglées une fois pour toutes (`normaliserLecture`) : « P12 » est le
 *      profil P012, « T 2 » le tarif T2. Pas besoin d'attendre qu'un commercial corrige.
 *   2. LES LEÇONS SÛRES (`appliquerLeconsSures`) : chez un fournisseur donné, une lecture que les
 *      commerciaux ont corrigée de la même façon au moins deux fois, et deux fois sur trois, est
 *      corrigée d'office.
 *   3. TOUTES LES LEÇONS (`consignesApprises`) sont données à lire au modèle, fournisseur par
 *      fournisseur, avant la facture.
 *
 * Les leçons viennent de `v_lecons_extraction`, alimentée à chaque compteur créé depuis une facture
 * (`src/lib/data/apprentissageExtraction.ts`). Elles ne portent que des CODES — énergie, segment,
 * tension, utilisation, tarif, profil, nom du fournisseur — jamais une donnée de client : elles
 * partent chez Anthropic avec la facture d'un autre client.
 */

export interface ChampLu {
  value: string | number | null
  confidence: number
  /** La valeur lue avant une correction apprise — c'est elle que l'observation enregistrera. */
  lu?: string | number | null
  /** La leçon qui a corrigé la lecture, dite en clair pour l'écran. */
  appris?: string
}

export interface Lecon {
  fournisseur_lu: string
  champ: string
  valeur_lue: string | null
  valeur_retenue: string
  nb: number
  total: number
  sure: boolean
}

/** Le fournisseur tel que la facture le nomme, sous la forme qui sert de clé au modèle de facture.
 *  La même transformation que côté navigateur : les deux doivent donner la même clé. */
export function normaliserFournisseur(nom: unknown): string {
  if (nom == null) return ''
  return String(nom)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

const CODE = (v: unknown) => (v == null ? '' : String(v).toUpperCase().replace(/\s+/g, ''))

/** ══ 1. LES ÉCRITURES CONNUES ══ */
export function normaliserLecture(champs: Record<string, ChampLu>): Record<string, ChampLu> {
  const sortie = { ...champs }
  const remplacer = (cle: string, valeur: string | null) => {
    if (!sortie[cle] || valeur == null) return
    sortie[cle] = { ...sortie[cle], value: valeur }
  }

  /* LE PROFIL GAZ : P011 à P019. Les factures écrivent souvent « P12 », « P 012 », « P-17 ». */
  const profil = CODE(sortie.profil_consommation?.value).replace(/-/g, '')
  const mProfil = profil.match(/^P0?1([1-9])$/)
  if (mProfil) remplacer('profil_consommation', `P01${mProfil[1]}`)

  /* LE TARIF D'ACHEMINEMENT GAZ : T1 à T4 (et TP), parfois « T 2 » ou « Tarif T2 ». */
  const tarif = CODE(sortie.tarif_distribution?.value).replace(/^TARIF/, '')
  const mTarif = tarif.match(/^T([1-4P])$/)
  if (mTarif) remplacer('tarif_distribution', `T${mTarif[1]}`)

  for (const cle of ['segment', 'tension', 'type_utilisation']) {
    const v = CODE(sortie[cle]?.value)
    if (v) remplacer(cle, v)
  }

  const energie = CODE(sortie.type_energie?.value).normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (energie.startsWith('ELEC')) remplacer('type_energie', 'electricite')
  else if (energie.startsWith('GAZ')) remplacer('type_energie', 'gaz')

  return sortie
}

/** Lit les leçons au nom de l'appelant : la vue suit les droits de la table (équipe seulement). */
export async function lireLecons(authHeader: string): Promise<Lecon[]> {
  const url = process.env.VITE_SUPABASE_URL
  const cle = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !cle) return []
  try {
    const r = await fetch(`${url}/rest/v1/v_lecons_extraction?select=*&order=nb.desc&limit=120`, {
      headers: { apikey: cle, Authorization: authHeader },
    })
    if (!r.ok) return []
    return (await r.json()) as Lecon[]
  } catch {
    /* SANS LEÇONS, LA LECTURE CONTINUE : elles améliorent la lecture, elles ne la conditionnent pas. */
    return []
  }
}

const LIBELLES: Record<string, string> = {
  type_energie: 'énergie',
  fournisseur_nom: 'nom du fournisseur',
  segment: 'segment',
  tension: 'tension',
  type_utilisation: 'plage d’utilisation',
  tarif_distribution: 'tarif d’acheminement',
  profil_consommation: 'profil de consommation',
}

/** ══ 3. LES CONSIGNES, POUR LE MODÈLE ══ */
export function consignesApprises(lecons: Lecon[]): string {
  if (lecons.length === 0) return ''
  const parFournisseur = new Map<string, string[]>()
  for (const l of lecons.slice(0, 60)) {
    const f = l.fournisseur_lu || 'FOURNISSEUR NON LU'
    const ligne = l.valeur_lue == null
      ? `- ${l.champ} : souvent laissé vide alors que les commerciaux y ont retenu « ${l.valeur_retenue} » (${l.nb} fois) — cherche-le sur ce modèle de facture.`
      : `- ${l.champ} : lu « ${l.valeur_lue} », les commerciaux ont retenu « ${l.valeur_retenue} » (${l.nb} fois sur ${l.total}).`
    parFournisseur.set(f, [...(parFournisseur.get(f) ?? []), ligne])
  }
  const blocs = [...parFournisseur].map(([f, lignes]) => `Factures ${f} :\n${lignes.join('\n')}`)
  return `\n\nCorrections apportées par les commerciaux sur les lectures précédentes, par fournisseur. Applique celles du fournisseur de CE document quand la situation se présente ; ignore les autres :\n${blocs.join('\n\n')}`
}

/** ══ 2. LES LEÇONS SÛRES, APPLIQUÉES D'OFFICE ══ */
export function appliquerLeconsSures(champs: Record<string, ChampLu>, lecons: Lecon[]): Record<string, ChampLu> {
  const modele = normaliserFournisseur(champs.fournisseur_nom?.value)
  const sortie = { ...champs }
  for (const l of lecons) {
    /* UNE LECTURE VIDE NE SE COMBLE PAS D'OFFICE : « non lu, retenu T2 » dit que la valeur est sur
       la facture, pas qu'elle vaut T2 pour tous les clients de ce fournisseur. Elle reste une
       consigne donnée au modèle. */
    if (!l.sure || l.valeur_lue == null || l.fournisseur_lu !== modele) continue
    const actuel = sortie[l.champ]
    const lu = l.champ === 'fournisseur_nom'
      ? modele
      : actuel?.value == null || actuel.value === '' ? null : String(actuel.value)
    if (lu !== l.valeur_lue) continue
    sortie[l.champ] = {
      value: l.valeur_retenue,
      confidence: Math.max(actuel?.confidence ?? 0, 0.8),
      lu,
      appris: `Corrigé d’après ${l.nb} saisie${l.nb > 1 ? 's' : ''} sur les factures ${l.fournisseur_lu} (${LIBELLES[l.champ] ?? l.champ}).`,
    }
  }
  return sortie
}

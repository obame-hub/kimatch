import type { Chiffrage, CompteurChiffrage, OffreChiffrage, SaisieLigne } from '@/lib/data/chiffrage'
import { SAISIE_VIDE } from '@/lib/data/chiffrage'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * D'UNE PROPOSITION LUE À UNE LIGNE DU PRICER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `api/ocr/extraire-offre` rend ce que le fournisseur a imprimé, tel quel. Ici, Kimatch en fait une
 * ligne du tableau — les règles de William, 02/10/2026, sur l'offre Gaz Européen de CAPTA :
 *
 *   · LA LIGNE : le fournisseur, la DURÉE lue en tête (« 36 mois ») et le type de prix ; le compteur
 *     par son PCE / PDL. Le pricing peut toujours en choisir une autre.
 *   · LE P0 IMPRIMÉ PORTE LA MARGE (55,01 dont 6 €/MWh) : le prix fournisseur est P0 − marge, et la
 *     marge se range dans sa case. Le tableau remontre 55,01 (P0 + marge, `ChiffrageVersion`). En
 *     électricité, la marge est dans le prix de chaque poste (Pointe, HPH, HCH, HPE, HCE).
 *     LA MARGE INCLUSE SE DEMANDE à chaque offre : « ça peut changer selon les dossiers ».
 *   · LA VALIDITÉ ne se lit pas : le pricing la saisit.
 *   · L'ABONNEMENT ANNUEL (4 487,96 €/an) se range au mois pour la case, l'annuel restant exact.
 *   · LES CEE : classiques + précarité (7,03 + 4,52 = 11,55).
 */

export interface OffreLue {
  numero_point: string | null
  duree_mois: number | null
  type_prix: 'Fixe' | 'Indexé' | null
  car_mwh: number | null
  profil: string | null
  p0_mwh: number | null
  prix_postes_mwh: Record<string, number>
  capacite_mwh: number | null
  abonnement_annuel: number | null
  abonnement_imprime: { montant: number; periode: 'an' | 'mois' } | null
  cee_classiques_mwh: number | null
  cee_precarite_mwh: number | null
  cee_mwh: number | null
}

export interface PropositionLue {
  fournisseur_nom: string | null
  type_energie: 'gaz' | 'electricite' | null
  reference_offre: string | null
  client: string | null
  date_prise_effet: string | null
  offres: OffreLue[]
  remarques: string | null
  /** La marge que la source dit avoir mise dans ses prix — Tradeo cote avec la marge de sa
   *  calculatrice (05/10/2026). Proposée dans la case, le pricing la confirme. Absente d'un PDF. */
  marge_incluse_proposee?: number | null
  /** D'où vient la proposition : un document lu par l'IA (par défaut), ou l'API Tradeo. */
  source?: 'IA' | 'TRADEO'
}

const auDixMillieme = (n: number) => Math.round(n * 10000) / 10000

/** « Gaz Européen », « GAZ EUROPEEN », « Gaz-Européen SAS » : la même clé. */
export function cleFournisseur(nom: string | null | undefined): string {
  return (nom ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b(SAS|SA|SASU|SARL)\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
}

const memeFournisseur = (a: string | null | undefined, b: string | null | undefined) => {
  const x = cleFournisseur(a)
  const y = cleFournisseur(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}

export const clePoint = (n: string | null | undefined) => (n ?? '').replace(/\s+/g, '').toUpperCase()
const estIndexe = (type: string | null | undefined) => /^index/i.test(type ?? '')

export interface Rapprochement {
  compteur: CompteurChiffrage | null
  offre: OffreChiffrage | null
  /** Ce que le pricing doit savoir avant d'inclure : rien n'est caché. */
  alerteCompteur: string | null
  alerteOffre: string | null
}

/** La ligne du tableau que cette offre lue vient remplir. */
export function rapprocher(chiffrage: Chiffrage, p: PropositionLue, lue: OffreLue): Rapprochement {
  const point = p.type_energie === 'electricite' ? 'PDL' : 'PCE'
  let alerteCompteur: string | null = null
  let compteur = chiffrage.compteurs.find((c) => clePoint(c.numero) === clePoint(lue.numero_point)) ?? null
  if (!compteur) {
    const candidats = chiffrage.compteurs.filter((c) => !p.type_energie || c.energie === p.type_energie)
    if (candidats.length === 1) {
      compteur = candidats[0]
      alerteCompteur = lue.numero_point
        ? `Le ${point} lu (${lue.numero_point}) n’est pas celui du compteur ${compteur.numero}.`
        : `Aucun ${point} lu : rattachée au seul compteur de la version.`
    } else {
      alerteCompteur = lue.numero_point ? `Le ${point} ${lue.numero_point} n’est pas dans le périmètre de cette version.` : `Aucun ${point} lu : choisissez le compteur.`
    }
  }

  const duFournisseur = chiffrage.offres.filter((o) => memeFournisseur(o.fournisseurNom, p.fournisseur_nom))
  const offre = duFournisseur.find((o) => o.duree === lue.duree_mois && estIndexe(o.type) === (lue.type_prix === 'Indexé')) ?? null
  const alerteOffre = offre
    ? null
    : !duFournisseur.length
      ? `${p.fournisseur_nom ?? 'Ce fournisseur'} n’a pas de ligne commandée sur cette version : choisissez la ligne.`
      : `Aucune ligne ${p.fournisseur_nom ?? ''} ${lue.duree_mois ?? '?'} mois ${lue.type_prix ?? ''} commandée : choisissez la ligne.`.replace(/\s+/g, ' ')
  return { compteur, offre, alerteCompteur, alerteOffre }
}

/** Ce que la ligne portera une fois l'offre incluse — le reste de la saisie (CPB…) ne bouge pas. */
export function saisieDepuisLecture(compteur: CompteurChiffrage, lue: OffreLue, margeIncluse: number, existante?: SaisieLigne): SaisieLigne {
  const s: SaisieLigne = { ...SAISIE_VIDE, ...existante, p0Postes: { ...(existante?.p0Postes ?? {}) } }
  s.marge = margeIncluse
  if (lue.abonnement_annuel != null) s.abonnementMois = lue.abonnement_annuel / 12
  if (lue.cee_mwh != null) s.cee = lue.cee_mwh
  if (compteur.energie === 'gaz') {
    if (lue.p0_mwh != null) s.p0 = auDixMillieme(lue.p0_mwh - margeIncluse)
  } else {
    for (const [poste, prix] of Object.entries(lue.prix_postes_mwh)) s.p0Postes[poste] = auDixMillieme(prix - margeIncluse)
    if (lue.capacite_mwh != null) s.capacite = lue.capacite_mwh
  }
  return s
}

/** Une ligne qui porte déjà au moins un prix : l'inclure les remplacera. */
export function dejaChiffree(s: SaisieLigne | undefined): boolean {
  if (!s) return false
  return [s.abonnementMois, s.p0, s.cee, s.capacite].some((x) => x != null) || Object.values(s.p0Postes).some((x) => x != null)
}

/* ══ LA VALIDITÉ, SAISIE PAR LE PRICING ══
   Un champ « date et heure » parle l'heure de Paris (« 2026-10-02T16:00 ») ; la base range un instant. */
const deux = (n: number) => String(n).padStart(2, '0')
export function versSaisieLocale(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`
}
export function depuisSaisieLocale(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

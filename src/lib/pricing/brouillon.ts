import { CAPACITE_DEFAUT_MWH, lireNombre } from '@/lib/pricing/budget'
import type { SaisieLigne } from '@/lib/data/chiffrage'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES CASES D'UNE LIGNE DU PRICER — ce que montre la case, ce qui s'enregistre
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const fr2 = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export type Brouillon = Record<string, string>

/**
 * ══ LE PRIX SAISI EST MARGE INCLUSE — William, 06/10/2026 ══
 * « Les prix renseignés par le pricing (P0, Pointe, HPH, HCH, HPE, HCE) sont des prix avec la marge
 * incluse. Ce n'est que par la suite que le commercial pourra bouger la marge. Si je renseigne
 * 115 €/MWh avec une marge de 12 €/MWh, le prix hors marge est de 103 €/MWh. »
 * Une case P0 montre et reçoit donc le prix marge incluse ; ce qui s'enregistre reste le P0 hors marge
 * (115 − 12 = 103), avec la marge à côté — comme le faisait déjà la lecture des propositions
 * (`saisieDepuisLecture`). Les prix déjà en base gardent leur sens : la case montrait P0 + marge.
 * Changer la marge dans le Pricer garde le prix saisi (le fournisseur l'a coté ainsi) : c'est le P0
 * hors marge qui bouge. Le commercial, lui, bouge la marge sur un P0 fixe (« Générer l'offre »).
 */
const margeIncluse = (p0: number | null | undefined, marge: number | null | undefined) => (p0 == null ? null : p0 + (marge ?? 0))
/** Au millionième : une soustraction ne laisse pas traîner 102,99999999. */
const net = (x: number) => Math.round(x * 1e6) / 1e6

export function versBrouillon(s: SaisieLigne | undefined, postes: string[]): Brouillon {
  const x: SaisieLigne = s ?? { abonnementMois: null, marge: null, p0: null, cee: null, cpb: null, p0Postes: {}, capacite: null, inclus: [] }
  const b: Brouillon = { abonnementMois: fr2(x.abonnementMois), marge: fr2(x.marge), p0: fr2(margeIncluse(x.p0, x.marge)), cee: fr2(x.cee), cpb: fr2(x.cpb), capacite: fr2(x.capacite ?? CAPACITE_DEFAUT_MWH) }
  for (const p of postes) b[`p0_${p}`] = fr2(margeIncluse(x.p0Postes[p], x.marge))
  /* Ce que le P0 inclut, rangé dans le brouillon comme le reste : « TQD,CEE ». */
  b.inclus = (x.inclus ?? []).join(',')
  return b
}

/**
 * ══ UNE CASE QU'ON N'A PAS TOUCHÉE GARDE SON NOMBRE ══
 * 02/10/2026 : un abonnement de 4 487,96 €/an s'affiche 374,00 €/mois ; relu depuis la case, il
 * devenait 4 488,00 €/an dès qu'on modifiait une AUTRE case de la ligne. Une case dont le texte n'a
 * pas bougé rend donc le nombre d'origine, au centime de l'annuel près.
 */
export function depuisBrouillon(b: Brouillon, postes: string[], origine?: SaisieLigne, initial?: Brouillon): SaisieLigne {
  const intacte = (cle: string) => !!origine && !!initial && b[cle] === initial[cle]
  const lire = (cle: string, avant: number | null | undefined) => (intacte(cle) ? avant ?? null : lireNombre(b[cle]))
  const marge = lire('marge', origine?.marge)
  /* Le P0 hors marge d'une case : le prix marge incluse, moins la marge de la ligne. Case et marge
     intactes, le P0 d'origine revient tel quel. */
  const horsMarge = (cle: string, avant: number | null | undefined) => {
    if (intacte(cle)) {
      if (avant == null) return null
      return (marge ?? 0) === (origine?.marge ?? 0) ? avant : net(avant + (origine?.marge ?? 0) - (marge ?? 0))
    }
    const prix = lireNombre(b[cle])
    return prix == null ? null : net(prix - (marge ?? 0))
  }
  const p0Postes: Record<string, number | null> = {}
  for (const p of postes) p0Postes[p] = horsMarge(`p0_${p}`, origine?.p0Postes[p])
  return {
    abonnementMois: lire('abonnementMois', origine?.abonnementMois), marge, p0: horsMarge('p0', origine?.p0),
    cee: lire('cee', origine?.cee), cpb: lire('cpb', origine?.cpb), capacite: lire('capacite', origine?.capacite) ?? CAPACITE_DEFAUT_MWH, p0Postes,
    inclus: b.inclus ? b.inclus.split(',').filter(Boolean) : [],
  }
}


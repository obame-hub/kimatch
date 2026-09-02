/**
 * ══ LA COULEUR D'UN SCORE : ROUGE, ORANGE, JAUNE, VERT ══
 *
 * Naoëlle, 02/09/2026 : « faudrait changer le vert et le bleu, car ça ne donne pas d'urgence. Il
 * faudrait, pour la qualité du compte et pour le score Ellipro, du rouge, du orange, du jaune et du
 * vert selon le score. »
 *
 * ELLE A RAISON SUR LE FOND. Les deux héros de la fiche compte étaient l'un bleu, l'autre vert —
 * quelle que soit la note. Un compte à 12 et un compte à 95 se peignaient pareil : la couleur disait
 * DE QUOI on parle, jamais si c'était bon. Un tableau de bord dont les couleurs ne varient pas ne
 * hiérarchise rien, et il faut lire les chiffres un par un pour trier.
 *
 * ══ LES QUATRE SEUILS ══
 *
 *     0 à 39     rouge     rien n'est acquis, c'est là qu'on va d'abord
 *    40 à 59     orange    la moitié manque
 *    60 à 79     jaune     l'essentiel est là, il reste des trous
 *    80 à 100    vert      tenu
 *
 * POURQUOI CES BORNES ET PAS DES QUARTS ÉGAUX. Elles suivent le barème de la qualité, qui ne rend
 * que six valeurs par compteur : 0, 30, 50, 70, 80, 100. Un compteur sans contrat et sans échéance
 * mais avec un responsable vaut 30 — il doit être rouge, parce que l'essentiel manque. Un compteur
 * sans contrat mais avec échéance et responsable vaut 80 — il doit être vert, il n'y a plus qu'à
 * attendre l'échéance. Les seuils à 40 et 80 tombent donc exactement entre deux marches du barème,
 * là où le sens change ; des quarts égaux (25/50/75) auraient coupé au milieu d'une marche.
 *
 * Vérifié sur la production le 02/09/2026 : 1 352 comptes en rouge, 189 en orange, 140 en jaune,
 * 1 084 en vert. La répartition est franche parce que le portefeuille l'est.
 *
 * ══ LE MÊME BARÈME POUR ELLIPRO, RAMENÉ SUR CENT ══
 *
 * Ellipro note sur 10, dans le même sens — 10 est le meilleur. On multiplie par dix et on lit la
 * même échelle : deux scores côte à côte doivent se comparer d'un regard, et deux échelles
 * différentes sur la même ligne obligeraient à se rappeler laquelle est laquelle.
 */

export type NiveauScore = 'rouge' | 'orange' | 'jaune' | 'vert'

export interface TeinteScore {
  niveau: NiveauScore
  /** Ce que le niveau veut dire, en trois mots — pour l'infobulle et les lecteurs d'écran. */
  libelle: string
  /** Le fond du héro : un dégradé radial, comme les cartes d'origine. */
  fond: string
  /** L'ombre portée de la carte, dans la même famille. */
  ombre: string
  /** Les deux bouts du dégradé de l'anneau, du clair au soutenu. */
  anneau: [string, string]
  /** La couleur du halo décoratif. */
  halo: string
  /** Le texte de l'intitulé en capitales, assez clair pour rester lisible sur le fond. */
  intitule: string
}

const TEINTES: Record<NiveauScore, TeinteScore> = {
  rouge: {
    niveau: 'rouge',
    libelle: 'Rien n’est acquis',
    fond: 'radial-gradient(125% 130% at 6% 0%,#c0503a 0%,#8f2f1e 48%,#5c1b0f 100%)',
    ombre: '0 8px 24px rgba(92,27,15,.28)',
    anneau: ['#ffc9b8', '#ff8a6a'],
    halo: 'radial-gradient(circle,rgba(255,180,162,.26),transparent 70%)',
    intitule: '#f0bdae',
  },
  orange: {
    niveau: 'orange',
    libelle: 'La moitié manque',
    fond: 'radial-gradient(125% 130% at 6% 0%,#d1873a 0%,#a2601c 48%,#6b3d0d 100%)',
    ombre: '0 8px 24px rgba(107,61,13,.26)',
    anneau: ['#ffdfb4', '#ffb057'],
    halo: 'radial-gradient(circle,rgba(255,205,150,.26),transparent 70%)',
    intitule: '#f2d3ac',
  },
  jaune: {
    niveau: 'jaune',
    libelle: 'Il reste des trous',
    fond: 'radial-gradient(125% 130% at 6% 0%,#b9971e 0%,#8d7412 48%,#5c4a08 100%)',
    ombre: '0 8px 24px rgba(92,74,8,.24)',
    anneau: ['#f7e9a8', '#e0c34a'],
    halo: 'radial-gradient(circle,rgba(240,222,150,.24),transparent 70%)',
    intitule: '#eadfae',
  },
  vert: {
    niveau: 'vert',
    libelle: 'Tenu',
    fond: 'radial-gradient(125% 130% at 6% 0%,#189c78 0%,#0b5c48 48%,#07382c 100%)',
    ombre: '0 8px 24px rgba(7,56,44,.24)',
    anneau: ['#8fe6bd', '#3fc492'],
    halo: 'radial-gradient(circle,rgba(120,235,190,.24),transparent 70%)',
    intitule: '#9fdcc4',
  },
}

/** Le niveau d'un score sur cent. */
export function niveauScore(score: number): NiveauScore {
  if (score >= 80) return 'vert'
  if (score >= 60) return 'jaune'
  if (score >= 40) return 'orange'
  return 'rouge'
}

/** La teinte complète d'un score sur cent. */
export function teinteScore(score: number): TeinteScore {
  return TEINTES[niveauScore(score)]
}

/**
 * La teinte d'une note Ellipro, sur dix.
 *
 * `null` — un compte jamais interrogé — n'est PAS rouge : rouge dirait « mauvais » là où la vérité
 * est « inconnu ». On le peint dans le gris de l'absence, et le chiffre affiche un tiret.
 */
export function teinteEllipro(note: number | null): TeinteScore {
  if (note == null) {
    return {
      niveau: 'rouge',
      libelle: 'Jamais interrogé',
      fond: 'radial-gradient(125% 130% at 92% 0%,#5b6169 0%,#3d4249 48%,#24272b 100%)',
      ombre: '0 8px 24px rgba(36,39,43,.24)',
      anneau: ['#c9ced4', '#8e959d'],
      halo: 'radial-gradient(circle,rgba(200,206,212,.2),transparent 70%)',
      intitule: '#c2c7cd',
    }
  }
  return teinteScore(note * 10)
}

/** Les classes d'une pastille de score, pour les listes et les tableaux. */
export function pastilleScore(score: number): string {
  const n = niveauScore(score)
  if (n === 'vert') return 'bg-km-green-soft text-km-green'
  if (n === 'jaune') return 'bg-[#f7f0cf] text-[#7a6410]'
  if (n === 'orange') return 'bg-km-amber-soft text-km-amber'
  return 'bg-km-red-soft text-km-red'
}

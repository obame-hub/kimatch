import { rendreGabarit } from '@/lib/offrePdf/rendu'
import { vueOffre } from '@/lib/offrePdf/vue'
import type { DonneesOffrePdf } from '@/lib/offrePdf/types'
import modeleGaz from '@/lib/offrePdf/modeles/gaz.html?raw'
import modeleElec from '@/lib/offrePdf/modeles/elec.html?raw'

/**
 * LE DOCUMENT COMPLET, prêt à imprimer : les trois pages A4 de Claude Design, les polices embarquées,
 * aucune ressource extérieure — le serveur qui l'imprime n'a besoin d'aucun réseau. Les règles
 * d'impression sont celles du cahier de Claude Design (§ 2.1).
 *
 * ══ LA POLICE : INTER, AJUSTÉE SUR SAN FRANCISCO ══
 * Les PDF validés par William ont été imprimés sur Mac avec San Francisco, la police système d'Apple
 * (le lien vers Geist de la maquette n'était pas appliqué). San Francisco n'est ni libre ni présente sur
 * un serveur. Mesuré le 04/10/2026 sur les textes de la maquette : Inter s'en écarte de 3,5 % en
 * largeur en moyenne, Geist de 5,2 % ; Inter pose aussi sa ligne de base au même endroit. Le reste
 * de l'écart suit l'« approche optique » de San Francisco, qui espace ses petits corps et resserre ses
 * grands titres : `approcheSF` le reproduit, taille par taille. Les chiffres restent en Geist Mono,
 * la police des modèles, sans correction.
 */

/** L'approche de San Francisco relative à Inter, en em, selon la taille (relevée sur la maquette). */
const APPROCHE: [number, number][] = [[7.5, 0.03], [8.5, 0.028], [9, 0.022], [9.5, 0.014], [10, 0.009], [11, 0.009], [12, 0.014], [13, 0.006], [15, 0], [17, -0.012], [21, -0.022], [30, 0], [100, 0]]
function approche(taille: number): number {
  for (let i = 1; i < APPROCHE.length; i++) {
    const [t0, a0] = APPROCHE[i - 1]
    const [t1, a1] = APPROCHE[i]
    if (taille <= t1) return taille <= t0 ? a0 : a0 + ((a1 - a0) * (taille - t0)) / (t1 - t0)
  }
  return 0
}

/**
 * La hauteur de ligne « normale » de San Francisco dans Chrome, en px, mesurée taille par taille : Chrome
 * l'arrondit au pixel (12 px en corps 10,5, quand Inter en donne 13). Le modèle laisse cette hauteur à la
 * police presque partout ; sans ce tableau, les lignes dérivaient de 6 px en bas de page.
 */
const LIGNE_SF: Record<string, number> = { '7.5': 9, '8': 10, '8.5': 10, '9': 11, '9.5': 11, '10': 12, '10.5': 12, '11': 13, '12': 15, '13': 16, '15': 18, '17': 20, '21': 24 }

/** Ajoute l'approche optique et la hauteur de ligne de San Francisco à chaque style qui fixe une taille ;
 *  les chiffres (Geist Mono, la police des modèles) gardent leur approche. */
export function approcheSF(html: string): string {
  return html.replace(/style="([^"]*)"/g, (_tout, brut: string) => {
    let style = brut
    const taille = /font-size:\s*([\d.]+)px/.exec(style)?.[1]
    // Les chiffres (Geist Mono, la police même des modèles) gardent leur hauteur de ligne naturelle.
    if (taille && !/line-height/.test(style)) {
      const ligne = /Geist Mono/.test(style) ? 'normal' : LIGNE_SF[taille] ? `${LIGNE_SF[taille]}px` : null
      if (ligne) style = `${style.replace(/;?\s*$/, '')};line-height:${ligne}`
    }
    const tout = `style="${style}"`
    const mono = /Geist Mono/.test(style)
    const ls = /letter-spacing:\s*(-?[\d.]+)em/.exec(style)
    if (mono) return ls || /letter-spacing/.test(style) ? tout : `style="${style.replace(/;?\s*$/, '')};letter-spacing:0"`
    const fs = /font-size:\s*([\d.]+)px/.exec(style)
    if (!fs) return tout
    const a = approche(Number(fs[1]))
    if (!a) return tout
    if (ls) return `style="${style.replace(ls[0], `letter-spacing:${(Number(ls[1]) + a).toFixed(4)}em`)}"`
    if (/letter-spacing/.test(style)) return tout
    return `style="${style.replace(/;?\s*$/, '')};letter-spacing:${a.toFixed(4)}em"`
  })
}

export interface RessourcesOffre {
  /** Adresses `data:` des polices woff2. */
  polices: { inter: string[]; mono: string[] }
  /** Le logo KiWee, en adresse `data:` (SVG). */
  logoKiwee: string
}

export function htmlOffre(d: DonneesOffrePdf, r: RessourcesOffre): string {
  const faces = [
    /* Les proportions verticales de San Francisco : la ligne de base tombe au même pixel. */
    ...r.polices.inter.map((u) => `@font-face{font-family:'Inter';src:url(${u}) format('woff2');font-weight:100 900;font-display:block;ascent-override:95.2%;descent-override:23.1%;line-gap-override:0%}`),
    ...r.polices.mono.map((u) => `@font-face{font-family:'Geist Mono';src:url(${u}) format('woff2');font-weight:100 900;font-display:block}`),
  ].join('')
  const css = `${faces}
@page{size:A4;margin:0}
html,body{margin:0;font-family:'Inter',sans-serif;color:#1f2123;-webkit-font-smoothing:antialiased;background:#f2f3ee;line-height:19px}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;animation:none!important;transition:none!important}
section.page{width:210mm;height:297mm;overflow:hidden;break-after:page;page-break-after:always}
section.page:last-of-type{break-after:auto;page-break-after:auto}`
  const modele = approcheSF(d.energie === 'gaz' ? modeleGaz : modeleElec)
  const corps = rendreGabarit(modele, vueOffre(d, r.logoKiwee))
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Proposition ${d.reference}</title><style>${css}</style></head><body>${corps}</body></html>`
}

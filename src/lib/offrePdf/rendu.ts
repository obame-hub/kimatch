/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE RENDU DES GABARITS DE CLAUDE DESIGN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 04/10/2026 : « kimatch puisse générer automatiquement ce PDF au pixel près ». Claude Design
 * a remis la source exacte des deux modèles (`modeles/gaz.html`, `modeles/elec.html`), tout en style
 * en ligne. On la garde TELLE QUELLE — c'est la seule façon d'être fidèle au pixel, et une retouche
 * future de Claude Design se reprend en remplaçant le fichier — et l'on branche seulement les données.
 *
 * Ces gabarits parlent trois mots, et ce module les comprend :
 *   {{ a.b.c }}                          une valeur (échappée)
 *   <sc-if value="{{ x }}">…</sc-if>     un bloc affiché si x est vrai
 *   <sc-for list="{{ l }}" as="o">…</sc-for>   un bloc répété pour chaque élément de l
 */

type Portee = Record<string, unknown>

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function lire(chemin: string, portees: Portee[]): unknown {
  const morceaux = chemin.trim().split('.')
  if (morceaux[0] === 'true') return true
  if (morceaux[0] === 'false') return false
  for (const p of portees) {
    if (morceaux[0] in p) {
      let v: unknown = p[morceaux[0]]
      for (const m of morceaux.slice(1)) v = v == null ? undefined : (v as Record<string, unknown>)[m]
      return v
    }
  }
  return undefined
}

/** La balise fermante qui répond à l'ouvrante en `debut`, en tenant compte des imbrications. */
function fermeture(html: string, balise: string, debut: number): number {
  const ouvre = new RegExp(`<${balise}\\b`, 'g')
  const ferme = `</${balise}>`
  let profondeur = 1
  let i = debut
  while (profondeur > 0) {
    const f = html.indexOf(ferme, i)
    if (f < 0) throw new Error(`Gabarit : <${balise}> sans fermeture`)
    ouvre.lastIndex = i
    const o = ouvre.exec(html)
    if (o && o.index < f) { profondeur += 1; i = o.index + balise.length + 1 } else { profondeur -= 1; i = f + ferme.length; if (profondeur === 0) return f }
  }
  return -1
}

export function rendreGabarit(html: string, vue: Portee, portees: Portee[] = []): string {
  const pile = [...portees, vue]
  let out = ''
  let i = 0
  const motif = /<sc-(if|for)\b([^>]*)>/g
  for (;;) {
    motif.lastIndex = i
    const m = motif.exec(html)
    if (!m) break
    out += valeurs(html.slice(i, m.index), pile)
    const balise = `sc-${m[1]}`
    const debutCorps = m.index + m[0].length
    const fin = fermeture(html, balise, debutCorps)
    const corps = html.slice(debutCorps, fin)
    if (m[1] === 'if') {
      const expr = /value="\{\{\s*([^}]+?)\s*\}\}"/.exec(m[2])?.[1] ?? 'false'
      if (lire(expr, [...pile].reverse())) out += rendreGabarit(corps, {}, pile)
    } else {
      const liste = /list="\{\{\s*([^}]+?)\s*\}\}"/.exec(m[2])?.[1] ?? ''
      const nom = /as="([^"]+)"/.exec(m[2])?.[1] ?? 'x'
      const elements = (lire(liste, [...pile].reverse()) as unknown[] | undefined) ?? []
      for (const e of elements) out += rendreGabarit(corps, { [nom]: e }, pile)
    }
    i = fin + `</${balise}>`.length
  }
  return out + valeurs(html.slice(i), pile)
}

function valeurs(morceau: string, pile: Portee[]): string {
  const inverse = [...pile].reverse()
  return morceau.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, chemin: string) => {
    const v = lire(chemin, inverse)
    return v == null ? '' : echapper(String(v))
  })
}

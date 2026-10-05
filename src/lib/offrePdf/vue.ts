import type { CarteFournisseurPdf, DonneesOffrePdf, LigneOffrePdf, PrixCellule } from '@/lib/offrePdf/types'

/**
 * LES VALEURS QUE LES GABARITS AFFICHENT, déjà mises en forme — l'équivalent de `K.view()` dans les
 * fichiers d'exemple de Claude Design (`offre-data.js`), mais tiré des vraies données. Les formats sont
 * ceux de la maquette (§ 3.3 du cahier de Claude Design) :
 *   · nombres `fr-FR`, l'espace fine U+202F remplacée par l'espace insécable U+00A0 ;
 *   · budgets en euros entiers, prix unitaires à deux décimales, CTA en entier ;
 *   · signe moins U+2212 ; écart « − 1 234 € » / « + 456 € » ; dates JJ/MM/AAAA, validité avec l'heure.
 */

const NB = '\u00a0'
const MOINS = '\u2212'
const nf = (n: number, d = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u202f/g, NB)
/** Un volume : jusqu'à trois décimales, sans zéro inutile (« 285 », « 343,778 »). */
const vol = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 }).replace(/\u202f/g, NB)
const eur = (n: number) => `${nf(Math.round(n))}${NB}€`
const sg = (d: number) => `${d < 0 ? MOINS : '+'}${NB}${eur(Math.abs(d))}`
const dateC = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR') : '—')
const ou = (v: string | null | undefined) => (v && v.trim() ? v : '—')

/** « 06/10/2026 16:00 » ; l'heure se tait quand elle n'est pas donnée (minuit). */
function validiteC(iso: string): string {
  const v = new Date(iso)
  if (Number.isNaN(v.getTime())) return '—'
  const date = v.toLocaleDateString('fr-FR')
  return v.getHours() || v.getMinutes() ? `${date} ${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}` : date
}

function prix(v: PrixCellule | undefined, d = 2): string {
  if (v === 'inclus') return 'incl.'
  if (v == null) return '—'
  return nf(v, d)
}

/** Une pastille d'initiales, quand le fournisseur n'a pas encore de logo (« tuile d'initiales »). */
export function logoInitiales(nom: string): string {
  const ini = nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="#eef0ea"/><text x="20" y="25" text-anchor="middle" font-family="Geist, sans-serif" font-size="14" font-weight="700" fill="#56594f">${ini.replace(/[<&]/g, '')}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const CLAUSES_GAZ: [keyof LigneOffrePdf['clauses'], string, boolean][] = [
  ['securise', 'Contrat sécurisé', true], ['depot', 'Dépôt de garantie', false], ['engagement', 'Engagement de conso.', false],
  ['renegociation', 'Renégociation anticipée', true], ['tacite', 'Tacite reconduction', false],
]
const CLAUSES_ELEC: [keyof LigneOffrePdf['clauses'], string, boolean][] = [
  ['securise', 'Contrat sécurisé', true], ['depot', 'Dépôt de garantie', false], ['tacite', 'Tacite reconduction', false],
]
const COULEUR_NOTE: Record<string, string> = { A: '#2f7a3b', B: '#6aa531', C: '#b89a00', D: '#d9822b', E: '#c2452d' }

export function vueOffre(d: DonneesOffrePdf, logoKiwee: string): Record<string, unknown> {
  const gaz = d.energie === 'gaz'
  const ttc = d.ttc
  const k = (l: LigneOffrePdf) => (ttc ? l.totalTtc : l.totalHt)
  const cur = d.actuelle
  const hasCur = !!cur
  const clauses = gaz ? CLAUSES_GAZ : CLAUSES_ELEC

  const fmt = (o: LigneOffrePdf, rang: number | null) => {
    const u = o.unitaires
    const logo = o.logo ?? logoInitiales(o.fournisseur)
    return {
      f: o.fournisseur, logo, type: ou(o.typePrix), dur: o.dureeMois ? `${o.dureeMois} mois` : '—', rank: rang ?? '—',
      best: rang === 1, notBest: rang !== 1,
      abo: eur(o.abonnement), en: eur(o.energie), tax: eur(o.taxes), turpe: eur(o.turpe ?? 0), ht: eur(o.totalHt), ttc: eur(o.totalTtc),
      uAbo: prix(u.abonnementMois), uMol: prix(u.molecule), uCee: prix(u.cee), uCpb: prix(u.cpb), uEn: prix(u.totalMwh ?? null),
      uTqd: prix(u.tqd), uAg: prix(u.ag), uCta: u.cta == null ? '—' : nf(Math.round(u.cta)),
      uP: prix(u.postes?.POINTE), uHph: prix(u.postes?.HPH), uHch: prix(u.postes?.HCH), uHpe: prix(u.postes?.HPE), uHce: prix(u.postes?.HCE),
      uCap: prix(u.capacite), uAe: prix(u.ae),
      cl: clauses.map(([cle, , protection]) => {
        const v = !!o.clauses[cle]
        return { v, no: !v, good: protection ? v : !v, bad: protection ? !v : v, pos: protection }
      }),
      score: o.score, scoreDeg: `${(o.score * 3.6).toFixed(1)}deg`, grade: o.note, gc: COULEUR_NOTE[o.note],
    }
  }

  const offres = d.offres.map((o, i) => {
    const base = fmt(o, i + 1)
    if (!cur) return { ...base, dd: '', up: false, down: false }
    const ecart = k(o) - k(cur)
    return { ...base, dd: sg(ecart), up: ecart > 0, down: ecart < 0 }
  })
  const best = d.offres[0]
  const worst = d.offres[d.offres.length - 1]
  const an = cur && best ? k(cur) - k(best) : 0
  // « Si l'économie est négative ou nulle : basculer en variante B » (cahier de Claude Design, § 6.3).
  const heroCur = hasCur && an > 0

  const ini = d.consultant.nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('')
  const [rue, ville] = splitAdresse(d.clientAdresse)
  const total = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE'].reduce((s, p) => s + (d.compteur.conso[p] ?? 0), 0)

  return {
    logoKiwee,
    afficherClauses: d.afficherClauses,
    hasCur, noCur: !hasCur, heroCur, heroNoCur: !heroCur, ttc, ht: !ttc, uLbl: ttc ? 'TTC' : 'HTVA', titrePerim: true,
    gcols: (gaz ? '22px 1.6fr .8fr .6fr .72fr .82fr .74fr .95fr' : '22px 1.6fr .6fr .7fr .82fr .74fr .7fr .95fr') + (ttc ? ' .95fr' : '') + (hasCur ? ' .9fr' : ''),
    com: { nom: d.consultant.nom, mail: ou(d.consultant.email), tel: ou(d.consultant.telephone), ini },
    compte: { nom: d.clientNom, adr: [rue, ville] },
    contact: { nom: ou(d.contact?.nom), mail: ou(d.contact?.email), tel: ou(d.contact?.telephone) },
    dates: { ref: ou(d.reference), consultC: dateC(d.dateEdition), validC: validiteC(d.validite) },
    pce: {
      lib: ou(d.compteur.libelle), numC: d.compteur.numero.replace(/\s+/g, ''), tarif: ou(d.compteur.tarif), profil: ou(d.compteur.profil),
      car: d.compteur.car != null ? `${vol(d.compteur.car)}${NB}MWh/an` : '—',
      ech: d.compteur.echeanceIndeterminee ? 'Indéterminée' : dateC(d.compteur.echeance),
    },
    pdl: { lib: ou(d.compteur.libelle), numC: d.compteur.numero.replace(/\s+/g, ''), segment: ou(d.compteur.segment), fta: ou(d.compteur.fta), ech: d.compteur.echeanceIndeterminee ? 'Indéterminée' : dateC(d.compteur.echeance) },
    postes: ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE'].map((p) => ({
      k: p === 'POINTE' ? 'Pointe' : p,
      c: vol(d.compteur.conso[p] ?? 0),
      p: d.compteur.puissances[p] != null ? nf(d.compteur.puissances[p] as number) : '—',
    })),
    consoTot: vol(total),
    cur: cur ? fmt(cur, null) : null,
    offers: offres,
    best: best ? fmt(best, 1) : null,
    clauses: clauses.map(([, libelle]) => ({ k: libelle })),
    fourn: d.fournisseurs.map(carte),
    nbOff: d.offres.length,
    ecoPct: cur && k(cur) ? nf((an / k(cur)) * 100, 1) : '',
    ecoAnN: nf(Math.round(an)), ecoMois: eur(an / 12), ecoDuree: eur((an * (best?.dureeMois ?? 12)) / 12),
    curTot: cur ? eur(k(cur)) : '', bestTot: best ? eur(k(best)) : '', bestTotN: best ? nf(Math.round(k(best))) : '', bestMois: best ? eur(k(best) / 12) : '',
    bestW: cur && best ? `${((k(best) / k(cur)) * 100).toFixed(2)}%` : '100%',
    bestF: best?.fournisseur ?? '', bestDur: best?.dureeMois ? `${best.dureeMois} mois` : '—', bestType: best?.typePrix ?? '',
    worstF: worst?.fournisseur ?? '', worstTot: worst ? eur(k(worst)) : '', bestVsWorstW: best && worst ? `${((k(best) / k(worst)) * 100).toFixed(2)}%` : '100%',
  }
}

function carte(f: CarteFournisseurPdf) {
  const age = f.creation ? `${new Date().getFullYear() - f.creation} ans` : ''
  return {
    nom: f.nom, logo: f.logo ?? logoInitiales(f.nom), statut: f.qualification ?? '', origine: f.origine ?? '', crea: f.creation ?? '', age,
    desc: f.presentation ?? '', siege: f.siege ?? '', clients: f.clients ?? '', exp: f.tags,
    aStatut: !!f.qualification, aOrigine: !!f.origine, aCrea: !!f.creation, aTuiles: !!f.origine || !!f.creation,
    aSiege: !!f.siege, aClients: !!f.clients, aPied: !!f.siege || !!f.clients, aTags: f.tags.length > 0,
  }
}

/** « 14 avenue Jean Jaurès, 69007 Lyon » → [« 14 avenue Jean Jaurès », « 69007 Lyon »]. */
function splitAdresse(a: string | null): [string, string] {
  if (!a) return ['—', '—']
  const i = a.lastIndexOf(', ')
  return i < 0 ? [a, '—'] : [a.slice(0, i), a.slice(i + 2)]
}

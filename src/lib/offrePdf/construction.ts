import { budgetLigne, type Chiffrage, type CompteurChiffrage, type OffreChiffrage, type SaisieLigne } from '@/lib/data/chiffrage'
import { ttcDuBudget } from '@/lib/pricing/budget'
import { contratSecurise, scoreDesClauses } from '@/lib/offres/clauses'
import type { CarteFournisseurPdf, DonneesOffrePdf, LigneOffrePdf, PrixCellule } from '@/lib/offrePdf/types'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * DU PRICER À LA PROPOSITION COMMERCIALE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les chiffres du document sont CEUX DU PRICER, à l'euro près : mêmes budgets que son tableau et que
 * son « détail du calcul » (`budgetLigne`) — TURPE et taxes réglementées de la base, CTA à part, ce
 * que le P0 inclut compté une seule fois, TVA à 20 %. Le document ne les recalcule pas autrement.
 *
 * Seule la VENTILATION suit le modèle de Claude Design :
 *   Gaz    Énergie = CAR × (P0 + marge + CEE + CPB)       Taxes = CAR × (TQD + AG) + CTA
 *   Élec   Énergie = postes + capacité + CEE              TURPE · Taxes = AE + CTA
 * (le Pricer range le CPB dans l'énergie depuis le 06/10/2026, comme le modèle).
 *
 * Les offres présentées : proposées, disponibles, à prix fixe (les indexées restent « hors
 * comparatif », William, 04/10/2026), au budget complet ; les cinq moins chères (hauteur de page).
 */

export interface ContexteOffre {
  reference: string | null
  clientNom: string
  /** « Syndic professionnel », « Entreprise »… — décide de la présentation par défaut. */
  clientSegment: string | null
  clientAdresse: string | null
  consultant: { nom: string; email: string | null; telephone: string | null }
  contact: { nom: string; email: string | null; telephone: string | null } | null
  compteur: {
    libelle: string | null
    echeanceDeclaree: string | null
    /** L'échéance retenue (`v_echeance_compteur`, 05/10/2026) : contrats prospects compris. */
    echeanceRetenue?: { date: string | null; indeterminee: boolean } | null
    puissances: Record<string, number | null>
  }
  /** Par compte fournisseur : l'identité de la page 3, et son logo prêt à poser. */
  fournisseurs: Record<string, Omit<CarteFournisseurPdf, 'id'>>
  /** Les logos, par nom de fournisseur, quand la fiche n'en a pas (repli Kimatch). */
  logoParNom: (nom: string) => string | null
}

export interface OptionsOffre { validite: string; ttc: boolean; dateEdition?: string; /** Oui par défaut. */ clauses?: boolean }

/** TTC pour un syndic, HTVA pour une entreprise (William, 04/10/2026) : un syndic ne récupère pas la TVA. */
export const ttcParDefaut = (segment: string | null | undefined) => /^syndic/i.test(segment ?? '')

const MAX_OFFRES = 5
const MAX_FOURNISSEURS = 6
const estIndexe = (type: string | null | undefined) => /^index/i.test(type ?? '')

/** Pourquoi une version ne peut pas (encore) donner sa proposition — `null` si elle le peut. */
export function raisonIndisponible(c: Chiffrage | null | undefined): string | null {
  if (!c) return 'Version introuvable.'
  if (!c.version.publieeLe) return 'Le comparatif n’est pas encore publié par le pricing.'
  if (c.compteurs.length !== 1) return 'Proposition générée disponible pour un seul point de livraison pour l’instant.'
  const k = c.compteurs[0]
  const ok = c.offres.some((o) => o.nature === 'PROPOSEE' && o.statut === 'DISPONIBLE' && !estIndexe(o.type) && budgetLigne(k, o.saisies[k.vcId] ?? vide, o.duree)?.complet)
  return ok ? null : 'Aucune offre disponible au budget complet.'
}
const vide: SaisieLigne = { abonnementMois: null, marge: null, p0: null, cee: null, cpb: null, p0Postes: {}, capacite: null, inclus: [] }

function ligne(k: CompteurChiffrage, o: OffreChiffrage, ctx: ContexteOffre, actuelle: boolean): LigneOffrePdf | null {
  const s = { ...(o.saisies[k.vcId] ?? vide), ...(actuelle ? { marge: 0 } : {}) }
  const b = budgetLigne(k, s, o.duree)
  if (!b || !b.complet) return null
  const r = k.reglementaire
  const inclus = (x: string) => (s.inclus ?? []).includes(x)
  const cellule = (x: string, v: number | null | undefined): PrixCellule => (inclus(x) ? 'inclus' : v ?? null)
  const marge = s.marge ?? 0
  const gaz = k.energie === 'gaz'
  const energie = b.energie
  let taxes = b.taxes
  let unitaires: LigneOffrePdf['unitaires']
  if (gaz) {
    const cpb = inclus('CPB') ? 0 : r?.cpb[String(o.duree ?? 12)] ?? 0
    taxes = b.acheminement + b.taxes
    const molecule = s.p0 == null ? null : s.p0 + marge
    const ceeV = inclus('CEE') ? 0 : s.cee ?? 0
    unitaires = {
      abonnementMois: s.abonnementMois,
      molecule, cee: cellule('CEE', s.cee), cpb: cellule('CPB', r?.cpb[String(o.duree ?? 12)]),
      totalMwh: molecule == null ? null : Math.round((molecule + ceeV + cpb) * 10000) / 10000,
      tqd: cellule('TQD', r?.tqd), ag: cellule('ACCISE', r?.accise), cta: r?.cta ?? null,
    }
  } else {
    const postes: Record<string, PrixCellule> = {}
    for (const p of ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE']) postes[p] = s.p0Postes[p] == null ? null : (s.p0Postes[p] as number) + marge
    unitaires = { abonnementMois: s.abonnementMois, postes, capacite: cellule('CAPACITE', s.capacite), cee: cellule('CEE', s.cee), ae: r?.accise ?? null, cta: r?.cta ?? null }
  }
  const sc = scoreDesClauses(
    { depot_garantie: o.clauses.depot, engagement_consommation: o.clauses.engagement, renegociation_anticipee: o.clauses.renegociation, swap: o.clauses.swap, tacite_reconduction: o.clauses.tacite },
    o.type, k.energie,
  )
  const fiche = ctx.fournisseurs[o.fournisseurId]
  return {
    id: o.id, fournisseurId: o.fournisseurId, fournisseur: o.fournisseurNom, logo: fiche?.logo ?? ctx.logoParNom(o.fournisseurNom),
    typePrix: o.type, dureeMois: o.duree, actuelle,
    abonnement: b.abonnement, energie, turpe: gaz ? null : b.turpe, taxes, totalHt: b.total, totalTtc: ttcDuBudget(b),
    unitaires,
    clauses: { securise: contratSecurise(o.type), depot: o.clauses.depot, engagement: o.clauses.engagement, renegociation: o.clauses.renegociation, swap: o.clauses.swap, tacite: o.clauses.tacite },
    score: sc.score, note: sc.note,
  }
}

/** Toutes les offres présentables, de la moins chère à la plus chère — la proposition n'en garde que
 *  les cinq premières (`MAX_OFFRES`). */
export function lignesPresentables(c: Chiffrage, ctx: ContexteOffre): LigneOffrePdf[] {
  const k = c.compteurs[0]
  return c.offres
    .filter((o) => o.nature === 'PROPOSEE' && o.statut === 'DISPONIBLE' && !estIndexe(o.type))
    .map((o) => ligne(k, o, ctx, false))
    .filter((l): l is LigneOffrePdf => !!l)
    .sort((a, b) => a.totalHt - b.totalHt)
}

/** La ligne de l'offre actuelle (la référence), ou `null` pour un appel d'offres sans comparatif. */
export function ligneActuelle(c: Chiffrage, ctx: ContexteOffre): LigneOffrePdf | null {
  return !c.version.sansComparatif && c.actuelle ? ligne(c.compteurs[0], c.actuelle, ctx, true) : null
}

/** Le chiffrage avec d'autres marges, offre par offre — le brouillon du commercial avant génération. */
export function avecMarges(c: Chiffrage, marges: Record<string, number>): Chiffrage {
  return {
    ...c,
    offres: c.offres.map((o) => (marges[o.id] == null ? o : {
      ...o,
      saisies: Object.fromEntries(Object.entries(o.saisies).map(([vc, s]) => [vc, { ...s, marge: marges[o.id] }])),
    })),
  }
}

export const NB_OFFRES_PROPOSITION = MAX_OFFRES

export function construireOffrePdf(c: Chiffrage, ctx: ContexteOffre, options: OptionsOffre): DonneesOffrePdf {
  const k = c.compteurs[0]
  const offres = lignesPresentables(c, ctx).slice(0, MAX_OFFRES)
  const actuelle = ligneActuelle(c, ctx)

  /* Une carte par fournisseur, dans l'ordre de sa meilleure offre ; l'offre actuelle n'en ajoute pas. */
  const vus = new Set<string>()
  const fournisseurs: CarteFournisseurPdf[] = []
  for (const o of offres) {
    if (vus.has(o.fournisseurId)) continue
    vus.add(o.fournisseurId)
    const f = ctx.fournisseurs[o.fournisseurId]
    fournisseurs.push({ id: o.fournisseurId, nom: f?.nom ?? o.fournisseur, logo: f?.logo ?? o.logo, qualification: f?.qualification ?? null, origine: f?.origine ?? null, creation: f?.creation ?? null, presentation: f?.presentation ?? null, siege: f?.siege ?? null, clients: f?.clients ?? null, tags: f?.tags ?? [] })
  }

  const conso: Record<string, number> = {}
  for (const p of ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE']) conso[p] = k.conso[p] ?? 0
  return {
    energie: k.energie,
    reference: ctx.reference ?? '—',
    clientNom: ctx.clientNom,
    clientAdresse: ctx.clientAdresse,
    dateEdition: options.dateEdition ?? new Date().toISOString().slice(0, 10),
    validite: options.validite,
    ttc: options.ttc,
    afficherClauses: options.clauses ?? true,
    consultant: ctx.consultant,
    contact: ctx.contact,
    compteur: {
      libelle: ctx.compteur.libelle || k.libelle || k.site || '—',
      numero: k.numero, tarif: k.tarif, profil: k.profil, car: k.car, segment: k.segment, fta: k.energie === 'electricite' ? k.tarif : null,
      /* L'échéance retenue, et « Indéterminée » quand le dernier contrat connu n'a pas de fin — elle
         ne retombe plus sur la date déclarée (William, 05/10/2026). */
      echeance: ctx.compteur.echeanceRetenue?.indeterminee ? null : ctx.compteur.echeanceRetenue?.date ?? k.reglementaire?.echeance ?? ctx.compteur.echeanceDeclaree,
      echeanceIndeterminee: !!ctx.compteur.echeanceRetenue?.indeterminee,
      conso, puissances: ctx.compteur.puissances,
    },
    actuelle,
    offres,
    fournisseurs: fournisseurs.slice(0, MAX_FOURNISSEURS),
  }
}

import type { CompteurChiffrage, SaisieLigne } from '@/lib/data/chiffrage'
import { budgetLigne } from '@/lib/data/chiffrage'
import { auCentime, postesDuCompteur, ttcDuBudget, type BudgetOffre } from '@/lib/pricing/budget'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉTAIL DU CALCUL D'UNE LIGNE — « Ce serait bien d'avoir cette option de calcul détaillé par
 * ligne » (William, 02/10/2026)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le même calcul que `budgetLigne` (donc que la base), posé ligne à ligne : chaque montant dit de
 * quoi il est fait. Les sous-totaux et le total sont CEUX DE `budgetLigne`, jamais refaits ici : le
 * détail ne peut pas contredire le budget affiché dans le tableau.
 */

export interface LigneDetail {
  libelle: string
  /** La formule, en clair, avec ses chiffres. */
  formule: string
  montant: number
  /** D'où vient la valeur réglementée, quand il y en a une. */
  source?: string
}
export interface SectionDetail { titre: string; lignes: LigneDetail[]; sousTotal: number }
export interface DetailBudget {
  sections: SectionDetail[]
  totalHt: number
  tva: LigneDetail[]
  totalTtc: number
  complet: boolean
  /** Ce qui manque au calcul (prix non saisis, valeurs réglementées inconnues). */
  manques: string[]
}

const f = (v: number | null | undefined, max = 2) => (v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: max }))
const mwh = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 3 }))
const z = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? x : 0)
const jour = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR') : null)

/** Les années civiles couvertes par une fourniture — celles dont le CPB fait la moyenne. */
export function anneesFourniture(debut: string | null | undefined, dureeMois: number): [number, number] | null {
  if (!debut) return null
  const d = new Date(`${debut.slice(0, 10)}T12:00:00`)
  const fin = new Date(d)
  fin.setMonth(fin.getMonth() + dureeMois)
  fin.setDate(fin.getDate() - 1)
  return [d.getFullYear(), fin.getFullYear()]
}

/* Toute la TVA à 20 %, CTA comprise (William, 02/10/2026) : une ligne, qui retombe exactement sur le
   TTC du tableau. */
function tvaDe(b: BudgetOffre): LigneDetail[] {
  return [{ libelle: 'TVA 20 %', formule: `${f(b.total)} × 20 %`, montant: auCentime(ttcDuBudget(b) - b.total) }]
}

export function detailBudget(compteur: CompteurChiffrage, s: SaisieLigne, dureeMois?: number | null): DetailBudget | null {
  const b = budgetLigne(compteur, s, dureeMois)
  if (!b) return null
  const r = compteur.reglementaire
  const manques = [...(r?.manques ?? [])]
  const envoi = jour(r?.dateEnvoi)
  const aLEnvoi = envoi ? `${r?.envoiFige ? 'figé à l’envoi du' : 'en vigueur au'} ${envoi}` : undefined
  const abonnement: LigneDetail = {
    /* L'annuel est la valeur saisie au centime ; « 374,00 €/mois × 12 » ne ferait pas 4 487,96. */
    libelle: 'Abonnement', formule: s.abonnementMois == null ? 'non saisi' : `${f(b.abonnement)} €/an, soit ${f(s.abonnementMois)} €/mois`, montant: b.abonnement,
  }

  if (compteur.energie === 'gaz') {
    const car = z(compteur.car)
    const duree = dureeMois ?? 12
    const cpb = r?.cpb[String(duree)] ?? null
    const annees = anneesFourniture(r?.dateReference, duree)
    const prixMwh = z(s.p0) + z(s.marge) + z(s.cee)
    if (r?.tqd == null) manques.push('TQD inconnu')
    if (cpb == null) manques.push('CPB inconnu pour cette durée')
    return {
      sections: [
        {
          titre: 'Fourniture', sousTotal: auCentime(b.abonnement + b.energie), lignes: [
            abonnement,
            { libelle: 'Énergie', formule: `CAR ${mwh(car)} MWh × (P0 ${f(s.p0, 4)} + marge ${f(s.marge, 4)} + CEE ${f(s.cee, 4)} = ${f(prixMwh, 4)} €/MWh)`, montant: b.energie },
          ],
        },
        {
          titre: 'Acheminement', sousTotal: b.acheminement, lignes: [
            { libelle: `TQD ${compteur.tarif ?? ''}`.trim(), formule: `CAR ${mwh(car)} MWh × ${f(r?.tqd, 4)} €/MWh`, montant: auCentime(car * z(r?.tqd)), source: aLEnvoi },
          ],
        },
        {
          titre: 'Taxes et contributions', sousTotal: b.taxes, lignes: [
            { libelle: 'Accise gaz (AG)', formule: `CAR ${mwh(car)} MWh × ${f(r?.accise, 4)} €/MWh`, montant: auCentime(car * z(r?.accise)), source: aLEnvoi },
            {
              libelle: 'CPB', formule: `CAR ${mwh(car)} MWh × ${f(cpb, 4)} €/MWh`, montant: auCentime(car * z(cpb)),
              source: annees ? `moyenne ${annees[0] === annees[1] ? annees[0] : `${annees[0]} à ${annees[1]}`}, fourniture du ${jour(r?.dateReference)} sur ${duree} mois` : undefined,
            },
            { libelle: `CTA ${[compteur.tarif, compteur.profil].filter(Boolean).join(' ')}`.trim(), formule: 'forfait annuel', montant: auCentime(z(r?.cta)), source: aLEnvoi },
          ],
        },
      ],
      totalHt: b.total, tva: tvaDe(b), totalTtc: ttcDuBudget(b), complet: b.complet, manques,
    }
  }

  const postes = postesDuCompteur(compteur.conso)
  const conso = postes.reduce((t, p) => t + (compteur.conso[p] ?? 0), 0)
  const t = r?.turpe
  const turpe: LigneDetail[] = t?.total != null
    ? [
      { libelle: 'Gestion', formule: 'composante annuelle', montant: z(t.detail.cg) },
      { libelle: 'Comptage', formule: 'composante annuelle', montant: z(t.detail.cc) },
      { libelle: 'Soutirage fixe', formule: `formule ${t.formule ?? '—'}`, montant: z(t.detail.csFixe) },
      { libelle: 'Soutirage variable', formule: 'consommation par poste × c', montant: z(t.detail.csVariable) },
    ].map((l) => ({ ...l, montant: auCentime(l.montant), source: aLEnvoi }))
    : [{ libelle: 'TURPE', formule: 'non calculable', montant: 0 }]
  return {
    sections: [
      {
        titre: 'Fourniture', sousTotal: auCentime(b.abonnement + b.energie), lignes: [
          abonnement,
          ...postes.map((p) => {
            const c = compteur.conso[p] ?? 0
            return { libelle: p === 'POINTE' ? 'Pointe' : p === 'BASE' ? 'Base' : p, formule: `${mwh(c)} MWh × (P0 ${f(s.p0Postes[p], 4)} + marge ${f(s.marge, 4)})`, montant: auCentime(c * (z(s.p0Postes[p]) + z(s.marge))) }
          }),
          { libelle: 'Capacité', formule: `${mwh(conso)} MWh × ${f(s.capacite, 4)} €/MWh`, montant: auCentime(conso * z(s.capacite)) },
          { libelle: 'CEE', formule: `${mwh(conso)} MWh × ${f(s.cee, 4)} €/MWh`, montant: auCentime(conso * z(s.cee)) },
        ],
      },
      { titre: 'Acheminement (TURPE)', sousTotal: b.turpe, lignes: turpe },
      {
        titre: 'Taxes', sousTotal: b.taxes, lignes: [
          { libelle: 'Accise électricité (AE)', formule: `${mwh(conso)} MWh × ${f(r?.accise, 4)} €/MWh`, montant: auCentime(conso * z(r?.accise)), source: aLEnvoi },
        ],
      },
    ],
    totalHt: b.total, tva: tvaDe(b), totalTtc: ttcDuBudget(b), complet: b.complet, manques,
  }
}

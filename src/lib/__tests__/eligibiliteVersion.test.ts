import { describe, expect, it } from 'vitest'
import { businessDaysBetween, checkEligibility } from '@/lib/eligibility'
import type { Compte, Compteur } from '@/types/domain'

const compte = { id: 'c', nom: 'X', segment: 'Entreprise', score_ellipro: '7' } as unknown as Compte
const compteur = { id: 'k1', utilisation: 'Fournil', site_nom: 'Fournil', type_energie: 'gaz', tarif_distribution: 'T3', profil_consommation: 'P016', consommation_annuelle_mwh: 312, date_echeance: '2028-02-29' } as unknown as Compteur
const f = (o: Partial<Compte> = {}) => ({ id: 'f', nom: 'F', partnership: 'kiwee', intermediary: null, targets: ['Entreprise'], energy_types: ['Gaz'], tariffs: ['T3'], profiles: ['P016'], segments: [], response_delay_days: 2, max_dff: '2032-01-01', ...o }) as unknown as Compte
/* Les conditions de la base : tarif et profil au gaz, segment hors gaz. */
const R = (k: string, cf: string | null = null, op = 'eq', cv: string | null = null) => ({ id: k, rule_key: k, name: k, description: null, level: 'pdl', is_active: true, condition_field: cf, condition_operator: op, condition_value: cv, value_operator: 'OU', sort_order: 0 })
const regles = [R('tariff', 'energy', 'eq', 'Gaz'), R('profile', 'energy', 'eq', 'Gaz'), R('segment', 'energy', 'neq', 'Gaz'), R('response_delay', 'request_type', 'eq', 'premiere_demande'), R('update_delay', 'request_type', 'neq', 'premiere_demande')]
const carac = { durations: [1], requestType: 'premiere_demande', mandats: { kiwee: true, energix: false } }

describe('l’éligibilité de la première version (06/10/2026)', () => {
  it('le profil gaz est enfin vérifié', () => {
    const r = checkEligibility(f({ profiles: ['P011', 'P012'] }), compte, [compteur], carac, regles, [])
    expect(r.eligible).toBe(false)
    expect(r.reasons.join()).toContain('Profil P016 non pris en charge')
  })
  it('un fournisseur Energix demande un mandat Energix', () => {
    const r = checkEligibility(f({ partnership: 'intermediaire', intermediary: 'Energix' }), compte, [compteur], carac, regles, [])
    expect(r.reasons.join()).toContain('Aucun mandat Energix actif')
  })
  it('un fournisseur KiWee éligible quand tout concorde', () => {
    expect(checkEligibility(f(), compte, [compteur], carac, regles, []).eligible).toBe(true)
  })
  it('la note Ellipro minimale se dit clairement', () => {
    const r = checkEligibility(f({ min_ellipro_score: 8 }), compte, [compteur], carac, regles, [])
    expect(r.reasons).toContain('Note Ellipro du client 7/10 : ce fournisseur demande au moins 8/10')
  })
  it('les jours ouvrés excluent les fériés : du jeudi 24/12/2026 au lundi 28/12, un seul (le 28)', () => {
    expect(businessDaysBetween(new Date(2026, 11, 24, 12), new Date(2026, 11, 28, 12))).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import {
  calculerSante, joignabiliteEcrit, joignabiliteTelephone, valenceDuSignal, type SignalRelation,
} from '@/lib/santeRelation'

const MAINTENANT = new Date('2026-09-22T12:00:00Z')

function signal(p: Partial<SignalRelation> = {}): SignalRelation {
  return {
    quand: '2026-09-20T10:00:00Z',
    nature: 'APPEL',
    sens: 'SORTANT',
    sentiment: null,
    etiquettes: [],
    aura: null,
    issue: null,
    sansReponse: false,
    ...p,
  }
}

describe('valenceDuSignal', () => {
  it('ne donne aucun sens à un mail que nous avons envoyé', () => {
    expect(valenceDuSignal(signal({ nature: 'MAIL', sens: 'SORTANT' }))).toBeNull()
  })

  it('ne donne aucun sens à un appel sans réponse', () => {
    expect(valenceDuSignal(signal({ sansReponse: true }))).toBeNull()
  })

  it('fait primer la correction humaine sur tout le reste', () => {
    expect(valenceDuSignal(signal({ sentiment: 'NEGATIF', etiquettes: ['interested'], aura: 5 }))).toBe('NEGATIF')
  })

  it('lit les étiquettes d’Allô quand rien d’autre ne parle', () => {
    expect(valenceDuSignal(signal({ etiquettes: ['meeting_booked'] }))).toBe('POSITIF')
    expect(valenceDuSignal(signal({ etiquettes: ['not_interested'] }))).toBe('NEGATIF')
  })

  it('fait primer le négatif sur le positif dans un même appel', () => {
    expect(valenceDuSignal(signal({ etiquettes: ['interested', 'not_interested'] }))).toBe('NEGATIF')
  })

  /* ══ LES ISSUES SONT DES CODES ══
     `appels_en_cours_issue_check` n'accepte que ces six valeurs. J'avais d'abord comparé aux
     libellés français — « Refus clair », « OK factures » — qui ne sont jamais stockés : la
     comparaison ne trouvait rien, et un score qui ne trouve rien ne se plaint pas, il reste à 50.
     C'est le genre de panne qu'aucune erreur ne signale, d'où ces deux cas. */
  it('lit l’issue de l’appel dans le vocabulaire de la base', () => {
    expect(valenceDuSignal(signal({ issue: 'REFUS' }))).toBe('NEGATIF')
    expect(valenceDuSignal(signal({ issue: 'DEJA_RENEGOCIE' }))).toBe('NEGATIF')
    expect(valenceDuSignal(signal({ issue: 'FACTURES' }))).toBe('POSITIF')
    expect(valenceDuSignal(signal({ issue: 'INTERESSE' }))).toBe('POSITIF')
    expect(valenceDuSignal(signal({ issue: 'PAS_LE_BON_MOMENT' }))).toBe('NEUTRE')
  })

  it('ne reconnaît pas un libellé français là où la base écrit un code', () => {
    expect(valenceDuSignal(signal({ issue: 'Refus clair' }))).toBe('NEUTRE')
  })
})

describe('calculerSante', () => {
  it('part de la neutralité quand il ne s’est rien passé', () => {
    const s = calculerSante([], MAINTENANT)
    expect(s.score).toBe(45)
    expect(s.etat).toBe('À entretenir')
    expect(s.explication).toContain('jamais répondu')
  })

  it('n’accorde rien à une réponse tant qu’on n’a pas lu ce qu’elle dit', () => {
    const s = calculerSante([signal({ nature: 'MAIL', sens: 'ENTRANT' })], MAINTENANT)
    expect(s.score).toBe(45)
    expect(s.aAnalyser).toBe(1)
  })

  /* LE CAS DE WILLIAM, mot pour mot : « s'il répond à un mail en nous disant qu'on l'emmerde ». */
  it('fait chuter le score sur une réponse négative, malgré la réponse', () => {
    const s = calculerSante(
      [signal({ nature: 'MAIL', sens: 'ENTRANT', sentiment: 'NEGATIF', quand: '2026-09-20T10:00:00Z' })],
      MAINTENANT,
    )
    expect(s.score).toBe(28)
    expect(s.etat).toBe('Froide')
    expect(s.negatifs).toBe(1)
  })

  it('demande trois échanges positifs pour effacer un refus', () => {
    const refus = signal({ sentiment: 'NEGATIF' })
    const bon = signal({ sentiment: 'POSITIF' })
    expect(calculerSante([refus, bon, bon], MAINTENANT).score).toBeLessThan(50)
    expect(calculerSante([refus, bon, bon, bon], MAINTENANT).score).toBeGreaterThan(50)
  })

  it('pèse moins un enthousiasme d’il y a deux ans qu’un d’hier', () => {
    const vieux = calculerSante([signal({ sentiment: 'POSITIF', quand: '2024-09-20T10:00:00Z' })], MAINTENANT)
    const frais = calculerSante([signal({ sentiment: 'POSITIF', quand: '2026-09-20T10:00:00Z' })], MAINTENANT)
    expect(vieux.score).toBeLessThan(frais.score)
  })

  it('plafonne le score quand plus rien ne vient de lui', () => {
    const s = calculerSante(
      [signal({ sentiment: 'POSITIF', quand: '2025-09-20T10:00:00Z' }), signal({ sentiment: 'POSITIF', quand: '2025-09-21T10:00:00Z' })],
      MAINTENANT,
    )
    expect(s.score).toBeLessThanOrEqual(75)
    expect(s.explication).toContain('Plus rien de lui')
  })
})

describe('joignabilite', () => {
  it('ne rend rien tant qu’aucun appel n’a été passé', () => {
    expect(joignabiliteTelephone([signal({ nature: 'MAIL' })]).taux).toBeNull()
  })

  it('ne compte comme abouti que ce qui a joint quelqu’un', () => {
    const t = joignabiliteTelephone([signal({ sansReponse: true }), signal({ sansReponse: true }), signal()])
    expect(t).toEqual({ tentatives: 3, retours: 1, taux: 33 })
  })

  it('mesure l’écrit sur les réponses reçues, pas sur les mails partis', () => {
    const t = joignabiliteEcrit([
      signal({ nature: 'MAIL', sens: 'SORTANT' }),
      signal({ nature: 'MAIL', sens: 'SORTANT' }),
      signal({ nature: 'MAIL', sens: 'ENTRANT' }),
    ])
    expect(t).toEqual({ tentatives: 2, retours: 1, taux: 50 })
  })

  it('ne dépasse jamais cent pour cent', () => {
    const t = joignabiliteEcrit([
      signal({ nature: 'MAIL', sens: 'SORTANT' }),
      signal({ nature: 'MAIL', sens: 'ENTRANT' }),
      signal({ nature: 'MAIL', sens: 'ENTRANT' }),
    ])
    expect(t.taux).toBe(100)
    expect(t.retours).toBe(2)
  })
})

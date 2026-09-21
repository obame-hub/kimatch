import { describe, expect, it } from 'vitest'
import { calendrierDeProduction, joursOuvresEcoules, journeeDuPricing } from '@/lib/journeePricing'
import type { VersionPricing, FournisseurConsulteLite } from '@/lib/data/pricingVersions'
import type { ContratPricing } from '@/lib/data/pricingContrats'

/**
 * Les règles du pricing, éprouvées cas par cas.
 *
 * ELLES DÉCIDENT DU TRAVAIL DE QUELQU'UN, donc elles se testent. La suggestion de relance des
 * recommandations s'est cassée deux fois en silence faute de test : personne ne voit une règle qui
 * cesse de proposer, et il a fallu la mesurer en base pour s'en apercevoir.
 */

/* Jeudi 18 septembre 2026, 11 h — un jour ouvré ordinaire, avant l'heure limite. */
const JEUDI_MATIN = new Date(2026, 8, 18, 11, 0, 0)
const JEUDI_APRES_15H = new Date(2026, 8, 18, 16, 0, 0)

function fournisseur(p: Partial<FournisseurConsulteLite> = {}): FournisseurConsulteLite {
  return {
    id: 'c1',
    fournisseur_compte_id: 'f1',
    fournisseur_nom: 'GAZ EUROPEEN',
    statut_code: 'A_TRAITER',
    statut_libelle: 'À traiter',
    date_evenement: null,
    mode_consultation: 'EMAIL',
    mode_reponse: 'MAIL',
    combinaisons: [],
    ...p,
  }
}

function version(p: Partial<VersionPricing> = {}): VersionPricing {
  const f = p.fournisseurs ?? [fournisseur()]
  return {
    version_id: 'v1',
    numero_version: 1,
    version_nom: null,
    version_statut: 'EN_CONSTRUCTION',
    version_statut_libelle: 'En construction',
    date_souhaitee: '2026-09-22',
    jours_avant_livraison: 4,
    date_presentation_client: null,
    version_date_creation: '2026-09-18T09:00:00Z',
    recommandation_id: 'r1',
    recommandation_nom: 'CABINET MOLINIER',
    montant: null,
    compte_id: 'cp1',
    compte_nom: 'CABINET MOLINIER',
    compte_proprietaire_id: null,
    recommandation_proprietaire_id: null,
    type_energie: 'gaz',
    nb_fournisseurs: f.length,
    nb_recues: f.filter((x) => x.statut_code === 'DISPONIBLE').length,
    nb_refusees: f.filter((x) => x.statut_code === 'REFUSEE').length,
    nb_attendus: f.filter((x) => x.statut_code !== 'DISPONIBLE' && x.statut_code !== 'REFUSEE').length,
    fournisseurs: f,
    ...p,
  }
}

function contrat(p: Partial<ContratPricing> = {}): ContratPricing {
  return {
    contrat_id: 'ct1',
    reference_fournisseur: null,
    avancement_code: 'DEMANDE',
    avancement_libelle: 'Demandé',
    statut_signature: null,
    date_reception_souhaitee: '2026-09-18',
    jours_avant_reception: 0,
    date_creation: '2026-09-16T10:00:00Z',
    date_envoi_signature: null,
    date_signature: null,
    docusign_envelope_id: null,
    fournisseur_nom: 'TOTAL ENERGIES',
    fournisseur_compte_id: null,
    compte_id: null,
    compte_nom: 'RÉSIDENCE BÉRANGER',
    compte_proprietaire_id: null,
    recommandation_id: null,
    recommandation_nom: null,
    recommandation_proprietaire_id: null,
    ...p,
  }
}

const gestes = (a: { geste: string }[]) => a.map((x) => x.geste)

describe('joursOuvresEcoules', () => {
  it('ne compte pas le week-end', () => {
    // Vendredi 18 h → lundi : un seul jour ouvré s'est écoulé, le lundi.
    expect(joursOuvresEcoules(new Date(2026, 8, 11, 18), new Date(2026, 8, 14, 9))).toBe(1)
  })
  it('rend zéro dans la même journée', () => {
    expect(joursOuvresEcoules(new Date(2026, 8, 18, 9), new Date(2026, 8, 18, 18))).toBe(0)
  })
})

describe('les gestes d’une version', () => {
  it('demande l’offre à un fournisseur MAIL dès la création', () => {
    const a = journeeDuPricing([version()], [], JEUDI_MATIN)
    expect(gestes(a)).toEqual(['ECRIRE_DEMANDE'])
    expect(a[0].urgence).toBe('a_lancer')
  })

  it('distingue Tradéo du mail — le geste n’est pas le même', () => {
    const a = journeeDuPricing([version({ fournisseurs: [fournisseur({ mode_reponse: 'TRADEO' })] })], [], JEUDI_MATIN)
    expect(gestes(a)).toEqual(['SAISIR_TRADEO'])
  })

  it('passe la demande en retard après un jour ouvré', () => {
    const v = version({ version_date_creation: '2026-09-16T09:00:00Z' })
    expect(journeeDuPricing([v], [], JEUDI_MATIN)[0].urgence).toBe('retard')
  })

  it('ne demande RIEN à un fournisseur Plateforme avant le jour J', () => {
    const v = version({ fournisseurs: [fournisseur({ mode_reponse: 'PLATEFORME' })] })
    expect(journeeDuPricing([v], [], JEUDI_MATIN)).toEqual([])
  })

  it('fait relever les prix d’un Plateforme le jour de la livraison', () => {
    const v = version({ date_souhaitee: '2026-09-18', fournisseurs: [fournisseur({ mode_reponse: 'GRILLE' })] })
    const a = journeeDuPricing([v], [], JEUDI_MATIN)
    expect(gestes(a)).toEqual(['RELEVER_PRIX'])
    expect(a[0].urgence).toBe('aujourdhui')
  })

  it('relance la confirmation jamais reçue, un jour ouvré après l’envoi', () => {
    const v = version({
      fournisseurs: [fournisseur({ statut_code: 'ENVOYEE', statut_libelle: 'Demande envoyée', date_evenement: '2026-09-16T10:00:00Z' })],
    })
    expect(gestes(journeeDuPricing([v], [], JEUDI_MATIN))).toEqual(['RELANCER_CONFIRMATION'])
  })

  it('ne relance pas une confirmation envoyée le matin même', () => {
    const v = version({
      fournisseurs: [fournisseur({ statut_code: 'ENVOYEE', date_evenement: '2026-09-18T09:00:00Z' })],
    })
    expect(journeeDuPricing([v], [], JEUDI_MATIN)).toEqual([])
  })

  it('n’ouvre la relance d’offre du jour J qu’à partir de 15 h', () => {
    const v = version({
      date_souhaitee: '2026-09-18',
      fournisseurs: [fournisseur({ statut_code: 'ACCEPTEE', statut_libelle: 'Demande acceptée' })],
    })
    expect(journeeDuPricing([v], [], JEUDI_MATIN)).toEqual([])
    expect(gestes(journeeDuPricing([v], [], JEUDI_APRES_15H))).toEqual(['RELANCER_OFFRE'])
  })

  it('relance sur l’OFFRE et non sur la confirmation quand l’échéance est passée', () => {
    /* Un seul geste par fournisseur : deux lignes donneraient deux appels pour un seul. */
    const v = version({
      date_souhaitee: '2026-09-16',
      fournisseurs: [fournisseur({ statut_code: 'ENVOYEE', date_evenement: '2026-09-14T10:00:00Z' })],
    })
    expect(gestes(journeeDuPricing([v], [], JEUDI_MATIN))).toEqual(['RELANCER_OFFRE'])
  })

  it('réclame la proposition commerciale quand tout est arrivé', () => {
    const v = version({
      fournisseurs: [
        fournisseur({ id: 'a', statut_code: 'DISPONIBLE' }),
        fournisseur({ id: 'b', fournisseur_nom: 'PICOTY', statut_code: 'REFUSEE' }),
      ],
    })
    expect(gestes(journeeDuPricing([v], [], JEUDI_MATIN))).toEqual(['EDITER_PROPOSITION'])
  })

  it('ne la réclame pas si tous les fournisseurs ont refusé', () => {
    const v = version({ fournisseurs: [fournisseur({ statut_code: 'REFUSEE' })] })
    expect(journeeDuPricing([v], [], JEUDI_MATIN)).toEqual([])
  })

  it('signale un fournisseur sans mode de réponse plutôt que d’en inventer un', () => {
    const v = version({ fournisseurs: [fournisseur({ mode_reponse: null })] })
    const a = journeeDuPricing([v], [], JEUDI_MATIN)
    expect(a[0].titre).toContain('Mode de réponse inconnu')
  })
})

describe('les gestes d’un contrat', () => {
  it('demande le contrat tant qu’il est en brouillon', () => {
    expect(gestes(journeeDuPricing([], [contrat({ avancement_code: 'BROUILLON' })], JEUDI_MATIN)))
      .toEqual(['DEMANDER_CONTRAT'])
  })

  it('relance passé 15 h le jour de la réception souhaitée', () => {
    expect(journeeDuPricing([], [contrat()], JEUDI_MATIN)).toEqual([])
    expect(gestes(journeeDuPricing([], [contrat()], JEUDI_APRES_15H))).toEqual(['RELANCER_CONTRAT'])
  })

  it('ne relance PAS une demande faite après 15 h pour le jour même', () => {
    /* L'exception de William : « ce serait débile de lui proposer une relance alors qu'il vient
       juste d'envoyer la demande ». */
    const c = contrat({ date_creation: '2026-09-18T15:30:00' })
    expect(journeeDuPricing([], [c], JEUDI_APRES_15H)).toEqual([])
  })

  it('relance quand même si la demande date de la veille', () => {
    const c = contrat({ date_creation: '2026-09-17T16:00:00' })
    expect(gestes(journeeDuPricing([], [c], JEUDI_APRES_15H))).toEqual(['RELANCER_CONTRAT'])
  })

  it('fait transmettre au fournisseur un contrat signé', () => {
    expect(gestes(journeeDuPricing([], [contrat({ avancement_code: 'SIGNE' })], JEUDI_MATIN)))
      .toEqual(['TRANSMETTRE_CONTRAT'])
  })

  it('se tait sur un contrat parti en signature', () => {
    expect(journeeDuPricing([], [contrat({ avancement_code: 'ENVOYE' })], JEUDI_MATIN)).toEqual([])
  })
})

describe('l’ordre', () => {
  it('met les retards avant ce qui est à lancer', () => {
    const enRetard = version({
      version_id: 'v-retard',
      date_souhaitee: '2026-09-16',
      fournisseurs: [fournisseur({ id: 'x', statut_code: 'ACCEPTEE' })],
    })
    const a = journeeDuPricing([enRetard, version()], [], JEUDI_MATIN)
    expect(a[0].urgence).toBe('retard')
    expect(a[a.length - 1].urgence).toBe('a_lancer')
  })
})

describe('le calendrier de production', () => {
  it('compte les offres ENCORE attendues, pas les fournisseurs', () => {
    const v = version({
      date_souhaitee: '2026-09-22',
      fournisseurs: [
        fournisseur({ id: 'a', statut_code: 'DISPONIBLE' }),
        fournisseur({ id: 'b', statut_code: 'ENVOYEE' }),
      ],
    })
    const c = calendrierDeProduction([v])
    expect(c.get('2026-09-22')?.offresAttendues).toBe(1)
  })

  it('regroupe plusieurs versions sur le même jour', () => {
    const c = calendrierDeProduction([version(), version({ version_id: 'v2' })])
    expect(c.get('2026-09-22')?.versions).toHaveLength(2)
  })

  it('ignore les versions sans date souhaitée', () => {
    expect(calendrierDeProduction([version({ date_souhaitee: null })]).size).toBe(0)
  })
})

describe('les fériés comptent', () => {
  /* Le 1er mai 2026 tombe un vendredi : du jeudi 30 avril au lundi 4 mai, le seul jour ouvré est le
     lundi. La relance s'ouvre donc le LUNDI — le jour ouvré suivant l'envoi — et pas le vendredi. */
  const v = version({
    date_souhaitee: '2026-05-20',
    fournisseurs: [fournisseur({ statut_code: 'ENVOYEE', date_evenement: '2026-04-30T16:00:00' })],
  })

  it('ne réclame rien le vendredi férié ni pendant le week-end', () => {
    expect(journeeDuPricing([v], [], new Date(2026, 4, 1, 10))).toEqual([])
    expect(journeeDuPricing([v], [], new Date(2026, 4, 3, 10))).toEqual([])
  })

  it('réclame la relance le lundi, premier jour ouvré depuis l’envoi', () => {
    expect(gestes(journeeDuPricing([v], [], new Date(2026, 4, 4, 9)))).toEqual(['RELANCER_CONFIRMATION'])
  })

  it('ne compte pas le 1er mai comme un jour ouvré', () => {
    expect(joursOuvresEcoules(new Date(2026, 3, 30, 17), new Date(2026, 4, 1, 9))).toBe(0)
    expect(joursOuvresEcoules(new Date(2026, 3, 30, 17), new Date(2026, 4, 4, 9))).toBe(1)
  })
})

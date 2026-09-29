import { describe, expect, it } from 'vitest'
import { appliquerLeconsSures, consignesApprises, normaliserLecture, type Lecon } from '../../../api/ocr/_apprentissage'
import { normaliserFournisseur } from '@/lib/data/apprentissageExtraction'

/**
 * ══ LA LECTURE DES FACTURES APPREND DES COMMERCIAUX ══
 *
 * William, 29/09/2026 : « Pour le P012, il est possible que ce soit renseigné P12 dans la facture.
 * Pour le P017, P17. […] Tu dois apprendre des corrections apportées par les commerciaux. »
 */
const champ = (value: string | null) => ({ value, confidence: 0.9 })

describe('normaliserLecture', () => {
  it('« P12 » est le profil P012, « P17 » le P017', () => {
    expect(normaliserLecture({ profil_consommation: champ('P12') }).profil_consommation.value).toBe('P012')
    expect(normaliserLecture({ profil_consommation: champ('P17') }).profil_consommation.value).toBe('P017')
    expect(normaliserLecture({ profil_consommation: champ('p 012') }).profil_consommation.value).toBe('P012')
    expect(normaliserLecture({ profil_consommation: champ('P-16') }).profil_consommation.value).toBe('P016')
  })

  it('ne fabrique pas un profil qui n’existe pas', () => {
    expect(normaliserLecture({ profil_consommation: champ('P20') }).profil_consommation.value).toBe('P20')
    expect(normaliserLecture({ profil_consommation: champ('P10') }).profil_consommation.value).toBe('P10')
  })

  it('le tarif et l’énergie retrouvent leur forme', () => {
    expect(normaliserLecture({ tarif_distribution: champ('Tarif T 2') }).tarif_distribution.value).toBe('T2')
    expect(normaliserLecture({ type_energie: champ('Électricité') }).type_energie.value).toBe('electricite')
    expect(normaliserLecture({ segment: champ(' c5 ') }).segment.value).toBe('C5')
  })
})

const lecon = (l: Partial<Lecon>): Lecon => ({
  fournisseur_lu: 'ENGIE', champ: 'tarif_distribution', valeur_lue: 'T1', valeur_retenue: 'T2',
  nb: 3, total: 3, sure: true, ...l,
})

describe('appliquerLeconsSures', () => {
  it('corrige d’office chez le bon fournisseur, et garde la lecture d’origine', () => {
    const r = appliquerLeconsSures({ fournisseur_nom: champ('Engie'), tarif_distribution: champ('T1') }, [lecon({})])
    expect(r.tarif_distribution.value).toBe('T2')
    expect(r.tarif_distribution.lu).toBe('T1')
  })

  it('ne touche pas un autre fournisseur, ni une leçon pas encore sûre', () => {
    expect(appliquerLeconsSures({ fournisseur_nom: champ('EDF'), tarif_distribution: champ('T1') }, [lecon({})]).tarif_distribution.value).toBe('T1')
    expect(appliquerLeconsSures({ fournisseur_nom: champ('Engie'), tarif_distribution: champ('T1') }, [lecon({ sure: false })]).tarif_distribution.value).toBe('T1')
  })

  it('ne comble jamais d’office un champ que la facture n’a pas donné', () => {
    const r = appliquerLeconsSures({ fournisseur_nom: champ('Engie'), tarif_distribution: champ(null) }, [lecon({ valeur_lue: null })])
    expect(r.tarif_distribution.value).toBeNull()
  })

  it('les consignes nomment le fournisseur et la correction', () => {
    const texte = consignesApprises([lecon({})])
    expect(texte).toContain('Factures ENGIE')
    expect(texte).toContain('lu « T1 »')
  })
})

describe('normaliserFournisseur', () => {
  it('désigne le même modèle quelle que soit l’écriture', () => {
    expect(normaliserFournisseur('Électricité de France')).toBe(normaliserFournisseur('ELECTRICITE  DE FRANCE'))
    expect(normaliserFournisseur('TotalEnergies-Pro')).toBe('TOTALENERGIES PRO')
  })
})

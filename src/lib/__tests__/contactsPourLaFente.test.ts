import { describe, expect, it } from 'vitest'
import { contactsPourLaFente, estMembreConseilSyndical } from '@/lib/contactRoles'

const gestionnaire = { id: 'g', roles: ['DECISIONNAIRE', 'SIGNATAIRE'] }
const membreCS = { id: 'cs', roles: ['CONSEIL_SYNDICAL'] }
const potentiel = { id: 'p', roles: ['DECISIONNAIRE_POTENTIEL'] }
const sansRole = { id: 'n', roles: [] }
/* Possible : la contrainte n'interdit les deux fentes que sur le MÊME compteur. */
const lesDeux = { id: 'd', roles: ['DECISIONNAIRE', 'CONSEIL_SYNDICAL'] }

const tous = [gestionnaire, membreCS, potentiel, sansRole, lesDeux]

describe('estMembreConseilSyndical', () => {
  it('reconnaît le rôle, quelle que soit sa place dans la liste', () => {
    expect(estMembreConseilSyndical(membreCS)).toBe(true)
    expect(estMembreConseilSyndical(lesDeux)).toBe(true)
  })

  it('est faux pour un contact ordinaire, et pour un contact sans rôle', () => {
    expect(estMembreConseilSyndical(gestionnaire)).toBe(false)
    expect(estMembreConseilSyndical(sansRole)).toBe(false)
  })

  it('supporte un contact dont les rôles sont absents ou nuls', () => {
    expect(estMembreConseilSyndical({ roles: null })).toBe(false)
    expect(estMembreConseilSyndical({})).toBe(false)
  })
})

describe('contactsPourLaFente', () => {
  it('la fente du conseil syndical ne propose que des membres CS', () => {
    expect(contactsPourLaFente(tous, 'conseilSyndical').map((c) => c.id)).toEqual(['cs', 'd'])
  })

  it('la fente du responsable exclut les membres CS', () => {
    expect(contactsPourLaFente(tous, 'responsable').map((c) => c.id)).toEqual(['g', 'p', 'n'])
  })

  /* LA RÉGRESSION QUI COÛTERAIT UNE DONNÉE : un champ affiché vide s'enregistre vide. */
  it('garde le contact déjà choisi même s’il ne passe pas le filtre', () => {
    expect(contactsPourLaFente(tous, 'responsable', 'cs').map((c) => c.id)).toEqual(['g', 'cs', 'p', 'n'])
    expect(contactsPourLaFente(tous, 'conseilSyndical', 'g').map((c) => c.id)).toEqual(['g', 'cs', 'd'])
  })

  it('un déjà-choisi absent de la liste ne fabrique rien', () => {
    expect(contactsPourLaFente(tous, 'conseilSyndical', 'inconnu').map((c) => c.id)).toEqual(['cs', 'd'])
  })
})

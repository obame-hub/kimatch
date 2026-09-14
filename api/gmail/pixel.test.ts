import { describe, expect, it } from 'vitest'

/**
 * ══ LE PIXEL DE SUIVI ══
 *
 * William, 14/09/2026 : « tracker quand ils lisent l'email, quand ils ouvrent nos emails ».
 *
 * Ces tests portent sur les deux choses qui, si elles cassaient, casseraient en silence : l'image
 * elle-même — un GIF mal formé afficherait un carré gris DANS LE MAIL DU CLIENT — et la balise
 * insérée dans le corps, qui doit rester invisible.
 */

/** Le même octet pour octet que dans `api/gmail/ouvert.ts`. */
const PIXEL_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

describe('l’image du pixel', () => {
  const pixel = Buffer.from(PIXEL_BASE64, 'base64')

  it('est un GIF valide', () => {
    expect(pixel.slice(0, 6).toString('ascii')).toMatch(/^GIF8[79]a$/)
  })

  it('mesure exactement un pixel sur un', () => {
    expect(pixel.readUInt16LE(6)).toBe(1)
    expect(pixel.readUInt16LE(8)).toBe(1)
  })

  /* Sans l'octet de fin, certains clients affichent une image cassée plutôt que rien — un carré
     gris au milieu du message qu'on vient d'écrire au client. */
  it('se termine par le marqueur de fin de flux', () => {
    expect(pixel[pixel.length - 1]).toBe(0x3b)
  })
})

/** Reproduit la balise composée dans `api/gmail/send.ts`. */
function baliseSuivi(base: string, jeton: string): string {
  const racine = base.replace(/\/+$/, '')
  return (
    `<img src="${racine}/api/gmail/ouvert?j=${jeton}" width="1" height="1" `
    + 'alt="" style="display:block;width:1px;height:1px;border:0;" />'
  )
}

describe('la balise insérée dans le mail', () => {
  const jeton = '0f6d2c4a-9b1e-4a7f-8c3d-1e2f3a4b5c6d'

  it('pointe le point d’entrée avec le jeton', () => {
    expect(baliseSuivi('https://kimatch.fr', jeton))
      .toContain(`https://kimatch.fr/api/gmail/ouvert?j=${jeton}`)
  })

  /* Une adresse avec barre oblique finale donnerait `//api/gmail/...`. Certains serveurs
     l'acceptent, Vercel répond 308, et une redirection sur une image de mail n'est suivie par
     personne : le suivi serait muet sans que rien ne le signale. */
  it('ne double pas la barre oblique quand l’adresse en porte une', () => {
    expect(baliseSuivi('https://kimatch.fr/', jeton)).not.toContain('fr//api')
  })

  it('reste invisible : un pixel, sans bordure, sans texte de remplacement', () => {
    const balise = baliseSuivi('https://kimatch.fr', jeton)
    expect(balise).toContain('width="1"')
    expect(balise).toContain('height="1"')
    expect(balise).toContain('border:0')
    expect(balise).toContain('alt=""')
  })
})

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exigerSession, refuserLesPartenaires } from '../_auth.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'IMPRESSION DE LA PROPOSITION COMMERCIALE EN PDF
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 04/10/2026 : « Je veux de la très haute définition, aucun flou ou aucun pixel visible ! »
 * Les modèles validés ont été imprimés par Chrome ; ce point d'entrée fait de même — un Chromium sans
 * écran imprime le document HTML reçu : texte vectoriel, logos à leur résolution, A4 exact.
 *
 *   · en ligne (Vercel) : `@sparticuz/chromium`, le Chromium allégé des fonctions serveur ;
 *   · en local : le Google Chrome de la machine.
 *
 * LE DOCUMENT ARRIVE COMPLET (polices et images en `data:`) : le navigateur d'impression n'a le droit
 * d'aller chercher AUCUNE ressource sur le réseau — un HTML qu'on imprime ne doit pas pouvoir
 * interroger ce que le serveur, lui, peut joindre.
 */

const TAILLE_MAX = 4_000_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }
  const utilisateur = await exigerSession(req, res)
  if (!utilisateur) return
  if (await refuserLesPartenaires(utilisateur, res)) return

  const { html, nomFichier } = (req.body ?? {}) as { html?: unknown; nomFichier?: unknown }
  if (typeof html !== 'string' || !html.startsWith('<!doctype html>')) {
    res.status(400).json({ error: 'Document HTML requis.' })
    return
  }
  if (html.length > TAILLE_MAX) {
    res.status(413).json({ error: 'Document trop lourd pour être imprimé (logos trop volumineux ?).' })
    return
  }

  let navigateur: { close: () => Promise<void> } | null = null
  try {
    const { chromium: playwright } = await import('playwright-core')
    if (process.env.VERCEL) {
      const chromium = (await import('@sparticuz/chromium')).default
      navigateur = await playwright.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
    } else {
      navigateur = await playwright.launch({ channel: 'chrome', headless: true })
    }
    const b = navigateur as Awaited<ReturnType<typeof playwright.launch>>
    const page = await b.newPage()
    await page.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()))
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate('document.fonts.ready.then(() => true)')
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
    const nom = typeof nomFichier === 'string' && nomFichier.trim() ? nomFichier.replace(/[^\w.\- ]+/g, '_') : 'proposition.pdf'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`)
    res.status(200).end(Buffer.from(pdf))
  } catch (e) {
    res.status(500).json({ error: `Impression impossible : ${e instanceof Error ? e.message : String(e)}` })
  } finally {
    await navigateur?.close().catch(() => undefined)
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { LARGEUR_BLOC } from '@/lib/offrePdf/blocs'

/**
 * Un tableau de la proposition, dans la fiche — le tableau même du PDF (`offrePdf/blocs.ts`).
 *
 * ══ À LA TAILLE DE LA PAGE, PAS À CELLE DU CADRE — William, 05/10/2026 ══
 * « Les tableaux sont trop gros, j'aimerais que la police utilisée dans le tableau soit cohérente et
 * harmonieuse avec le reste de la page. » Le tableau s'agrandissait jusqu'à remplir le bloc : sur un
 * grand écran, ses lignes passaient à 17 px. Il est désormais rendu à 1,2 fois la taille du PDF — ses
 * lignes à 12,5 px, comme le texte de la fiche — et ce sont ses COLONNES qui s'étirent sur la largeur
 * disponible. Plus étroit que cela, le cadre défile à l'horizontale (William, 04/10/2026 : « si la
 * place est suffisante, oublie le scroll »).
 *
 * ══ SANS FLASH ══
 * « Le passage de HTVA à TTC applique un bug visuel, un flash que je ne veux pas. » Le cadre se
 * rechargeait à chaque changement — page blanche le temps de relire les polices. Il ne se charge plus
 * qu'une fois : ensuite, seul son contenu est remplacé, sur place, polices déjà prêtes.
 */
const ECHELLE = 1.2

export function ApercuBloc({ html, titre }: { html: string; titre: string }) {
  const boite = useRef<HTMLDivElement>(null)
  const cadre = useRef<HTMLIFrameElement>(null)
  const [largeur, setLargeur] = useState(0)
  const [hauteur, setHauteur] = useState(0)
  /* Le premier document seulement : les suivants s'injectent sans recharger le cadre. */
  const [premier] = useState(html)
  const charge = useRef(false)

  useEffect(() => {
    const el = boite.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLargeur(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const mesurer = useCallback(() => {
    const doc = cadre.current?.contentDocument
    if (doc?.body) setHauteur(doc.body.scrollHeight)
  }, [])

  const injecter = useCallback((h: string) => {
    const doc = cadre.current?.contentDocument
    if (!doc?.body) return
    doc.body.innerHTML = new DOMParser().parseFromString(h, 'text/html').body.innerHTML
    mesurer()
  }, [mesurer])

  useEffect(() => {
    if (charge.current) injecter(html)
  }, [html, injecter])

  const interieure = Math.max(LARGEUR_BLOC + 2, largeur / ECHELLE)
  useEffect(() => {
    const t = requestAnimationFrame(mesurer)
    return () => cancelAnimationFrame(t)
  }, [interieure, mesurer])

  const surCharge = () => {
    charge.current = true
    if (html !== premier) injecter(html)
    mesurer()
    void cadre.current?.contentDocument?.fonts?.ready.then(mesurer)
  }

  const defile = largeur > 0 && largeur < (LARGEUR_BLOC + 2) * ECHELLE
  return (
    <div ref={boite} className={defile ? 'w-full overflow-x-auto overflow-y-hidden' : 'w-full overflow-hidden'}>
      <div style={{ width: interieure * ECHELLE, height: hauteur ? hauteur * ECHELLE : 140 }}>
        <iframe
          ref={cadre}
          title={titre}
          srcDoc={premier}
          sandbox="allow-same-origin"
          scrolling="no"
          onLoad={surCharge}
          style={{ width: interieure, height: hauteur || 140, border: 0, transform: `scale(${ECHELLE})`, transformOrigin: '0 0', display: 'block', background: 'transparent' }}
        />
      </div>
    </div>
  )
}

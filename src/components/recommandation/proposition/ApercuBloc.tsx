import { useEffect, useRef, useState } from 'react'
import { LARGEUR_BLOC } from '@/lib/offrePdf/blocs'

/**
 * Un tableau de la proposition, à la largeur de son conteneur. Le tableau garde ses proportions
 * d'A4 et s'agrandit d'un seul tenant : à l'écran, les petits corps du PDF (8,5 px) se lisent sans
 * loupe, et la mise en page reste celle que recevra le client.
 */
export function ApercuBloc({ html, titre }: { html: string; titre: string }) {
  const boite = useRef<HTMLDivElement>(null)
  const cadre = useRef<HTMLIFrameElement>(null)
  const [largeur, setLargeur] = useState(LARGEUR_BLOC)
  const [hauteur, setHauteur] = useState(0)

  useEffect(() => {
    const el = boite.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLargeur(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const mesurer = () => {
    const doc = cadre.current?.contentDocument
    if (!doc) return
    const lire = () => setHauteur(doc.documentElement.scrollHeight)
    lire()
    void doc.fonts?.ready.then(lire)
  }

  const echelle = largeur / (LARGEUR_BLOC + 2)
  return (
    <div ref={boite} className="w-full" style={{ height: hauteur * echelle || undefined, minHeight: hauteur ? undefined : 120 }}>
      <iframe
        ref={cadre}
        title={titre}
        srcDoc={html}
        sandbox="allow-same-origin"
        scrolling="no"
        onLoad={mesurer}
        style={{ width: LARGEUR_BLOC + 2, height: hauteur || 120, border: 0, transform: `scale(${echelle})`, transformOrigin: '0 0', display: 'block' }}
      />
    </div>
  )
}

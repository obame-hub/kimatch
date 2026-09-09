import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, Maximize2, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CadreVide } from '@/components/mandat/ListeFichiers'

/**
 * ══ LIRE UN PDF DANS KIMATCH, SANS OUVRIR D'ONGLET ══
 *
 * William, 09/09/2026 : « une visualisatrice de PDF hyper optimisée, reprenant le design de Kimatch.
 * Laisse la possibilité de naviguer entre les pages avec des flèches, pas uniquement du défilement
 * continu. Et l'affichage doit être optimisé pour la lecture, donc le fichier doit être gros et
 * utiliser la largeur à son max. »
 *
 * ── POURQUOI PDF.JS ET PAS UNE `<iframe>` ──
 *
 * L'aperçu précédent (`ApercuDocument`) posait le fichier dans une `<iframe>` : c'était la
 * visionneuse de Chrome, avec sa barre d'outils grise. On ne peut ni la styler, ni lui poser des
 * flèches, ni savoir quelle page elle affiche. Les trois demandes ci-dessus étaient hors de portée
 * par ce chemin. `pdf.js` rend chaque page dans un canvas qu'on maîtrise entièrement.
 *
 * Le pari est le bon : sur les 6 539 documents de Kimatch, 6 539 sont des PDF. Les six PNG et trois
 * DOCX restent servis par l'aperçu générique.
 *
 * ── TROIS CHOSES QUI FONT LA DIFFÉRENCE ENTRE « UN PDF DANS UNE PAGE » ET « UN DOCUMENT » ──
 *
 * · LE RENDU EST FAIT AU DOUBLE DE LA TAILLE AFFICHÉE. Un canvas dessiné à sa taille CSS est baveux
 *   sur un écran Retina — le texte d'un contrat y devient pénible au bout de deux pages. On rend à
 *   `devicePixelRatio` (plafonné à 2 : au-delà, la mémoire double sans gain visible) et on affiche
 *   en taille simple.
 *
 * · SEULE LA PAGE COURANTE EST RENDUE. Un contrat de quarante pages dessiné d'un bloc fige l'onglet
 *   plusieurs secondes ; le plus gros document de la base fait 37 Mo. On ne rend que ce qu'on
 *   regarde, et le changement de page est alors instantané.
 *
 * · UN RENDU EN COURS S'ANNULE. Changer de page ou de zoom pendant un rendu laisserait deux
 *   dessins se disputer le même canvas — pdf.js lève alors une exception et la page reste blanche.
 *   La tâche précédente est donc annulée avant d'en lancer une autre.
 *
 * ── LE WORKER VIENT DU PAQUET, PAS D'UN CDN ──
 *
 * `pdf.js` déporte le décodage dans un web worker. Le charger depuis un CDN ferait dépendre
 * l'affichage d'un contrat client d'un serveur tiers, et casserait le jour où le réseau de Kiwee
 * bloque ce domaine. `import.meta.url` le fait empaqueter par Vite avec le reste.
 */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/** Bornes du zoom. En deçà on ne lit plus, au-delà on ne fait plus que défiler. */
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.5

export function VisionneusePdf({ url, nomFichier }: { url: string; nomFichier: string }) {
  const [document_, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  /** `null` = ajusté à la largeur disponible, ce qui est le mode de lecture par défaut. */
  const [ajusteLargeur, setAjusteLargeur] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(true)

  const canvas = useRef<HTMLCanvasElement>(null)
  const zoneRendu = useRef<HTMLDivElement>(null)
  const tacheRendu = useRef<{ cancel: () => void } | null>(null)

  // ── Chargement du document ──
  useEffect(() => {
    let annule = false
    setChargement(true)
    setErreur(null)
    setPage(1)

    const tache = pdfjs.getDocument({ url, withCredentials: false })
    tache.promise
      .then((doc) => {
        // `tache.destroy()` du nettoyage suffit à libérer le document : `PDFDocumentProxy`
        // n'expose pas de `destroy` propre dans pdf.js 6.
        if (annule) return
        setDocument(doc)
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof Error ? e.message : 'Ce document n’a pas pu être ouvert.')
      })
      .finally(() => { if (!annule) setChargement(false) })

    return () => {
      annule = true
      void tache.destroy()
    }
  }, [url])

  // ── Rendu de la page courante ──
  const rendre = useCallback(async () => {
    const doc = document_
    const cible = canvas.current
    const zone = zoneRendu.current
    if (!doc || !cible || !zone) return

    // Une tâche encore en cours écrirait dans le même canvas que la nouvelle.
    tacheRendu.current?.cancel()

    const p = await doc.getPage(page)
    const nature = p.getViewport({ scale: 1 })
    // La largeur disponible moins les marges de lecture — voir `padding` de la zone.
    const echelle = ajusteLargeur ? Math.max(0.2, (zone.clientWidth - 48) / nature.width) : zoom
    const viewport = p.getViewport({ scale: echelle })

    const densite = Math.min(window.devicePixelRatio || 1, 2)
    cible.width = Math.floor(viewport.width * densite)
    cible.height = Math.floor(viewport.height * densite)
    cible.style.width = `${Math.floor(viewport.width)}px`
    cible.style.height = `${Math.floor(viewport.height)}px`

    const contexte = cible.getContext('2d')
    if (!contexte) return
    const tache = p.render({
      canvas: cible,
      canvasContext: contexte,
      viewport,
      transform: densite === 1 ? undefined : [densite, 0, 0, densite, 0, 0],
    })
    tacheRendu.current = tache
    try {
      await tache.promise
    } catch {
      /* Rendu annulé au profit d'un plus récent : c'est le fonctionnement normal, pas une panne. */
    }
  }, [document_, page, zoom, ajusteLargeur])

  useEffect(() => { void rendre() }, [rendre])

  // Le mode « ajusté à la largeur » suit les changements de taille de la fenêtre.
  useEffect(() => {
    if (!ajusteLargeur) return
    const observateur = new ResizeObserver(() => { void rendre() })
    if (zoneRendu.current) observateur.observe(zoneRendu.current)
    return () => observateur.disconnect()
  }, [ajusteLargeur, rendre])

  const nbPages = document_?.numPages ?? 0
  const allerA = useCallback(
    (n: number) => setPage((p) => Math.min(Math.max(n, 1), Math.max(nbPages, 1)) || p),
    [nbPages],
  )

  /**
   * LES FLÈCHES DU CLAVIER, PARCE QUE CELLES DE L'ÉCRAN NE SUFFISENT PAS.
   *
   * Feuilleter un contrat de quarante pages à la souris demande de viser un bouton de 28 px à
   * chaque page. On écoute donc ← et →, en laissant tranquille toute frappe venue d'un champ de
   * saisie — le numéro de page en est un.
   */
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const cible = e.target as HTMLElement | null
      if (cible?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); allerA(page - 1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); allerA(page + 1) }
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [allerA, page])

  const boutonBarre =
    'flex h-7 w-7 items-center justify-center rounded-km-sm text-km-muted transition-colors hover:bg-km-soft hover:text-km-text disabled:opacity-35 disabled:hover:bg-transparent'

  if (erreur) {
    return (
      <CadreVide>
        <p className="text-km-body font-bold text-km-text">Ce document n’a pas pu être ouvert</p>
        <p className="max-w-[42ch] text-km-label leading-relaxed text-km-muted">{erreur}</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 rounded-km border border-km-line bg-white px-2.5 py-1 text-km-label font-semibold text-km-muted hover:border-km-green hover:text-km-green"
        >
          <ExternalLink className="h-3 w-3" />
          Ouvrir dans un onglet
        </a>
      </CadreVide>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-km-md border border-km-line bg-white">
      {/* ══ LA BARRE, AUX COULEURS DE KIMATCH ══
          C'est elle qui remplace la barre grise de Chrome : même hauteur de contrôle, mêmes jetons
          de couleur, même arrondi que le reste de l'application. */}
      <div className="flex flex-none items-center gap-1 border-b border-km-line bg-km-bg px-2.5 py-1.5">
        <p className="mr-auto min-w-0 truncate pr-2 text-km-label font-bold text-km-text" title={nomFichier}>
          {nomFichier}
        </p>

        <button type="button" className={boutonBarre} onClick={() => allerA(page - 1)} disabled={page <= 1} title="Page précédente (←)">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1 px-0.5 font-mono text-km-label text-km-muted">
          <input
            value={page}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ''))
              if (n) allerA(n)
            }}
            aria-label="Numéro de page"
            className="w-8 rounded-km-sm border border-km-line bg-white px-1 py-0.5 text-center text-km-label text-km-text focus:border-km-green focus:outline-none"
          />
          <span>/ {nbPages || '—'}</span>
        </div>
        <button type="button" className={boutonBarre} onClick={() => allerA(page + 1)} disabled={page >= nbPages} title="Page suivante (→)">
          <ChevronRight className="h-4 w-4" />
        </button>

        <span className="mx-1 h-4 w-px bg-km-line" />

        <button
          type="button"
          className={boutonBarre}
          onClick={() => { setAjusteLargeur(false); setZoom((z) => Math.max(ZOOM_MIN, Number((z - 0.15).toFixed(2)))) }}
          title="Réduire"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={cn(boutonBarre, ajusteLargeur && 'bg-km-green-soft text-km-green')}
          onClick={() => setAjusteLargeur(true)}
          title="Ajuster à la largeur"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={boutonBarre}
          onClick={() => { setAjusteLargeur(false); setZoom((z) => Math.min(ZOOM_MAX, Number((z + 0.15).toFixed(2)))) }}
          title="Agrandir"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-4 w-px bg-km-line" />

        <a href={url} target="_blank" rel="noreferrer" className={boutonBarre} title="Ouvrir dans un onglet">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <a href={url} download={nomFichier} className={boutonBarre} title="Télécharger">
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Le fond sombre-clair fait ressortir la page blanche : c'est la convention de toutes les
          visionneuses, et elle sert la lecture — une page blanche sur fond blanc n'a plus de bords. */}
      <div ref={zoneRendu} className="min-h-0 flex-1 overflow-auto bg-[#f0efec] p-6">
        {chargement ? (
          <div className="flex h-full items-center justify-center gap-2 text-km-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-km-label">Ouverture du document…</span>
          </div>
        ) : (
          <div className="flex justify-center">
            <canvas ref={canvas} className="rounded-[3px] shadow-[0_2px_14px_rgba(25,40,33,.16)]" />
          </div>
        )}
      </div>
    </div>
  )
}

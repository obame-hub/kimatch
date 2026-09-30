import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CARTE D'UN LIEU — un plan qu'on parcourt
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Fiche compteur v4 (Claude Design, 30/09/2026), bloc « Le lieu ». Écrite comme composant partagé
 * pour servir aussi la fiche d'un site.
 *
 * ══ CE QUI A CHANGÉ DEPUIS LA MAQUETTE ══
 *
 *   · un PLAN, plus une vue aérienne grise (William : « une map du style plan ou Google Map ») —
 *     Esri World Street Map, sans clé ;
 *   · une carte qu'on PARCOURT (« nous faire naviguer avec du zoom, dézoom, navigation gauche droite
 *     haut et bas ») : glisser pour se déplacer, + / − pour zoomer, les flèches du clavier une fois
 *     la carte sélectionnée, et « Recentrer » pour revenir au compteur ;
 *   · plus large et plus loin (zoom 15 au lieu de 18) pour voir le quartier.
 *
 * Leaflet, déjà employé par la carte des sites. La molette ne zoome qu'après un clic sur la carte :
 * sinon, faire défiler la fiche au-dessus de la carte la ferait zoomer sans qu'on l'ait voulu.
 *
 * Sans coordonnées, le cadre reste neutre et sans marqueur : une carte factice ferait croire à une
 * position connue. La mention des sources est obligatoire (conditions d'Esri).
 */
const ZOOM_INITIAL = 15

const MARQUEUR = L.divIcon({
  className: '',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: `<span style="position:absolute;inset:0;border-radius:50%;background:rgba(13,122,95,.14)"></span>
         <span style="position:absolute;left:15px;top:15px;width:14px;height:14px;border-radius:50%;background:#0D7A5F;border:3px solid #fff;box-shadow:0 2px 6px rgba(25,40,33,.3);box-sizing:border-box"></span>`,
})

/** La molette ne zoome qu'une fois la carte choisie, et plus dès que la souris la quitte. */
function MoletteAuClic() {
  const map = useMap()
  useEffect(() => {
    const activer = () => map.scrollWheelZoom.enable()
    const desactiver = () => map.scrollWheelZoom.disable()
    map.on('click', activer)
    map.on('mouseout', desactiver)
    return () => { map.off('click', activer); map.off('mouseout', desactiver) }
  }, [map])
  return null
}

/** Le bouton « Recentrer » n'apparaît que lorsqu'on s'est éloigné du compteur. */
function Recentrer({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  const [eloigne, setEloigne] = useState(false)
  useEffect(() => {
    const verifier = () => {
      const centre = map.getCenter()
      setEloigne(map.getZoom() !== ZOOM_INITIAL || map.latLngToContainerPoint(centre).distanceTo(map.latLngToContainerPoint([lat, lon])) > 8)
    }
    map.on('moveend', verifier)
    map.on('zoomend', verifier)
    return () => { map.off('moveend', verifier); map.off('zoomend', verifier) }
  }, [map, lat, lon])
  if (!eloigne) return null
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); map.setView([lat, lon], ZOOM_INITIAL) }}
      className="absolute bottom-6 right-2 z-[1000] rounded-[8px] border border-km-line bg-white px-[9px] py-1 text-[11px] font-semibold text-km-text shadow-[0_2px_8px_rgba(25,40,33,.12)] hover:bg-km-soft"
    >
      Recentrer
    </button>
  )
}

/** Le cadre peut changer de taille après le premier rendu (colonne, onglet) : on prévient Leaflet. */
function SuivreLaTaille({ cadre }: { cadre: React.RefObject<HTMLDivElement> }) {
  const map = useMap()
  useEffect(() => {
    const el = cadre.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(() => map.invalidateSize())
    obs.observe(el)
    return () => obs.disconnect()
  }, [map, cadre])
  return null
}

export function CarteLieu({ lat, lon, hauteurMin = 190 }: {
  lat: number | null | undefined
  lon: number | null | undefined
  hauteurMin?: number
}) {
  const cadre = useRef<HTMLDivElement>(null)
  const connue = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)
  return (
    <div ref={cadre} className="carte-lieu relative isolate border-l border-km-line bg-[#F2F3F0]" style={{ minHeight: hauteurMin }}>
      {connue && (
        <>
          <MapContainer
            key={`${lat},${lon}`}
            center={[lat, lon]}
            zoom={ZOOM_INITIAL}
            minZoom={5}
            maxZoom={19}
            scrollWheelZoom={false}
            keyboard
            attributionControl={false}
            style={{ position: 'absolute', inset: 0, background: '#F2F3F0' }}
          >
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} />
            <Marker position={[lat, lon]} icon={MARQUEUR} interactive={false} keyboard={false} />
            <MoletteAuClic />
            <Recentrer lat={lat} lon={lon} />
            <SuivreLaTaille cadre={cadre} />
          </MapContainer>
          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`}
            target="_blank"
            rel="noreferrer"
            className="absolute right-2 top-2 z-[1000] rounded-[8px] border border-km-line bg-white px-[9px] py-1 text-[11px] font-semibold text-km-text no-underline shadow-[0_2px_8px_rgba(25,40,33,.12)] hover:text-km-text hover:no-underline"
          >
            Ouvrir ↗
          </a>
          <span className="pointer-events-none absolute bottom-1 left-1.5 z-[1000] rounded-[3px] bg-white/70 px-1 text-[8.5px] text-km-muted">© Esri, HERE, Garmin, OpenStreetMap</span>
        </>
      )}
    </div>
  )
}

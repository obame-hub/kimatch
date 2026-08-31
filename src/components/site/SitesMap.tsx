import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { SiteHealth } from '@/lib/siteHealth'

const TONE_COLOR: Record<SiteHealth['tone'], string> = {
  kiwi: '#0d7a5f',
  amber: '#8a6420',
  red: '#ef4444',
}

function pinIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  })
}

export interface SitesMapItem {
  id: string
  nom: string
  ville: string | null
  compte_nom: string
  latitude: number | null
  longitude: number | null
  tone: SiteHealth['tone']
}

/**
 * Cadre la carte sur l'ensemble des sites, plutot que de centrer sur leur barycentre a un zoom
 * fixe. Demande du brief de William : « cadrage automatique sur l'ensemble de la zone couverte ».
 *
 * Le barycentre seul tombait au milieu de nulle part des qu'un compte avait des sites eloignes —
 * un syndic parisien avec un site a Vichy affichait une vue centree sur la Bourgogne, aucun des
 * deux visible. `fitBounds` montre les deux.
 *
 * Un seul site : on ne peut pas cadrer sur un point, on se centre dessus a un zoom de rue.
 */
function CadrerSurLesSites({ points }: { points: [number, number][] }) {
  const carte = useMap()
  // La signature evite de recadrer a chaque rendu : seul un vrai changement de points compte.
  const signature = points.map((p) => p.join(',')).join('|')

  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      carte.setView(points[0], 14)
      return
    }
    carte.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, carte])

  return null
}

export function SitesMap({ sites }: { sites: SitesMapItem[] }) {
  const navigate = useNavigate()
  const positioned = useMemo(
    () => sites.filter((s): s is SitesMapItem & { latitude: number; longitude: number } => s.latitude != null && s.longitude != null),
    [sites],
  )

  if (positioned.length === 0) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-1 rounded-xl border border-km-line bg-white text-center">
        <p className="text-sm font-semibold text-km-muted">Aucun site n'a de coordonnées enregistrées.</p>
        <p className="text-xs text-km-faint">Renseigne la latitude/longitude sur une fiche site pour la faire apparaître ici.</p>
      </div>
    )
  }

  const center: [number, number] = [
    positioned.reduce((sum, s) => sum + s.latitude, 0) / positioned.length,
    positioned.reduce((sum, s) => sum + s.longitude, 0) / positioned.length,
  ]

  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-km-line">
      <MapContainer center={center} zoom={positioned.length > 1 ? 6 : 12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <CadrerSurLesSites points={positioned.map((s) => [s.latitude, s.longitude] as [number, number])} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {positioned.map((s) => (
          <Marker key={s.id} position={[s.latitude, s.longitude]} icon={pinIcon(TONE_COLOR[s.tone])} eventHandlers={{ click: () => navigate(`/sites/${s.id}`) }}>
            <Popup>
              <p className="font-semibold text-km-text">{s.nom}</p>
              <p className="text-km-muted">{s.compte_nom}</p>
              {s.ville && <p className="text-km-faint">{s.ville}</p>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

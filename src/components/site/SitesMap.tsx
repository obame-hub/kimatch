import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
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

export function SitesMap({ sites }: { sites: SitesMapItem[] }) {
  const navigate = useNavigate()
  const positioned = useMemo(
    () => sites.filter((s): s is SitesMapItem & { latitude: number; longitude: number } => s.latitude != null && s.longitude != null),
    [sites],
  )

  if (positioned.length === 0) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-1 rounded-xl border border-navy-100 bg-white text-center">
        <p className="text-sm font-semibold text-navy-600">Aucun site n'a de coordonnées enregistrées.</p>
        <p className="text-xs text-navy-400">Renseigne la latitude/longitude sur une fiche site pour la faire apparaître ici.</p>
      </div>
    )
  }

  const center: [number, number] = [
    positioned.reduce((sum, s) => sum + s.latitude, 0) / positioned.length,
    positioned.reduce((sum, s) => sum + s.longitude, 0) / positioned.length,
  ]

  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-navy-100">
      <MapContainer center={center} zoom={positioned.length > 1 ? 6 : 12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {positioned.map((s) => (
          <Marker key={s.id} position={[s.latitude, s.longitude]} icon={pinIcon(TONE_COLOR[s.tone])} eventHandlers={{ click: () => navigate(`/sites/${s.id}`) }}>
            <Popup>
              <p className="font-semibold text-navy-800">{s.nom}</p>
              <p className="text-navy-500">{s.compte_nom}</p>
              {s.ville && <p className="text-navy-400">{s.ville}</p>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

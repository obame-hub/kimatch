/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CARTE D'UN LIEU — vue aérienne, sans texte
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Fiche compteur v4 (Claude Design, 30/09/2026), bloc « Le lieu ». Écrite comme composant partagé
 * pour servir aussi la fiche d'un site.
 *
 * ══ UN PLAN, PLUS UNE VUE AÉRIENNE (30/09/2026) ══
 *
 * William : « serait-il possible d'afficher une map du style plan ou Google Map ? » La maquette
 * posait Esri World Imagery passée au gris ; on garde le même fournisseur, sans clé, mais son fond
 * « World Street Map » — rues, noms, couleurs d'un plan routier — et sans filtre gris.
 *
 * ══ DES TUILES, PAS UNE BIBLIOTHÈQUE ══
 *
 * Esri sert des tuiles raster 256 px sans clé. Il suffit d'en poser
 * 5 × 3 autour du point, décalées de la fraction de tuile où il tombe : le point est alors au centre
 * exact du cadre, quelle que soit sa taille. Charger Leaflet pour une image fixe serait 40 Ko pour
 * rien. Adresse des tuiles en z/y/x — l'ordre d'Esri, pas celui d'OpenStreetMap.
 *
 * La mention des sources est obligatoire (conditions d'Esri). Sans coordonnées, le cadre reste
 * neutre et sans marqueur : une carte factice ferait croire à une position connue.
 */
const TAILLE = 256
/* 17 plutôt que 18 : un plan se lit avec ses rues voisines, là où la vue aérienne se lisait au
   bâtiment près. */
const ZOOM = 17

function tuiles(lat: number, lon: number) {
  const n = 2 ** ZOOM
  const r = (lat * Math.PI) / 180
  const fx = ((lon + 180) / 360) * n
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  const tx = Math.floor(fx)
  const ty = Math.floor(fy)
  const ox = (fx - tx) * TAILLE
  const oy = (fy - ty) * TAILLE
  const sortie: { cle: string; left: string; top: string; url: string }[] = []
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      sortie.push({
        cle: `${dx}:${dy}`,
        left: `calc(50% + ${dx * TAILLE - ox}px)`,
        top: `calc(50% + ${dy * TAILLE - oy}px)`,
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${ZOOM}/${ty + dy}/${tx + dx}`,
      })
    }
  }
  return sortie
}

export function CarteLieu({ lat, lon, hauteurMin = 170 }: {
  lat: number | null | undefined
  lon: number | null | undefined
  hauteurMin?: number
}) {
  const connue = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)
  return (
    <div className="relative border-l border-km-line bg-km-line-soft" style={{ minHeight: hauteurMin }}>
      <div className="absolute inset-0 overflow-hidden bg-[#F2F3F0]">
        {connue && (
          <>
            {tuiles(lat, lon).map((t) => (
              <span
                key={t.cle}
                aria-hidden="true"
                className="absolute"
                style={{
                  width: TAILLE,
                  height: TAILLE,
                  left: t.left,
                  top: t.top,
                  background: `url("${t.url}") center/100% 100% no-repeat`,
                }}
              />
            ))}
            <span aria-hidden="true" className="absolute left-1/2 top-1/2 -ml-[22px] -mt-[22px] h-[44px] w-[44px] rounded-full bg-[rgba(13,122,95,.14)]" />
            <span aria-hidden="true" className="absolute left-1/2 top-1/2 -ml-[7px] -mt-[7px] h-[14px] w-[14px] rounded-full border-[3px] border-white bg-km-green shadow-[0_2px_6px_rgba(25,40,33,.3)]" />
          </>
        )}
      </div>
      {connue && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`}
          target="_blank"
          rel="noreferrer"
          className="absolute right-2 top-2 rounded-[8px] border border-km-line bg-white px-[9px] py-1 text-[11px] font-semibold text-km-text no-underline shadow-[0_2px_8px_rgba(25,40,33,.12)] hover:text-km-text hover:no-underline"
        >
          Ouvrir ↗
        </a>
      )}
      {connue && <span className="absolute bottom-1 left-1.5 text-[8.5px] text-km-faint">© Esri, HERE, Garmin, OpenStreetMap</span>}
    </div>
  )
}

/**
 * ══ LES PICTOS DE LA MAQUETTE, RECOPIÉS TELS QUELS ══
 *
 * Handoff de William, 08/09/2026 : « à recopier tels quels (pas d'équivalents approximatifs d'une
 * bibliothèque d'icônes) ».
 *
 * L'application dessine ses icônes avec `lucide-react` partout ailleurs, et c'est très bien pour du
 * texte courant. Ici non : les pictos du chemin de conversion vivent dans des pastilles de 35 à
 * 40 px, sur un dégradé doré, à côté les uns des autres. Une flèche d'avion à 2 px de trait posée
 * contre un œil à 2,2 px se voit immédiatement — c'est le genre d'écart qui fait qu'un écran a l'air
 * « presque » soigné.
 *
 * Chaque chemin vient de `02-TOKENS.md`, avec sa propre épaisseur de trait.
 */

type ProprietesPicto = { taille?: number; className?: string }

function Picto({
  taille = 16,
  epaisseur,
  className,
  children,
}: ProprietesPicto & { epaisseur: number; children: React.ReactNode }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Mandat — bouclier et coche. La marque de l'objet : jamais réattribuée à un autre. */
export function PictoMandat(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.3}>
      <path d="M12 3l7 2.5V11c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V5.5z" />
      <path d="m9 11.5 2 2 4-4" />
    </Picto>
  )
}

export function PictoCompte(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.3}>
      <path d="M5 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15" />
      <path d="M3 20h18" />
    </Picto>
  )
}

export function PictoSite(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.2}>
      <path d="M12 21s-7-4.8-7-10.7a7 7 0 0 1 14 0C19 16.2 12 21 12 21z" />
      <circle cx="12" cy="10" r="2.5" />
    </Picto>
  )
}

export function PictoContact(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.3}>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M4.5 21c.6-4 3.6-6 7.5-6s6.9 2 7.5 6" />
    </Picto>
  )
}

export function PictoCompteur(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.2}>
      <rect x="4" y="4" width="16" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Picto>
  )
}

export function PictoBrouillon(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.2}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
    </Picto>
  )
}

export function PictoEnvoye(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.2}>
      <path d="m22 2-7 20-4-9-9-4z" />
      <path d="M22 2 11 13" />
    </Picto>
  )
}

export function PictoConsulte(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.2}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <path d="M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    </Picto>
  )
}

export function PictoRefuse(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.6}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Picto>
  )
}

export function PictoAnnule(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.4}>
      <path d="M4.9 4.9 19.1 19.1" />
      <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" />
    </Picto>
  )
}

export function PictoExpire(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2.4}>
      <path d="M12 7.5V12l3 2" />
      <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" />
    </Picto>
  )
}

/** La validité se lit comme une horloge — le même dessin que le jalon « Expiré », par cohérence. */
export const PictoValidite = PictoExpire

export function PictoTelephone(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </Picto>
  )
}

export function PictoEnveloppe(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
      <path d="m20 7-8 5-8-5" />
    </Picto>
  )
}

export function PictoLoupe(p: ProprietesPicto) {
  return (
    <Picto {...p} epaisseur={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4-4" />
    </Picto>
  )
}

/** Électricité et gaz sont pleins, pas filaires : ce sont des marqueurs, pas des icônes d'action. */
export function PictoElectricite({ taille = 12, className }: ProprietesPicto) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  )
}

export function PictoGaz({ taille = 12, className }: ProprietesPicto) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 22c4.4 0 8-3.6 8-8 0-3.5-2-6.5-4-8.5-.3 1.5-1.2 2.9-2.5 3.5C13 6.5 12 4 9.5 2c.3 2.5-.5 4-2 5.5C5.6 9.4 4 11.5 4 14c0 4.4 3.6 8 8 8z" />
    </svg>
  )
}

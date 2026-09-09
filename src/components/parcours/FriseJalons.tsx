import type { ReactElement, ReactNode } from 'react'

/**
 * ══ LA FRISE DE JALONS, PARTAGÉE ENTRE LE MANDAT ET LE CONTRAT ══
 *
 * Le dessin vient de la maquette de William du 08/09/2026, portée d'abord sur le mandat
 * (`CheminConversion`). Le 09/09 il demande la même chose sur le contrat : « inspire-toi de ce que
 * j'ai fait sur mon mandat pour récupérer le design de l'étape Consulté ».
 *
 * ── POURQUOI EXTRAIT, ET PAS RECOPIÉ ──
 *
 * Recopier aurait été plus rapide et plus sûr à l'instant — le fichier du mandat est le sien, il
 * l'a modifié à 11 h 55 le jour même, et y toucher expose à un conflit. Mais le MÊME jour il
 * signalait un composant DocuSign dupliqué entre le mandat et le contrat, et une deuxième copie du
 * même dessin garantissait la même remarque une semaine plus tard : deux frises qui divergent au
 * premier ajustement de couleur.
 *
 * Le partage s'arrête au DESSIN. Ce qui rend un jalon franchi n'est pas partageable : un mandat le
 * sait par sa date d'envoi et son statut, un contrat par son avancement et ses dates DocuSign.
 * Chaque objet calcule donc ses propres jalons et les passe ici.
 *
 * ── CE QUI EST FRANCHI, ET COMMENT ON LE SAIT ──
 *
 * Jamais par comparaison d'ordre dans un référentiel : un mandat REFUSÉ a forcément été envoyé
 * alors que son ordre (65) dépasse celui d'ACTIF (50). Chaque jalon dit LUI-MÊME s'il est franchi —
 * une date observée, ou un statut qui l'implique.
 *
 * UN JALON FRANCHI SANS DATE RESTE FRANCHI, en gras, sans ligne de date. Le cas se produit sur les
 * 1 380 mandats antérieurs au suivi du parcours et sur les 1 579 contrats signés avant lui : leur
 * signature est un fait, l'heure de leur consultation n'a jamais été observée. Inventer un
 * horodatage serait pire que la ligne vide.
 *
 * ── POURQUOI DES STYLES EN LIGNE ICI, ALORS QUE TOUT LE RESTE EST EN TAILWIND ──
 *
 * Le handoff est explicite : « les valeurs numériques et hexadécimales doivent être respectées
 * exactement ». Plusieurs n'ont pas d'équivalent dans l'échelle du projet — un dégradé à cinq
 * paliers, des nœuds de 35 et 40 px, un interlettrage `-.01em`. Les exprimer en classes obligerait
 * à arrondir, ou à étendre la configuration de jetons qui ne serviraient qu'ici.
 */

export const OR_CLAIR = '#d19a44'
export const OR_FONCE = '#b57a24'
export const DEGRADE_OR = `linear-gradient(135deg,${OR_FONCE},${OR_CLAIR})`

export interface Jalon {
  cle: string
  libelle: string
  picto: (p: { taille?: number }) => ReactElement
  franchi: boolean
  /** Couleur propre au jalon final. Absente, le jalon prend l'or du parcours. */
  couleur?: string
  date: string | null
  /** Sous la date : l'heure, et ce qui s'est passé. */
  contexte: string | null
}

export function jourFr(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('fr-FR')
}

export function heureFr(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** L'heure, puis ce qu'on en sait — « 18:02 · ouvert 3 fois ». */
export function contexteDe(iso: string | null | undefined, complement?: string | null): string | null {
  const h = heureFr(iso)
  if (!h) return complement ?? null
  return complement ? `${h} · ${complement}` : h
}

/** Deux cellules de grille voisines, sans conteneur : un `<div>` casserait la grille. */
function Cellules({ children }: { children: ReactNode }) {
  return <>{children}</>
}

/**
 * La barre entre deux jalons.
 *
 * TROIS ÉTATS, ET LE DEUXIÈME EST LE PLUS IMPORTANT : quand l'étape précédente est franchie et pas
 * la suivante, les tirets défilent. C'est le seul signal d'attente de tout le rail — le handoff
 * écarte explicitement toute pulsation sur les nœuds.
 */
function BarreDeLiaison({ depuis, vers }: { depuis: Jalon; vers: Jalon }) {
  const commun = { height: 6, borderRadius: 3, margin: '0 -10px' } as const

  if (depuis.franchi && vers.franchi) {
    /* Vers un jalon coloré, cinq paliers : un simple dégradé or → vert vire au kaki au milieu, et la
       transition se voit comme une salissure. `backgroundSize` en pourcentage est indispensable —
       une valeur en pixels ferait RÉPÉTER le dégradé et produirait un motif segmenté. */
    const fond = vers.couleur
      ? `linear-gradient(90deg,${OR_CLAIR} 0%,#c2a03f 22%,#96a055 48%,#5a9270 74%,${vers.couleur} 100%)`
      : DEGRADE_OR
    return <div style={{ ...commun, background: fond, backgroundSize: '100% 100%' }} />
  }

  if (depuis.franchi) {
    return (
      <div
        style={{
          ...commun,
          background: 'repeating-linear-gradient(90deg,#e0cfa8 0 6px,#f3eee2 6px 12px)',
          backgroundSize: '24px 100%',
          animation: 'stripeMove 1.1s linear infinite',
        }}
      />
    )
  }

  return <div style={{ ...commun, background: '#eceae6' }} />
}

/**
 * La frise elle-même : les nœuds, puis les libellés, dans une seule grille.
 *
 * Deux passes sur la même grille plutôt qu'une colonne par jalon : c'est ce qui garantit que le
 * libellé « Réceptionné » et le nœud au-dessus partagent exactement le même axe, quelle que soit
 * la largeur du texte.
 */
export function FriseJalons({ jalons }: { jalons: Jalon[] }) {
  const dernierFranchi = jalons.reduce((acc, j, i) => (j.franchi ? i : acc), 0)

  /* Alternance nœud / barre. Les barres sont volontairement étroites et élastiques (`.75fr`) : ce
     sont les libellés, sous les nœuds, qui doivent disposer de la place. */
  const colonnes = jalons.map(() => 'minmax(0,1fr)').join(' minmax(14px,.75fr) ')

  return (
    <div style={{ display: 'grid', alignItems: 'center', padding: '18px 2px 2px', gridTemplateColumns: colonnes }}>
      {/* ── Première passe : les nœuds et les barres ── */}
      {jalons.map((jalon, i) => {
        const Picto = jalon.picto
        const courant = i === dernierFranchi
        const taille = courant ? 40 : 35
        const couleur = jalon.couleur
        const fond = jalon.franchi
          ? couleur
            ? `linear-gradient(135deg,${couleur}cc,${couleur})`
            : DEGRADE_OR
          : '#fff'

        const suivant = jalons[i + 1]
        return (
          <Cellules key={jalon.cle}>
            <div className="relative flex justify-center" style={{ zIndex: 1 }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: taille,
                  height: taille,
                  borderRadius: '50%',
                  background: fond,
                  border: jalon.franchi ? undefined : '2px dashed #dcdad5',
                  color: jalon.franchi ? '#fff' : '#c9cbc6',
                  boxShadow: jalon.franchi
                    ? courant
                      ? `0 4px 12px ${couleur ?? OR_FONCE}4d`
                      : '0 2px 6px rgba(181,122,36,.22)'
                    : 'none',
                }}
              >
                <Picto taille={courant ? 18 : 16} />
              </div>
            </div>
            {suivant && <BarreDeLiaison depuis={jalon} vers={suivant} />}
          </Cellules>
        )
      })}

      {/* ── Seconde passe : les libellés, dans la même grille ── */}
      {jalons.map((jalon, i) => (
        <Cellules key={`lbl-${jalon.cle}`}>
          <div style={{ textAlign: 'center', paddingTop: 9, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: '-.01em',
                fontWeight: jalon.franchi ? 800 : 600,
                color: jalon.franchi ? jalon.couleur ?? '#16181d' : '#c0c2bd',
              }}
            >
              {jalon.libelle}
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                marginTop: 4,
                color: jalon.franchi ? jalon.couleur ?? '#5c5f66' : '#c0c2bd',
              }}
            >
              {jourFr(jalon.date) ?? (jalon.franchi ? '' : 'en attente')}
            </div>
            {jalon.contexte && (
              <div className="font-mono" style={{ fontSize: 9.5, color: '#a3a5a0', marginTop: 1 }}>
                {jalon.contexte}
              </div>
            )}
          </div>
          {i < jalons.length - 1 && <div />}
        </Cellules>
      ))}
    </div>
  )
}

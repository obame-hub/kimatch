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
  /**
   * ══ NI FRANCHI, NI À VENIR : DÉPASSÉ ══
   *
   * William, 21/09/2026 : « quand je clôture une recommandation, il faut que tout le process se
   * complète, pas que je me retrouve avec un chemin qui n'a que quelques étapes de complétées ».
   *
   * LA FRISE N'AVAIT QUE DEUX ÉTATS, et c'est ce qui produisait le chemin troué. Un dossier clos
   * sans proposition datée affichait « Proposée » en nœud pointillé, précédé de la barre à tirets
   * DÉFILANTS — le signal d'attente. Sur un dossier mort, l'écran disait donc « on attend encore »,
   * ce qui est faux deux fois : on n'attend plus, et personne n'a rien à faire.
   *
   * Ce troisième état dit l'exacte vérité : l'étape est DERRIÈRE nous, et elle n'a pas eu lieu.
   * Le nœud se remplit de gris plein — le parcours est passé par là — mais il ne prend ni l'or ni
   * la date d'un jalon franchi, parce qu'inventer un horodatage serait pire que la ligne vide.
   *
   * SUR PRODUCTION : 1 152 recommandations closes sur 1 625 (71 %) affichaient un chemin troué,
   * dont 871 acceptées dont seulement 219 avaient une présentation datée.
   */
  depasse?: boolean
  /** Couleur propre au jalon final. Absente, le jalon prend l'or du parcours. */
  couleur?: string
  date: string | null
  /** Sous la date : l'heure, et ce qui s'est passé. */
  contexte: string | null
  /**
   * ══ UNE PRÉCISION QUI TIENT SUR LA LIGNE DU LIBELLÉ ══
   *
   * William, 18/09/2026, sur le chemin d'une recommandation : « indique la proposition format "V3"
   * par exemple À CÔTÉ de "Proposée" et non pas en dessous. En conclusion, je veux au maximum
   * 2 lignes et non pas 3. »
   *
   * La frise n'avait que deux emplacements : le libellé, et la ligne de date où le contexte vient
   * se coller après un point médian. Y mettre « V3 » allongeait cette ligne jusqu'au repli, et la
   * troisième ligne apparaissait — celle qu'il ne veut pas.
   *
   * Le marqueur est donc une TROISIÈME place, sur la ligne du libellé et non sous elle : une
   * pastille discrète qui répond à « laquelle ? » sans coûter de hauteur. Absent, rien ne change.
   */
  marqueur?: string | null
  /**
   * ══ UN JALON QUI SE CLIQUE ══
   *
   * Absent partout sauf sur la piste, et c'est voulu : un jalon de mandat CONSTATE ce que DocuSign a
   * fait — on ne « met » pas un mandat à Consulté. Le statut d'une piste, lui, est déclaré par la
   * personne qui travaille, et se corrige quand on s'est trompé d'étape.
   *
   * Présent, le nœud devient un bouton. Le dessin ne change pas d'un pixel — seuls le curseur et le
   * relief au survol disent qu'on peut agir.
   */
  onChoisir?: () => void
  /** L'infobulle du nœud, utile surtout quand il se clique. */
  titre?: string
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

  /* Un jalon dépassé est derrière nous au même titre qu'un jalon franchi : la barre qui y mène ne
     doit plus attendre. C'est tout l'objet du troisième état. */
  const derriere = (j: Jalon) => j.franchi || j.depasse === true

  if (depuis.franchi && vers.franchi) {
    /* Vers un jalon coloré, cinq paliers : un simple dégradé or → vert vire au kaki au milieu, et la
       transition se voit comme une salissure. `backgroundSize` en pourcentage est indispensable —
       une valeur en pixels ferait RÉPÉTER le dégradé et produirait un motif segmenté. */
    const fond = vers.couleur
      ? `linear-gradient(90deg,${OR_CLAIR} 0%,#c2a03f 22%,#96a055 48%,#5a9270 74%,${vers.couleur} 100%)`
      : DEGRADE_OR
    return <div style={{ ...commun, background: fond, backgroundSize: '100% 100%' }} />
  }

  /* Le parcours a franchi ce segment, mais l'un des deux bouts n'a pas eu lieu : barre pleine et
     sourde. Pleine parce qu'on est passé ; sourde parce qu'il n'y a rien à fêter. */
  if (derriere(depuis) && derriere(vers)) {
    return <div style={{ ...commun, background: '#ddd9d1' }} />
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
export function FriseJalons({ jalons, compact }: {
  jalons: Jalon[]
  /**
   * ══ LA VARIANTE BASSE, POUR LES PARCOURS QU'ON SURVOLE ══
   *
   * William, 16/09/2026, sur la piste : « optimise sa hauteur, notamment en mettant sur la même
   * ligne la date et l'heure de passage à l'étape ».
   *
   * La date et son contexte occupaient deux lignes empilées ; réunis par un point médian, ils en
   * font une — c'est la ligne la plus facile à rendre, parce que « 16/09/2026 » et « 14:32 » se
   * lisent naturellement ensemble. Avec la respiration resserrée autour, la frise perd un bon quart
   * de sa hauteur.
   *
   * ELLE NE PORTE PLUS SA PROPRE MARGE VERTICALE : sans intitulé au-dessus, c'est le creux de la
 * carte qui centre la frise, et une marge interne asymétrique l'aurait fait flotter vers le bas.
 *
 * LE MANDAT ET LE CONTRAT N'Y TOUCHENT PAS. Leurs jalons portent des contextes plus longs
   * — « 18:02 · ouvert 3 fois », un motif de refus — qui ont besoin de leur ligne, et leur frise est
   * en tête de volet, là où la hauteur n'est pas disputée.
   */
  compact?: boolean
}) {
  const dernierFranchi = jalons.reduce((acc, j, i) => (j.franchi ? i : acc), 0)

  /* Alternance nœud / barre. Les barres sont volontairement étroites et élastiques (`.75fr`) : ce
     sont les libellés, sous les nœuds, qui doivent disposer de la place. */
  const colonnes = jalons.map(() => 'minmax(0,1fr)').join(' minmax(14px,.75fr) ')

  return (
    <div style={{ display: 'grid', alignItems: 'center', padding: compact ? '0 2px' : '18px 2px 2px', gridTemplateColumns: colonnes }}>
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
          : jalon.depasse
            ? '#e6e3dd'
            : '#fff'

        const suivant = jalons[i + 1]
        /* Bouton quand le jalon se clique, `div` sinon : un `<button disabled>` partout aurait
           changé la couleur héritée du texte et le comportement au clavier de trois autres fiches. */
        const Noeud = jalon.onChoisir ? 'button' : 'div'
        return (
          <Cellules key={jalon.cle}>
            <div className="relative flex justify-center" style={{ zIndex: 1 }}>
              <Noeud
                type={jalon.onChoisir ? 'button' : undefined}
                onClick={jalon.onChoisir}
                title={jalon.titre}
                className={jalon.onChoisir
                  ? 'flex items-center justify-center transition-transform hover:scale-[1.06]'
                  : 'flex items-center justify-center'}
                style={{
                  width: taille,
                  height: taille,
                  borderRadius: '50%',
                  background: fond,
                  /* Le pointillé signifie « pas encore ». Un jalon dépassé prend donc le trait
                     plein, comme un jalon franchi — c'est la couleur seule qui les sépare. */
                  border: jalon.franchi || jalon.depasse ? undefined : '2px dashed #dcdad5',
                  color: jalon.franchi ? '#fff' : jalon.depasse ? '#8d8f8a' : '#c9cbc6',
                  boxShadow: jalon.franchi
                    ? courant
                      ? `0 4px 12px ${couleur ?? OR_FONCE}4d`
                      : '0 2px 6px rgba(181,122,36,.22)'
                    : 'none',
                }}
              >
                <Picto taille={courant ? 18 : 16} />
              </Noeud>
            </div>
            {suivant && <BarreDeLiaison depuis={jalon} vers={suivant} />}
          </Cellules>
        )
      })}

      {/* ── Seconde passe : les libellés, dans la même grille ── */}
      {jalons.map((jalon, i) => (
        <Cellules key={`lbl-${jalon.cle}`}>
          {/* LE LIBELLÉ CLIQUE AUSSI quand le jalon le fait : viser un disque de 35 px à la souris
              est inutilement exigeant, alors que « En cours de qualification » offre dix fois la
              cible. Les deux déclenchent la même chose. */}
          <div
            onClick={jalon.onChoisir}
            title={jalon.onChoisir ? jalon.titre : undefined}
            style={{ textAlign: 'center', paddingTop: compact ? 6 : 9, minWidth: 0, cursor: jalon.onChoisir ? 'pointer' : undefined }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: '-.01em',
                fontWeight: jalon.franchi ? 800 : 600,
                color: jalon.franchi ? jalon.couleur ?? '#16181d' : jalon.depasse ? '#8d8f8a' : '#c0c2bd',
              }}
            >
              {jalon.libelle}
              {jalon.marqueur && (
                <span
                  style={{
                    marginLeft: 5,
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: '.02em',
                    padding: '1px 5px',
                    borderRadius: 999,
                    verticalAlign: 'middle',
                    background: jalon.franchi ? 'rgba(181,122,36,.12)' : '#f0efec',
                    color: jalon.franchi ? jalon.couleur ?? '#8a5f22' : '#c0c2bd',
                  }}
                >
                  {jalon.marqueur}
                </span>
              )}
            </div>
            {/* EN COMPACT, LES DEUX LIGNES N'EN FONT QU'UNE : « 16/09/2026 · 14:32 ». Le point
                médian est le même séparateur que celui qui joint déjà l'heure et son complément à
                l'intérieur du contexte, donc rien de nouveau à lire. */}
            {compact ? (
              <div
                className="font-mono"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  marginTop: 3,
                  color: jalon.franchi ? jalon.couleur ?? '#5c5f66' : '#c0c2bd',
                }}
              >
                {[jourFr(jalon.date), jalon.contexte].filter(Boolean).join(' · ')
                  || (jalon.franchi ? '' : 'en attente')}
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
          {i < jalons.length - 1 && <div />}
        </Cellules>
      ))}
    </div>
  )
}

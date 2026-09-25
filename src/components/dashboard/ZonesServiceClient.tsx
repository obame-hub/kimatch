import { Link } from 'react-router-dom'
import { useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from 'lucide-react'
import {
  useChiffresServiceClient, useTachesDesRequetes, useTachesDesSuivis,
  type TacheRequete, type TacheSuivi,
} from '@/lib/data/serviceClient'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES DEUX ZONES DU SERVICE CLIENT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « zone 1 : gestion des requêtes […] zone 2 : gestion de la fidélisation,
 * même logique et cohérence graphique avec la zone 1. Sur la gauche 3 cards et sur la droite un
 * tableau. »
 *
 * LA COHÉRENCE VIENT DE PIÈCES PARTAGÉES, pas d'une discipline. `Zone`, `Chiffre` et `Tableau`
 * servent les deux : une correction de l'une profite à l'autre, et aucune ne peut dériver de son
 * côté. C'est ce que « même logique » demande vraiment.
 */

/**
 * LA HAUTEUR DES TROIS CARTES DONNE CELLE DU TABLEAU.
 *
 * William, 25/09/2026 : « les tableaux doivent avoir une hauteur maximale correspondant à la
 * hauteur des 3 cards, je dois pouvoir scroller à l'intérieur ». Trois cartes de 76 px et deux
 * écarts de 10 : la rangée fait 248 px, et le tableau s'y cale exactement. Une zone dont les deux
 * moitiés ne finissent pas à la même ligne se lit comme deux blocs posés côte à côte, pas comme un
 * ensemble.
 */
const HAUTEUR_CARTE = 76
const ECART_CARTES = 10
const HAUTEUR_ZONE = HAUTEUR_CARTE * 3 + ECART_CARTES * 2

/**
 * ══ DEUX TEINTES, PARCE QUE CE SONT DEUX MÉTIERS ══
 *
 * William : « propose une zone colorée pour les requêtes différente que pour la fidélisation ».
 *
 * Le bleu pour les requêtes — ce qui arrive et qu'il faut traiter ; l'ambre pour la fidélisation —
 * ce qui dure et qu'il faut entretenir. La couleur ne touche QUE l'en-tête et le filet de la zone :
 * teinter les cartes ou le tableau ferait concurrence au rouge des retards, qui est la seule
 * couleur de cet écran à commander un geste.
 */
const TEINTES = {
  requetes: { barre: 'bg-km-blue', fond: 'bg-km-blue-soft', texte: 'text-km-blue' },
  fidelisation: { barre: 'bg-km-amber', fond: 'bg-km-amber-soft', texte: 'text-km-amber' },
} as const

function dateCourte(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LES PIÈCES COMMUNES
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

function Zone({ titre, teinte, chiffres, children }: {
  titre: string
  teinte: keyof typeof TEINTES
  chiffres: React.ReactNode
  children: React.ReactNode
}) {
  const t = TEINTES[teinte]
  return (
    <section className="overflow-hidden rounded-[20px] border border-km-line bg-km-surface">
      <div className={cn('flex items-center gap-2 border-b border-km-line px-4 py-2.5', t.fond)}>
        <span aria-hidden className={cn('h-3.5 w-1 rounded-full', t.barre)} />
        <h3 className={cn('text-km-label font-bold uppercase tracking-[0.08em]', t.texte)}>{titre}</h3>
      </div>
      {/* Les trois chiffres à gauche, le tableau à droite. En dessous de `lg`, ils s'empilent :
          trois cartes de 33 % sur un téléphone ne se lisent pas. */}
      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[186px_minmax(0,1fr)]">
        <div className="flex flex-col" style={{ gap: ECART_CARTES }}>{chiffres}</div>
        {children}
      </div>
    </section>
  )
}

/**
 * Un chiffre et ce qu'il compte.
 *
 * `alerte` ne colore que ce qui appelle un geste — une tâche en retard. Peindre en rouge un chiffre
 * qui vaut zéro ferait du bruit permanent sur un tableau de bord sain.
 */
function Chiffre({ valeur, libelle, precision, alerte }: {
  valeur: number | string | null
  libelle: string
  precision?: string
  alerte?: boolean
}) {
  const enAlerte = alerte && typeof valeur === 'number' && valeur > 0
  return (
    <div
      style={{ height: HAUTEUR_CARTE }}
      className={cn(
        'flex flex-col justify-center overflow-hidden rounded-km-md border px-3 py-2',
        enAlerte ? 'border-km-red-line bg-km-red-soft' : 'border-km-line bg-km-bg/50',
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-[22px] font-extrabold leading-none tabular-nums tracking-[-0.03em]', enAlerte ? 'text-km-red' : 'text-km-text')}>
          {valeur ?? '—'}
        </span>
        {enAlerte && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-km-red" strokeWidth={2.4} />}
      </div>
      <div className="mt-1 truncate text-km-label font-semibold text-km-text" title={libelle}>{libelle}</div>
      {precision && <div className="truncate text-km-micro text-km-faint" title={precision}>{precision}</div>}
    </div>
  )
}

/**
 * ══ LES COLONNES SE TRIENT ══
 *
 * William : « les colonnes doivent être triables ». Le tri se fait EN MÉMOIRE, sur les lignes déjà
 * là : elles sont au plus quelques centaines, et repartir en base à chaque clic ferait attendre
 * pour un travail que le navigateur fait en une milliseconde.
 *
 * LE PREMIER CLIC TRIE DANS LE SENS UTILE — croissant pour une date (le plus urgent d'abord),
 * alphabétique pour un texte. Un premier clic qui donnerait l'ordre inverse de celui qu'on cherche
 * oblige à cliquer deux fois, chaque fois.
 */
type Sens = 'asc' | 'desc'

function useTri<T>(defaut: keyof T & string) {
  const [colonne, setColonne] = useState<keyof T & string>(defaut)
  const [sens, setSens] = useState<Sens>('asc')
  function trier(c: keyof T & string) {
    if (c === colonne) setSens((s) => (s === 'asc' ? 'desc' : 'asc'))
    else { setColonne(c); setSens('asc') }
  }
  function appliquer(lignes: T[]): T[] {
    return [...lignes].sort((a, b) => {
      const va = a[colonne], vb = b[colonne]
      /* Une valeur absente ferme la marche dans les deux sens : elle n'est ni la plus petite ni la
         plus grande, elle est inconnue, et la voir ouvrir un tri décroissant surprend. */
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'fr', { numeric: true })
      return sens === 'asc' ? cmp : -cmp
    })
  }
  return { colonne, sens, trier, appliquer }
}

function EnTeteTriable({ libelle, actif, sens, aDroite, onClick }: {
  libelle: string
  actif: boolean
  sens: Sens
  aDroite?: boolean
  onClick: () => void
}) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-km-line bg-km-soft px-3 py-1.5 text-km-micro font-bold uppercase tracking-[0.07em]',
        aDroite ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-km-text',
          actif ? 'text-km-text' : 'text-km-faint',
          aDroite && 'flex-row-reverse',
        )}
      >
        {libelle}
        {actif
          ? (sens === 'asc' ? <ArrowUp className="h-3 w-3" strokeWidth={2.6} /> : <ArrowDown className="h-3 w-3" strokeWidth={2.6} />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" strokeWidth={2.2} />}
      </button>
    </th>
  )
}

function Tableau({ vide, chargement, enTout, enTete, children }: {
  vide: string
  chargement: boolean
  enTout: number
  enTete: React.ReactNode
  children: React.ReactNode
}) {
  if (chargement) {
    return (
      <p className="flex items-center gap-2 px-3 py-6 text-km-body text-km-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Lecture…
      </p>
    )
  }
  if (enTout === 0) {
    return (
      <div style={{ height: HAUTEUR_ZONE }} className="flex items-center rounded-km-md border border-km-line px-3">
        <p className="text-km-body text-km-faint">{vide}</p>
      </div>
    )
  }
  return (
    <div style={{ height: HAUTEUR_ZONE }} className="flex flex-col overflow-hidden rounded-km-md border border-km-line">
      {/* LE TABLEAU DÉFILE, SON EN-TÊTE RESTE. `sticky` sur les cellules d'en-tête et non sur la
          rangée : dans un tableau, c'est `th` qui porte le fond, et une rangée collante laisse
          voir les lignes défiler dessous. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-km-body">
          <thead className="sticky top-0 z-10">{enTete}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      <p className="shrink-0 border-t border-km-line bg-km-bg/50 px-3 py-1 text-km-micro text-km-faint">
        {enTout} tâche{enTout > 1 ? 's' : ''} — les colonnes se trient d’un clic.
      </p>
    </div>
  )
}

/** L'échéance, en rouge quand elle est passée : c'est la seule colonne qui commande un geste. */
function Echeance({ valeur, enRetard }: { valeur: string | null; enRetard: boolean }) {
  return (
    <span className={cn('whitespace-nowrap tabular-nums', enRetard ? 'font-bold text-km-red' : 'text-km-text')}>
      {dateCourte(valeur)}
    </span>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ZONE 1 · LES REQUÊTES
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export function ZoneRequetes({ jour }: { jour?: string | null }) {
  const { data: chiffres, isLoading: chiffresEnCours } = useChiffresServiceClient()
  const { data: taches, isLoading } = useTachesDesRequetes(jour)
  const tri = useTri<TacheRequete>('echeance')
  const lignes = tri.appliquer((taches ?? []) as TacheRequete[])

  return (
    <Zone
      titre="Gestion des requêtes"
      teinte="requetes"
      chiffres={
        <>
          <Chiffre valeur={chiffresEnCours ? null : chiffres?.requetes_du_jour ?? 0} libelle="Nouvelles requêtes" precision="aujourd’hui" />
          <Chiffre valeur={chiffresEnCours ? null : chiffres?.taches_requetes_en_retard ?? 0} libelle="Tâches en retard" precision="échéance dépassée" alerte />
          {/* LE DÉLAI EST VIDE AU DÉPART, ET C'EST JUSTE : il ne compte que les requêtes résolues
              depuis le 25/09/2026 — décision de William, pour ne pas traîner les 645 reprises de
              Salesforce. « 0 jour » se lirait comme une performance parfaite. */}
          <Chiffre
            valeur={chiffres?.jours_moyens_resolution != null ? `${chiffres.jours_moyens_resolution} j` : null}
            libelle="Délai de résolution"
            precision={
              chiffres?.resolutions_comptees
                ? `sur ${chiffres.resolutions_comptees} résolue${chiffres.resolutions_comptees > 1 ? 's' : ''}`
                : 'aucune depuis le 25/09'
            }
          />
        </>
      }
    >
      <Tableau
        vide={jour ? 'Aucune tâche sur une requête ce jour-là.' : 'Aucune tâche ouverte sur une requête.'}
        chargement={isLoading}
        enTout={lignes.length}
        enTete={
          <tr>
            <EnTeteTriable libelle="Compte" actif={tri.colonne === 'compte_nom'} sens={tri.sens} onClick={() => tri.trier('compte_nom')} />
            <EnTeteTriable libelle="Tâche" actif={tri.colonne === 'titre'} sens={tri.sens} onClick={() => tri.trier('titre')} />
            <EnTeteTriable libelle="Contact" actif={tri.colonne === 'contact_nom'} sens={tri.sens} onClick={() => tri.trier('contact_nom')} />
            <EnTeteTriable libelle="Échéance" actif={tri.colonne === 'echeance'} sens={tri.sens} aDroite onClick={() => tri.trier('echeance')} />
          </tr>
        }
      >
        {lignes.map((t) => (
          <tr key={t.id} className="border-b border-km-line-soft last:border-b-0 hover:bg-km-soft/60">
            <td className="max-w-[190px] truncate px-3 py-1.5">
              {t.compte_id ? (
                <Link to={`/comptes/${t.compte_id}`} className="font-semibold text-km-text hover:text-km-green">{t.compte_nom}</Link>
              ) : (
                <span className="text-km-faint">—</span>
              )}
            </td>
            <td className="max-w-[260px] truncate px-3 py-1.5">
              <Link to={`/requetes/${t.requete_id}`} className="text-km-text hover:text-km-green" title={t.requete_objet ?? undefined}>
                {t.titre}
              </Link>
            </td>
            <td className="max-w-[150px] truncate px-3 py-1.5">
              {t.contact_id ? (
                <Link to={`/contacts/${t.contact_id}`} className="text-km-text hover:text-km-green">{t.contact_nom}</Link>
              ) : (
                <span className="text-km-faint">—</span>
              )}
            </td>
            <td className="px-3 py-1.5 text-right"><Echeance valeur={t.echeance} enRetard={t.en_retard} /></td>
          </tr>
        ))}
      </Tableau>
    </Zone>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ZONE 2 · LA FIDÉLISATION
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export function ZoneFidelisation({ jour }: { jour?: string | null }) {
  const { data: chiffres, isLoading: chiffresEnCours } = useChiffresServiceClient()
  const { data: taches, isLoading } = useTachesDesSuivis(jour)
  const tri = useTri<TacheSuivi>('echeance')
  const lignes = tri.appliquer((taches ?? []) as TacheSuivi[])

  return (
    <Zone
      titre="Gestion de la fidélisation"
      teinte="fidelisation"
      chiffres={
        <>
          <Chiffre valeur={chiffresEnCours ? null : chiffres?.contrats_valides_du_jour ?? 0} libelle="Contrats validés" precision="aujourd’hui" />
          <Chiffre valeur={chiffresEnCours ? null : chiffres?.taches_suivis_en_retard ?? 0} libelle="Tâches en retard" precision="échéance dépassée" alerte />
          <Chiffre
            valeur={chiffresEnCours ? null : chiffres?.contrats_en_attente_activation ?? 0}
            libelle="En attente d’activation"
            precision="avant « Contrat actif »"
          />
        </>
      }
    >
      <Tableau
        vide={jour ? 'Aucune tâche sur un suivi ce jour-là.' : 'Aucune tâche ouverte sur un suivi de contrat.'}
        chargement={isLoading}
        enTout={lignes.length}
        enTete={
          <tr>
            <EnTeteTriable libelle="Contrat" actif={tri.colonne === 'contrat_reference'} sens={tri.sens} onClick={() => tri.trier('contrat_reference')} />
            <EnTeteTriable libelle="Tâche" actif={tri.colonne === 'titre'} sens={tri.sens} onClick={() => tri.trier('titre')} />
            <EnTeteTriable libelle="Contact" actif={tri.colonne === 'contact_nom'} sens={tri.sens} onClick={() => tri.trier('contact_nom')} />
            {/* L'ÉTAPE SE TRIE PAR SON ORDRE, PAS PAR SON NOM : « À préparer » viendrait après
                « Contrat actif » dans l'alphabet, ce qui ferait mentir la colonne. */}
            <EnTeteTriable libelle="Étape" actif={tri.colonne === 'etape_ordre'} sens={tri.sens} onClick={() => tri.trier('etape_ordre')} />
            <EnTeteTriable libelle="Échéance" actif={tri.colonne === 'echeance'} sens={tri.sens} aDroite onClick={() => tri.trier('echeance')} />
          </tr>
        }
      >
        {lignes.map((t) => (
          <tr key={t.id} className="border-b border-km-line-soft last:border-b-0 hover:bg-km-soft/60">
            <td className="max-w-[170px] px-3 py-1.5">
              <Link to={`/suivis-contrats/${t.suivi_id}`} className="block truncate font-semibold text-km-text hover:text-km-green">
                {t.contrat_reference || 'sans référence'}
              </Link>
              {t.compte_nom && <span className="block truncate text-km-micro text-km-faint">{t.compte_nom}</span>}
            </td>
            <td className="max-w-[230px] truncate px-3 py-1.5 text-km-text">{t.titre}</td>
            <td className="max-w-[140px] truncate px-3 py-1.5">
              {t.contact_id ? (
                <Link to={`/contacts/${t.contact_id}`} className="text-km-text hover:text-km-green">{t.contact_nom}</Link>
              ) : (
                <span className="text-km-faint">—</span>
              )}
            </td>
            <td className="px-3 py-1.5">
              <span className="whitespace-nowrap rounded-km-pill bg-km-soft px-2 py-px text-km-micro font-semibold text-km-muted">
                {t.etape_libelle || '—'}
              </span>
            </td>
            <td className="px-3 py-1.5 text-right"><Echeance valeur={t.echeance} enRetard={t.en_retard} /></td>
          </tr>
        ))}
      </Tableau>
    </Zone>
  )
}

import { Link } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
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

const LIGNES_AFFICHEES = 12

function dateCourte(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LES PIÈCES COMMUNES
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

function Zone({ titre, chiffres, children }: {
  titre: string
  chiffres: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-km-line bg-km-surface">
      <div className="border-b border-km-line px-4 py-2.5">
        <h3 className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">{titre}</h3>
      </div>
      {/* Les trois chiffres à gauche, le tableau à droite. En dessous de `lg`, ils s'empilent :
          trois cartes de 33 % sur un téléphone ne se lisent pas. */}
      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5">{chiffres}</div>
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
      className={cn(
        'rounded-km-md border px-3.5 py-2.5',
        enAlerte ? 'border-km-red-line bg-km-red-soft' : 'border-km-line bg-km-bg/50',
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-[24px] font-extrabold tabular-nums tracking-[-0.03em]', enAlerte ? 'text-km-red' : 'text-km-text')}>
          {valeur ?? '—'}
        </span>
        {enAlerte && <AlertTriangle className="h-3.5 w-3.5 text-km-red" strokeWidth={2.4} />}
      </div>
      <div className="mt-0.5 text-km-body font-semibold text-km-text">{libelle}</div>
      {precision && <div className="text-km-label text-km-faint">{precision}</div>}
    </div>
  )
}

function Tableau({ colonnes, vide, chargement, enTout, children }: {
  colonnes: string[]
  vide: string
  chargement: boolean
  enTout: number
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
    return <p className="px-3 py-6 text-km-body text-km-faint">{vide}</p>
  }
  return (
    <div className="overflow-hidden rounded-km-md border border-km-line">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-km-body">
          <thead>
            <tr className="bg-km-soft">
              {colonnes.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap border-b border-km-line px-3 py-2 text-km-micro font-bold uppercase tracking-[0.07em] text-km-faint',
                    i === colonnes.length - 1 ? 'text-right' : 'text-left',
                  )}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {enTout > LIGNES_AFFICHEES && (
        <p className="border-t border-km-line bg-km-bg/50 px-3 py-1.5 text-km-label text-km-faint">
          {LIGNES_AFFICHEES} sur {enTout} — les plus urgentes d’abord.
        </p>
      )}
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
  const lignes = (taches ?? []) as TacheRequete[]

  return (
    <Zone
      titre="Gestion des requêtes"
      chiffres={
        <>
          <Chiffre valeur={chiffresEnCours ? null : chiffres?.requetes_du_jour ?? 0} libelle="Nouvelles requêtes" precision="aujourd’hui" />
          <Chiffre valeur={chiffresEnCours ? null : chiffres?.taches_requetes_en_retard ?? 0} libelle="Tâches en retard" precision="échéance dépassée" alerte />
          {/* LE DÉLAI EST VIDE AU DÉPART, ET C'EST JUSTE : il ne compte que les requêtes résolues
              depuis le 25/09/2026 — décision de William, pour ne pas traîner les 645 reprises de
              Salesforce. « 0 jour » se lirait comme une performance parfaite. */}
          <Chiffre
            valeur={chiffres?.jours_moyens_resolution != null ? `${chiffres.jours_moyens_resolution} j` : null}
            libelle="Délai moyen de résolution"
            precision={
              chiffres?.resolutions_comptees
                ? `sur ${chiffres.resolutions_comptees} requête${chiffres.resolutions_comptees > 1 ? 's' : ''} résolue${chiffres.resolutions_comptees > 1 ? 's' : ''}`
                : 'aucune résolution depuis le 25/09'
            }
          />
        </>
      }
    >
      <Tableau
        colonnes={['Compte', 'Tâche', 'Contact', 'Échéance']}
        vide={jour ? "Aucune tâche sur une requête ce jour-là." : "Aucune tâche ouverte sur une requête."}
        chargement={isLoading}
        enTout={lignes.length}
      >
        {lignes.slice(0, LIGNES_AFFICHEES).map((t) => (
          <tr key={t.id} className="border-b border-km-line-soft last:border-b-0">
            <td className="max-w-[200px] truncate px-3 py-2">
              {t.compte_id ? (
                <Link to={`/comptes/${t.compte_id}`} className="font-semibold text-km-text hover:text-km-green">{t.compte_nom}</Link>
              ) : (
                <span className="text-km-faint">—</span>
              )}
            </td>
            <td className="max-w-[280px] truncate px-3 py-2">
              <Link to={`/requetes/${t.requete_id}`} className="text-km-text hover:text-km-green" title={t.requete_objet ?? undefined}>
                {t.titre}
              </Link>
            </td>
            <td className="max-w-[160px] truncate px-3 py-2">
              {t.contact_id ? (
                <Link to={`/contacts/${t.contact_id}`} className="text-km-text hover:text-km-green">{t.contact_nom}</Link>
              ) : (
                <span className="text-km-faint">—</span>
              )}
            </td>
            <td className="px-3 py-2 text-right"><Echeance valeur={t.echeance} enRetard={t.en_retard} /></td>
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
  const lignes = (taches ?? []) as TacheSuivi[]

  return (
    <Zone
      titre="Gestion de la fidélisation"
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
        colonnes={['Contrat', 'Tâche', 'Contact', 'Étape', 'Échéance']}
        vide={jour ? "Aucune tâche sur un suivi ce jour-là." : "Aucune tâche ouverte sur un suivi de contrat."}
        chargement={isLoading}
        enTout={lignes.length}
      >
        {lignes.slice(0, LIGNES_AFFICHEES).map((t) => (
          <tr key={t.id} className="border-b border-km-line-soft last:border-b-0">
            <td className="max-w-[190px] px-3 py-2">
              <Link to={`/suivis-contrats/${t.suivi_id}`} className="block truncate font-semibold text-km-text hover:text-km-green">
                {t.contrat_reference || 'sans référence'}
              </Link>
              {t.compte_nom && <span className="block truncate text-km-label text-km-faint">{t.compte_nom}</span>}
            </td>
            <td className="max-w-[240px] truncate px-3 py-2 text-km-text">{t.titre}</td>
            <td className="max-w-[150px] truncate px-3 py-2">
              {t.contact_id ? (
                <Link to={`/contacts/${t.contact_id}`} className="text-km-text hover:text-km-green">{t.contact_nom}</Link>
              ) : (
                <span className="text-km-faint">—</span>
              )}
            </td>
            <td className="px-3 py-2">
              <span className="whitespace-nowrap rounded-km-pill bg-km-soft px-2 py-px text-km-label font-semibold text-km-muted">
                {t.etape_libelle || '—'}
              </span>
            </td>
            <td className="px-3 py-2 text-right"><Echeance valeur={t.echeance} enRetard={t.en_retard} /></td>
          </tr>
        ))}
      </Tableau>
    </Zone>
  )
}

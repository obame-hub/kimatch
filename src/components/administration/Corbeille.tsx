import { useState } from 'react'
import { RotateCcw, Trash2, ChevronRight, AlertTriangle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { dateRelative } from '@/lib/dateRelative'
import {
  useCorbeille,
  useDetailCorbeille,
  useRestaurerSuppression,
  useViderCorbeille,
  type EntreeCorbeille,
} from '@/lib/data/corbeille'

/**
 * ══ LA CORBEILLE ══
 *
 * Naoëlle, 07/09/2026 : « une corbeille visible pour les admin et super admin où on aurait la
 * possibilité de récupérer les données et de vider la corbeille si besoin, et aussi il faut qu'on
 * voie qui a supprimé quoi et quand. »
 *
 * ══ UNE LIGNE PAR GESTE, PAS PAR ENREGISTREMENT ══
 *
 * Supprimer un compte peut emporter 672 lignes. Les lister une par une noierait toutes les autres
 * suppressions de la journée. Chaque entrée montre donc l'objet principal — « Compte MEMPHIS
 * BRUAY » — avec qui, quand, et combien de lignes derrière. Le détail se déplie.
 *
 * ══ RESTAURER EST UN BOUTON, VIDER EST UNE CONFIRMATION ══
 *
 * Restaurer ne détruit rien : au pire ça ne marche pas, et la fonction en base refuse en bloc.
 * Vider, en revanche, est la seule opération de Kimatch sans recours — elle efface le filet
 * lui-même. Elle passe donc par une fenêtre qui nomme ce qui va disparaître.
 */
export function Corbeille() {
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [aVider, setAVider] = useState<EntreeCorbeille | null>(null)
  const [purgeOuverte, setPurgeOuverte] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const { data, isLoading } = useCorbeille(true)
  const restaurer = useRestaurerSuppression()
  const vider = useViderCorbeille()

  const entrees = data?.entrees ?? []

  function signaler(texte: string) {
    setMessage(texte)
    setErreur(null)
    window.setTimeout(() => setMessage(null), 6000)
  }

  async function lancerRestauration(e: EntreeCorbeille) {
    setErreur(null)
    try {
      const resultat = await restaurer.mutateAsync(e.correlation_id)
      const total = resultat.reduce((t, r) => t + Number(r.lignes_remises), 0)
      signaler(
        `✓ ${e.libelle_type}${e.nom ? ` « ${e.nom} »` : ''} restauré — `
        + `${total.toLocaleString('fr-FR')} ligne${total > 1 ? 's' : ''} remise${total > 1 ? 's' : ''} `
        + `dans ${resultat.length} table${resultat.length > 1 ? 's' : ''}.`,
      )
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Ce que la corbeille est, et ce qu'elle n'est pas ── */}
      <div className="rounded-km-md border border-km-line bg-km-soft px-3.5 py-3">
        <p className="text-km-body font-bold text-km-text">
          Tout ce qui a été supprimé depuis la mise en place du journal
        </p>
        <p className="mt-1 max-w-[62ch] text-km-label leading-relaxed text-km-muted">
          Une entrée par clic sur « Supprimer », avec l’auteur, l’heure, et tout ce que ce clic a
          emporté. Restaurer remet l’ensemble en place, ou rien — jamais la moitié.
        </p>
        {/* ELLE NE REMONTE PAS DANS LE PASSÉ, et le dire évite de chercher longtemps une
            suppression d'avant-hier qui n'y sera jamais. */}
        <p className="mt-1.5 max-w-[62ch] text-km-label leading-relaxed text-km-faint">
          Les suppressions antérieures au 7 septembre 2026 n’ont laissé aucune trace : elles ne
          figurent pas ici et ne sont pas récupérables.
        </p>
      </div>

      {/* ── Les migrations pas encore passées ── */}
      {data && !data.pretMigration && (
        <div className="rounded-km-md border border-km-amber-line bg-km-amber-soft px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-km-body font-bold text-km-amber">
            <AlertTriangle className="h-3.5 w-3.5" /> La corbeille n’est pas encore active
          </p>
          <p className="mt-1 text-km-label leading-relaxed text-km-text">
            Les deux migrations qui la font fonctionner ne sont pas appliquées. Tant qu’elles ne le
            sont pas, <strong>aucune suppression n’est enregistrée</strong> et rien n’est
            récupérable.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-km bg-white/70 px-2.5 py-2 font-mono text-km-label text-km-text">
node scripts/appliquer-migration.cjs 20260907120000{'\n'}
node scripts/appliquer-migration.cjs 20260907160000
          </pre>
        </div>
      )}

      {message && (
        <p className="rounded-km border border-km-green-line bg-km-green-soft px-3 py-2 text-km-body font-semibold text-km-green">
          {message}
        </p>
      )}
      {erreur && (
        <div className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5">
          <p className="text-km-body font-bold text-km-red">Restauration impossible</p>
          <p className="mt-1 text-km-label leading-snug text-km-text">{erreur}</p>
        </div>
      )}

      {/* ── La liste ── */}
      {isLoading ? (
        <p className="py-6 text-center text-km-body text-km-muted">Lecture de la corbeille…</p>
      ) : entrees.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-km-md border border-dashed border-km-line py-10">
          <Inbox className="h-6 w-6 text-km-faint" />
          <p className="text-km-body font-semibold text-km-text">La corbeille est vide</p>
          <p className="text-km-label text-km-faint">
            {data?.pretMigration
              ? 'Aucune suppression depuis la mise en place du journal.'
              : 'Elle le restera tant que les migrations ne sont pas appliquées.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-km-label text-km-muted">
              {entrees.length} suppression{entrees.length > 1 ? 's' : ''} conservée
              {entrees.length > 1 ? 's' : ''}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPurgeOuverte(true)}
              className="text-km-muted hover:text-km-red"
            >
              Purger l’ancien…
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            {entrees.map((e) => (
              <EntreeLigne
                key={e.correlation_id}
                entree={e}
                depliee={ouverte === e.correlation_id}
                onDeplier={() => setOuverte(ouverte === e.correlation_id ? null : e.correlation_id)}
                onRestaurer={() => void lancerRestauration(e)}
                onVider={() => setAVider(e)}
                enCours={restaurer.isPending}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Vider une entrée : définitif, donc nommé ── */}
      <Dialog
        open={Boolean(aVider)}
        onClose={() => setAVider(null)}
        title="Effacer définitivement de la corbeille ?"
      >
        {aVider && (
          <>
            <p className="text-km-body leading-relaxed text-km-text">
              <strong>
                {aVider.libelle_type}
                {aVider.nom ? ` « ${aVider.nom} »` : ''}
              </strong>{' '}
              et les {aVider.nb_lignes.toLocaleString('fr-FR')} ligne
              {aVider.nb_lignes > 1 ? 's' : ''} de cette suppression ne seront{' '}
              <strong>plus récupérables</strong>. L’enregistrement est déjà supprimé de Kimatch :
              c’est la possibilité de le remettre qui disparaît.
            </p>
            <div className="flex justify-end gap-2 pt-3">
              <Button type="button" variant="ghost" onClick={() => setAVider(null)}>
                Annuler
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={vider.isPending}
                className="border-km-red-line text-km-red hover:bg-km-red-soft"
                onClick={async () => {
                  try {
                    const n = await vider.mutateAsync({ correlationId: aVider.correlation_id })
                    setAVider(null)
                    signaler(`${n} ligne${n > 1 ? 's' : ''} effacée${n > 1 ? 's' : ''} de la corbeille.`)
                  } catch (err) {
                    setErreur(err instanceof Error ? err.message : 'Erreur inconnue')
                  }
                }}
              >
                {vider.isPending ? 'Effacement…' : 'Effacer définitivement'}
              </Button>
            </div>
          </>
        )}
      </Dialog>

      {/* ── Purge par ancienneté ── */}
      <DialogPurge
        ouvert={purgeOuverte}
        onFermer={() => setPurgeOuverte(false)}
        entrees={entrees}
        enCours={vider.isPending}
        onPurger={async (avant) => {
          try {
            const n = await vider.mutateAsync({ avant })
            setPurgeOuverte(false)
            signaler(`${n} ligne${n > 1 ? 's' : ''} effacée${n > 1 ? 's' : ''} de la corbeille.`)
          } catch (err) {
            setErreur(err instanceof Error ? err.message : 'Erreur inconnue')
          }
        }}
      />
    </div>
  )
}

/** Une suppression, dépliable sur son détail. */
function EntreeLigne({
  entree, depliee, onDeplier, onRestaurer, onVider, enCours,
}: {
  entree: EntreeCorbeille
  depliee: boolean
  onDeplier: () => void
  onRestaurer: () => void
  onVider: () => void
  enCours: boolean
}) {
  const { data: detail } = useDetailCorbeille(depliee ? entree.correlation_id : null)
  const quand = new Date(entree.supprime_le)

  return (
    <div className="overflow-hidden rounded-km-md border border-km-line bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
        <button
          type="button"
          onClick={onDeplier}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 shrink-0 text-km-faint transition-transform', depliee && 'rotate-90')}
          />
          <span className="min-w-0">
            <span className="block truncate text-km-body font-bold text-km-text">
              {entree.libelle_type}
              {entree.nom ? ` — ${entree.nom}` : ''}
            </span>
            {/* QUI, QUAND, COMBIEN : les trois questions qu'on se pose en ouvrant la corbeille. */}
            <span className="block truncate text-km-label text-km-muted">
              par {entree.auteur_nom || 'auteur inconnu'}
              {' · '}
              {quand.toLocaleString('fr-FR')}
              {' · '}
              <span className="text-km-faint">{dateRelative(entree.supprime_le)}</span>
            </span>
          </span>
        </button>

        <span className="shrink-0 rounded-km-sm bg-km-soft px-2 py-0.5 font-mono text-km-label font-bold tabular-nums text-km-muted">
          {entree.nb_lignes.toLocaleString('fr-FR')} ligne{entree.nb_lignes > 1 ? 's' : ''}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={onRestaurer}>
            <RotateCcw className="mr-1 h-3 w-3" />
            Restaurer
          </Button>
          <button
            type="button"
            onClick={onVider}
            title="Effacer définitivement de la corbeille"
            className="flex h-7 w-7 items-center justify-center rounded-km border border-km-line text-km-faint transition-colors hover:border-km-red-line hover:bg-km-red-soft hover:text-km-red"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      </div>

      {depliee && (
        <div className="border-t border-km-line bg-km-soft px-3 py-2.5">
          <p className="mb-1.5 text-km-micro font-bold uppercase tracking-[0.07em] text-km-faint">
            Ce que cette suppression a emporté
          </p>
          {!detail ? (
            <p className="text-km-label text-km-muted">Lecture…</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {Object.entries(
                detail.reduce<Record<string, { n: number; noms: string[] }>>((acc, l) => {
                  const e = acc[l.entite_type] ?? { n: 0, noms: [] }
                  e.n += 1
                  if (l.nom && e.noms.length < 4) e.noms.push(l.nom)
                  acc[l.entite_type] = e
                  return acc
                }, {}),
              )
                .sort((a, b) => b[1].n - a[1].n)
                .map(([table, { n, noms }]) => (
                  <div key={table} className="flex items-baseline gap-2">
                    <span className="w-14 shrink-0 text-right font-mono text-km-label font-bold tabular-nums text-km-text">
                      {n.toLocaleString('fr-FR')}
                    </span>
                    <span className="min-w-0 flex-1 text-km-label text-km-muted">
                      {table}
                      {noms.length > 0 && (
                        <span className="text-km-faint">
                          {' — '}
                          {noms.join(', ')}
                          {n > noms.length ? '…' : ''}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * La purge par ancienneté.
 *
 * TROIS SEUILS PROPOSÉS, PAS UN CHAMP LIBRE : une date tapée à la main sur une opération sans
 * recours est une occasion de se tromper d'un chiffre. Et chaque seuil annonce combien d'entrées il
 * emporterait, compté sur ce qui est affiché.
 */
function DialogPurge({
  ouvert, onFermer, entrees, onPurger, enCours,
}: {
  ouvert: boolean
  onFermer: () => void
  entrees: EntreeCorbeille[]
  onPurger: (avant: string) => void
  enCours: boolean
}) {
  const seuils = [
    { libelle: 'plus de 3 mois', jours: 90 },
    { libelle: 'plus de 6 mois', jours: 182 },
    { libelle: 'plus d’un an', jours: 365 },
  ]

  return (
    <Dialog open={ouvert} onClose={onFermer} title="Purger les anciennes suppressions">
      <p className="text-km-body leading-relaxed text-km-text">
        Efface définitivement les entrées les plus anciennes. Les enregistrements concernés sont
        déjà supprimés de Kimatch : c’est la possibilité de les remettre qui disparaît.
      </p>
      <div className="mt-3 flex flex-col gap-1.5">
        {seuils.map((s) => {
          const limite = new Date(Date.now() - s.jours * 86400_000)
          const concernees = entrees.filter((e) => new Date(e.supprime_le) < limite)
          const lignes = concernees.reduce((t, e) => t + e.nb_lignes, 0)
          return (
            <button
              key={s.jours}
              type="button"
              disabled={enCours || concernees.length === 0}
              onClick={() => onPurger(limite.toISOString())}
              className={cn(
                'flex items-baseline justify-between gap-3 rounded-km border px-3 py-2.5 text-left transition-colors',
                concernees.length === 0
                  ? 'cursor-not-allowed border-km-line bg-km-soft text-km-faint'
                  : 'border-km-line bg-white hover:border-km-red-line hover:bg-km-red-soft',
              )}
            >
              <span className="text-km-body font-semibold">Supprimées depuis {s.libelle}</span>
              <span className="shrink-0 font-mono text-km-label tabular-nums">
                {concernees.length === 0
                  ? 'aucune'
                  : `${concernees.length} entrée${concernees.length > 1 ? 's' : ''} · ${lignes.toLocaleString('fr-FR')} ligne${lignes > 1 ? 's' : ''}`}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex justify-end pt-3">
        <Button type="button" variant="ghost" onClick={onFermer}>
          Fermer
        </Button>
      </div>
    </Dialog>
  )
}

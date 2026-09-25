/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES CLÉS D'API DES PARTENAIRES
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 25/09/2026 : « on pourrait avoir l'option de faire une interface externe où le
 * partenaire pourra se connecter, récupérer nos données via clé API, via endpoint, si trop de
 * failles sont présentes dans notre code pour qu'il rentre à l'intérieur ».
 *
 * ══ POURQUOI CET ÉCRAN EXISTE ══
 *
 * Deux jours d'audit ont montré sept failles, dont une dans une correction écrite la veille par
 * quelqu'un qui cherchait précisément ce genre de faille. Faire entrer un externe dans Kimatch,
 * c'est lui donner une session dans une application de 188 tables et 69 points d'entrée, dont
 * chacun doit refuser individuellement et pour toujours.
 *
 * Une clé, une porte, deux ressources en lecture : le raisonnement s'inverse. Au lieu de vérifier
 * que trois cents objets refusent, on écrit ce qu'un seul accepte.
 *
 * ══ LA CLÉ S'AFFICHE UNE FOIS ══
 *
 * Elle naît dans ce navigateur et n'est jamais envoyée : la base ne reçoit que son empreinte. Une
 * base volée ne donne donc aucune clé utilisable, et personne chez KiWee ne peut relire celle d'un
 * partenaire. L'écran le DIT au moment de l'afficher, plutôt que de laisser découvrir qu'elle a
 * disparu.
 */
import { useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Loader2, ShieldOff, TriangleAlert } from 'lucide-react'
import { useComptes } from '@/lib/data/comptes'
import {
  useClesApiPartenaires, useEmettreCleApi, useRevoquerCleApi,
} from '@/lib/data/clesApiPartenaires'
import { cn } from '@/lib/utils'

export function ClesApiPartenaires() {
  const { data: cles, isLoading, isError } = useClesApiPartenaires()
  const { data: comptes } = useComptes()
  const emettre = useEmettreCleApi()
  const revoquer = useRevoquerCleApi()

  const [compteId, setCompteId] = useState('')
  const [libelle, setLibelle] = useState('')
  const [nouvelle, setNouvelle] = useState<string | null>(null)
  const [copiee, setCopiee] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const partenaires = useMemo(
    () => (comptes ?? []).filter((c) => c.type_compte === 'partenaire'),
    [comptes],
  )

  if (isLoading) return null

  if (isError) {
    return (
      <div className="rounded-km border border-km-red/30 bg-km-red-soft px-3.5 py-3">
        <p className="text-km-xs text-km-red">
          Impossible de lire les clés d’API. Seuls les administrateurs y ont accès.
        </p>
      </div>
    )
  }

  async function emettreLaCle() {
    setErreur(null)
    if (!compteId || !libelle.trim()) {
      setErreur('Choisissez un partenaire et donnez un nom à cette clé.')
      return
    }
    try {
      const { cle } = await emettre.mutateAsync({ compteId, libelle })
      setNouvelle(cle)
      setCompteId('')
      setLibelle('')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Émission impossible.')
    }
  }

  const vivantes = (cles ?? []).filter((c) => c.actif && !c.revoquee_le)
  const eteintes = (cles ?? []).filter((c) => !c.actif || c.revoquee_le)

  return (
    <div className="flex flex-col gap-[14px]">
      {/* ── CE QUE LA CLÉ DONNE, DIT AVANT DE L'ÉMETTRE ── */}
      <div className="rounded-km border border-km-line bg-km-bg/40 px-3.5 py-3">
        <p className="text-km-xs leading-relaxed text-km-muted">
          Une clé donne accès à <strong className="text-km-text">deux ressources, en lecture seule</strong> :
          le patrimoine du partenaire et ses recommandations. Elle ne permet aucune écriture, et ne
          montre que son propre compte et ceux dont il est l’apporteur.
          <br />
          Les partenaires n’ont pas de session Kimatch : c’est la seule porte.
        </p>
      </div>

      {/* ── LA CLÉ QUI VIENT DE NAÎTRE ── */}
      {nouvelle && (
        <div className="rounded-km border border-km-green bg-km-green-tint px-3.5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 shrink-0 text-km-green" />
            <span className="text-km-sm font-semibold text-km-text">
              Copiez-la maintenant : elle ne s’affichera plus jamais.
            </span>
          </div>
          <p className="mb-2.5 text-km-xs leading-snug text-km-muted">
            Elle n’est pas enregistrée — KiWee n’en garde qu’une empreinte. En cas de perte, il
            faudra en émettre une nouvelle et révoquer celle-ci.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-km-sm border border-km-line bg-white px-2.5 py-2 font-mono text-[12px] text-km-text">
              {nouvelle}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(nouvelle)
                setCopiee(true)
                setTimeout(() => setCopiee(false), 2000)
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-km-sm bg-km-green px-2.5 py-2 text-km-xs font-semibold text-white transition-colors hover:bg-km-green/90"
            >
              {copiee ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiee ? 'Copiée' : 'Copier'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNouvelle(null)}
            className="mt-2.5 text-km-xs text-km-muted underline hover:text-km-text"
          >
            J’ai transmis la clé, masquer
          </button>
        </div>
      )}

      {/* ── ÉMETTRE ── */}
      <div className="rounded-km border border-km-line bg-white px-3.5 py-3">
        <div className="mb-2.5 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-km-muted" />
          <span className="text-km-sm font-semibold text-km-text">Émettre une clé</span>
        </div>

        {partenaires.length === 0 ? (
          <p className="text-km-xs text-km-faint">
            Aucun compte de type Partenaire en base : créez-en un d’abord.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-km-label font-semibold uppercase tracking-wide text-km-faint">
                Pour quel partenaire
              </span>
              <select
                value={compteId}
                onChange={(e) => setCompteId(e.target.value)}
                className="h-[32px] rounded-km-sm border border-km-line bg-white px-2 text-km-xs text-km-text outline-none focus:border-km-green"
              >
                <option value="">choisir…</option>
                {partenaires.map((p) => (
                  <option key={p.id} value={p.id}>{p.nom}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-1 flex-col gap-1">
              <span className="text-km-label font-semibold uppercase tracking-wide text-km-faint">
                À quoi elle sert
              </span>
              {/* UNE CLÉ SANS NOM NE SE RÉVOQUE JAMAIS : on ignore ce qu'on casserait. */}
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="export mensuel, intégration CRM…"
                className="h-[32px] rounded-km-sm border border-km-line bg-white px-2 text-km-xs text-km-text outline-none focus:border-km-green"
              />
            </label>

            <button
              type="button"
              disabled={emettre.isPending}
              onClick={() => void emettreLaCle()}
              className="flex h-[32px] shrink-0 items-center gap-1.5 rounded-km-sm bg-km-green px-3 text-km-xs font-semibold text-white transition-colors hover:bg-km-green/90 disabled:opacity-60"
            >
              {emettre.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Émission…</>
                : 'Émettre'}
            </button>
          </div>
        )}

        {erreur && (
          <p className="mt-2 rounded-km-sm border border-km-red/30 bg-km-red-soft px-2.5 py-1.5 text-km-xs text-km-red">
            {erreur}
          </p>
        )}
      </div>

      {/* ── LES CLÉS EN COURS ── */}
      {vivantes.length > 0 && (
        <div className="overflow-hidden rounded-km border border-km-line bg-white">
          <table className="w-full text-km-xs">
            <thead>
              <tr className="border-b border-km-line bg-km-bg/40 text-km-label uppercase tracking-wide text-km-faint">
                <th className="px-3 py-2 text-left font-semibold">Partenaire</th>
                <th className="px-3 py-2 text-left font-semibold">Usage</th>
                <th className="px-3 py-2 text-left font-semibold">Clé</th>
                <th className="px-3 py-2 text-left font-semibold">Dernier appel</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {vivantes.map((c) => (
                <tr key={c.id} className="border-b border-km-line-soft last:border-0">
                  <td className="px-3 py-2 font-semibold text-km-text">{c.compte?.nom ?? '—'}</td>
                  <td className="px-3 py-2 text-km-muted">{c.libelle}</td>
                  <td className="px-3 py-2 font-mono text-km-faint">{c.prefixe}…</td>
                  <td className="px-3 py-2 text-km-muted">
                    {c.derniere_utilisee
                      ? `${new Date(c.derniere_utilisee).toLocaleDateString('fr-FR')} · ${c.nb_appels} appel${c.nb_appels > 1 ? 's' : ''}`
                      : <span className="text-km-faint">jamais utilisée</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={revoquer.isPending}
                      onClick={() => { void revoquer.mutateAsync(c.id) }}
                      className="inline-flex items-center gap-1 rounded-km-sm border border-km-line px-2 py-1 text-km-label font-semibold text-km-muted transition-colors hover:border-km-red hover:text-km-red disabled:opacity-60"
                    >
                      <ShieldOff className="h-3 w-3" /> Révoquer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CE QUI A ÉTÉ RÉVOQUÉ : on garde la trace, elle répond à « depuis quand ? » ── */}
      {eteintes.length > 0 && (
        <details className="rounded-km border border-km-line bg-white px-3.5 py-2.5">
          <summary className="cursor-pointer text-km-xs font-semibold text-km-muted">
            {eteintes.length} clé{eteintes.length > 1 ? 's' : ''} révoquée{eteintes.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {eteintes.map((c) => (
              <div key={c.id} className={cn('flex items-center gap-2 text-km-xs text-km-faint')}>
                <span className="font-mono">{c.prefixe}…</span>
                <span>{c.compte?.nom ?? '—'}</span>
                <span>· {c.libelle}</span>
                {c.revoquee_le && (
                  <span>· révoquée le {new Date(c.revoquee_le).toLocaleDateString('fr-FR')}</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

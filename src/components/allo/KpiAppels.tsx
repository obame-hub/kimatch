/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES CHIFFRES D'APPELS DE L'ÉQUIPE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, réunion du 08/09/2026 : « au moins après, on peut savoir : tu as eu 20 personnes au
 * téléphone aujourd'hui et tu as passé 60 appels. »
 *
 * ILS ÉTAIENT DÉJÀ CALCULÉS PAR ALLO, et accessibles depuis le début avec la portée que la clé
 * avait. On ne recompte rien : on affiche ce qu'ils ont mesuré, ce qui évite deux comptages qui
 * finiraient par diverger.
 *
 * ══ CE QUE CET ÉCRAN MONTRE, ET DANS CET ORDRE ══
 *
 * ① LE RÉSUMÉ, quatre nombres. Ce qu'on veut savoir en arrivant.
 * ② L'ENTONNOIR, parce qu'un nombre d'appels ne dit rien sans son taux de décroché : 248 appels
 *   dont la moitié tombe dans le vide n'est pas la même journée que 248 conversations.
 * ③ QUI A FAIT QUOI. Sans classer personne : le tableau est trié par nombre d'appels parce que
 *   c'est l'ordre dans lequel on lit un tableau, pas pour désigner un premier et un dernier.
 */
import { useState } from 'react'
import { Phone, PhoneOff, Clock, MessageSquare } from 'lucide-react'
import { useKpiAppels, dureeCourte, pourcentage, PERIODES, type ClePeriode } from '@/lib/data/kpiAllo'
import { heureLisible } from '@/lib/dateRelative'
import { cn } from '@/lib/utils'

/** « 08/09 » — la borne d'une période, lue d'un coup d'œil sans son année. */
function jourCourt(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** Une tuile de chiffre. Grande, parce que c'est le chiffre qu'on vient chercher. */
function Tuile({ libelle, valeur, precision, Icone }: {
  libelle: string
  valeur: string
  precision?: string
  Icone: typeof Phone
}) {
  return (
    <div className="rounded-km border border-km-line bg-white px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
        <Icone className="h-3.5 w-3.5" />
        {libelle}
      </p>
      <p className="mt-1.5 font-display text-[26px] font-bold leading-none tabular-nums text-km-text">
        {valeur}
      </p>
      {precision && <p className="mt-1 text-km-label text-km-faint">{precision}</p>}
    </div>
  )
}

export function KpiAppels() {
  /* « CETTE SEMAINE » PAR DÉFAUT et non « aujourd'hui » : à 9 h du matin, la journée est presque
     vide et l'écran s'ouvrirait sur des zéros. La semaine en cours est la question qu'on se pose. */
  const [periode, setPeriode] = useState<ClePeriode>('semaine')
  const { data, isLoading, error } = useKpiAppels(periode)
  const libellePeriode = PERIODES.find((p) => p.cle === periode)?.libelle ?? ''

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-6">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-km-title font-semibold text-km-text">Chiffres d’appels</p>
          <p className="text-km-label text-km-faint">Mesurés par Allo, pas recomptés par Kimatch.</p>
        </div>
        {/* DES PÉRIODES NOMMÉES, dans l'ordre où on les regarde : le jour, la veille, puis les
            ensembles qui les contiennent. Elles défilent sur mobile plutôt que de se replier —
            cinq boutons courts tiennent sur une ligne dès 380 px. */}
        <div className="-mx-1 flex max-w-full overflow-x-auto px-1">
          <div className="flex overflow-hidden rounded-km border border-km-line">
            {PERIODES.map((p) => (
              <button
                key={p.cle}
                type="button"
                onClick={() => setPeriode(p.cle)}
                className={cn(
                  'whitespace-nowrap px-3 py-1.5 text-km-label font-semibold transition-colors',
                  periode === p.cle ? 'bg-ink-800 text-white' : 'bg-white text-km-muted hover:bg-km-soft',
                )}
              >
                {p.libelle}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <p className="flex items-center gap-2 rounded-km border border-km-line bg-km-soft px-3 py-2.5 text-km-body text-km-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-km-faint border-t-transparent" />
          Lecture des chiffres chez Allo…
        </p>
      )}

      {error && (
        <div className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5">
          <p className="text-km-body font-bold text-km-red">Chiffres indisponibles</p>
          <p className="mt-1 text-km-label leading-snug text-km-text">
            {error instanceof Error ? error.message : 'Erreur inconnue'}
          </p>
        </div>
      )}

      {data && (
        <>
          {/* ── ① LE RÉSUMÉ ── */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Tuile
              libelle="Appels"
              valeur={data.resume.appels.toLocaleString('fr-FR')}
              precision={libellePeriode.toLowerCase()}
              Icone={Phone}
            />
            <Tuile
              libelle="Au téléphone"
              valeur={dureeCourte(data.resume.secondes_au_telephone)}
              precision="temps de conversation"
              Icone={Clock}
            />
            <Tuile
              libelle="Plus d’une minute"
              valeur={data.resume.appels_plus_une_minute.toLocaleString('fr-FR')}
              precision="de vraies conversations"
              Icone={MessageSquare}
            />
            <Tuile
              libelle="Décroché"
              valeur={pourcentage(data.resume.taux_decroche)}
              precision="des appels aboutissent"
              Icone={PhoneOff}
            />
          </div>

          {/* ── ② L'ENTONNOIR ──
              Une barre par étape, à l'échelle de la première : c'est la comparaison qui informe,
              pas le nombre isolé. */}
          <div className="mt-4 rounded-km border border-km-line bg-white px-4 py-3.5">
            <p className="text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
              Des appels composés aux conversions
            </p>
            <div className="mt-2.5 flex flex-col gap-2">
              {data.entonnoir.map((e) => {
                const base = data.entonnoir[0]?.nombre || 1
                const part = Math.max(2, Math.round((e.nombre / base) * 100))
                return (
                  <div key={e.libelle} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                    <p className="text-km-body text-km-text">{e.libelle}</p>
                    <p className="text-right text-km-body font-bold tabular-nums text-km-text">
                      {e.nombre.toLocaleString('fr-FR')}
                      {e.taux != null && (
                        <span className="ml-2 font-normal text-km-faint">{pourcentage(e.taux)}</span>
                      )}
                    </p>
                    <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-km-soft">
                      <div className="h-full rounded-full bg-km-green" style={{ width: `${part}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── ③ QUI A FAIT QUOI ── */}
          <div className="mt-4 overflow-hidden rounded-km border border-km-line bg-white">
            <div className="border-b border-km-line px-4 py-2.5">
              <p className="text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
                Par personne
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-km-body">
                <thead>
                  <tr className="border-b border-km-line text-km-label text-km-faint">
                    <th className="px-4 py-2 text-left font-semibold">Commercial</th>
                    <th className="px-4 py-2 text-right font-semibold">Appels</th>
                    <th className="px-4 py-2 text-right font-semibold">Au téléphone</th>
                    <th className="px-4 py-2 text-right font-semibold">&gt; 1 min</th>
                    <th className="px-4 py-2 text-right font-semibold">Décroché</th>
                  </tr>
                </thead>
                <tbody>
                  {data.parPersonne.map((p) => (
                    <tr key={p.email || p.nom} className="border-b border-km-line last:border-b-0">
                      <td className="px-4 py-2.5 font-medium text-km-text">{p.nom}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-km-text">
                        {p.appels.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-km-muted">
                        {dureeCourte(p.secondes_au_telephone)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-km-muted">
                        {p.appels_plus_une_minute.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-km-muted">
                        {pourcentage(p.taux_decroche)}
                      </td>
                    </tr>
                  ))}
                  {data.parPersonne.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-km-label text-km-faint">
                        Aucun appel sur la période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CE QUE CES CHIFFRES NE DISENT PAS, dit une fois — sinon on les lit comme la vérité de
              l'activité de l'équipe, alors qu'ils ne couvrent que les comptes Allo. */}
          {/* ── L'HEURE DU RELEVÉ, ET CE QUE LES CHIFFRES NE DISENT PAS ──
              Naoëlle, 08/09/2026 : « ajoute aussi cette heure-ci à tout ça. » Sur « Aujourd'hui »,
              le nombre d'appels bouge de minute en minute et l'écran garde sa réponse cinq minutes :
              sans l'heure de lecture, on ne sait pas ce qu'on regarde. Le bouton de période sert
              aussi de rafraîchissement — recliquer dessus relit. */}
          <p className="mt-3 text-km-label leading-snug text-km-faint">
            {libellePeriode} · du {jourCourt(data.du)} au {jourCourt(data.au)} · chiffres arrêtés à{' '}
            {heureLisible(data.luLe)}.
          </p>
          <p className="mt-1 text-km-label leading-snug text-km-faint">
            Ils viennent des sept comptes Allo de l’équipe : un appel passé depuis un téléphone
            personnel n’y figure pas. Allo ne descend pas sous la journée, il n’y a donc pas de
            période plus fine.
          </p>
        </>
      )}
    </div>
  )
}

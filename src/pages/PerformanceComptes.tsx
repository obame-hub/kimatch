import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Gauge, TrendingUp, UserCheck, CalendarCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { Select } from '@/components/ui/form'
import { TuileChiffre } from '@/components/dashboard/TuileChiffre'
import {
  useComptesPatrimoine,
  useSynthesePatrimoine,
  type TriPatrimoine,
} from '@/lib/data/patrimoineComptes'
import { volumeLisible } from '@/lib/volume'
import { cn } from '@/lib/utils'

/**
 * « PATRIMOINE DES COMPTES » — page 2 du PDF de Michel du 25/08/2026.
 *
 * Sa phrase d'intention : « mesurez la valeur de chaque compte et fiabilisez les données qui pilotent
 * vos actions ». Un score en tête, quatre indicateurs, puis le tableau des comptes.
 *
 * CE N'EST PAS UN CLASSEMENT DE COMMERCIAUX, c'est une liste de travail. D'où le lien « voir les
 * comptes à améliorer », qui trie par le score le plus bas : un tableau de bord qui montre d'abord
 * ses meilleurs élèves ne sert à personne.
 *
 * DEUX CHOSES QUE JE N'AI PAS INVENTÉES, et qui l'attendent :
 *
 * · LE VOLUME DE COMPTEURS N'EST PAS NOTÉ. Sa maquette en fait la quatrième dimension du score, à
 *   25 %. Mais un nombre de compteurs n'est pas un taux : le noter demande de dire combien vaut 100,
 *   et ce plafond est une décision commerciale, pas un calcul. La colonne est affichée, et le score
 *   porte les trois dimensions qui se mesurent.
 * · IL A ÉCARTÉ LE CONCEPT DE SCORE le 24/08 — « je ne préfère pas utiliser le concept de score pour
 *   le moment, ça va nous embrouiller, plus tard avec de l'historique ». C'était à propos de la
 *   maturité d'une opportunité, pas de la fiabilité d'une donnée, et sa maquette du 25 en réintroduit
 *   un. Les deux se défendent ; c'est à lui de trancher, et la page existe pour qu'il puisse le faire
 *   devant quelque chose de réel.
 *
 * LE CHIFFRE QUI VA LE SURPRENDRE : sa maquette annonce 72/100, la base rend 47. L'écart n'est pas
 * une erreur de calcul — 85 % des compteurs ont un contact, mais 44 % seulement ont une échéance
 * valide. C'est précisément le travail que sa page cherche à rendre visible.
 */

const TRIS: { cle: TriPatrimoine; libelle: string; sens: 'asc' | 'desc' }[] = [
  { cle: 'score', libelle: 'Score le plus bas', sens: 'asc' },
  { cle: 'score', libelle: 'Score le plus haut', sens: 'desc' },
  { cle: 'nb_compteurs', libelle: 'Le plus de compteurs', sens: 'desc' },
  { cle: 'volume_mwh', libelle: 'Le plus gros volume', sens: 'desc' },
  { cle: 'compte_nom', libelle: 'Nom du compte', sens: 'asc' },
]

/** La pastille de score : la couleur dit l'état, le nombre dit lequel. */
function Pastille({ score }: { score: number }) {
  const ton =
    score >= 70
      ? 'border-kw-green-border bg-kw-green-light text-kw-green'
      : score >= 40
        ? 'border-kw-amber-border bg-kw-amber-light text-kw-amber-dark'
        : 'border-kw-border-strong bg-kw-red-light text-kw-red'
  return (
    <span
      className={cn(
        'inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-kw-md border font-mono text-kw-xs font-extrabold tabular-nums',
        ton,
      )}
    >
      {score}
    </span>
  )
}

/** Un taux, avec sa barre — deux lectures du même nombre, l'une exacte, l'autre immédiate. */
function Taux({ pct, detail }: { pct: number; detail: string }) {
  return (
    <div className="min-w-[92px]">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-kw-sm font-bold tabular-nums text-kw-ink">{pct} %</span>
        <span className="truncate text-kw-micro text-kw-faint">{detail}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-kw-pill bg-kw-bloc">
        <span
          className={cn('block h-full', pct >= 70 ? 'bg-kw-green' : pct >= 40 ? 'bg-kw-amber' : 'bg-kw-red')}
          style={{ width: Math.min(100, Math.max(0, pct)) + '%' }}
        />
      </div>
    </div>
  )
}

export default function PerformanceComptes({ sansEntete }: { sansEntete?: boolean }) {
  const navigate = useNavigate()
  const [recherche, setRecherche] = useState('')
  const [indiceTri, setIndiceTri] = useState(0)
  const [limite, setLimite] = useState(50)

  const tri = TRIS[indiceTri]
  const synthese = useSynthesePatrimoine()
  const liste = useComptesPatrimoine({ recherche, tri: tri.cle, sens: tri.sens, limite })

  const s = synthese.data
  const pct = (n: number | undefined, d: number | undefined) =>
    n == null || !d ? '—' : Math.round((100 * n) / d) + ' %'

  const total = liste.data?.[0]?.total ?? 0

  return (
    <div>
      {!sansEntete && (
        <PageHeader
          title="Patrimoine des comptes"
          description="Mesurez la valeur de chaque compte et fiabilisez les données qui pilotent vos actions."
        />
      )}

      {/* ══════ LE SCORE MOYEN ══════ */}
      <div className="rounded-kw-3xl border border-kw-green-border bg-kw-green-tint px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-kw-xl bg-kw-green text-white">
            <TrendingUp className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <div className="mr-auto">
            <p className="text-kw-xs font-bold text-kw-body">Performance moyenne des comptes</p>
            <p className="mt-0.5 font-mono text-[26px] font-extrabold leading-none tabular-nums text-kw-ink">
              {s?.scoreMoyen == null ? '—' : `${s.scoreMoyen} / 100`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIndiceTri(0)}
            className="inline-flex shrink-0 items-center gap-1 text-kw-xs font-bold text-kw-green hover:underline"
          >
            Voir les comptes à améliorer
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-kw-pill bg-white">
          <span
            className="block h-full bg-kw-green"
            style={{ width: (s?.scoreMoyen ?? 0) + '%' }}
          />
        </div>
        <p className="mt-2 max-w-[95ch] text-kw-xs leading-relaxed text-kw-meta">
          Un score unique combine trois mesures de fiabilité, à poids égal : les compteurs rattachés à
          un contact, les échéances valides, et les recommandations acceptées par compteur.{' '}
          <strong className="font-semibold text-kw-body">
            Le nombre de compteurs est affiché mais pas noté
          </strong>{' '}
          : le noter demanderait de fixer combien de compteurs valent 100.
        </p>
      </div>

      {/* ══════ LES QUATRE INDICATEURS ══════ */}
      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <TuileChiffre
          icone={Gauge}
          teinte="bg-kw-bloc text-kw-meta"
          badge={s ? `${s.nbComptes.toLocaleString('fr-FR')} comptes` : null}
          valeur={s ? s.nbCompteurs.toLocaleString('fr-FR') : '—'}
          libelle="Nombre de compteurs"
          definition="Compteurs actifs rattachés à un compte, tous types d'énergie."
          onClick={() => navigate('/patrimoine?objet=compteurs')}
        />
        <TuileChiffre
          icone={UserCheck}
          teinte="bg-kw-green-light text-kw-green"
          badge={s ? `${s.nbAvecContact.toLocaleString('fr-FR')} rattachés` : null}
          valeur={pct(s?.nbAvecContact, s?.nbCompteurs)}
          libelle="Compteurs liés à un contact"
          definition="Un compteur sans contact ne produira jamais de signal : c'est la règle de Michel du 24/08 — le signal s'accroche à un contact."
          onClick={() => navigate('/patrimoine?objet=compteurs')}
        />
        <TuileChiffre
          icone={CalendarCheck}
          teinte="bg-kw-amber-light text-kw-amber"
          badge={s ? `${s.nbEcheanceValide.toLocaleString('fr-FR')} valides` : null}
          valeur={pct(s?.nbEcheanceValide, s?.nbCompteurs)}
          libelle="Échéances valides"
          definition="Échéance connue — prouvée par un contrat ou déclarée — et non dépassée. Une date passée n'est pas une donnée, c'est une donnée périmée."
          onClick={() => navigate('/patrimoine?objet=compteurs')}
        />
        <TuileChiffre
          icone={TrendingUp}
          teinte="bg-kw-green-light text-kw-green"
          badge={s ? `${s.nbRecosAcceptees.toLocaleString('fr-FR')} acceptées` : null}
          valeur={pct(s?.nbRecosAcceptees, s?.nbCompteurs)}
          libelle="Recommandations par compteur"
          definition="Recommandations acceptées rapportées au nombre de compteurs : le rendement du patrimoine."
          onClick={() => navigate('/recommandations')}
        />
      </div>

      {/* ══════ LE TABLEAU DES COMPTES ══════ */}
      <div className="mt-5">
        <ListToolbar
          query={recherche}
          onQueryChange={setRecherche}
          placeholder="Rechercher un compte…"
          count={total}
        >
          <Select
            value={String(indiceTri)}
            onChange={(e) => setIndiceTri(Number(e.target.value))}
            className="w-auto"
          >
            {TRIS.map((t, i) => (
              <option key={t.libelle} value={i}>
                {t.libelle}
              </option>
            ))}
          </Select>
        </ListToolbar>

        <div className="overflow-x-auto rounded-kw-3xl border border-kw-border bg-white">
          <table className="w-full min-w-[720px] border-collapse text-kw-sm">
            <thead>
              <tr className="border-b border-kw-border bg-kw-bloc text-left">
                <th className="px-4 py-2.5 text-kw-xs font-bold uppercase tracking-[0.07em] text-kw-meta">
                  Compte
                </th>
                <th className="px-3 py-2.5 text-right text-kw-xs font-bold uppercase tracking-[0.07em] text-kw-meta">
                  Compteurs
                </th>
                <th className="px-3 py-2.5 text-right text-kw-xs font-bold uppercase tracking-[0.07em] text-kw-meta">
                  Volume
                </th>
                <th className="px-3 py-2.5 text-kw-xs font-bold uppercase tracking-[0.07em] text-kw-meta">
                  Liés à un contact
                </th>
                <th className="px-3 py-2.5 text-kw-xs font-bold uppercase tracking-[0.07em] text-kw-meta">
                  Échéances valides
                </th>
                <th className="px-4 py-2.5 text-kw-xs font-bold uppercase tracking-[0.07em] text-kw-meta">
                  Recommandations
                </th>
              </tr>
            </thead>
            <tbody>
              {(liste.data ?? []).map((c) => (
                <tr
                  key={c.compte_id}
                  onClick={() => navigate(`/comptes/${c.compte_id}`)}
                  className="cursor-pointer border-b border-kw-border-faint last:border-b-0 hover:bg-kw-bloc"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Pastille score={c.score} />
                      <span className="truncate font-semibold text-kw-ink">{c.compte_nom}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-kw-body">
                    {c.nb_compteurs.toLocaleString('fr-FR')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-kw-body">
                    {volumeLisible(c.volume_mwh) ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Taux pct={c.pct_contact} detail={`${c.nb_avec_contact} sur ${c.nb_compteurs}`} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Taux
                      pct={c.pct_echeance}
                      detail={`${c.nb_echeance_valide} sur ${c.nb_compteurs}`}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Taux
                      pct={c.pct_recommandation}
                      detail={`${c.nb_recos_acceptees} acceptée${c.nb_recos_acceptees > 1 ? 's' : ''}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {liste.isLoading && <p className="px-4 py-3 text-kw-sm text-kw-meta">Chargement…</p>}
          {!liste.isLoading && (liste.data ?? []).length === 0 && (
            <p className="px-4 py-3 text-kw-sm text-kw-meta">Aucun compte ne correspond.</p>
          )}
        </div>

        {/* On dit combien reste, plutôt que de couper en silence. */}
        {total > (liste.data ?? []).length && (
          <button
            type="button"
            onClick={() => setLimite((l) => l + 100)}
            className="mt-3 rounded-kw-md border border-kw-border-strong bg-white px-3 py-1.5 text-kw-sm font-bold text-kw-meta hover:bg-kw-subtle"
          >
            Voir 100 comptes de plus — {(total - (liste.data ?? []).length).toLocaleString('fr-FR')} restants
          </button>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Download, Gauge, TrendingUp, UserCheck, CalendarCheck } from 'lucide-react'
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
import { supabase } from '@/lib/supabase'
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
  const [exportEnCours, setExportEnCours] = useState(false)

  /**
   * L'EXPORT DE SA MAQUETTE — le bouton en haut à droite de sa page 2.
   *
   * Il porte sur TOUS les comptes, pas sur la tranche affichée : un export qui ne rend que les
   * cinquante lignes visibles est un piège, on s'en aperçoit une fois le fichier ouvert. La
   * recherche en cours est en revanche respectée — si on a filtré, c'est qu'on veut ce filtre.
   *
   * POINT-VIRGULE ET BOM, et ce n'est pas un détail : Excel en français découpe sur le point-virgule
   * et lit l'UTF-8 uniquement s'il trouve la marque d'ordre des octets. Sans les deux, le fichier
   * s'ouvre en une seule colonne avec les accents cassés — et personne ne s'en sert.
   */
  async function exporter() {
    setExportEnCours(true)
    try {
      let q = supabase
        .from('v_comptes_patrimoine')
        .select(
          'compte_nom, nb_compteurs, volume_mwh, nb_avec_contact, pct_contact, nb_echeance_valide, pct_echeance, nb_recos_acceptees, pct_recommandation, score',
        )
      const mots = recherche.trim()
      if (mots) q = q.ilike('compte_nom', `%${mots}%`)
      const { data, error } = await q.order(tri.cle, { ascending: tri.sens === 'asc', nullsFirst: false })
      if (error || !data) return

      const entetes = [
        'Compte', 'Compteurs', 'Volume MWh', 'Compteurs liés à un contact', '% liés à un contact',
        'Échéances valides', "% d'échéances valides", 'Recommandations acceptées',
        '% recommandations par compteur', 'Score sur 100',
      ]
      const cellule = (v: unknown) => {
        const t = v == null ? '' : String(v)
        return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
      }
      const lignes = (data as unknown as Record<string, unknown>[]).map((r) =>
        [
          r.compte_nom, r.nb_compteurs, r.volume_mwh, r.nb_avec_contact, r.pct_contact,
          r.nb_echeance_valide, r.pct_echeance, r.nb_recos_acceptees, r.pct_recommandation, r.score,
        ]
          .map(cellule)
          .join(';'),
      )

      const csv = '﻿' + [entetes.join(';'), ...lignes].join('\r\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `patrimoine-comptes-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportEnCours(false)
    }
  }

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

      {/* ══════ L'INDICE, ET CE QU'IL PÈSE ══════

          Le bloc « Indice de performance du compte » de sa maquette : la légende du score. Un score
          dont on ne peut pas lire la composition ne se discute pas — on le croit ou on l'ignore, et
          dans les deux cas il ne sert à rien.

          TROIS DIMENSIONS À PARTS ÉGALES, et la quatrième est nommée pour ce qu'elle est. Sa maquette
          en met quatre à 25 % ; le nombre de compteurs n'est pas un taux, donc il est affiché sans
          être noté. Le dire ICI plutôt que dans un coin : c'est la seule question ouverte sur cette
          page, autant qu'il la voie en la lisant. */}
      <div className="mt-4 rounded-kw-3xl border border-kw-border bg-white px-5 py-4">
        <p className="text-kw-h4 font-extrabold text-kw-ink">Indice de performance du compte</p>
        <p className="mt-0.5 text-kw-xs text-kw-meta">
          Chaque dimension contribue à parts égales au score sur 100.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {[
            { couleur: 'bg-kw-green', libelle: 'Liés à un contact', poids: '33 %' },
            { couleur: 'bg-kw-amber', libelle: 'Échéances valides', poids: '33 %' },
            { couleur: 'bg-kw-blue', libelle: 'Recommandations / compteur', poids: '33 %' },
            { couleur: 'bg-kw-ghost', libelle: 'Nombre de compteurs', poids: 'affiché, non noté' },
          ].map((d) => (
            <div key={d.libelle} className="flex items-baseline gap-2">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', d.couleur)} />
              <span className="truncate text-kw-sm text-kw-body">{d.libelle}</span>
              <span className="ml-auto shrink-0 font-mono text-kw-xs font-bold tabular-nums text-kw-ink">
                {d.poids}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 max-w-[95ch] border-t border-kw-border-faint pt-2.5 text-kw-xs leading-relaxed text-kw-faint">
          Le nombre de compteurs mesure la taille du compte, pas la qualité de sa donnée : le noter
          demanderait de fixer combien de compteurs valent 100, et ce plafond est une décision
          commerciale. En attendant, il se lit dans le tableau et sert au tri.
        </p>
      </div>

      {/* ══════ LE TABLEAU DES COMPTES ══════ */}
      <div className="mt-5">
        <ListToolbar
          query={recherche}
          onQueryChange={setRecherche}
          placeholder="Rechercher un compte…"
          count={total}
        >
          <button
            type="button"
            onClick={exporter}
            disabled={exportEnCours}
            title="Exporter tous les comptes de la sélection au format CSV"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-white px-2.5 py-1.5 text-kw-sm font-bold text-kw-meta hover:bg-kw-subtle disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exportEnCours ? 'Export…' : 'Exporter'}
          </button>
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

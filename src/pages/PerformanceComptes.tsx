import { useNavigate } from 'react-router-dom'
import { CircleDot, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { useSynthesePatrimoine } from '@/lib/data/patrimoineSynthese'
import { cn } from '@/lib/utils'

/**
 * « PATRIMOINE DES COMPTES » — page 2 du dossier UX du 26/08/2026.
 *
 * Sa règle, mot pour mot : « Afficher UNIQUEMENT le nombre de comptes client/prospect et par segment,
 * le nombre de compteurs avec échéance vide ou dépassée, le nombre de compteurs sans responsable, et
 * les compteurs à échéance valide répartis par période. »
 *
 * CETTE PAGE REMPLACE CELLE DU MATIN, et c'est un revirement qu'il a prononcé lui-même pendant
 * l'appel : « on ne va pas le compter, on ne va pas le compter » — le score sur 100, ses quatre
 * dimensions pondérées et le tableau des 2 635 comptes disparaissent. Ce qu'il veut à la place, il l'a
 * dit dans la même phrase : « le plus important, c'est de savoir le nombre de compteurs qui ont des
 * dates d'échéance vides ou fausses, c'est-à-dire dépassées ».
 *
 * CE N'EST PLUS UN CLASSEMENT, C'EST UN CONSTAT. D'où quatre blocs de comptage et zéro tri : la page
 * ne dit pas quel compte est le meilleur, elle dit combien de données sont à corriger. Les deux blocs
 * du milieu portent une teinte d'alerte parce qu'ils décrivent un arriéré, pas un état de fait —
 * 3 838 échéances dépassées et 1 183 compteurs sans responsable sont du travail, pas une statistique.
 *
 * ══ « CLIENT / PROSPECT » : LA SEULE CHOSE QUE JE N'AI PAS PU FAIRE, ET POURQUOI ══
 *
 * Le champ n'existe pas. Mesuré le 26/08 : les 2 698 comptes consommateurs portent TOUS
 * `type_compte = 'client'`, il n'y a pas une seule ligne « prospect ». Ce n'est donc pas un affichage
 * oublié, c'est une donnée jamais saisie — et l'inventer aurait produit une répartition fausse sur
 * l'écran qui sert justement à mesurer la qualité de la donnée.
 *
 * À la place, la seule mesure vérifiable qui s'en approche : les comptes AVEC CONTRAT ACTIF (511) et
 * les autres (2 190). Un compte chez qui Kiwee a placé de la fourniture est un client au sens le plus
 * défendable du terme ; les autres sont du portefeuille, ce qui n'est pas la même chose qu'un prospect.
 * La page le dit en une ligne plutôt que de laisser croire à un décompte commercial.
 */

/** Un grand nombre, sa légende, et ses subdivisions à droite. */
function Bloc({
  icone: Icone,
  teinte,
  fond,
  intitule,
  valeur,
  precision,
  cellules,
  onClick,
}: {
  icone: typeof CircleDot
  teinte: string
  fond?: string
  intitule: string
  valeur: string
  precision?: string
  cellules: { libelle: string; valeur: string }[]
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'overflow-hidden rounded-kw-3xl border',
        fond ?? 'border-km-line bg-white',
        onClick && 'cursor-pointer transition-shadow hover:shadow-kw-card-open',
      )}
    >
      <div className="flex flex-col sm:flex-row">
        {/* ── Le nombre principal ── */}
        <div className="flex min-w-0 items-start gap-3 px-5 py-4 sm:w-[300px] sm:shrink-0">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-km-lg', teinte)}>
            <Icone className="h-[18px] w-[18px]" strokeWidth={2.3} />
          </span>
          <div className="min-w-0">
            <p className="text-km-label font-bold leading-snug text-km-muted">{intitule}</p>
            <p className="mt-1 text-km-metric-lg font-bold leading-none tabular-nums text-km-text">
              {valeur}
            </p>
            {precision && <p className="mt-1 text-km-label text-km-faint">{precision}</p>}
          </div>
        </div>

        {/* ── Les subdivisions ── */}
        {cellules.length > 0 && (
          <div className="grid flex-1 grid-cols-2 border-t border-km-line sm:grid-cols-4 sm:border-l sm:border-t-0">
            {cellules.map((c, i) => (
              <div
                key={c.libelle}
                className={cn(
                  'px-4 py-4',
                  i % 2 === 1 && 'border-l border-km-line',
                  i >= 2 && 'border-t border-km-line sm:border-t-0',
                  i % 4 !== 0 && 'sm:border-l sm:border-km-line',
                )}
              >
                <p className="truncate text-km-label text-km-muted" title={c.libelle}>
                  {c.libelle}
                </p>
                <p className="mt-1 text-kw-h2 font-extrabold tabular-nums text-km-text">
                  {c.valeur}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PerformanceComptes({ sansEntete }: { sansEntete?: boolean }) {
  const navigate = useNavigate()
  const { data, isLoading } = useSynthesePatrimoine()
  const s = data?.synthese
  const n = (v: number | undefined) => (isLoading || v == null ? '—' : v.toLocaleString('fr-FR'))

  return (
    <div className="flex flex-col gap-3.5">
      {!sansEntete && (
        <PageHeader
          titreMasque={sansEntete}
          title="Patrimoine des comptes"
          description="Suivez le volume des comptes et les compteurs dont les données doivent être corrigées."
        />
      )}

      {/* ══════ 1. LES COMPTES ══════ */}
      <Bloc
        icone={CircleDot}
        teinte="bg-km-green-soft text-km-green"
        intitule="Nombre de comptes"
        valeur={n(s?.nbComptes)}
        precision={s ? `${n(s.nbCompteurs)} compteurs actifs` : undefined}
        cellules={[
          { libelle: 'Avec contrat', valeur: n(s?.nbAvecContrat) },
          { libelle: 'Sans contrat', valeur: n(s?.nbSansContrat) },
          ...(data?.segments ?? []).slice(0, 2).map((x) => ({ libelle: x.segment, valeur: n(x.nb) })),
        ]}
        onClick={() => navigate('/patrimoine?objet=comptes')}
      />

      {/* LA RÉPARTITION PAR SEGMENT EN ENTIER, sur sa propre ligne : elle en compte cinq et les
          tronquer à deux dans le bloc au-dessus aurait caché les syndics, qui sont le cœur du
          portefeuille. */}
      <div className="rounded-kw-3xl border border-km-line bg-white px-5 py-4">
        <p className="text-km-label font-bold text-km-muted">Répartition par segment</p>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
          {(data?.segments ?? []).map((x) => (
            <div key={x.segment} className="min-w-[120px]">
              <p className="truncate text-km-label text-km-muted" title={x.segment}>
                {x.segment}
              </p>
              <p className="mt-0.5 text-kw-h2 font-extrabold tabular-nums text-km-text">
                {n(x.nb)}
              </p>
            </div>
          ))}
          {isLoading && <p className="text-km-body text-km-muted">Chargement…</p>}
        </div>
        {/* LA MENTION QUI ÉVITE UN MALENTENDU. Sa règle demande « client / prospect » ; le champ
            n'existe pas en base. Dire pourquoi vaut mieux qu'un décompte inventé sur l'écran même
            qui mesure la qualité de la donnée. */}
        <p className="mt-3 max-w-[95ch] border-t border-km-line pt-2.5 text-km-label leading-relaxed text-km-faint">
          La distinction client / prospect n’est pas saisie : les {n(s?.nbComptes)} comptes
          consommateurs portent tous le même type. « Avec contrat » compte ceux chez qui une fourniture
          est en cours — c’est la mesure la plus proche que la base sache produire.
        </p>
      </div>

      {/* ══════ 2 ET 3. CE QU'IL Y A À CORRIGER ══════ */}
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <Bloc
          icone={Clock}
          teinte="bg-km-amber-soft text-km-amber"
          fond="border-kw-amber-border bg-km-amber-soft/40"
          intitule="Compteurs avec une date d’échéance dépassée ou vide"
          valeur={n(s ? s.nbEcheanceVide + s.nbEcheanceDepassee : undefined)}
          cellules={[
            { libelle: 'Dates dépassées', valeur: n(s?.nbEcheanceDepassee) },
            { libelle: 'Dates vides', valeur: n(s?.nbEcheanceVide) },
          ]}
          onClick={() => navigate('/patrimoine?objet=compteurs')}
        />

        <Bloc
          icone={AlertCircle}
          teinte="bg-km-red-soft text-km-red"
          fond="border-km-line bg-km-red-soft/30"
          intitule="Compteurs sans responsable"
          valeur={n(s?.nbSansResponsable)}
          precision="Responsable à renseigner"
          cellules={[]}
          onClick={() => navigate('/patrimoine?objet=compteurs')}
        />
      </div>

      {/* ══════ 4. LES ÉCHÉANCES VALIDES, PAR PÉRIODE ══════ */}
      <Bloc
        icone={CheckCircle2}
        teinte="bg-km-green-soft text-km-green"
        intitule="Compteurs par période d’échéance"
        valeur={n(s?.nbEcheanceValide)}
        precision="Uniquement les dates d’échéance valides"
        cellules={[
          { libelle: '0 à 3 mois', valeur: n(s?.nb0a3) },
          { libelle: '4 à 6 mois', valeur: n(s?.nb4a6) },
          { libelle: '7 à 12 mois', valeur: n(s?.nb7a12) },
          { libelle: 'Plus de 12 mois', valeur: n(s?.nbPlus12) },
        ]}
        onClick={() => navigate('/patrimoine?objet=compteurs')}
      />
    </div>
  )
}

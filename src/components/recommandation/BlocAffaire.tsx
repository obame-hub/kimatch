import type { Recommandation } from '@/types/domain'
import { cn } from '@/lib/utils'

/**
 * « L'affaire » — les chiffres portés par la recommandation elle-même.
 *
 * POURQUOI CE FICHIER EXISTE. L'ancienne fiche affichait ces montants dans sa carte « Dossier ». En
 * réorganisant la page en trois colonnes et quatre onglets le 17/08/2026, je l'ai supprimée sans la
 * remplacer : 1599 recommandations ont un `montant` en base et il n'était plus visible nulle part.
 *
 * CE N'EST PAS LE COMPARATIF. Le comparatif compare les VERSIONS entre elles à partir des offres
 * reçues. Ce bloc-ci porte le résultat de l'affaire au niveau du dossier : le fournisseur qui a
 * gagné, le budget avant et après, la marge. Les deux cohabitent sans se recouvrir.
 *
 * ── LA COLONNE DES MARGES, REFAITE LE 30/08/2026 ────────────────────────────────────────────
 *
 * Elle alignait neuf montants sur un pied d'égalité : commission nette KiWee, commission interne,
 * rémunération apporteur, marge brute, marge nette, marge nette avec coeff., marge apporteur,
 * marge nette par MWh, montant de l'affaire. Sur la plupart des dossiers, cinq d'entre eux
 * portaient EXACTEMENT LA MÊME VALEUR — et on ne pouvait pas savoir lequel regarder.
 *
 * Michel a donné la règle le 30/08/2026 :
 *
 *     marge nette = marge brute − marge apporteur d'affaires
 *
 * Vérifiée sur 1 562 dossiers sur 1 562, sans un contre-exemple. Si les cinq libellés se
 * confondaient, c'est simplement que 1 445 dossiers sur 1 562 n'ont aucun apporteur.
 *
 * D'où ces trois lignes, qui se lisent de haut en bas comme une soustraction et non comme une
 * liste. La ligne de l'apporteur ne s'affiche que lorsqu'il y en a un : ailleurs, elle apprendrait
 * seulement qu'il n'y a rien à retrancher.
 *
 * Le reste passe dans le repli. Ce ne sont pas des chiffres de négociation : la marge
 * « commission » sert au commissionnement des salaires, le montant et la marge par MWh servent à
 * situer l'affaire. On les consulte, on ne les surveille pas.
 *
 * DISPARUS DE L'ÉCRAN, PAS DE LA BASE : « Commission nette KiWee », « Commission interne » et
 * « Rémunération apporteur » sont les copies Salesforce de la marge nette, de la marge commission
 * et de la marge apporteur — identiques partout où elles sont renseignées. Les afficher à côté de
 * leur équivalent recréait exactement la confusion qu'on vient de défaire. Elles restent en base
 * comme trace de la reprise.
 */

function euros(n: number): string {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`
}

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-km-body text-km-muted">{libelle}</span>
      <span className="text-right font-mono text-km-body font-bold text-km-text">{children}</span>
    </div>
  )
}

/** Une ligne de l'enchaînement des marges : le signe porte le sens, le total porte le trait. */
function LigneMarge({
  signe, libelle, montant, total,
}: { signe?: '−' | '='; libelle: string; montant: number; total?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 py-1',
        total && 'mt-1 border-t border-km-line pt-2',
      )}
    >
      <span className={cn('flex items-baseline gap-1.5 text-km-body', total ? 'font-semibold text-km-text' : 'text-km-muted')}>
        {signe && <span className="w-2.5 font-mono text-km-muted">{signe}</span>}
        {!signe && <span className="w-2.5" />}
        {libelle}
      </span>
      <span
        className={cn(
          'text-right font-mono font-bold tabular-nums',
          total ? 'text-km-name text-km-green' : 'text-km-body text-km-text',
        )}
      >
        {euros(montant)}
      </span>
    </div>
  )
}

export function BlocAffaire({ reco }: { reco: Recommandation }) {
  const chiffres = [
    reco.montant, reco.fournisseur_nom, reco.duree_mois, reco.volume_contractuel,
    reco.budget_ancienne_offre, reco.budget_nouvelle_offre, reco.difference_budgetaire,
    reco.marge_brute, reco.marge_nette, reco.marge_nette_coeff, reco.marge_apporteur, reco.marge_nette_mwh,
  ]
  if (chiffres.every((v) => v == null || v === '')) return null

  const economise = (reco.difference_budgetaire ?? 0) < 0
  const apporteur = reco.marge_apporteur ?? 0

  /* LE TAUX DU COURTIER, DÉDUIT PLUTÔT QUE REDEMANDÉ. Il vit sur la fiche du fournisseur
     (comptes.taux_commission_courtier) et vaut 0,85/0,75 chez les six courtiers connus. Le rapport
     entre les deux montants le redonne exactement, sans une requête de plus — et quand il vaut 1,
     c'est qu'on a traité en direct : il n'y a alors pas de taux à annoncer. */
  const taux = reco.marge_nette && reco.marge_nette_coeff
    ? reco.marge_nette_coeff / reco.marge_nette
    : null
  const viaCourtier = taux != null && Math.abs(taux - 1) > 0.001

  const detail = [
    reco.marge_nette_coeff != null && {
      libelle: 'Marge « commission »',
      valeur: euros(reco.marge_nette_coeff),
      precision: viaCourtier ? `marge nette × ${taux!.toLocaleString('fr-FR', { maximumFractionDigits: 3 })}` : null,
    },
    reco.montant != null && { libelle: "Montant de l'affaire", valeur: euros(reco.montant), precision: null },
    reco.marge_nette_mwh != null && {
      libelle: 'Marge par MWh',
      valeur: `${reco.marge_nette_mwh.toLocaleString('fr-FR')} €/MWh`,
      precision: null,
    },
  ].filter(Boolean) as { libelle: string; valeur: string; precision: string | null }[]

  return (
    <div className="rounded-[13px] border border-km-line bg-white px-[17px] py-3.5">
      {/* LA MENTION ÉTAIT ÉCRITE EN DUR, donc affirmée sur des dossiers qui ne viennent pas de
          Salesforce. Elle ne s'affiche plus que quand l'origine est vérifiable. */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">L'affaire</span>
        <span className="flex-1" />
        {reco.id_salesforce && <span className="text-km-label text-km-faint">repris de Salesforce</span>}
      </div>

      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        <div>
          {reco.fournisseur_nom && <Ligne libelle="Fournisseur retenu">{reco.fournisseur_nom}</Ligne>}
          {reco.duree_mois != null && <Ligne libelle="Durée">{reco.duree_mois} mois</Ligne>}
          {reco.volume_contractuel != null && (
            <Ligne libelle="Volume contractuel">{reco.volume_contractuel.toLocaleString('fr-FR')} MWh</Ligne>
          )}
          {reco.budget_ancienne_offre != null && (
            <Ligne libelle="Budget ancienne offre">{euros(reco.budget_ancienne_offre)}</Ligne>
          )}
          {reco.budget_nouvelle_offre != null && (
            <Ligne libelle="Budget nouvelle offre">{euros(reco.budget_nouvelle_offre)}</Ligne>
          )}
          {reco.difference_budgetaire != null && (
            <Ligne libelle="Différence annuelle">
              {/* Une différence négative est une BONNE nouvelle pour le client : il paie moins. */}
              <span className={cn(economise ? 'text-km-green' : 'text-km-text')}>
                {euros(reco.difference_budgetaire)}
                {reco.difference_budgetaire_pourcentage != null
                  && ` (${reco.difference_budgetaire_pourcentage.toLocaleString('fr-FR')} %)`}
              </span>
            </Ligne>
          )}
        </div>

        <div>
          {reco.marge_brute != null && <LigneMarge libelle="Marge brute" montant={reco.marge_brute} />}
          {apporteur !== 0 && (
            <LigneMarge signe="−" libelle="Marge apporteur" montant={apporteur} />
          )}
          {reco.marge_nette != null && (
            <LigneMarge signe={reco.marge_brute != null ? '=' : undefined} libelle="Marge nette" montant={reco.marge_nette} total />
          )}

          {detail.length > 0 && (
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-km-body text-km-muted transition-colors hover:text-km-text">
                <span className="inline-block w-2.5 font-mono transition-transform group-open:rotate-90">›</span>
                Détail
              </summary>
              <div className="mt-1 pl-4">
                {detail.map((d) => (
                  <div key={d.libelle} className="flex items-baseline justify-between gap-3 py-1">
                    <span className="text-km-body text-km-muted">
                      {d.libelle}
                      {d.precision && (
                        <span className="ml-1.5 font-mono text-km-label text-km-faint">{d.precision}</span>
                      )}
                    </span>
                    <span className="text-right font-mono text-km-body font-bold tabular-nums text-km-muted">
                      {d.valeur}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

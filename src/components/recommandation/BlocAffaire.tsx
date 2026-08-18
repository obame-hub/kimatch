import type { Recommandation } from '@/types/domain'
import { cn } from '@/lib/utils'

/**
 * « L'affaire » — les chiffres portés par la recommandation elle-même.
 *
 * POURQUOI CE FICHIER EXISTE. L'ancienne fiche affichait ces montants dans sa carte « Dossier ». En
 * réorganisant la page en trois colonnes et quatre onglets le 17/08/2026, je l'ai supprimée sans la
 * remplacer : 1599 recommandations ont un `montant` en base et il n'était plus visible nulle part.
 * Régression constatée le 18/08/2026 en cherchant s'il fallait fabriquer des offres pour retrouver
 * ces chiffres — la réponse était non, il suffisait de les réafficher.
 *
 * CE N'EST PAS LE COMPARATIF. Le comparatif compare les VERSIONS entre elles à partir des offres
 * reçues. Ce bloc-ci porte le résultat de l'affaire au niveau du dossier, tel que Salesforce l'a
 * donné : le fournisseur qui a gagné, le budget avant et après, la marge. Les deux cohabitent sans
 * se recouvrir.
 *
 * Chaque ligne ne s'affiche que si sa valeur existe, et le bloc entier disparaît s'il n'y a rien :
 * sur une recommandation neuve, une liste de tirets n'apprendrait rien.
 */

function euros(n: number): string {
  return `${n.toLocaleString('fr-FR')} €`
}

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-kw-base text-kw-meta">{libelle}</span>
      <span className="text-right font-mono text-kw-md font-bold text-kw-ink">{children}</span>
    </div>
  )
}

export function BlocAffaire({ reco }: { reco: Recommandation }) {
  const chiffres = [
    reco.montant, reco.fournisseur_nom, reco.duree_mois, reco.volume_contractuel,
    reco.budget_ancienne_offre, reco.budget_nouvelle_offre, reco.difference_budgetaire,
    reco.commission_nette, reco.commission_interne, reco.remuneration_apporteur,
    reco.marge_brute, reco.marge_nette, reco.marge_nette_coeff, reco.marge_apporteur, reco.marge_nette_mwh,
  ]
  if (chiffres.every((v) => v == null || v === '')) return null

  const economise = (reco.difference_budgetaire ?? 0) < 0

  return (
    <div className="rounded-[13px] border border-kw-border bg-white px-[17px] py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">L'affaire</span>
        <span className="flex-1" />
        <span className="text-kw-tiny text-kw-faint">repris de Salesforce</span>
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
              {/* Une différence négative est une BONNE nouvelle pour le client : il paie moins. Elle
                  se lit en vert, comme la baisse de prix du bandeau de marché. */}
              <span className={cn(economise ? 'text-kw-green' : 'text-kw-ink')}>
                {euros(reco.difference_budgetaire)}
                {reco.difference_budgetaire_pourcentage != null
                  && ` (${reco.difference_budgetaire_pourcentage.toLocaleString('fr-FR')} %)`}
              </span>
            </Ligne>
          )}
        </div>

        <div>
          {reco.montant != null && <Ligne libelle="Montant de l'affaire">{euros(reco.montant)}</Ligne>}
          {reco.commission_nette != null && <Ligne libelle="Commission nette KiWee">{euros(reco.commission_nette)}</Ligne>}
          {reco.commission_interne != null && <Ligne libelle="Commission interne">{euros(reco.commission_interne)}</Ligne>}
          {reco.remuneration_apporteur != null && (
            <Ligne libelle="Rémunération apporteur">{euros(reco.remuneration_apporteur)}</Ligne>
          )}
          {reco.marge_brute != null && <Ligne libelle="Marge brute">{euros(reco.marge_brute)}</Ligne>}
          {reco.marge_nette != null && <Ligne libelle="Marge nette">{euros(reco.marge_nette)}</Ligne>}
          {reco.marge_nette_coeff != null && <Ligne libelle="Marge nette avec coeff.">{euros(reco.marge_nette_coeff)}</Ligne>}
          {reco.marge_apporteur != null && <Ligne libelle="Marge apporteur">{euros(reco.marge_apporteur)}</Ligne>}
          {reco.marge_nette_mwh != null && (
            <Ligne libelle="Marge nette par MWh">{reco.marge_nette_mwh.toLocaleString('fr-FR')} €/MWh</Ligne>
          )}
        </div>
      </div>
    </div>
  )
}

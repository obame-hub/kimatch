import type { Recommandation } from '@/types/domain'
import { InlineField } from '@/components/ui/inline-field'
import type { PatchRecommandation } from '@/lib/data/recommandations'
import { useMontantsRecommandation } from '@/lib/data/montantAffaire'
import { CalculMontants } from '@/components/recommandation/CalculMontants'
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

/**
 * ══ LES CHIFFRES SE SAISISSENT ICI ═══════════════════════════════════════════════════════════
 *
 * William, 03/09/2026 : impossible de saisir le montant sur une recommandation née dans Kimatch.
 * Le bloc était en lecture seule d'un bout à l'autre — ce qui n'avait jamais gêné, les 1 599
 * dossiers repris apportant leurs chiffres de Salesforce.
 *
 * ══ CE QUI S'ÉDITE, ET CE QUI SE DÉDUIT ══
 *
 * Tout se saisit SAUF la marge nette. Michel a donné la règle le 30/08, vérifiée sur 1 562 dossiers
 * sur 1 562 : marge nette = marge brute − marge apporteur. La rendre modifiable à côté de ses deux
 * termes autoriserait un écran qui se contredit — 100 de brute, 20 d'apporteur, 50 de nette — et
 * personne ne saurait lequel des trois croire.
 *
 * Elle est donc RECALCULÉE ET ÉCRITE à chaque fois que l'un des deux bouge. Écrite, parce qu'elle
 * est lue ailleurs qu'ici — et parce qu'un trigger la recalculait autrefois en base
 * (`fn_calculer_marges`, supprimé le 10/09/2026 : il ignorait la commission d'intermédiaire et
 * écrasait silencieusement les valeurs reprises de Salesforce).
 *
 * DEPUIS LE 10/09/2026, LE TABLEAU DE BORD NE LA SOMME PLUS : il somme `marge_nette_coeff`, le
 * « Montant ». `marge_nette` reste une étape de la cascade, affichée sur la fiche.
 *
 * ══ UNE LIGNE VIDE RESTE VISIBLE ══
 *
 * Le bloc n'affichait chaque ligne que si sa valeur existait — parfait pour lire un dossier repris,
 * impossible pour en remplir un neuf : les champs à saisir étaient précisément ceux qui ne
 * s'affichaient pas. Dès qu'on peut écrire, tout se montre, vide compris.
 */
function LigneSaisie({ libelle, valeur, unite, onCommit, retour, explication }: {
  libelle: string
  valeur: number | null
  unite: string
  onCommit: (v: number | null) => Promise<void>
  retour: { onSaved: () => void; onError: (e: Error) => void }
  explication?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="flex items-center gap-1 text-km-body text-km-muted">
        {libelle}
        {explication}
      </span>
      <span className="text-right">
        <InlineField variant="number" label="" value={valeur} unit={unite} emptyLabel="ajouter"
          onCommit={onCommit} {...retour} />
      </span>
    </div>
  )
}

function Ligne({ libelle, children, explication }: {
  libelle: string
  children: React.ReactNode
  /** L'infobulle « pourquoi ce chiffre », posée contre l'intitulé et non contre la valeur : c'est
      l'intitulé qu'on lit quand on ne comprend pas. */
  explication?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="flex items-center gap-1 text-km-body text-km-muted">
        {libelle}
        {explication}
      </span>
      <span className="text-right font-mono text-km-body font-bold text-km-text">{children}</span>
    </div>
  )
}

export function BlocAffaire({ reco, peutModifier, majReco, signaler }: {
  reco: Recommandation
  /** Sans droit d'écrire, le bloc reste ce qu'il était : une lecture. */
  peutModifier?: boolean
  majReco?: (patch: PatchRecommandation) => Promise<void>
  signaler?: (message: string) => void
}) {
  const editable = Boolean(peutModifier && majReco)
  const retour = {
    onSaved: () => signaler?.('✓ enregistré'),
    onError: (e: Error) => signaler?.(`Erreur : ${e.message}`),
  }

  const chiffres = [
    reco.montant, reco.fournisseur_nom, reco.duree_mois, reco.volume_contractuel,
    reco.budget_ancienne_offre, reco.budget_nouvelle_offre, reco.difference_budgetaire,
    reco.marge_brute, reco.marge_nette, reco.marge_nette_coeff, reco.marge_apporteur, reco.marge_nette_mwh,
    reco.commission_intermediaire, reco.chiffre_affaires,
  ]
  // Un dossier vide se masquait entièrement — donc impossible à remplir. Dès qu'on peut écrire, le
  // bloc s'affiche, quitte à n'être qu'une grille de champs à compléter.
  const masque = !editable && chiffres.every((v) => v == null || v === '')

  /* ══ LE MONTANT CALCULÉ ══
     La formule est en base (`v_montant_recommandation`). Ce bloc la LIT pour deux choses : proposer
     le calcul quand le montant est vide, et expliquer d'où sort le chiffre quand il est rempli.

     ══ CE HOOK EST APPELÉ AVANT LE `return null`, ET CE N'EST PAS UN DÉTAIL DE STYLE ══

     Il était placé APRÈS, donc appelé conditionnellement : le Claude de William l'a relevé le
     08/09/2026 comme la seule erreur de lint du dépôt. Un composant qui appelle ses hooks dans un
     ordre variable d'un rendu à l'autre lit les états de ses voisins — React les tient dans une
     liste positionnelle, pas dans un dictionnaire. Le bloc affichait donc juste, jusqu'au premier
     rendu où le dossier passait de vide à rempli sans que `peutModifier` change.

     L'ARGUMENT, LUI, RESTE CONDITIONNEL, et c'est permis : `useMontantCalcule` porte un
     `enabled: Boolean(recommandationId)`. Passer `undefined` quand le bloc ne s'affichera pas
     préserve l'ordre des hooks sans lancer une requête pour un bloc invisible. */
  const { data: montants } = useMontantsRecommandation(masque ? undefined : reco.id)

  if (masque) return null

  const economise = (reco.difference_budgetaire ?? 0) < 0
  /* La marge nette suit ses deux termes quand ils sont SAISIS — sur les recommandations reprises de
     Salesforce, aucune offre ne permet de la calculer. On l'écrit dans le même patch que celui qui
     la fait bouger : deux écritures séparées laisseraient une seconde pendant laquelle la fiche
     affiche une soustraction fausse. */
  const avecMontantNet = (patch: PatchRecommandation): PatchRecommandation => {
    const b = 'marge_brute' in patch ? (patch.marge_brute ?? 0) : (reco.marge_brute ?? 0)
    const a = 'marge_apporteur' in patch ? (patch.marge_apporteur ?? 0) : (reco.marge_apporteur ?? 0)
    /* LA CIP ENTRE DANS LA SOUSTRACTION DEPUIS LE 09/09/2026. La règle de Michel — nette = brute −
       apporteur — a été vérifiée sur 1 562 dossiers où la commission d'intermédiaire n'était nulle
       part : elle valait donc zéro sans le dire. Maintenant qu'elle se saisit, l'ignorer donnerait
       une marge nette supérieure à ce que Kiwee encaisse vraiment.
       La colonne est vide sur les 1 732 recommandations actives au 09/09/2026 : aucun chiffre
       existant ne bouge, la règle vérifiée par Michel continue de s'appliquer à l'identique. */
    const c = 'commission_intermediaire' in patch
      ? (patch.commission_intermediaire ?? 0)
      : (reco.commission_intermediaire ?? 0)
    return { ...patch, marge_nette: b - c - a, chiffre_affaires: b - c }
  }

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
          {editable ? (
            <>
              <LigneSaisie libelle="Volume contractuel" valeur={reco.volume_contractuel ?? null} unite="MWh"
                onCommit={(v) => majReco!({ volume_contractuel: v })} retour={retour} />
              <LigneSaisie libelle="Budget ancienne offre" valeur={reco.budget_ancienne_offre ?? null} unite="€"
                onCommit={(v) => majReco!({ budget_ancienne_offre: v })} retour={retour} />
              <LigneSaisie libelle="Budget nouvelle offre" valeur={reco.budget_nouvelle_offre ?? null} unite="€"
                onCommit={(v) => majReco!({ budget_nouvelle_offre: v })} retour={retour} />
              <LigneSaisie libelle="Différence annuelle" valeur={reco.difference_budgetaire ?? null} unite="€"
                onCommit={(v) => majReco!({ difference_budgetaire: v })} retour={retour} />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        <div>
          {/* ══ LA CALCULATRICE ══
              Six montants qui découlent l'un de l'autre : la colonne d'opérateurs et les traits de
              sous-total portent cette causalité, là où six lignes alignées se liraient comme six
              faits indépendants. Voir `CalculMontants`. */}
          <CalculMontants
            montants={montants}
            margeBrute={reco.marge_brute ?? null}
            margeNette={reco.marge_nette ?? null}
            commissionApporteur={reco.marge_apporteur ?? null}
            commissionIntermediaire={reco.commission_intermediaire ?? null}
            chiffreAffaires={reco.chiffre_affaires ?? null}
            montantReference={reco.marge_nette_coeff ?? null}
            editable={editable}
            retour={retour}
            onMontantBrut={(v) => majReco!(avecMontantNet({ marge_brute: v }))}
            onCommissionApporteur={(v) => majReco!(avecMontantNet({ marge_apporteur: v }))}
            onCommissionIntermediaire={(v) => majReco!(avecMontantNet({ commission_intermediaire: v }))}
            onMontantReference={(v) => majReco!({ marge_nette_coeff: v })}
          />
        </div>
      </div>
    </div>
  )
}

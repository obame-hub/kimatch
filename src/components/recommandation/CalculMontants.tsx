import { InlineField } from '@/components/ui/inline-field'
import { ExplicationCalcul } from '@/components/ui/explication-calcul'
import type { MontantsRecommandation } from '@/lib/data/montantAffaire'
import { cn } from '@/lib/utils'

/**
 * ══ LA CALCULATRICE DES MONTANTS D'UNE AFFAIRE ══
 *
 * William, 09/09/2026 : « j'aimerais que ce soit présenté dans une card optimisée, hyper premium
 * comme une calculatrice — Montant brut, en dessous Commission Intermédiaire Pricing, puis une
 * ligne de total avec en dessous Chiffre d'affaires, puis Commission apporteur d'affaires, puis une
 * ligne de total avec en dessous Montant net. Et enfin, bien mis en évidence dans une capsule
 * chatoyante, le Montant. »
 *
 * ── POURQUOI UNE CALCULATRICE ET PAS UNE LISTE ──
 *
 * Six montants alignés se lisent comme six faits indépendants. Ils n'en sont pas : chacun naît du
 * précédent, et c'est l'enchaînement qui explique pourquoi Kiwee encaisse 5 625 € sur une affaire
 * facturée 7 500 €. La colonne d'opérateurs et les traits de sous-total portent cette causalité —
 * on lit un calcul, pas un tableau.
 *
 * ── LA COMMISSION D'INTERMÉDIAIRE S'AFFICHE MÊME À ZÉRO ──
 *
 * Elle était masquée quand aucun intermédiaire n'était rattaché au fournisseur. William, en la
 * cherchant sur une fiche : « je ne vois pas le CIP par exemple ». Une étape absente d'un calcul se
 * lit comme un oubli, pas comme un zéro — et la ligne dit alors POURQUOI elle vaut zéro : Kiwee
 * facture en direct. C'est l'information, pas son absence.
 *
 * ── CE QUI SE SAISIT, ET CE QUI SE CALCULE ──
 *
 * La commission d'apporteur se négocie : elle se saisit toujours. Le montant brut se calcule depuis
 * l'offre retenue — mais les 1 728 recommandations reprises de Salesforce n'en ont aucune, et il
 * redevient alors saisissable. Le reste découle.
 */

function euros(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function pourcent(t: number | null | undefined): string | null {
  return t == null ? null : `${(t * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
}

/** Une ligne du calcul : opérateur, intitulé, valeur alignée à droite en chiffres tabulaires. */
function Ligne({
  operateur,
  libelle,
  valeur,
  explication,
  sousTotal,
  saisie,
  enregistre,
  precision,
}: {
  operateur?: '−' | '='
  libelle: string
  valeur: number | null
  explication?: React.ReactNode
  /** Un sous-total ferme une étape : trait au-dessus, intitulé plus affirmé. */
  sousTotal?: boolean
  /** Remplace la valeur par un champ éditable. */
  saisie?: React.ReactNode
  /** Valeur venue de la base faute de calcul possible — voir l'en-tête. */
  enregistre?: boolean
  /** Une précision discrète sous l'intitulé, en petit : le taux appliqué, la raison d'un zéro. */
  precision?: string | null
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-2 py-[7px]',
        sousTotal && 'mt-0.5 border-t border-km-line pt-2.5',
      )}
    >
      <span className="w-3 shrink-0 text-center font-mono text-km-label text-km-faint">
        {operateur ?? ''}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'flex items-center gap-1 text-km-body',
            sousTotal ? 'font-bold text-km-text' : 'text-km-muted',
          )}
        >
          {libelle}
          {enregistre && (
            <span
              className="rounded-km-sm bg-km-soft px-1 text-km-tiny font-semibold text-km-faint"
              title="Valeur enregistrée : aucune offre retenue ne permet de la recalculer."
            >
              enregistré
            </span>
          )}
          {explication}
        </span>
        {precision && <span className="mt-px block text-km-label text-km-faint">{precision}</span>}
      </span>
      <span className="shrink-0 text-right">
        {saisie ?? (
          <span
            className={cn(
              'font-mono tabular-nums',
              valeur == null
                ? 'text-km-body text-km-faint'
                : sousTotal
                  ? 'text-km-name font-extrabold text-km-text'
                  : 'text-km-body font-semibold text-km-text',
            )}
          >
            {valeur == null ? '—' : euros(valeur)}
          </span>
        )}
      </span>
    </div>
  )
}

export function CalculMontants({
  montants,
  margeBrute,
  margeNette,
  commissionApporteur,
  montantReference,
  editable,
  onMontantBrut,
  onCommissionApporteur,
  onMontantReference,
  retour,
}: {
  montants: MontantsRecommandation | null | undefined
  /** Les valeurs enregistrées, qui prennent le relais quand aucune offre ne permet de calculer. */
  margeBrute: number | null
  margeNette: number | null
  commissionApporteur: number | null
  montantReference: number | null
  editable: boolean
  onMontantBrut: (v: number | null) => Promise<void>
  onCommissionApporteur: (v: number | null) => Promise<void>
  onMontantReference: (v: number | null) => Promise<void>
  retour: { onSaved: () => void; onError: (e: Error) => void }
}) {
  const calculAbouti = montants?.montant_brut != null
  const apporteur = commissionApporteur ?? 0

  const brut = calculAbouti ? montants!.montant_brut : margeBrute
  const cip = calculAbouti ? (montants!.commission_intermediaire ?? 0) : 0
  const chiffreAffaires = brut == null ? null : brut - cip
  const montantNet = calculAbouti
    ? montants!.montant_net
    : brut != null
      ? brut - apporteur
      : margeNette
  const montantCalcule = calculAbouti ? montants!.montant_reference : null
  const montant = montantReference ?? montantCalcule

  const intermediaire = montants?.intermediaire_nom ?? null

  return (
    <div className="rounded-km-md border border-km-line bg-km-bg/40 px-3.5 py-3">
      <p className="mb-1.5 text-km-tiny font-extrabold uppercase tracking-[.08em] text-km-faint">
        Calcul du montant
      </p>

      <Ligne
        libelle="Montant brut"
        valeur={brut}
        enregistre={!calculAbouti && brut != null}
        saisie={
          editable && !calculAbouti ? (
            <InlineField
              variant="number"
              label=""
              value={margeBrute}
              unit="€"
              emptyLabel="ajouter"
              onCommit={onMontantBrut}
              {...retour}
            />
          ) : undefined
        }
        explication={
          <ExplicationCalcul
            titre="Montant brut"
            resume={'Ce que Kiwee — ou son intermédiaire pricing — facture au fournisseur sur toute la durée du '
              + 'contrat. Le volume annuel ramené au mois, multiplié par la durée, par la marge €/MWh et par la '
              + 'part qui revient à Kiwee.'}
            etapes={[
              { libelle: 'Volume de référence, sur un an', valeur: montants?.conso_totale_mwh != null ? `${montants.conso_totale_mwh.toLocaleString('fr-FR')} MWh` : null, origine: 'offre retenue' },
              { libelle: 'Durée du contrat', valeur: montants?.duree_mois != null ? `${montants.duree_mois} mois` : null, origine: 'offre retenue' },
              { libelle: 'Marge annoncée au fournisseur', valeur: montants?.marge_eur_mwh != null ? `${montants.marge_eur_mwh.toLocaleString('fr-FR')} €/MWh` : null, origine: 'saisie dans « Modifier les prix »' },
              { libelle: 'Taux répartition', valeur: pourcent(montants?.taux_repartition), origine: montants?.fournisseur_nom ? `fiche de ${montants.fournisseur_nom}` : 'fiche du fournisseur' },
            ]}
            resultat={brut != null ? { libelle: 'Montant brut', valeur: euros(brut) } : undefined}
          />
        }
      />

      {/* ══ LA CIP S'AFFICHE MÊME À ZÉRO ══ voir l'en-tête du fichier. */}
      <Ligne
        operateur="−"
        libelle="Commission intermédiaire pricing"
        valeur={brut == null ? null : cip}
        precision={
          intermediaire
            ? `${intermediaire} · ${pourcent(montants?.taux_commissionnement) ?? '—'}`
            : 'aucun intermédiaire : Kiwee facture en direct'
        }
        explication={
          <ExplicationCalcul
            titre="Commission intermédiaire pricing"
            resume={'Ce que l’intermédiaire prélève sur le montant qu’il facture à son fournisseur partenaire. '
              + 'Son taux vit sur sa fiche partenaire, et le rattachement du fournisseur à un intermédiaire sur '
              + 'la fiche du fournisseur.'}
            etapes={[
              { libelle: 'Montant brut', valeur: brut != null ? euros(brut) : null, origine: 'calculé ci-dessus' },
              { libelle: 'Intermédiaire', valeur: intermediaire, origine: 'fiche du fournisseur retenu' },
              { libelle: 'Taux commissionnement', valeur: pourcent(montants?.taux_commissionnement), origine: intermediaire ? `fiche de ${intermediaire}` : 'aucun' },
            ]}
            resultat={brut != null ? { libelle: 'CIP', valeur: euros(cip) } : undefined}
            manques={intermediaire ? undefined : ['Ce fournisseur n’est rattaché à aucun intermédiaire pricing : rien n’est prélevé.']}
          />
        }
      />

      <Ligne
        operateur="="
        libelle="Chiffre d’affaires"
        valeur={chiffreAffaires}
        sousTotal
        explication={
          <ExplicationCalcul
            titre="Chiffre d’affaires"
            resume={'Ce qui entre réellement dans les caisses de Kiwee, avant la commission de l’apporteur '
              + 'd’affaires. Sans intermédiaire pricing, il égale le montant brut.'}
            etapes={[
              { libelle: 'Montant brut', valeur: brut != null ? euros(brut) : null, origine: 'calculé ci-dessus' },
              { libelle: 'Commission intermédiaire', valeur: brut != null ? euros(cip) : null, origine: intermediaire ? `prélevée par ${intermediaire}` : 'aucune' },
            ]}
            resultat={chiffreAffaires != null ? { libelle: 'Chiffre d’affaires', valeur: euros(chiffreAffaires) } : undefined}
          />
        }
      />

      <Ligne
        operateur="−"
        libelle="Commission apporteur d’affaires"
        valeur={apporteur}
        precision={apporteur === 0 ? 'aucun apporteur sur ce dossier' : null}
        saisie={
          editable ? (
            <InlineField
              variant="number"
              label=""
              value={commissionApporteur}
              unit="€"
              emptyLabel="ajouter"
              onCommit={onCommissionApporteur}
              {...retour}
            />
          ) : undefined
        }
        explication={
          <ExplicationCalcul
            titre="Commission apporteur d’affaires"
            resume={'Ce que Kiwee reverse à l’apporteur qui a détecté et contractualisé l’affaire. Montant fixe, '
              + 'négocié au cas par cas. Sans apporteur sur le dossier, il n’y a pas de commission.'}
            etapes={[{ libelle: 'Apporteur sur ce dossier', valeur: apporteur === 0 ? 'aucun' : 'oui', origine: 'ce champ' }]}
            resultat={apporteur !== 0 ? { libelle: 'CAA', valeur: euros(apporteur) } : undefined}
          />
        }
      />

      <Ligne
        operateur="="
        libelle="Montant net"
        valeur={montantNet}
        sousTotal
        enregistre={!calculAbouti && montantNet != null}
        explication={
          <ExplicationCalcul
            titre="Montant net"
            resume={'Ce qui reste dans les caisses de Kiwee une fois l’apporteur d’affaires payé. Sans apporteur, '
              + 'il égale le chiffre d’affaires.'}
            etapes={[
              { libelle: 'Chiffre d’affaires', valeur: chiffreAffaires != null ? euros(chiffreAffaires) : null, origine: 'calculé ci-dessus' },
              { libelle: 'Commission apporteur', valeur: euros(apporteur), origine: apporteur === 0 ? 'aucun apporteur' : 'saisie sur cette fiche' },
            ]}
            resultat={montantNet != null ? { libelle: 'Montant net', valeur: euros(montantNet) } : undefined}
          />
        }
      />

      {/* ══ LA CAPSULE ══
          Le « Montant » n'est pas la dernière ligne d'une addition : c'est LA référence, celle qui
          alimente les commissions, les objectifs et tous les rapports. Il sort donc du tableau et
          prend une capsule à lui.

          LE REFLET QUI TRAVERSE est lent — six secondes — et ne se déclenche pas sur un survol :
          il dit « ce chiffre compte », pas « clique ici ». Une animation plus rapide, sur un écran
          qu'on garde ouvert, devient un tic nerveux. */}
      <div
        className="animate-km-chatoie mt-2.5 flex items-center gap-3 rounded-km-md px-3.5 py-2.5"
        style={{
          background:
            'linear-gradient(110deg,#0d7a5f 0%,#199b78 38%,#5fae8f 50%,#199b78 62%,#0d7a5f 100%)',
          backgroundSize: '260% 100%',
          boxShadow: '0 3px 12px rgba(13,122,95,.28)',
        }}
      >
        <span className="flex items-center gap-1.5 text-km-label font-extrabold uppercase tracking-[.08em] text-white/85">
          Montant
          {editable ? null : (
            <ExplicationCalcul
              titre="Montant"
              resume={'La référence des commissions commerciales, des objectifs et de tous les rapports. Il se '
                + 'calcule comme le montant net, mais avec le taux commerciaux à la place du taux de '
                + 'commissionnement réel — 15 % contre 25 %. Deux chiffres pour la même affaire, et c’est voulu.'}
              etapes={[
                { libelle: 'Montant brut', valeur: brut != null ? euros(brut) : null, origine: 'calculé ci-dessus' },
                { libelle: 'Taux commerciaux', valeur: pourcent(montants?.taux_commerciaux), origine: intermediaire ? `fiche de ${intermediaire}` : 'aucun intermédiaire : 0 %' },
                { libelle: 'Commission apporteur', valeur: euros(apporteur), origine: apporteur === 0 ? 'aucun apporteur' : 'saisie sur cette fiche' },
              ]}
              resultat={montantCalcule != null ? { libelle: 'Montant calculé', valeur: euros(montantCalcule) } : undefined}
            />
          )}
        </span>
        <span className="flex-1" />
        {editable ? (
          <span className="[&_*]:!text-white">
            <InlineField
              variant="number"
              label=""
              value={montantReference}
              unit="€"
              emptyLabel="ajouter"
              onCommit={onMontantReference}
              {...retour}
            />
          </span>
        ) : (
          <span className="font-mono text-km-title font-extrabold tabular-nums text-white">
            {montant == null ? '—' : euros(montant)}
          </span>
        )}
      </div>

      {/* La proposition du calcul, sous la capsule : on propose, on n'impose pas — « la version
          modifiée à la main écrase le calcul » (William, 03/09/2026). */}
      {editable && montantCalcule != null && Math.abs((montantReference ?? 0) - montantCalcule) > 0.5 && (
        <button
          type="button"
          onClick={() => void onMontantReference(montantCalcule)}
          className="mt-1.5 ml-auto block rounded-km bg-km-green-soft px-2 py-1 text-km-label font-semibold text-km-green transition-colors hover:brightness-95"
        >
          Reprendre le calcul : {euros(montantCalcule)}
        </button>
      )}
    </div>
  )
}

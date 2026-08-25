import { useState } from 'react'
import { budgetGazDecompose, TAUX_TVA_GAZ } from '@/lib/calculs/budgetGaz'
import type { PrixOffreGaz } from '@/types/domain'

/**
 * LES CONDITIONS DU FOURNISSEUR RETENU, PRÉSENTÉES COMME IL LES A ENVOYÉES.
 *
 * Michel, appel du 25/08/2026 : « je veux le même affichage sur condition essentielle, qui reprend
 * exactement le détail que le fournisseur a envoyé, mais uniquement pour LE FOURNISSEUR RETENU ».
 *
 * La référence est l'offre 500074350 de Gaz Européen, qu'il a envoyée à Naoëlle : deux blocs, le prix
 * du MWh décomposé par nature de rémunération, puis le budget annuel indicatif poste par poste
 * jusqu'au total TTC et au prix moyen du MWh. C'est cette structure qui est reprise ici, pas une
 * interprétation : « qu'on se retrouve à peu près sur le même type d'information ».
 *
 * DEUX CHOSES QUE NOUS N'AVIONS PAS et qui font l'essentiel de leur clarté :
 *
 *   · le budget est décomposé en SIX postes au lieu de trois, l'acheminement variable étant fondu
 *     dans les dépenses énergétiques comme ils le font ;
 *   · le TOTAL EST TTC, avec ses deux lignes de TVA — la CTA taxée avec l'abonnement, l'accise avec
 *     la consommation. Aucune colonne « tva » n'existe dans notre base : ces montants sont calculés
 *     à l'affichage, au taux de 20 % qui vaut pour tous les fournisseurs (Naoëlle, 25/08/2026). Le
 *     taux reste écrit dans chaque libellé : un total TTC ne doit pas pouvoir être lu sans savoir
 *     sur quoi il repose.
 *
 * GAZ SEULEMENT, et c'est dit à l'écran quand ce n'est pas du gaz. Un compteur d'électricité n'a ni
 * molécule, ni CEE, ni accise gaz : ses composantes sont le TURPE et les classes horosaisonnières,
 * et transposer cette présentation serait inventer un document qu'aucun fournisseur n'a envoyé.
 */

const euros = (v: number | null | undefined, decimales = 2) =>
  v == null
    ? 'à vérifier'
    : `${v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} €`

const parMwh = (v: number | null | undefined) =>
  v == null ? 'à vérifier' : `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/MWh`

/** Une ligne du tableau : intitulé à gauche, sigle au milieu, montant à droite. */
function LignePrix({
  intitule,
  sigle,
  valeur,
  fort,
}: {
  intitule: string
  sigle?: string
  valeur: string
  fort?: boolean
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-kw-border-faint py-[3px] last:border-b-0">
      <span className={fort ? 'text-kw-base font-bold text-kw-ink' : 'text-kw-base text-kw-body'}>{intitule}</span>
      {sigle && <span className="font-mono text-kw-micro text-kw-faint">{sigle}</span>}
      <span className="flex-1" />
      <span className={fort ? 'font-mono text-kw-base font-extrabold tabular-nums text-kw-ink' : 'font-mono text-kw-base tabular-nums text-kw-body'}>
        {valeur}
      </span>
    </div>
  )
}

function Titre({ children }: { children: string }) {
  return (
    <p className="mt-3 text-kw-micro font-extrabold uppercase tracking-[0.09em] text-kw-green">{children}</p>
  )
}

export function ConditionsFournisseurRetenu({
  dureeMois,
  typePrix,
  debut,
  prixGaz,
  consommation,
}: {
  dureeMois: number | null
  typePrix: string | null
  /** Date ISO de prise d'effet, si elle est connue. */
  debut: string | null
  prixGaz: PrixOffreGaz | null | undefined
  /** La consommation à retenir, quand elle ne vient pas des prix de l'offre. */
  consommation: number | null
}) {
  /**
   * HORS TAXES OU TOUTES TAXES — demandé par Naoëlle le 25/08/2026 : « avoir la possibilité de voir
   * l'offre avec ou sans TVA, via toggle ou autre chose que tu juges bien ».
   *
   * LE BASCULEMENT NE S'IMPRIME PAS, et c'est le point : ce qui est affiché au moment d'imprimer est
   * ce qui part chez le client. La personne qui envoie choisit donc sa base au lieu de subir celle
   * qu'on aurait figée — un syndic raisonne en TTC, une entreprise assujettie en HT.
   *
   * TTC PAR DÉFAUT, parce que c'est la base du document de Gaz Européen dont Michel veut « le même
   * affichage », et parce que c'est le montant que le client paie réellement.
   */
  const [base, setBase] = useState<'ttc' | 'ht'>('ttc')
  const b = budgetGazDecompose(prixGaz, consommation)

  if (!prixGaz || !b) {
    return (
      <p className="mt-2 rounded-kw-md border border-dashed border-kw-border-strong bg-kw-subtle px-3 py-2 text-kw-sm text-kw-meta">
        Le détail du fournisseur retenu n’est pas disponible : il demande les composantes de prix et la
        consommation de référence du point de livraison. Saisissez-les sur l’offre pour que cette page
        reprenne la présentation du fournisseur.
      </p>
    )
  }

  const dateFr = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR')
  const pourcent = `${(TAUX_TVA_GAZ * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

  return (
    <div className="mt-2 grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2">
      {/* ══════════ LE PRIX DU MWH ══════════ */}
      <div>
        <p className="text-kw-base font-extrabold uppercase tracking-[0.04em] text-kw-ink">Prix du MWh</p>

        <Titre>Prix fournisseur</Titre>
        <LignePrix intitule="Molécule" sigle="P0 + marge" valeur={parMwh(prixGaz.prix_energie_mwh)} />

        <Titre>Rémunération acheminement distribution et transport</Titre>
        <LignePrix intitule="Total abonnement" sigle="Ab(M)" valeur={euros(prixGaz.abonnement_fourniture_annuel_ht) + '/an'} />
        <LignePrix intitule="Terme quantité distribution" sigle="ATRD" valeur={parMwh(prixGaz.prix_atrd_mwh)} />
        {prixGaz.prix_atrt_mwh != null && (
          <LignePrix intitule="Terme quantité transport" sigle="ATRT" valeur={parMwh(prixGaz.prix_atrt_mwh)} />
        )}

        <Titre>Rémunération du dispositif CEE</Titre>
        {/* LEUR DOCUMENT SÉPARE CEE CLASSIQUES ET PRÉCARITÉ ; nous n'avons qu'une colonne. On affiche
            donc le total sans prétendre à une ventilation qu'on n'a pas — l'inventer serait pire que
            de la regrouper. */}
        <LignePrix intitule="Certificats d’économie d’énergie" sigle="CEE" valeur={parMwh(prixGaz.prix_cee_mwh)} />

        <Titre>Rémunération du dispositif CPB</Titre>
        <LignePrix intitule="Certificat de production de biogaz" sigle="CPB" valeur={parMwh(prixGaz.prix_cpb_mwh)} />

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-kw-sm text-kw-body">
          <span>
            Consommation de référence :{' '}
            <strong className="font-mono font-bold">
              {b.conso.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} MWh
            </strong>
          </span>
          {dureeMois != null && <span>Durée : <strong className="font-bold">{dureeMois} mois</strong></span>}
          {typePrix && <span>Prix : <strong className="font-bold">{typePrix}</strong></span>}
        </div>
      </div>

      {/* ══════════ LE BUDGET ANNUEL INDICATIF ══════════ */}
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-kw-base font-extrabold uppercase tracking-[0.04em] text-kw-ink">
            Budget annuel indicatif
          </p>
          {/* Le choix se fait ici et ne s'imprime pas : le papier ne porte que la base retenue. */}
          <span className="flex items-center gap-0.5 rounded-kw-md border border-kw-border-strong bg-white p-0.5 print:hidden">
            {([
              { cle: 'ttc' as const, libelle: 'TTC' },
              { cle: 'ht' as const, libelle: 'HT' },
            ]).map((o) => (
              <button
                key={o.cle}
                type="button"
                onClick={() => setBase(o.cle)}
                title={o.cle === 'ttc' ? 'Toutes taxes comprises — ce que le client paie' : 'Hors taxes — pour un client assujetti'}
                className={
                  base === o.cle
                    ? 'rounded-kw-sm bg-ink-800 px-2 py-0.5 text-kw-micro font-extrabold text-white'
                    : 'rounded-kw-sm px-2 py-0.5 text-kw-micro font-bold text-kw-meta hover:bg-kw-subtle'
                }
              >
                {o.libelle}
              </button>
            ))}
          </span>
        </div>

        <div className="mt-1">
          <LignePrix intitule="Abonnement" valeur={euros(b.abonnement) + ' HT/an'} />
          <LignePrix intitule="Dépenses énergétiques" valeur={euros(b.depensesEnergetiques) + ' HT/an'} />
          <LignePrix intitule="CTA" valeur={euros(b.cta) + ' HT/an'} />
          <LignePrix intitule="Accise sur les gaz naturels" sigle="ex-TICGN" valeur={euros(b.accise) + ' HT/an'} />
          {/* Les deux lignes de TVA disparaissent en base hors taxes : les montrer sans les compter
              dans le total serait le meilleur moyen de faire douter du total. */}
          {base === 'ttc' && (
            <>
              <LignePrix intitule={`TVA sur abonnement (${pourcent})`} valeur={euros(b.tvaAbonnement) + '/an'} />
              <LignePrix intitule={`TVA hors abonnement (${pourcent})`} valeur={euros(b.tvaConsommation) + '/an'} />
            </>
          )}
        </div>

        <div className="mt-2 rounded-kw-lg border-2 border-kw-green bg-kw-green-tint px-3 py-2">
          <LignePrix
            intitule="Total dépenses"
            valeur={euros(base === 'ttc' ? b.totalTtc : b.totalHt) + (base === 'ttc' ? ' TTC/an' : ' HT/an')}
            fort
          />
          <LignePrix
            intitule="Prix moyen annuel du MWh"
            valeur={euros(base === 'ttc' ? b.prixMoyenTtcMwh : b.prixMoyenHtMwh) + (base === 'ttc' ? ' TTC/MWh' : ' HT/MWh')}
            fort
          />
          <p className="pt-1 text-kw-micro text-kw-meta">
            {base === 'ttc'
              ? 'Y compris abonnement et taxes.'
              : 'Hors TVA, abonnement compris. Un client assujetti la récupère.'}
          </p>
        </div>

        {debut && (
          <p className="mt-2 text-kw-sm font-bold uppercase tracking-[0.04em] text-kw-ink">
            Prise d’effet le {dateFr(debut)}
          </p>
        )}

        {/* UN BUDGET PARTIEL SE DIT. Sans cette mention, un total amputé d'une composante non saisie
            se lirait comme un total complet — et c'est un chiffre que le client compare. */}
        {b.incomplet && (
          <p className="mt-2 rounded-kw-md border border-dashed border-kw-amber bg-kw-amber-light px-2.5 py-1.5 text-kw-micro font-semibold text-kw-amber-dark">
            Une ou plusieurs composantes ne sont pas saisies : ce budget est partiel. Les lignes
            marquées « à vérifier » ci-contre indiquent lesquelles.
          </p>
        )}

        <p className="mt-2 text-kw-micro leading-snug text-kw-faint">
          Montants indicatifs, calculés sur la consommation de référence et les composantes
          réglementaires applicables à la date de l’analyse.
          {base === 'ttc'
            ? ` TVA appliquée au taux de ${pourcent} sur les deux assiettes — abonnement et CTA d’une part, consommation et accise de l’autre.`
            : ' Montants hors TVA.'}
        </p>
      </div>
    </div>
  )
}

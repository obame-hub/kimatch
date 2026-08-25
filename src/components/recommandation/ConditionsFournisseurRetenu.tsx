import { useState } from 'react'
import { budgetGazDecompose, TAUX_TVA_GAZ } from '@/lib/calculs/budgetGaz'
import type { PrixOffreGaz } from '@/types/domain'

/**
 * LES CONDITIONS DÉTAILLÉES DU FOURNISSEUR RETENU.
 *
 * Structure dictée ligne par ligne par Michel, appel du 25/08/2026 à 14 h 52. Deux colonnes :
 *
 *   PRIX DÉTAILLÉ                        BUDGET ANNUEL INDICATIF
 *     Prix du fournisseur                  Budget prix fournisseur
 *       molécule                           Budget acheminement et distribution
 *       certificat d'économie d'énergie    Budget des taxes
 *       certificat de production biogaz    ────
 *     Acheminement, distribution           TVA (20 %)
 *     et transport                         Total TTC · prix moyen du MWh
 *       total abonnement                   Début de fourniture
 *       terme quantité distribution
 *     Taxe
 *       CTA
 *       accise sur le gaz naturel
 *
 * SES CORRECTIONS, UNE PAR UNE :
 *
 * · « PRIX DU MÉGAWATTHEURE, ça n'a pas de sens parce qu'il y a des trucs qui sont [à part],
 *   notamment l'abonnement. Je mettrais PRIX DÉTAILLÉ. » Le titre annonçait une unité que la moitié
 *   des lignes ne portent pas.
 * · « On ne met pas RÉMUNÉRATION, on met simplement acheminement, distribution et transport. »
 * · La molécule perd sa mention « P0 + marge » : la marge ne se montre pas au client.
 * · Un intitulé TAXE, avec la CTA et l'accise dessous — « un titre pour dire que c'est la taxe ».
 * · L'accise s'affiche en €/MWh dans le prix détaillé, « le montant mégawattheure qui sera calculé
 *   en fonction de la consommation », et non en € par an.
 * · Durée, type de prix et consommation de référence QUITTENT ce bloc : « tout ça, c'est déjà
 *   indiqué [en page 1] donc je ne vais pas venir le remettre là ». Ne restent ici que les
 *   informations propres à l'offre retenue.
 * · Le budget n'a plus que TROIS grandes lignes, une par famille — « la ligne du budget c'est le
 *   montant total, et les lignes [du prix détaillé] le montant de chaque composante ».
 * · La TVA est GROUPÉE en une ligne, « parce que c'est 20 % maintenant » sur les deux assiettes.
 * · « PRISE D'EFFET » devient DÉBUT DE FOURNITURE : « c'est pas la date à laquelle on a fait la
 *   demande de cotation, c'est le début de fourniture ».
 *
 * GAZ SEULEMENT. Un compteur d'électricité n'a ni molécule, ni CEE, ni accise gaz : ses composantes
 * sont le TURPE et les classes horosaisonnières. Transposer cette présentation serait inventer un
 * document qu'aucun fournisseur n'a envoyé — l'appelant retombe alors sur les lignes essentielles.
 */

const euros = (v: number | null | undefined) =>
  v == null
    ? 'à vérifier'
    : `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

const parMwh = (v: number | null | undefined) =>
  v == null ? 'à vérifier' : `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/MWh`

/** Une ligne : intitulé à gauche, sigle au milieu, montant à droite. */
function Ligne({
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
      <span
        className={
          fort
            ? 'font-mono text-kw-base font-extrabold tabular-nums text-kw-ink'
            : 'font-mono text-kw-base tabular-nums text-kw-body'
        }
      >
        {valeur}
      </span>
    </div>
  )
}

/** Les intitulés de famille, en vert — « comme rémunération des CEE, je vais mettre taxe ». */
function Famille({ children }: { children: string }) {
  return <p className="mt-3 text-kw-micro font-extrabold uppercase tracking-[0.09em] text-kw-green">{children}</p>
}

export function ConditionsFournisseurRetenu({
  debut,
  prixGaz,
  consommation,
}: {
  /** Date ISO du DÉBUT DE FOURNITURE — et non celle de la demande de cotation. */
  debut: string | null
  prixGaz: PrixOffreGaz | null | undefined
  /** La consommation à retenir, quand elle ne vient pas des prix de l'offre. */
  consommation: number | null
}) {
  /**
   * HORS TAXES OU TOUTES TAXES — « total TTC ou total hors taxe », et « le prix moyen TTC ou le prix
   * moyen hors taxes ». Le basculement NE S'IMPRIME PAS : ce qui est affiché au moment d'imprimer est
   * ce qui part chez le client, donc celui qui envoie choisit sa base — un syndic raisonne en TTC,
   * une entreprise assujettie en HT.
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
  const ttc = base === 'ttc'

  return (
    <div className="mt-2 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
      {/* ══════════ PRIX DÉTAILLÉ ══════════ */}
      <div>
        <p className="text-kw-base font-extrabold uppercase tracking-[0.04em] text-kw-ink">Prix détaillé</p>

        <Famille>Prix du fournisseur</Famille>
        <Ligne intitule="Molécule" valeur={parMwh(prixGaz.prix_energie_mwh)} />
        <Ligne intitule="Certificat d’économie d’énergie" sigle="CEE" valeur={parMwh(prixGaz.prix_cee_mwh)} />
        <Ligne intitule="Certificat de production biogaz" sigle="CPB" valeur={parMwh(prixGaz.prix_cpb_mwh)} />

        <Famille>Acheminement, distribution et transport</Famille>
        <Ligne
          intitule="Total abonnement"
          sigle="Ab(M)"
          valeur={`${euros(prixGaz.abonnement_fourniture_annuel_ht)}/an`}
        />
        <Ligne intitule="Terme quantité distribution" sigle="ATRD" valeur={parMwh(prixGaz.prix_atrd_mwh)} />
        {prixGaz.prix_atrt_mwh != null && (
          <Ligne intitule="Terme quantité transport" sigle="ATRT" valeur={parMwh(prixGaz.prix_atrt_mwh)} />
        )}

        <Famille>Taxe</Famille>
        <Ligne intitule="Contribution tarifaire d’acheminement" sigle="CTA" valeur={`${euros(prixGaz.cta_annuel_ht)}/an`} />
        {/* L'accise en €/MWh et non en € par an : « je vais donc juste mettre le montant mégawattheure
            qui sera calculé en fonction de la consommation ». */}
        <Ligne intitule="Accise sur le gaz naturel" sigle="ex-TICGN" valeur={parMwh(prixGaz.prix_agn_mwh)} />
      </div>

      {/* ══════════ BUDGET ANNUEL INDICATIF ══════════ */}
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
                title={
                  o.cle === 'ttc'
                    ? 'Toutes taxes comprises — ce que le client paie'
                    : 'Hors taxes — pour un client assujetti'
                }
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

        {/* LES MÊMES TROIS FAMILLES QU'À GAUCHE, avec leurs intitulés verts. Michel, 25/08/2026 :
            « dans les deux, tu as trois grandes lignes — si ce n'est que la ligne du budget c'est le
            montant total, et les lignes [du prix détaillé] le montant détaillé de chaque composante ».
            Les deux colonnes se lisent donc en miroir : même titre, même ordre, détail d'un côté,
            total de l'autre. */}
        <div className="mt-1">
          <Famille>Prix du fournisseur</Famille>
          <Ligne intitule="Montant total" valeur={`${euros(b.budgetFournisseur)} HT/an`} />

          <Famille>Acheminement, distribution et transport</Famille>
          <Ligne intitule="Montant total" valeur={`${euros(b.budgetAcheminement)} HT/an`} />

          <Famille>Taxe</Famille>
          <Ligne intitule="Montant total" valeur={`${euros(b.budgetTaxes)} HT/an`} />
          {/* LA TVA EST GROUPÉE : les deux assiettes sont au même taux depuis que l'abonnement est
              passé de 5,5 % à 20 %. Elle disparaît en base hors taxes — la montrer sans la compter
              dans le total serait le meilleur moyen de faire douter du total. */}
        </div>

        {/* LA TVA EST HORS DES TROIS FAMILLES, et c'est ce qui garde les deux colonnes parallèles :
            trois intitulés verts à gauche, trois à droite, et rien de plus. Michel : « on les mettra
            juste en dessous du budget ». Un quatrième titre vert ici n'aurait aucun vis-à-vis dans le
            prix détaillé — et c'est précisément le parallélisme que Naoëlle demande.
            Elle disparaît en base hors taxes : la montrer sans la compter dans le total serait le
            meilleur moyen de faire douter du total. */}
        {ttc && (
          <div className="mt-1.5 border-t border-kw-border pt-1.5">
            <Ligne intitule={`TVA (${pourcent})`} valeur={`${euros(b.tva)}/an`} />
          </div>
        )}

        <div className="mt-2 rounded-kw-lg border-2 border-kw-green bg-kw-green-tint px-3 py-2">
          <Ligne
            intitule={ttc ? 'Total TTC' : 'Total hors taxes'}
            valeur={`${euros(ttc ? b.totalTtc : b.totalHt)}/an`}
            fort
          />
          <Ligne
            intitule="Prix moyen annuel du MWh"
            valeur={`${euros(ttc ? b.prixMoyenTtcMwh : b.prixMoyenHtMwh)} ${ttc ? 'TTC' : 'HT'}/MWh`}
            fort
          />
          <p className="pt-1 text-kw-micro text-kw-meta">
            {ttc
              ? 'Y compris abonnement et taxes.'
              : 'Hors TVA, abonnement compris. Un client assujetti la récupère.'}
          </p>
        </div>

        {/* « C'est pas la date à laquelle on a fait la demande de cotation, c'est le DÉBUT DE
            FOURNITURE. » */}
        {debut && (
          <p className="mt-2 text-kw-sm font-bold uppercase tracking-[0.04em] text-kw-ink">
            Début de fourniture le {dateFr(debut)}
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
          {ttc ? ` TVA appliquée au taux de ${pourcent}.` : ' Montants hors TVA.'}
        </p>
      </div>
    </div>
  )
}

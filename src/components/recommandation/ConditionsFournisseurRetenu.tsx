import { useState, type ReactNode } from 'react'
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
 * AÉRÉ ET LISIBLE, demandé par Naoëlle le 25/08/2026 : « aère tout ça, augmente un peu la police,
 * rends tout ça plus lisible ». C'est un document CLIENT — il se lit une fois, souvent vite, parfois
 * sur papier. Trois réglages, et aucun ne touche à la structure :
 *
 *   · le corps passe de 11 à 13 px et les intitulés de famille de 8,5 à 10,5 px — l'échelle du
 *     document, pas celle d'une interface dense ;
 *   · les lignes respirent (padding vertical presque doublé) et les familles s'écartent, parce que
 *     c'est L'ESPACE, plus que la taille, qui fait qu'un tableau se lit d'un coup d'œil ;
 *   · les montants gagnent en graisse : ce sont eux qu'on cherche, ils doivent accrocher l'œil avant
 *     l'intitulé qui les décrit.
 *
 * La grille et l'ordre ne changent pas : les titres restent face à face.
 *
 * ET LA PAGE 3 DOIT TENIR SUR UNE FEUILLE (Naoëlle, 25/08/2026 : « là elle débordent »). Tout ce qui
 * se resserre pour y arriver est en variante `print:` — l'écran garde exactement la version aérée
 * qu'elle vient de valider. Aucune police ne baisse : ce sont les ESPACES qui se resserrent, parce
 * qu'un caractère plus petit se paie en lisibilité alors que 2 px de padding en moins ne se voient
 * pas. Le compte est de ~144 px récupérés pour ~100 px de débordement.
 *
 * DES APLATS POUR SÉPARER LES CATÉGORIES, demandés par Naoëlle le 25/08/2026 : « des blocs très très
 * clairs en fond pour séparer les catégories, car là tout est sur fond blanc et on ne sait pas où
 * donner de la tête … afin que ça ne fasse pas trop de couleur ». Chaque famille repose donc sur un
 * aplat, et les six aplats sont IDENTIQUES : ils ne hiérarchisent rien, ils délimitent.
 *
 * UN SEUL GRIS, DÉJÀ DANS LA CHARTE — `kw-sunken`, #f9f9f7, le plus clair des fonds de l'app. Aucune
 * couleur n'entre dans le document : le vert reste réservé à ce qui fait décider (l'offre retenue en
 * page 1, le total ici), le gris ne fait que poser les limites. C'est la condition pour que les
 * blocs aident à lire au lieu d'ajouter du bruit.
 *
 * ET LES FILETS INTÉRIEURS PASSENT DE #f5f4f1 À #e7e6e2 : sur fond blanc le filet le plus pâle
 * suffisait, sur un aplat gris il devenait plus clair que son propre fond — donc invisible.
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
    <div className="flex items-baseline gap-3 border-b border-kw-border py-[7px] last:border-b-0 print:py-[5px]">
      <span className={fort ? 'text-kw-h3 font-bold text-kw-ink' : 'text-kw-h4 text-kw-body'}>{intitule}</span>
      {sigle && <span className="font-mono text-kw-tiny text-kw-faint">{sigle}</span>}
      <span className="flex-1" />
      <span
        className={
          fort
            ? 'font-mono text-kw-h3 font-extrabold tabular-nums text-kw-ink'
            : 'font-mono text-kw-h4 font-semibold tabular-nums text-kw-ink'
        }
      >
        {valeur}
      </span>
    </div>
  )
}

/**
 * UN BLOC DE CATÉGORIE : l'aplat sur lequel repose une famille, titre vert compris. Ni bordure ni
 * ombre — un aplat suffit à dire « ceci va ensemble », et six blocs bordés redessineraient la grille
 * qu'on vient justement d'alléger.
 */
function Bloc({ children }: { children: ReactNode }) {
  return <div className="rounded-kw-lg bg-kw-bloc px-3.5 py-3 print:py-2">{children}</div>
}

/** Les intitulés de famille, en vert — « comme rémunération des CEE, je vais mettre taxe ». */
function Famille({ children }: { children: string }) {
  return (
    <p className="mb-1 mt-5 text-kw-sm font-extrabold uppercase tracking-[0.1em] text-kw-green first:mt-0">
      {children}
    </p>
  )
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
      <p className="mt-2 rounded-kw-md border border-dashed border-kw-border-strong bg-kw-subtle px-3 py-2.5 text-kw-h4 leading-relaxed text-kw-meta">
        Le détail du fournisseur retenu n’est pas disponible : il demande les composantes de prix et la
        consommation de référence du point de livraison. Saisissez-les sur l’offre pour que cette page
        reprenne la présentation du fournisseur.
      </p>
    )
  }

  const dateFr = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR')
  const pourcent = `${(TAUX_TVA_GAZ * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
  const ttc = base === 'ttc'

  /**
   * UNE GRILLE, UNE LIGNE PAR FAMILLE — et c'est la seule façon d'aligner les titres.
   *
   * Naoëlle, 25/08/2026 : « que chaque titre vert ait son équivalent bien en face à face », et
   * « l'encadré total TTC en bas des conditions détaillées, comme ça on laisse la possibilité à prix
   * détaillé et budget annuel indicatif d'être bien parallèles l'un l'autre sans décalage ».
   *
   * DEUX COLONNES INDÉPENDANTES NE PEUVENT PAS S'ALIGNER : la gauche porte trois lignes sous « Prix
   * du fournisseur », la droite une seule. Dès la deuxième famille les titres se décalent, et l'écart
   * grandit à chaque bloc. Aucun réglage d'espacement n'y change quoi que ce soit — c'est la
   * structure qui était fausse.
   *
   * Chaque famille est donc une LIGNE DE GRILLE de deux cellules : elles partagent leur bord haut,
   * donc les deux titres verts sont à la même hauteur, quel que soit le nombre de lignes de détail.
   *
   * ET CE QUI N'A PAS DE VIS-À-VIS PASSE DESSOUS, en pleine largeur : le total, le prix moyen, le
   * début de fourniture et les mentions. Les garder dans la colonne de droite était précisément ce
   * qui l'allongeait et cassait le parallèle.
   */
  return (
    <div className="mt-2">
      {/* `gap-y-4` et non `gap-y-1` : entre deux aplats, l'espace est ce qui les fait lire comme
          deux blocs. Serrés, ils ne formeraient qu'une seule zone grise.

          ET SURTOUT `items-stretch` À LA PLACE DE `items-start` — c'est ce qui fait les blocs miroir.
          Naoëlle, 25/08/2026 : « je veux que les blocs de gauche aient la même taille que les blocs
          de droite pour bien comprendre que ce sont des blocs miroir qui se correspondent ».

          En `items-start` chaque cellule prenait la hauteur de son contenu : à gauche trois lignes,
          à droite une seule, donc deux aplats de tailles différentes que rien ne désignait comme une
          paire. En `items-stretch` les deux cellules d'une même ligne de grille montent à la hauteur
          de la plus haute — la correspondance devient visible sans une seule ligne de texte pour
          l'expliquer. Le contenu, lui, reste calé en haut : c'est le flux normal d'un bloc. */}
      <div className="grid grid-cols-1 items-stretch gap-x-14 gap-y-4 sm:grid-cols-2 print:gap-y-2.5">
        {/* ── Ligne 1 : les deux en-têtes de colonne, hors aplat — ce sont des titres ── */}
        <p className="border-b-2 border-kw-ink pb-1 text-kw-h2 font-extrabold uppercase tracking-[0.05em] text-kw-ink">Prix détaillé</p>
        <div className="flex flex-wrap items-baseline gap-2 border-b-2 border-kw-ink pb-1">
          <p className="text-kw-h2 font-extrabold uppercase tracking-[0.05em] text-kw-ink">
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

        {/* ── Ligne 2 : PRIX DU FOURNISSEUR ── */}
        <Bloc>
          <Famille>Prix du fournisseur</Famille>
          <Ligne intitule="Molécule" valeur={parMwh(prixGaz.prix_energie_mwh)} />
          <Ligne intitule="Certificat d’économie d’énergie" sigle="CEE" valeur={parMwh(prixGaz.prix_cee_mwh)} />
          <Ligne intitule="Certificat de production biogaz" sigle="CPB" valeur={parMwh(prixGaz.prix_cpb_mwh)} />
        </Bloc>
        <Bloc>
          <Famille>Prix du fournisseur</Famille>
          <Ligne intitule="Montant total" valeur={euros(b.budgetFournisseur) + ' HT/an'} />
        </Bloc>

        {/* ── Ligne 3 : ACHEMINEMENT, DISTRIBUTION ET TRANSPORT ── */}
        <Bloc>
          <Famille>Acheminement, distribution et transport</Famille>
          <Ligne
            intitule="Total abonnement"
            sigle="Ab(M)"
            valeur={euros(prixGaz.abonnement_fourniture_annuel_ht) + '/an'}
          />
          <Ligne intitule="Terme quantité distribution" sigle="ATRD" valeur={parMwh(prixGaz.prix_atrd_mwh)} />
          {prixGaz.prix_atrt_mwh != null && (
            <Ligne intitule="Terme quantité transport" sigle="ATRT" valeur={parMwh(prixGaz.prix_atrt_mwh)} />
          )}
        </Bloc>
        <Bloc>
          <Famille>Acheminement, distribution et transport</Famille>
          <Ligne intitule="Montant total" valeur={euros(b.budgetAcheminement) + ' HT/an'} />
        </Bloc>

        {/* ── Ligne 4 : TAXE ── */}
        <Bloc>
          <Famille>Taxe</Famille>
          <Ligne
            intitule="Contribution tarifaire d’acheminement"
            sigle="CTA"
            valeur={euros(prixGaz.cta_annuel_ht) + '/an'}
          />
          {/* L'accise en €/MWh et non par an : « le montant mégawattheure qui sera calculé en
              fonction de la consommation ». */}
          <Ligne intitule="Accise sur le gaz naturel" sigle="ex-TICGN" valeur={parMwh(prixGaz.prix_agn_mwh)} />
        </Bloc>
        <Bloc>
          <Famille>Taxe</Famille>
          <Ligne intitule="Montant total" valeur={euros(b.budgetTaxes) + ' HT/an'} />
          {/* LA TVA EST HORS DES TROIS FAMILLES — « on les mettra juste en dessous du budget ». Elle
              reste dans cette cellule pour ne pas ajouter une quatrième ligne de grille qui
              laisserait la gauche vide. Elle disparaît en base hors taxes : la montrer sans la
              compter dans le total serait le meilleur moyen de faire douter du total. */}
          {ttc && (
            <div className="mt-1.5 border-t-2 border-kw-border-strong pt-1.5">
              <Ligne intitule={'TVA (' + pourcent + ')'} valeur={euros(b.tva) + '/an'} />
            </div>
          )}
        </Bloc>
      </div>

      {/* ══════ CE QUI N'A PAS DE VIS-À-VIS : EN PLEINE LARGEUR, SOUS LES DEUX COLONNES ══════ */}
      <div className="mt-6 rounded-kw-lg border-2 border-kw-green bg-kw-green-tint px-4 py-3 print:mt-2">
        <Ligne
          intitule={ttc ? 'Total TTC' : 'Total hors taxes'}
          valeur={euros(ttc ? b.totalTtc : b.totalHt) + '/an'}
          fort
        />
        <Ligne
          intitule="Prix moyen annuel du MWh"
          valeur={euros(ttc ? b.prixMoyenTtcMwh : b.prixMoyenHtMwh) + (ttc ? ' TTC/MWh' : ' HT/MWh')}
          fort
        />
        <p className="pt-1.5 text-kw-xs text-kw-meta">
          {ttc
            ? 'Y compris abonnement et taxes.'
            : 'Hors TVA, abonnement compris. Un client assujetti la récupère.'}
        </p>
      </div>

      {/* « C'est pas la date à laquelle on a fait la demande de cotation, c'est le DÉBUT DE
          FOURNITURE. » */}
      {debut && (
        <p className="mt-3 rounded-kw-lg bg-kw-bloc px-3.5 py-2.5 text-kw-h4 font-bold uppercase tracking-[0.05em] text-kw-ink print:mt-2 print:py-1.5">
          Début de fourniture le {dateFr(debut)}
        </p>
      )}

      {/* UN BUDGET PARTIEL SE DIT. Sans cette mention, un total amputé d'une composante non saisie se
          lirait comme un total complet — et c'est un chiffre que le client compare. */}
      {b.incomplet && (
        <p className="mt-3 rounded-kw-md border border-dashed border-kw-amber bg-kw-amber-light px-3 py-2 text-kw-xs font-semibold text-kw-amber-dark">
          Une ou plusieurs composantes ne sont pas saisies : ce budget est partiel. Les lignes marquées
          « à vérifier » ci-dessus indiquent lesquelles.
        </p>
      )}

      {/* CETTE MENTION TENAIT SUR DEUX LIGNES POUR RIEN : « calculés sur la consommation de
          référence et les composantes réglementaires applicables à la date de l'analyse » est repris
          MOT POUR MOT par le bloc « Méthode », deux blocs plus bas sur la même page. La règle de
          Michel s'applique telle quelle — « on ne met rien qui n'est pas utile ». Ne reste donc ici
          que ce que Méthode ne dit pas : le caractère indicatif et la base de TVA.

          Les mentions restent sur le blanc : ce sont les seules lignes qu'on peut ne pas lire, et un
          aplat leur donnerait un poids qu'elles n'ont pas. */}
      <p className="mt-3 max-w-[95ch] text-kw-xs leading-relaxed text-kw-faint print:mt-2">
        Montants indicatifs.
        {ttc ? ' TVA appliquée au taux de ' + pourcent + '.' : ' Montants hors TVA.'}
      </p>
    </div>
  )
}

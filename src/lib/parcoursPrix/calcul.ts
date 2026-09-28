import { budgetsDepuisPrix, moleculePresentee, PRIX_GAZ_VIDE, somme } from '@/lib/calculs/prixOffre'
import type { PrixParCompteur as PrixSaisi } from '@/lib/data/recommandations'
import type { Compteur, OffreFournisseur, OffreFournisseurCompteur, PrixOffreElectricite, PrixOffreGaz, VersionRecommandation } from '@/types/domain'
import { compteurChiffre, detailSur } from './etatOffres'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * « CALCULER » : DES PRIX UNITAIRES AUX BUDGETS, ET LA MARGE EN UN CLIC
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Michel, 28/09/2026, étape 3 : « Le commercial peut cliquer sur "Calculer". KiMatch récupère les
 * prix disponibles […] et calcule les budgets correspondants. » Et William, en réunion : « on doit
 * pouvoir y ajouter de la marge, où en enlever, et faire tout ça en un clic ».
 *
 * AUCUNE FORMULE N'EST ÉCRITE ICI. Les budgets viennent de `budgetsDepuisPrix` et le prix présenté
 * de `moleculePresentee` — les règles de Michel du 19/08/2026, déjà utilisées par la saisie et le
 * document. Ce module ne fait que les appliquer à TOUTE la version d'un coup, et préparer l'écriture
 * dans la forme exacte qu'attend `useEnregistrerPrixCompteur`.
 *
 * ══ LA MARGE EST LINÉAIRE, ET C'EST CE QUI REND LA MARGE CIBLÉE CALCULABLE ══
 *
 * Avec une marge variable, le budget d'une offre vaut `base + marge × volume` : `base` est le budget
 * à marge nulle, `volume` la consommation sur laquelle la marge s'applique. On ne réécrit pas ce
 * volume à la main — il dépend des classes cotées, des repli de consommation, de l'énergie — on le
 * MESURE en calculant l'offre à marge 0 puis à marge 1. La pente est exactement celle que
 * `budgetsDepuisPrix` appliquera, par construction.
 *
 * Une marge FIXE n'entre pas dans le prix (Michel, 20/08/2026) : sa pente est nulle, et la marge
 * ciblée le dit au lieu de faire semblant de l'ajuster.
 */

export interface LigneCalculee {
  lienId: string
  compteurId: string
  libelle: string
  gaz: boolean
  chiffre: boolean
  marge: number | null
  energie: number | null
  contribution: number | null
  total: number | null
  /** Ce que « Calculer » écrit pour ce compteur. `null` si le compteur n'est pas chiffré. */
  ecriture: PrixSaisi | null
}

export interface OffreCalculee {
  offreId: string
  lignes: LigneCalculee[]
  complete: boolean
  total: number | null
  /** Budget à marge nulle et pente : `total(m) = base + m × pente`. */
  base: number | null
  pente: number
}

function prixGazAvec(detail: OffreFournisseurCompteur | undefined, marge: number | null): PrixOffreGaz {
  const p0 = detail?.prix_gaz?.prix_molecule_p0_mwh ?? null
  return {
    ...PRIX_GAZ_VIDE,
    ...(detail?.prix_gaz ?? {}),
    prix_molecule_p0_mwh: p0,
    prix_energie_mwh: moleculePresentee(p0, marge, detail?.type_marge ?? 'VARIABLE'),
  }
}

function prixElecAvec(detail: OffreFournisseurCompteur | undefined, marge: number | null): PrixOffreElectricite {
  const e = detail?.prix_electricite
  const p0 = Object.fromEntries(Object.entries(e?.p0_mwh_par_classe ?? {}).filter(([, v]) => v != null)) as Record<string, number>
  return {
    type_prix: e?.type_prix ?? null,
    formule_tarifaire: e?.formule_tarifaire ?? null,
    p0_mwh_par_classe: p0,
    prix_mwh_par_classe: Object.fromEntries(
      Object.entries(p0)
        .map(([classe, v]) => [classe, moleculePresentee(v, marge, detail?.type_marge ?? 'VARIABLE')])
        .filter(([, v]) => v != null),
    ) as Record<string, number>,
    prix_turpe_annuel_ht: e?.prix_turpe_annuel_ht ?? null,
    prix_cee_mwh: e?.prix_cee_mwh ?? null,
    prix_go_mwh: e?.prix_go_mwh ?? null,
    accise_annuel_ht: e?.accise_annuel_ht ?? null,
    cta_annuel_ht: e?.cta_annuel_ht ?? null,
    capacite_mwh_par_classe: e?.capacite_mwh_par_classe ?? {},
    turpe_gestion_annuel_ht: e?.turpe_gestion_annuel_ht ?? null,
    turpe_comptage_annuel_ht: e?.turpe_comptage_annuel_ht ?? null,
    turpe_soutirage_fixe_annuel_ht: e?.turpe_soutirage_fixe_annuel_ht ?? null,
    turpe_soutirage_variable_annuel_ht: e?.turpe_soutirage_variable_annuel_ht ?? null,
    abonnement_fourniture_annuel_ht: e?.abonnement_fourniture_annuel_ht ?? null,
  }
}

function budgets(gaz: boolean, compteur: Compteur | undefined, detail: OffreFournisseurCompteur | undefined, marge: number | null) {
  return budgetsDepuisPrix(
    gaz
      ? { gaz, compteur, detail, prixGaz: prixGazAvec(detail, marge) }
      : { gaz, compteur, detail, prixElec: prixElecAvec(detail, marge) },
  )
}

/**
 * Calcule une offre sur tous les compteurs de la version.
 *
 * `margeForcee` remplace la marge de chaque ligne — c'est « mettre une marge de 3 partout ». Absente,
 * chaque ligne garde la marge qu'elle porte déjà en base.
 */
export function calculerOffre(
  offre: OffreFournisseur,
  version: VersionRecommandation,
  compteurs: Map<string, Compteur>,
  margeForcee?: number | null,
): OffreCalculee {
  let base: number | null = null
  let pente = 0
  const lignes: LigneCalculee[] = version.compteurs.map((lien) => {
    const compteur = compteurs.get(lien.compteur_id)
    const gaz = compteur?.type_energie === 'gaz'
    const detail = detailSur(offre, lien.lien_id)
    const chiffre = compteurChiffre(detail, gaz)
    const marge = margeForcee !== undefined ? margeForcee : detail?.marge_reelle_eur_mwh ?? null
    const libelle = compteur?.numero_pdl || lien.label || 'Compteur'
    if (!chiffre) {
      return { lienId: lien.lien_id, compteurId: lien.compteur_id, libelle, gaz, chiffre, marge, energie: null, contribution: null, total: null, ecriture: null }
    }
    const b = budgets(gaz, compteur, detail, marge)
    const b0 = budgets(gaz, compteur, detail, 0)
    const b1 = budgets(gaz, compteur, detail, 1)
    base = somme(base, b0.total)
    if (b0.total != null && b1.total != null) pente += b1.total - b0.total

    const prixGaz = gaz ? prixGazAvec(detail, marge) : null
    const prixElec = gaz ? null : prixElecAvec(detail, marge)
    const ecriture: PrixSaisi = {
      marge_reelle_eur_mwh: marge,
      ...(gaz
        ? { prix_molecule_p0_mwh: prixGaz!.prix_molecule_p0_mwh, prix_energie_mwh: prixGaz!.prix_energie_mwh }
        : { p0_mwh_par_classe: prixElec!.p0_mwh_par_classe, prix_mwh_par_classe: prixElec!.prix_mwh_par_classe }),
      // Même règle que la saisie : on n'écrit un budget que s'il se calcule. Écrire `null` effacerait
      // une valeur posée à la main, que le calcul ne sait pas refaire (un TURPE non saisi, par exemple).
      ...(b.energie != null ? { cout_fourniture_annuel_ht: b.energie } : {}),
      ...(b.contribution != null ? { cout_acheminement_annuel_ht: b.contribution } : {}),
      ...(b.total != null ? { cout_total_annuel_estime_ht: b.total } : {}),
    }
    return { lienId: lien.lien_id, compteurId: lien.compteur_id, libelle, gaz, chiffre, marge, energie: b.energie, contribution: b.contribution, total: b.total, ecriture }
  })
  const complete = lignes.length > 0 && lignes.every((l) => l.chiffre)
  return {
    offreId: offre.id,
    lignes,
    complete,
    total: complete ? lignes.reduce<number | null>((t, l) => somme(t, l.total), null) : null,
    base,
    pente: Math.round(pente * 1e6) / 1e6,
  }
}

export interface AjustementCible {
  offreId: string
  margeAvant: number | null
  margeApres: number | null
  totalApres: number | null
  /** Pourquoi la marge ne peut pas être posée : marge fixe, offre incomplète… */
  impossible: string | null
}

/**
 * LA MARGE CIBLÉE. Michel, 28/09/2026 : « je veux mettre une marge de 3 […] et faire en sorte que
 * Gaz Européen soit le plus intéressant avec une marge de 3. Le système va mettre une marge de 3 à
 * Gaz Européen et, par logique, venir ajuster la marge des autres fournisseurs pour essayer de faire
 * passer Gaz Européen. » Le problème qu'il décrit : « l'équipe passe un temps fou à dire "modifie
 * celui-là" », avec des incohérences quand c'est fait de tête.
 *
 * LA RÈGLE, écrite pour qu'on puisse la contester :
 *   · la cible reçoit la marge demandée ;
 *   · chaque concurrente COMPARABLE — même durée, même type de prix — reçoit au moins cette marge,
 *     et davantage s'il le faut pour que son budget dépasse celui de la cible d'au moins `ecart` € ;
 *   · une concurrente déjà plus chère à la marge demandée garde la marge demandée : on ne gonfle pas
 *     un prix qui ne gêne pas ;
 *   · la marge est arrondie au centime supérieur, pour que l'écart soit tenu après arrondi.
 *
 * On ne descend jamais sous la marge demandée : baisser la marge d'un concurrent pour mettre la cible
 * en avant reviendrait à rendre KiWee moins payée sur l'offre qu'on ne propose pas.
 */
export function margeCiblee(
  offres: { offre: OffreFournisseur; calcul: OffreCalculee }[],
  cibleId: string,
  marge: number,
  ecart = 1,
): AjustementCible[] {
  const cible = offres.find((o) => o.offre.id === cibleId)
  if (!cible) return []
  const totalCible = cible.calcul.base == null ? null : cible.calcul.base + marge * cible.calcul.pente
  const comparable = (o: OffreFournisseur) => o.duree_mois === cible.offre.duree_mois && (o.type_prix ?? null) === (cible.offre.type_prix ?? null)
  const margeAvant = (o: { offre: OffreFournisseur; calcul: OffreCalculee }) => o.calcul.lignes.find((l) => l.chiffre)?.marge ?? null

  return offres
    .filter((o) => o.offre.id === cibleId || (comparable(o.offre) && o.offre.nature_offre !== 'EN_COURS'))
    .map((o): AjustementCible => {
      const avant = margeAvant(o)
      if (!o.calcul.complete || o.calcul.base == null) {
        return { offreId: o.offre.id, margeAvant: avant, margeApres: null, totalApres: null, impossible: 'offre incomplète : tous les compteurs ne sont pas chiffrés' }
      }
      if (o.offre.id === cibleId || totalCible == null) {
        return { offreId: o.offre.id, margeAvant: avant, margeApres: marge, totalApres: o.calcul.base + marge * o.calcul.pente, impossible: null }
      }
      const aMarge = o.calcul.base + marge * o.calcul.pente
      if (aMarge >= totalCible + ecart) {
        return { offreId: o.offre.id, margeAvant: avant, margeApres: marge, totalApres: aMarge, impossible: null }
      }
      if (o.calcul.pente <= 0) {
        return {
          offreId: o.offre.id, margeAvant: avant, margeApres: marge, totalApres: aMarge,
          impossible: 'marge fixe : elle n’entre pas dans le prix, cette offre reste moins chère que la cible',
        }
      }
      const requise = Math.ceil(((totalCible + ecart - o.calcul.base) / o.calcul.pente) * 100) / 100
      return { offreId: o.offre.id, margeAvant: avant, margeApres: requise, totalApres: o.calcul.base + requise * o.calcul.pente, impossible: null }
    })
}

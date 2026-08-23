import { useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ChampNombre } from '@/components/ui/champ-nombre'
import {
  budgetsDepuisPrix,
  classesDuCompteur,
  LIBELLE_CLASSE,
  moleculePresentee,
  ORDRE_CLASSES,
  PRIX_GAZ_VIDE,
  somme,
  type TypeMarge,
} from '@/lib/calculs/prixOffre'
import type { PrixParCompteur as PrixSaisi } from '@/lib/data/recommandations'
import type { Compteur, OffreFournisseurCompteur, PrixOffreElectricite } from '@/types/domain'

/**
 * Le formulaire de saisie des prix d'une offre sur UN point de livraison.
 *
 * DEMANDE DE MICHEL, 19/08/2026 : « il vous faudra avoir une espèce de formulaire qui permet
 * justement la saisie des informations », et son objectif du jour : « le plus important, c'est que
 * quand les commerciaux arrivent, on puisse faire tout ce qu'on pouvait faire avant — demander une
 * offre, ajuster la marge, générer un document ».
 *
 * CE QUI COMPTE ICI, ET QUE LA PREMIÈRE VERSION AVAIT RATÉ : le formulaire doit EXPLIQUER. Naoëlle
 * l'a dit sans détour dans l'appel du matin — « si c'est un peu compliqué à expliquer, les
 * commerciaux ils vont pas nous rater ». Déplacer les mêmes champs dans une fenêtre ne rend service à
 * personne. Trois exigences en découlent :
 *
 *   1. CHAQUE CHAMP PORTE SON EXPLICATION EN CLAIR, sous le champ, pas dans une infobulle qu'il faut
 *      deviner en survolant. Un commercial qui ouvre l'écran pour la première fois doit savoir ce
 *      qu'est un P0 sans demander à Michel.
 *
 *   2. LE CALCUL SE DÉROULE À CÔTÉ, avec les nombres réels et les opérateurs : « 45,00 + 5,00 = 50,00
 *      €/MWh », puis « × 118 MWh = 6 248,10 € ». Pas seulement le résultat : le chemin. C'est ce qui
 *      permet de repérer soi-même le chiffre qu'on a mal tapé.
 *
 *   3. IL REMPLACE LA SAISIE INLINE. Deux endroits pour saisir la même chose, c'est deux endroits à
 *      apprendre et deux endroits à corriger. Le dépliant ne fait plus que lire.
 *
 * LES FORMULES VIENNENT DE `@/lib/calculs/prixOffre` — les mêmes que le dépliant et le document
 * comparatif. Les étapes affichées ici sont construites à partir des mêmes nombres, et leur somme est
 * vérifiée contre le total que renvoie `budgetsDepuisPrix`.
 */

/** Une étape du calcul, telle qu'elle s'affiche : « + CEE  2,10 €/MWh ». */
interface Etape {
  operateur?: '+' | '×' | '='
  libelle: string
  valeur: number | null
  unite: string
  /** Un résultat intermédiaire se lit en gras : c'est un palier, pas un ingrédient. */
  palier?: boolean
}

export function SaisiePrixDialog({
  ouvert,
  onFermer,
  gaz,
  compteur,
  libelleCompteur,
  detail,
  dureeMois,
  onEnregistrer,
  enCours,
}: {
  ouvert: boolean
  onFermer: () => void
  gaz: boolean
  compteur: Compteur | undefined
  libelleCompteur: string
  detail: OffreFournisseurCompteur | undefined
  /** La durée de l'offre, pour rapporter la marge fixe à une année. Sert d'affichage, pas de calcul. */
  dureeMois: number | null
  onEnregistrer: (prix: PrixSaisi) => Promise<void>
  enCours: boolean
}) {
  // Un brouillon : rien ne part avant la validation, ce qui permet d'essayer un prix. `undefined`
  // veut dire « pas touché », `null` « effacé volontairement » — la convention du patch envoyé.
  const [brouillon, setBrouillon] = useState<PrixSaisi>({})
  const [classesEnPlus, setClassesEnPlus] = useState<string[]>([])
  const [budgetsForces, setBudgetsForces] = useState(false)
  const [etape, setEtape] = useState(0)

  // LES ÉTAPES, dans l'ordre où l'on rassemble les informations d'une offre. La dernière est un
  // récapitulatif : on n'enregistre que de là, ce qui garantit qu'on a vu ce qu'on écrit.
  //
  // LE MÊME PARCOURS AUX DEUX ÉNERGIES. Michel, 21/08/2026, après avoir suivi la modale gazière
  // pas à pas : « ça, c'est pour moi le modèle. Maintenant sur l'élec, tu vois, j'ai plus la même
  // chose. Repartir, avoir exactement la même logique que pour le gaz. »
  //
  // L'électricité avait six étapes à elle — Prix P0, Composantes, Marge, Réseau, Volume,
  // Vérification — parce qu'elle avait été écrite après, en suivant ses propres champs plutôt que
  // la manière dont on saisit une offre. Or on saisit une offre de la même façon quelle que soit
  // l'énergie : ce que coûte l'énergie, ce que coûte l'abonnement, ce que l'État et le réseau
  // prélèvent, sur quel volume, puis on relit. Les champs diffèrent, le parcours non.
  const etapes = [
    { titre: 'Énergie' },
    { titre: 'Abonnement' },
    { titre: 'Contributions' },
    { titre: 'Volume' },
    { titre: 'Vérification' },
  ]
  const derniere = etapes.length - 1

  const classes = useMemo(
    () => (gaz ? [] : ORDRE_CLASSES.filter((c) => classesDuCompteur(compteur).includes(c) || classesEnPlus.includes(c))),
    [gaz, compteur, classesEnPlus],
  )

  function valeur(cle: keyof PrixSaisi, base: number | null | undefined): number | null {
    const v = brouillon[cle]
    if (v === undefined) return base ?? null
    return typeof v === 'number' || v === null ? v : (base ?? null)
  }
  function poser(cle: keyof PrixSaisi, v: number | null) {
    setBrouillon((b) => ({ ...b, [cle]: v }))
  }
  function p0DeClasse(classe: string): number | null {
    const saisi = brouillon.p0_mwh_par_classe?.[classe]
    if (saisi !== undefined) return saisi
    return detail?.prix_electricite?.p0_mwh_par_classe?.[classe] ?? null
  }
  /** Le mécanisme de capacité, qui se facture au poste horaire comme le prix de l'énergie. */
  function capaDeClasse(classe: string): number | null {
    const saisi = brouillon.capacite_mwh_par_classe?.[classe]
    if (saisi !== undefined) return saisi
    return detail?.prix_electricite?.capacite_mwh_par_classe?.[classe] ?? null
  }

  const p0 = valeur('prix_molecule_p0_mwh', detail?.prix_gaz?.prix_molecule_p0_mwh)
  // VARIABLE ou FIXE — réunion du 20/08/2026. En fixe, le fournisseur impose sa marge : elle est
  // déjà dans son P0, donc elle ne s'y ajoute pas.
  const typeMarge: TypeMarge = brouillon.type_marge ?? detail?.type_marge ?? 'VARIABLE'
  const margeVariable = valeur('marge_reelle_eur_mwh', detail?.marge_reelle_eur_mwh)
  const margeFixe = valeur('marge_fixe_eur', detail?.marge_fixe_eur)
  const contributions = valeur('cout_taxes_annuel', detail?.cout_taxes_annuel)
  const cee = valeur('prix_cee_mwh', detail?.prix_gaz?.prix_cee_mwh)
  const cpb = valeur('prix_cpb_mwh', detail?.prix_gaz?.prix_cpb_mwh)
  const atrt = valeur('prix_atrt_mwh', detail?.prix_gaz?.prix_atrt_mwh)
  const atrd = valeur('prix_atrd_mwh', detail?.prix_gaz?.prix_atrd_mwh)
  const agn = valeur('prix_agn_mwh', detail?.prix_gaz?.prix_agn_mwh)
  const cta = valeur('cta_annuel_ht', detail?.prix_gaz?.cta_annuel_ht)
  const turpe = valeur('prix_turpe_annuel_ht', detail?.prix_electricite?.prix_turpe_annuel_ht)
  const turpeGestion = valeur('turpe_gestion_annuel_ht', detail?.prix_electricite?.turpe_gestion_annuel_ht)
  const turpeComptage = valeur('turpe_comptage_annuel_ht', detail?.prix_electricite?.turpe_comptage_annuel_ht)
  const turpeSoutFixe = valeur('turpe_soutirage_fixe_annuel_ht', detail?.prix_electricite?.turpe_soutirage_fixe_annuel_ht)
  const turpeSoutVar = valeur('turpe_soutirage_variable_annuel_ht', detail?.prix_electricite?.turpe_soutirage_variable_annuel_ht)
  // La somme des quatre parts fait foi dès qu'une seule est saisie : sinon on garderait deux totaux
  // possibles, celui du détail et celui du champ global.
  const turpeDetaille = somme(turpeGestion, turpeComptage, turpeSoutFixe, turpeSoutVar)
  // Les composantes du compte rendu Enéo, côté électricité. Les clés du payload sont partagées avec
  // le gaz (CEE, CTA) : c'est la mutation qui aiguille vers la bonne table selon l'énergie.
  const ceeElec = valeur('prix_cee_mwh', detail?.prix_electricite?.prix_cee_mwh)
  const go = valeur('prix_go_mwh', detail?.prix_electricite?.prix_go_mwh)
  const accise = valeur('accise_annuel_ht', detail?.prix_electricite?.accise_annuel_ht)
  const ctaElec = valeur('cta_annuel_ht', detail?.prix_electricite?.cta_annuel_ht)
  const abonnement = valeur(
    'abonnement_fourniture_annuel_ht',
    gaz ? detail?.prix_gaz?.abonnement_fourniture_annuel_ht : detail?.prix_electricite?.abonnement_fourniture_annuel_ht,
  )
  const conso = valeur('consommation_annuelle_reference_mwh', detail?.consommation_annuelle_reference_mwh)
    ?? (gaz ? compteur?.car_mwh : compteur?.consommation_annuelle_mwh)
    ?? null

  const molecule = moleculePresentee(p0, margeVariable, typeMarge)
  const consoParClasse = compteur?.consoParClasseMwh ?? {}

  // Les budgets, par les fonctions qui écrivent en base : ce sont eux qui font foi.
  const budgets = useMemo(() => {
    const prixGaz = gaz
      ? {
          ...PRIX_GAZ_VIDE,
          ...(detail?.prix_gaz ?? {}),
          prix_molecule_p0_mwh: p0,
          prix_energie_mwh: molecule,
          prix_cee_mwh: cee,
          prix_cpb_mwh: cpb,
          prix_atrt_mwh: atrt,
          prix_atrd_mwh: atrd,
          prix_agn_mwh: agn,
          cta_annuel_ht: cta,
          abonnement_fourniture_annuel_ht: abonnement,
        }
      : null
    const prixElec: PrixOffreElectricite | null = gaz
      ? null
      : {
          type_prix: detail?.prix_electricite?.type_prix ?? null,
          formule_tarifaire: detail?.prix_electricite?.formule_tarifaire ?? null,
          p0_mwh_par_classe: {},
          prix_mwh_par_classe: Object.fromEntries(
            classes
              .map((c) => [c, moleculePresentee(p0DeClasse(c), margeVariable, typeMarge)])
              .filter(([, v]) => v != null) as [string, number][],
          ),
          abonnement_fourniture_annuel_ht: abonnement,
          prix_turpe_annuel_ht: turpeDetaille ?? turpe,
          // Les composantes du compte rendu de consultation, saisies plus bas dans le formulaire.
          prix_cee_mwh: ceeElec,
          prix_go_mwh: go,
          accise_annuel_ht: accise,
          cta_annuel_ht: ctaElec,
          // Capacité et TURPE détaillé : repris de la base, ils se saisissent dans le formulaire.
          capacite_mwh_par_classe: detail?.prix_electricite?.capacite_mwh_par_classe ?? {},
          turpe_gestion_annuel_ht: detail?.prix_electricite?.turpe_gestion_annuel_ht ?? null,
          turpe_comptage_annuel_ht: detail?.prix_electricite?.turpe_comptage_annuel_ht ?? null,
          turpe_soutirage_fixe_annuel_ht: detail?.prix_electricite?.turpe_soutirage_fixe_annuel_ht ?? null,
          turpe_soutirage_variable_annuel_ht: detail?.prix_electricite?.turpe_soutirage_variable_annuel_ht ?? null,
        }
    return budgetsDepuisPrix({ gaz, compteur, detail, prixGaz, prixElec, consoForcee: conso, contributionSaisie: contributions })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brouillon, detail, gaz, compteur, classes, conso, contributions, typeMarge, turpeDetaille])

  // ── Le calcul, déroulé ──────────────────────────────────────────────────────
  const etapesEnergie: Etape[] = gaz
    ? [
        { libelle: 'Molécule (P0 + marge)', valeur: molecule, unite: '€/MWh' },
        { operateur: '+', libelle: 'CEE', valeur: cee, unite: '€/MWh' },
        { operateur: '+', libelle: 'CPB', valeur: cpb, unite: '€/MWh' },
        { operateur: '=', libelle: 'Prix de l’énergie', valeur: somme(molecule, cee, cpb), unite: '€/MWh', palier: true },
        { operateur: '×', libelle: 'Consommation retenue', valeur: conso, unite: 'MWh' },
        { operateur: '=', libelle: 'Budget énergie', valeur: budgets.energie, unite: '€/an', palier: true },
      ]
    : [
        ...classes.map((c): Etape => ({
          operateur: '+',
          libelle: `${LIBELLE_CLASSE[c] ?? c} · ${fmt(moleculePresentee(p0DeClasse(c), margeVariable, typeMarge))} €/MWh × ${fmt(consoParClasse[c] ?? null)} MWh`,
          valeur: multiplie(moleculePresentee(p0DeClasse(c), margeVariable, typeMarge), consoParClasse[c] ?? (classes.length === 1 ? conso : null)),
          unite: '€/an',
        })),
        { operateur: '+', libelle: 'Abonnement (compté ici, pas à part)', valeur: abonnement, unite: '€/an' },
        { operateur: '=', libelle: 'Budget énergie', valeur: budgets.energie, unite: '€/an', palier: true },
      ]

  const etapesContribution: Etape[] = gaz
    ? [
        { libelle: 'ATRD', valeur: atrd, unite: '€/MWh' },
        { operateur: '+', libelle: 'AGN', valeur: agn, unite: '€/MWh' },
        { operateur: '×', libelle: 'Consommation retenue', valeur: conso, unite: 'MWh' },
        { operateur: '+', libelle: 'CTA (déjà en €/an)', valeur: cta, unite: '€/an' },
        { operateur: '=', libelle: 'Budget contribution', valeur: budgets.contribution, unite: '€/an', palier: true },
      ]
    : [{ libelle: turpeDetaille != null ? 'TURPE (somme des quatre parts)' : 'TURPE saisi', valeur: turpeDetaille ?? turpe, unite: '€/an', palier: true }]

  // LES TAXES ÉLECTRIQUES, montrées à part. Elles entrent dans le total depuis le 21/08/2026 : les
  // afficher est ce qui permet de vérifier que le total vaut bien la somme de ce qu'on voit.
  const etapesTaxes: Etape[] = [
    { libelle: 'AE — accise', valeur: accise, unite: '€/an' },
    { operateur: '+', libelle: 'CTA', valeur: ctaElec, unite: '€/an' },
    { operateur: '=', libelle: 'Budget contribution', valeur: somme(accise, ctaElec), unite: '€/an', palier: true },
  ]

  const rienDeSaisi = Object.keys(brouillon).length === 0

  // CE QU'ON S'APPRÊTE À ÉCRIRE, en clair. On liste les valeurs EFFECTIVES — brouillon fusionné avec
  // la base — et non le seul brouillon : quelqu'un qui ne corrige qu'un chiffre doit relire l'offre
  // entière avant d'enregistrer, pas sa dernière frappe.
  const euros = (v: number | null, unite: string) =>
    v == null ? null : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${unite}`
  const recapitulatif = (gaz
    ? [
        { libelle: 'Molécule P0', valeur: euros(p0, '€/MWh') },
        {
          libelle: typeMarge === 'FIXE' ? 'Marge fixe' : 'Marge de référence',
          valeur: euros(typeMarge === 'FIXE' ? margeFixe : margeVariable, typeMarge === 'FIXE' ? '€' : '€/MWh'),
          note: typeMarge === 'FIXE' ? 'sur la durée du contrat, hors prix' : 'comprise dans le prix client',
        },
        { libelle: 'Molécule présentée', valeur: euros(molecule, '€/MWh'), note: 'prix client' },
        { libelle: 'CEE', valeur: euros(cee, '€/MWh') },
        { libelle: 'CPB', valeur: euros(cpb, '€/MWh') },
        { libelle: 'Abonnement', valeur: euros(abonnement, '€/an') },
        { libelle: 'ATRT', valeur: euros(atrt, '€/MWh') },
        { libelle: 'ATRD', valeur: euros(atrd, '€/MWh') },
        { libelle: 'AGN', valeur: euros(agn, '€/MWh') },
        { libelle: 'CTA', valeur: euros(cta, '€/an') },
      ]
    : [
        ...classes.map((c) => ({
          libelle: `P0 ${LIBELLE_CLASSE[c] ?? c}`,
          valeur: euros(p0DeClasse(c), '€/MWh'),
          note: capaDeClasse(c) != null ? `capacité ${capaDeClasse(c)!.toLocaleString('fr-FR')} €/MWh` : undefined,
        })),
        {
          libelle: typeMarge === 'FIXE' ? 'Marge fixe' : 'Marge de référence',
          valeur: euros(typeMarge === 'FIXE' ? margeFixe : margeVariable, typeMarge === 'FIXE' ? '€' : '€/MWh'),
          note: typeMarge === 'FIXE' ? 'sur la durée du contrat, hors prix' : 'comprise dans chaque prix client',
        },
        { libelle: 'CEE', valeur: euros(ceeElec, '€/MWh') },
        { libelle: 'GO', valeur: euros(go, '€/MWh') },
        { libelle: 'Abonnement', valeur: euros(abonnement, '€/an'), note: 'compté dans le budget énergie' },
        { libelle: 'TURPE', valeur: euros(turpeDetaille ?? turpe, '€/an'), note: turpeDetaille != null ? 'somme des quatre parts' : undefined },
        { libelle: 'AE — accise', valeur: euros(accise, '€/an') },
        { libelle: 'CTA', valeur: euros(ctaElec, '€/an') },
      ])
    .concat([{ libelle: 'Consommation retenue', valeur: conso == null ? null : `${conso.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh` }])
    .filter((r): r is { libelle: string; valeur: string; note?: string } => r.valeur != null)

  async function valider() {
    if (rienDeSaisi) return onFermer()
    await onEnregistrer(brouillon)
    setBrouillon({})
    setBudgetsForces(false)
    setEtape(0)
    onFermer()
  }

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title={`Prix de l’offre — ${libelleCompteur}`}
      description={
        gaz
          ? 'Compteur gaz. Saisissez les prix du fournisseur : les budgets annuels se calculent à mesure.'
          : 'Compteur électricité. Saisissez les prix du fournisseur : les budgets annuels se calculent à mesure.'
      }
      className="max-w-4xl"
    >
      <FilEtapes etapes={etapes} courante={etape} onAller={(i) => setEtape(Math.max(0, Math.min(i, derniere)))} />

      <div className={cn('grid gap-5', etape === derniere && 'lg:grid-cols-[minmax(0,1fr)_360px]')}>
        {/* ── Les saisies ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {gaz ? (
            <>
              <Etape
                numero={1}
                titre="Le prix de l’énergie"
                aide="Ce que le fournisseur facture pour le gaz lui-même, au mégawattheure."
                vigilance="le P0 est le prix NU du fournisseur. S’il vous a annoncé un prix marge comprise, basculez sur « marge fixe » plutôt que de la retirer à la main."
                active={etape === 0}
              >
                <Champ
                  libelle="Molécule P0"
                  aide="Le prix nu du fournisseur, sans votre marge. C’est le chiffre qu’il annonce dans son offre."
                  unite="€/MWh"
                  valeur={p0}
                  onCommit={(v) => poser('prix_molecule_p0_mwh', v)}
                />
                <ChoixMarge
                  valeur={typeMarge}
                  onChoisir={(t) => setBrouillon((b) => ({ ...b, type_marge: t }))}
                />
                {typeMarge === 'VARIABLE' ? (
                  <Champ
                    libelle="Marge de référence"
                    aide="Votre marge, au mégawattheure. La modifier change le prix présenté au client, et donc le budget."
                    unite="€/MWh"
                    valeur={margeVariable}
                    onCommit={(v) => poser('marge_reelle_eur_mwh', v)}
                  />
                ) : (
                  <Champ
                    libelle="Marge fixe (durée totale)"
                    aide={aideMargeFixe(dureeMois, margeFixe)}
                    unite="€"
                    valeur={margeFixe}
                    onCommit={(v) => poser('marge_fixe_eur', v)}
                  />
                )}
                <Deduit
                  libelle="Prix présenté au client"
                  calcul={typeMarge === 'FIXE' ? `${fmt(p0)} — marge fixe déjà dedans` : `${fmt(p0)} + ${fmt(margeVariable)}`}
                  valeur={molecule}
                  unite="€/MWh"
                />
                <Champ
                  libelle="CEE"
                  aide="Certificats d’économies d’énergie que le fournisseur refacture, au mégawattheure."
                  unite="€/MWh"
                  valeur={cee}
                  onCommit={(v) => poser('prix_cee_mwh', v)}
                />
                <Champ
                  libelle="CPB"
                  // « Contribution passage biométhane » était une invention de ma part. CPB signifie
                  // CERTIFICATS DE PRODUCTION DE BIOGAZ : un quota que le fournisseur doit restituer
                  // depuis le 1er janvier 2026, proportionnel au gaz livré, et qu'il refacture à part.
                  // Vérifié aux sources le 21/08/2026 — voir le lexique de DocumentComparatif.
                  aide="Certificats de production de biogaz, au mégawattheure. Quota que le fournisseur doit restituer depuis 2026 et qu'il refacture à part du prix du gaz."
                  unite="€/MWh"
                  valeur={cpb}
                  onCommit={(v) => poser('prix_cpb_mwh', v)}
                />
              </Etape>

              <Etape
                numero={2}
                titre="L’abonnement"
                aide="Facturé à l’année quel que soit le volume consommé. Au gaz, il forme son propre budget."
                vigilance="ce montant est ANNUEL. Un abonnement annoncé au mois se multiplie par douze avant d’être saisi ici."
                active={etape === 1}
              >
                <Champ
                  libelle="Abonnement"
                  aide="Montant annuel hors taxes de l’abonnement fourniture."
                  unite="€/an"
                  valeur={abonnement}
                  onCommit={(v) => poser('abonnement_fourniture_annuel_ht', v)}
                />
              </Etape>

              <Etape
                numero={3}
                titre="Les contributions"
                aide="Ce qui ne revient pas au fournisseur : l’acheminement et les taxes. Le client les paie dans tous les cas."
                vigilance="l’ATRT et l’ATRD sont au mégawattheure, la CTA en euros par AN. Les confondre fait un facteur mille."
                active={etape === 2}
              >
                <Champ
                  libelle="ATRT"
                  aide="Accès des tiers au réseau de TRANSPORT (NaTran, Teréga), au mégawattheure. Souvent nul parce qu’inclus dans l’abonnement — dans ce cas saisir 0, qui n’est pas la même chose que de laisser vide."
                  unite="€/MWh"
                  valeur={atrt}
                  onCommit={(v) => poser('prix_atrt_mwh', v)}
                />
                <Champ
                  libelle="ATRD"
                  aide="Accès des tiers au réseau de DISTRIBUTION (GRDF), part variable au mégawattheure."
                  unite="€/MWh"
                  valeur={atrd}
                  onCommit={(v) => poser('prix_atrd_mwh', v)}
                />
                <Champ
                  libelle="AGN"
                  aide="Achat de gaz naturel, au mégawattheure."
                  unite="€/MWh"
                  valeur={agn}
                  onCommit={(v) => poser('prix_agn_mwh', v)}
                />
                <Champ
                  libelle="CTA"
                  aide="Contribution tarifaire d’acheminement. Attention : elle est en euros par AN, pas au mégawattheure."
                  unite="€/an"
                  valeur={cta}
                  onCommit={(v) => poser('cta_annuel_ht', v)}
                />
              </Etape>
            </>
          ) : (
            <>
              {/* L'ÉTAPE « ÉNERGIE », dans le même ordre qu'au gaz : le prix nu du fournisseur, puis
                  la marge, puis ce qu'il refacture au mégawattheure. La différence est qu'ici le prix
                  nu se cote par plage horosaisonnière et non en une seule molécule. */}
              <Etape
                numero={1}
                titre="Le prix de l’énergie"
                aide="Ce que le fournisseur facture pour l’électricité elle-même. Un prix nu par plage horosaisonnière, tel qu’il le cote."
                vigilance="le P0 est le prix NU du fournisseur. S’il vous a annoncé un prix marge comprise, basculez sur « marge fixe » plutôt que de la retirer à la main. Et une classe laissée vide ne produira aucun budget, même si la marge est saisie."
                active={etape === 0}
              >
                {classes.map((classe) => (
                  <Champ
                    key={classe}
                    libelle={`P0 ${LIBELLE_CLASSE[classe] ?? classe}`}
                    aide={
                      consoParClasse[classe] != null
                        ? `Volume de cette classe : ${fmt(consoParClasse[classe])} MWh/an.`
                        : 'Volume de cette classe inconnu — son budget ne pourra pas se calculer.'
                    }
                    unite="€/MWh"
                    valeur={p0DeClasse(classe)}
                    onCommit={(v) =>
                      setBrouillon((b) => ({
                        ...b,
                        p0_mwh_par_classe: { ...(b.p0_mwh_par_classe ?? {}), [classe]: v },
                      }))
                    }
                    apres={
                      <span className="flex flex-wrap items-center gap-2">
                        <Fleche valeur={moleculePresentee(p0DeClasse(classe), margeVariable, typeMarge)} />
                        <span className="flex items-center gap-1.5">
                          <span className="text-kw-xs font-bold uppercase tracking-[0.06em] text-kw-faint">
                            Capacité
                          </span>
                          <ChampNombre
                            valeur={capaDeClasse(classe)}
                            suffixe="€/MWh"
                            placeholder="— €/MWh"
                            decimales={2}
                            largeur="w-[92px]"
                            titre="Mécanisme de capacité pour cette plage horaire, en €/MWh. Il garantit l'approvisionnement du réseau lors des pointes nationales, et se facture par poste."
                            peutModifier
                            onCommit={(v) =>
                              setBrouillon((b) => ({
                                ...b,
                                capacite_mwh_par_classe: { ...(b.capacite_mwh_par_classe ?? {}), [classe]: v },
                              }))
                            }
                          />
                        </span>
                      </span>
                    }
                  />
                ))}
                {ORDRE_CLASSES.filter((c) => !classes.includes(c)).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) setClassesEnPlus((l) => [...l, e.target.value]) }}
                      className="cursor-pointer rounded-kw-xs border border-dashed border-kw-border-strong bg-transparent px-1.5 py-0.5 text-kw-xs font-bold text-kw-meta hover:border-kw-green hover:text-kw-green"
                    >
                      <option value="">+ ajouter une classe</option>
                      {ORDRE_CLASSES.filter((c) => !classes.includes(c)).map((c) => (
                        <option key={c} value={c}>{LIBELLE_CLASSE[c] ?? c}</option>
                      ))}
                    </select>
                    <span className="text-kw-sm text-kw-faint">
                      si le fournisseur cote une plage que le compteur ne déclare pas
                    </span>
                  </div>
                )}

                {/* LA MARGE VIT ICI, comme au gaz : Michel la saisit dans le même geste que le prix
                    nu, et il attend de voir tout de suite qu'une marge fixe ne déplace pas le prix
                    présenté. Une seule marge pour le point de livraison, quelle que soit la classe. */}
                <ChoixMarge
                  valeur={typeMarge}
                  onChoisir={(t) => setBrouillon((b) => ({ ...b, type_marge: t }))}
                />
                {typeMarge === 'VARIABLE' ? (
                  <Champ
                    libelle="Marge de référence"
                    aide="Votre marge, au mégawattheure. Chaque prix présenté au client vaut son P0 plus cette marge — la flèche à côté de chaque classe le montre."
                    unite="€/MWh"
                    valeur={margeVariable}
                    onCommit={(v) => poser('marge_reelle_eur_mwh', v)}
                  />
                ) : (
                  <Champ
                    libelle="Marge fixe (durée totale)"
                    aide={aideMargeFixe(dureeMois, margeFixe)}
                    unite="€"
                    valeur={margeFixe}
                    onCommit={(v) => poser('marge_fixe_eur', v)}
                  />
                )}

                {/* Puis ce que le fournisseur refacture au mégawattheure, à la place des CEE et CPB
                    du gaz. */}
                <Champ
                  libelle="CEE"
                  aide="Certificats d’économies d’énergie refacturés, au mégawattheure. Ils entrent dans le budget énergie."
                  unite="€/MWh"
                  valeur={ceeElec}
                  onCommit={(v) => poser('prix_cee_mwh', v)}
                />
                <Champ
                  libelle="GO — énergie verte"
                  aide="Garanties d’origine, au mégawattheure. C’est la part « énergie verte » du compte rendu : incluse ou non selon l’offre. Laissez vide plutôt que de saisir zéro si l’information manque."
                  unite="€/MWh"
                  valeur={go}
                  onCommit={(v) => poser('prix_go_mwh', v)}
                />
              </Etape>

              <Etape
                numero={2}
                titre="L’abonnement"
                aide="Facturé à l’année quel que soit le volume consommé. En électricité, il est compté DANS le budget énergie et ne forme pas un budget à part."
                vigilance="ce montant est ANNUEL. Un abonnement annoncé au mois se multiplie par douze avant d’être saisi ici."
                active={etape === 1}
              >
                <Champ
                  libelle="Abonnement"
                  aide="Supplément annuel que le fournisseur ajoute librement. Il entre dans le budget énergie, pas dans un budget à part."
                  unite="€/an"
                  valeur={abonnement}
                  onCommit={(v) => poser('abonnement_fourniture_annuel_ht', v)}
                />
              </Etape>

              <Etape
                numero={3}
                titre="Les contributions"
                aide="Ce que le réseau et l’État prélèvent, en euros par an. Le même poste qu’au gaz — ici c’est le TURPE, l’accise et la CTA."
                vigilance="tous ces montants sont ANNUELS, et le TURPE se saisit en quatre parts dès qu’on les connaît. L’accise et la CTA sont identiques chez tous les fournisseurs : un écart entre deux offres sur ces lignes est une erreur de saisie."
                active={etape === 2}
              >
                {/* LE TURPE EN QUATRE PARTS, comme la maquette de William. La part fixe du soutirage
                    mérite d'être isolée : c'est la seule que réduit une optimisation de puissance, et
                    donc la seule qui rende cette optimisation chiffrable un jour. */}
                <Champ
                  libelle="TURPE · gestion"
                  aide="Frais fixes de gestion du dossier par le gestionnaire de réseau."
                  unite="€/an"
                  valeur={turpeGestion}
                  onCommit={(v) => poser('turpe_gestion_annuel_ht', v)}
                />
                <Champ
                  libelle="TURPE · comptage"
                  aide="Location et entretien du compteur par le gestionnaire de réseau."
                  unite="€/an"
                  valeur={turpeComptage}
                  onCommit={(v) => poser('turpe_comptage_annuel_ht', v)}
                />
                <Champ
                  libelle="TURPE · soutirage fixe"
                  aide="Part fixe du soutirage, calculée sur les puissances souscrites. C’est elle qu’une optimisation de puissance fait baisser."
                  unite="€/an"
                  valeur={turpeSoutFixe}
                  onCommit={(v) => poser('turpe_soutirage_fixe_annuel_ht', v)}
                />
                <Champ
                  libelle="TURPE · soutirage variable"
                  aide="Part variable du soutirage, proportionnelle à l’énergie réellement acheminée."
                  unite="€/an"
                  valeur={turpeSoutVar}
                  onCommit={(v) => poser('turpe_soutirage_variable_annuel_ht', v)}
                />
                {turpeDetaille != null ? (
                  <p className="rounded-kw-xs bg-kw-amber-light px-2 py-1 text-kw-sm leading-snug text-kw-amber-dark">
                    TURPE total : {Math.round(turpeDetaille).toLocaleString('fr-FR')} € / an — la somme
                    des quatre parts. Le champ global ci-dessous est ignoré tant qu’elles sont saisies.
                  </p>
                ) : (
                  <Champ
                    libelle="TURPE (total)"
                    aide="À utiliser quand le détail n’est pas connu : un montant annuel global, calculé à côté puis reporté ici."
                    unite="€/an"
                    valeur={turpe}
                    onCommit={(v) => poser('prix_turpe_annuel_ht', v)}
                  />
                )}
                {/* Michel, 20/08/2026 : « là, il manque les informations de contribution qu'il
                    faudrait qu'on rajoute ». Il doit envoyer les documents qui en listent les
                    composantes — « ça, je vais te l'envoyer parce que ça, tu l'as pas forcément ».
                    En attendant, un montant annuel global : mieux vaut une ligne juste qu'une
                    décomposition inventée qu'il faudrait défaire. */}
                {/* Les composantes du compte rendu de consultation, telles que le rapport Enéo les
                    liste côté électricité : AE et CTA en €/an, aux côtés du TURPE. */}
                <Champ
                  libelle="AE — accise"
                  aide="Accise sur l’électricité (ex-TICFE), en euros par an. Fixée par l’État : elle est identique chez tous les fournisseurs."
                  unite="€/an"
                  valeur={accise}
                  onCommit={(v) => poser('accise_annuel_ht', v)}
                />
                <Champ
                  libelle="CTA"
                  aide="Contribution tarifaire d’acheminement, en euros par an. Identique chez tous les fournisseurs."
                  unite="€/an"
                  valeur={ctaElec}
                  onCommit={(v) => poser('cta_annuel_ht', v)}
                />
              </Etape>
            </>
          )}

          <Etape
            numero={5}
            titre="Vérification"
            aide="Relisez avant d’enregistrer. Le détail du calcul est à droite : chaque ligne dit d’où vient le montant au-dessus."
            active={etape === derniere}
          >
            <div className="flex flex-col gap-1.5">
              {recapitulatif.length === 0 ? (
                <p className="rounded-kw-md border border-dashed border-kw-border-strong bg-kw-subtle px-3 py-2 text-kw-lg text-kw-meta">
                  Rien n’a été saisi. Revenez aux étapes précédentes, ou fermez sans enregistrer.
                </p>
              ) : (
                recapitulatif.map((r) => (
                  <div key={r.libelle} className="flex items-baseline gap-2 border-b border-kw-border-faint pb-1">
                    <span className="min-w-[160px] text-kw-lg text-kw-meta">{r.libelle}</span>
                    <span className="font-mono text-kw-h4 font-bold tabular-nums">{r.valeur}</span>
                    {r.note && <span className="text-kw-sm text-kw-faint">{r.note}</span>}
                  </div>
                ))
              )}
            </div>
          </Etape>

          <Etape
            numero={4}
            titre="Le volume"
            aide="C’est lui qui transforme les euros par mégawattheure en euros par an. Sans lui, aucun budget ne peut se calculer."
            vigilance="c’est la consommation que LE FOURNISSEUR a retenue pour établir son prix, pas forcément celle du compteur. Un écart entre les deux se paie en régularisation."
            active={etape === 3}
          >
            <Champ
              libelle="Consommation retenue"
              aide={
                (gaz ? compteur?.car_mwh : compteur?.consommation_annuelle_mwh) != null
                  ? `Laissez vide pour utiliser le volume du compteur : ${fmt(gaz ? compteur?.car_mwh ?? null : compteur?.consommation_annuelle_mwh ?? null)} MWh/an.`
                  : 'Le compteur ne porte aucun volume : renseignez celui que le fournisseur a retenu.'
              }
              unite="MWh"
              valeur={valeur('consommation_annuelle_reference_mwh', detail?.consommation_annuelle_reference_mwh)}
              onCommit={(v) => poser('consommation_annuelle_reference_mwh', v)}
            />
            {conso == null && (
              <p className="rounded-kw-xs bg-kw-amber-light px-2 py-1 text-kw-sm leading-snug text-kw-amber-dark">
                Sans volume, les budgets restent vides. Ils ne valent pas zéro : ils sont inconnus.
              </p>
            )}
          </Etape>
        </div>

        {/* ── Le calcul, déroulé — À LA VÉRIFICATION SEULEMENT ──
            Naoëlle, 20/08/2026 : « mets-le juste à la fin dans vérification, et supprime-le des
            autres étapes pour aérer. » Pendant la saisie, le déroulé se met à jour sur des champs
            encore vides : il occupe un tiers de la fenêtre pour afficher des tirets. À la
            vérification il devient l'essentiel, puisque c'est lui qui justifie les montants. */}
        <div className={cn(
          'flex flex-col gap-3 rounded-kw-lg border border-kw-border bg-kw-subtle p-3.5 lg:self-start',
          etape !== derniere && 'hidden',
        )}>
          <div>
            <span className="text-kw-sm font-bold uppercase tracking-[0.06em] text-kw-faint">
              Comment le budget se calcule
            </span>
            <p className="mt-0.5 text-kw-sm leading-snug text-kw-meta">
              Chaque ligne se met à jour dès que vous tapez. Si un montant vous surprend, la ligne qui
              le précède dit d’où il vient.
            </p>
          </div>

          <Calcul titre="Budget énergie" etapes={etapesEnergie} />
          {gaz && (
            <Calcul
              titre="Budget abonnement"
              etapes={[{ libelle: 'Abonnement annuel', valeur: abonnement, unite: '€/an', palier: true }]}
            />
          )}
          <Calcul titre={gaz ? 'Budget contribution' : 'Budget TURPE'} etapes={etapesContribution} />
          {!gaz && <Calcul titre="Budget contribution" etapes={etapesTaxes} />}

          <div className="rounded-kw-md border border-kw-ink bg-white px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-kw-lg font-extrabold">Budget total</span>
              <span className={`font-mono text-kw-h3 font-extrabold tabular-nums ${budgets.total == null ? 'text-kw-ghost' : 'text-kw-ink'}`}>
                {budgets.total == null ? '— €' : `${Math.round(budgets.total).toLocaleString('fr-FR')} €`}
              </span>
            </div>
            <p className="mt-0.5 text-kw-xs leading-snug text-kw-faint">
              {gaz
                ? 'Énergie + abonnement + contributions.'
                : 'Énergie (abonnement compris) + TURPE + contributions.'}
            </p>
          </div>

          {/* La correction manuelle d'un budget existait avant ce formulaire, et elle a un vrai usage :
              un fournisseur annonce parfois un montant global sans détailler ses prix. On la garde,
              repliée, avec l'avertissement qui va avec. */}
          <div className="border-t border-kw-border-faint pt-2">
            {!budgetsForces ? (
              <button
                type="button"
                onClick={() => setBudgetsForces(true)}
                className="text-kw-sm font-bold text-kw-meta underline decoration-dotted hover:text-kw-green"
              >
                Le fournisseur n’a donné qu’un budget global ?
              </button>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="text-kw-sm leading-snug text-kw-meta">
                  Ces montants remplacent le calcul. Ils seront écrasés dès qu’un prix sera saisi.
                </p>
                <Champ
                  libelle="Budget énergie"
                  aide=""
                  unite="€/an"
                  valeur={valeur('cout_fourniture_annuel_ht', detail?.cout_fourniture_annuel_ht)}
                  onCommit={(v) => poser('cout_fourniture_annuel_ht', v)}
                  compact
                />
                <Champ
                  libelle="Budget total"
                  aide=""
                  unite="€/an"
                  valeur={valeur('cout_total_annuel_estime_ht', detail?.cout_total_annuel_estime_ht)}
                  onCommit={(v) => poser('cout_total_annuel_estime_ht', v)}
                  compact
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LE PIED : on avance étape par étape, et on n'enregistre QUE depuis la vérification.
          C'est le seul point où l'assistant contraint — Michel veut « qu'ils prennent le temps de
          vérifier l'information », et le seul moyen honnête d'y obliger est de faire passer le bouton
          d'enregistrement par l'écran qui montre ce qu'on écrit. */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-kw-border pt-3">
        <span className="mr-auto text-kw-sm text-kw-faint">
          {rienDeSaisi
            ? 'Aucune modification'
            : etape === derniere
              ? `${recapitulatif.length} valeur${recapitulatif.length > 1 ? 's' : ''} à enregistrer`
              : `Étape ${etape + 1} sur ${etapes.length}`}
        </span>
        <button
          type="button"
          onClick={onFermer}
          className="rounded-kw-md border border-kw-border-strong bg-white px-3 py-[7px] text-kw-lg font-bold text-kw-label hover:bg-kw-subtle"
        >
          Annuler
        </button>
        {etape > 0 && (
          <button
            type="button"
            onClick={() => setEtape((e) => Math.max(e - 1, 0))}
            className="rounded-kw-md border border-kw-border-strong bg-white px-3 py-[7px] text-kw-lg font-bold text-kw-label hover:bg-kw-subtle"
          >
            ← Précédent
          </button>
        )}
        {etape < derniere ? (
          <button
            type="button"
            onClick={() => setEtape((e) => Math.min(e + 1, derniere))}
            className="rounded-kw-md bg-kw-ink px-3 py-[7px] text-kw-lg font-bold text-white hover:brightness-110"
          >
            Suivant →
          </button>
        ) : (
          <button
            type="button"
            onClick={valider}
            disabled={enCours || rienDeSaisi}
            className="rounded-kw-md bg-kw-green px-3 py-[7px] text-kw-lg font-bold text-white hover:brightness-95 disabled:opacity-50"
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer les prix'}
          </button>
        )}
      </div>
    </Dialog>
  )
}

/**
 * L'explication de la marge fixe, avec son équivalent annuel quand on connaît la durée.
 *
 * NAOËLLE, 20/08/2026 : « c'est sur toute la durée du contrat ». La distinction n'est pas un détail :
 * sur 36 mois, lire 150 € comme un montant annuel triple la rentabilité qu'on croit avoir. Le repère
 * annuel s'affiche donc à côté de la saisie — calculé, jamais enregistré, puisqu'il se déduit de la
 * durée de l'offre et changerait avec elle.
 */
function aideMargeFixe(dureeMois: number | null, montant: number | null): string {
  const base = 'Le montant que le fournisseur arrête lui-même, en euros et pour TOUTE LA DURÉE du '
    + 'contrat — ni au mégawattheure, ni par an. On ne peut pas le négocier, et il ne s’ajoute pas au '
    + 'prix : le fournisseur l’a déjà compris dans son P0.'
  if (dureeMois == null || dureeMois <= 0) {
    return base + ' La durée de l’offre n’est pas renseignée, l’équivalent annuel ne peut pas s’afficher.'
  }
  if (montant == null) return base + ` L’offre court sur ${dureeMois} mois.`
  const parAn = montant / (dureeMois / 12)
  return base + ` Sur ${dureeMois} mois, cela représente `
    + `${parAn.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € par an.`
}

/** `null` se lit « — » et non « 0 » : une donnée absente n'est pas une donnée nulle. */
function fmt(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

function multiplie(a: number | null, b: number | null | undefined): number | null {
  return a == null || b == null ? null : a * b
}

/**
 * Marge fixe ou variable.
 *
 * Michel, 20/08/2026 : « dans l'idéal, ce serait que le commercial choisisse si c'est une marge fixe
 * ou une marge variable […] quand c'est une marge fixe, ça n'a pas d'impact sur le prix ».
 *
 * LA RÈGLE EST ÉCRITE SOUS LES BOUTONS, et elle change avec le choix. Un aiguillage qui modifie
 * silencieusement un calcul est le meilleur moyen de faire signer un prix faux : autant dire, à
 * l'endroit du clic, ce que le clic fait.
 */
function ChoixMarge({ valeur, onChoisir }: {
  valeur: TypeMarge
  onChoisir: (t: TypeMarge) => void
}) {
  const options: { cle: TypeMarge; libelle: string }[] = [
    { cle: 'VARIABLE', libelle: 'Marge variable' },
    { cle: 'FIXE', libelle: 'Marge fixe' },
  ]
  return (
    <div className="flex flex-col gap-1">
      <div className="inline-flex w-fit rounded-kw-md border border-kw-border-strong bg-white p-0.5">
        {options.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => onChoisir(o.cle)}
            className={
              valeur === o.cle
                ? 'rounded-kw-sm bg-kw-ink px-3 py-1 text-kw-lg font-bold text-white'
                : 'rounded-kw-sm px-3 py-1 text-kw-lg font-bold text-kw-meta hover:text-kw-ink'
            }
          >
            {o.libelle}
          </button>
        ))}
      </div>
      <p className="text-kw-sm leading-snug text-kw-faint">
        {valeur === 'VARIABLE'
          ? 'Votre marge s’ajoute au P0 : elle augmente le prix présenté au client.'
          : 'Le fournisseur arrête un montant en euros pour toute la durée du contrat, indépendant du volume et déjà compris dans son P0. Il ne s’ajoute pas au prix : on l’enregistre pour savoir ce que rapporte le dossier.'}
      </p>
    </div>
  )
}

/**
 * Une étape de l'assistant. Elle ne se rend que si c'est celle en cours.
 *
 * MICHEL, 20/08/2026 : « est-ce qu'il est possible d'avoir une espèce de formulaire avec plusieurs
 * étapes ? […] Pour l'instant ça va être manuel, donc pour chaque saisie je veux vraiment qu'ils
 * réfléchissent. Je ne veux pas que ce soit trop rapide. Il faut qu'ils prennent le temps de vérifier
 * l'information. »
 *
 * L'INTENTION EST DE RALENTIR, pas d'empêcher. D'où le choix de ne rien rendre obligatoire : ni case
 * à cocher, ni champ requis. Ce qui ralentit, c'est qu'on ne voit qu'une famille de prix à la fois,
 * avec son point de vigilance, et qu'on passe forcément par un récapitulatif avant d'enregistrer.
 * Un formulaire qui bloque se contourne en tapant n'importe quoi ; un formulaire qui montre ce qu'on
 * vient de saisir se relit.
 */
function Etape({ numero, titre, aide, vigilance, active, children }: {
  numero: number
  titre: string
  aide: string
  /** Ce qu'on se trompe le plus souvent à cette étape. Absent quand il n'y a rien de particulier. */
  vigilance?: string
  active: boolean
  children: React.ReactNode
}) {
  if (!active) return null
  return (
    <section className="animate-kw-fade-slide flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-kw-ink text-kw-xs font-extrabold text-white">
          {numero}
        </span>
        <div>
          <h4 className="text-kw-h3 font-extrabold text-kw-ink">{titre}</h4>
          <p className="text-kw-sm leading-snug text-kw-meta">{aide}</p>
        </div>
      </div>
      {vigilance && (
        <p className="ml-[26px] rounded-kw-md border border-kw-amber-border bg-kw-amber-light px-2.5 py-1.5 text-kw-sm leading-snug text-kw-amber-dark">
          <b>À vérifier</b> — {vigilance}
        </p>
      )}
      <div className="flex flex-col gap-2.5 pl-[26px]">{children}</div>
    </section>
  )
}

/** Le fil des étapes : où l'on en est, et ce qui reste. Cliquable pour revenir en arrière. */
function FilEtapes({ etapes, courante, onAller }: {
  etapes: { titre: string }[]
  courante: number
  onAller: (i: number) => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-kw-border pb-3">
      {etapes.map((e, i) => (
        <button
          key={e.titre}
          type="button"
          onClick={() => onAller(i)}
          className={
            i === courante
              ? 'flex items-center gap-1.5 rounded-kw-md bg-kw-ink px-2.5 py-1 text-kw-sm font-bold text-white'
              : i < courante
                ? 'flex items-center gap-1.5 rounded-kw-md bg-kw-green-light px-2.5 py-1 text-kw-sm font-bold text-kw-green hover:brightness-95'
                : 'flex items-center gap-1.5 rounded-kw-md bg-kw-muted px-2.5 py-1 text-kw-sm font-bold text-kw-faint hover:text-kw-meta'
          }
        >
          <span className="font-mono">{i < courante ? '✓' : i + 1}</span>
          {e.titre}
        </button>
      ))}
    </div>
  )
}

/** Un champ avec son explication SOUS lui : elle doit se lire sans survoler quoi que ce soit. */
function Champ({ libelle, aide, unite, valeur, onCommit, apres, compact }: {
  libelle: string
  aide: string
  unite: string
  valeur: number | null
  onCommit: (v: number | null) => void
  apres?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${compact ? 'min-w-[92px]' : 'min-w-[132px]'} text-kw-lg font-semibold text-kw-label`}>
          {libelle}
        </label>
        <ChampNombre
          valeur={valeur}
          suffixe={unite}
          placeholder={`— ${unite}`}
          decimales={unite === '€/MWh' ? 2 : undefined}
          largeur={compact ? 'w-[96px]' : 'w-[112px]'}
          titre={aide}
          peutModifier
          onCommit={onCommit}
        />
        {apres}
      </div>
      {aide && !compact && (
        <p className={`${compact ? '' : 'ml-[140px]'} text-kw-sm leading-snug text-kw-faint`}>{aide}</p>
      )}
    </div>
  )
}

/** Un résultat intermédiaire, montré à l'endroit où il se produit. */
function Deduit({ libelle, calcul, valeur, unite }: {
  libelle: string
  calcul: string
  valeur: number | null
  unite: string
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 rounded-kw-md border border-kw-green-border bg-kw-green-tint px-2.5 py-1.5">
      <span className="min-w-[132px] text-kw-lg font-bold text-kw-green">{libelle}</span>
      <span className="font-mono text-kw-sm text-kw-meta">{calcul} =</span>
      <span className={`font-mono text-[22px] font-extrabold leading-none tabular-nums ${valeur == null ? 'text-kw-ghost' : 'text-kw-green'}`}>
        {fmt(valeur)}
      </span>
      <span className="text-kw-sm font-semibold text-kw-green">{unite}</span>
    </div>
  )
}

/**
 * Le prix client, à côté du P0 qui le produit.
 *
 * Michel, 20/08/2026 : « il faut que ce soit un peu plus impactant en termes de visibilité, pour que
 * le commercial voie bien que quand on met 100 € et 5 € de marge, le prix c'est 105 € ». D'où le
 * fond teinté et la taille : c'est le chiffre qui part chez le client, il ne doit pas se lire en
 * petit à côté d'une saisie.
 */
function Fleche({ valeur }: { valeur: number | null }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-kw-xs bg-kw-green-tint px-2 py-0.5">
      <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-green">
        Prix client
      </span>
      <span className={`font-mono text-kw-h3 font-extrabold tabular-nums ${valeur == null ? 'text-kw-ghost' : 'text-kw-green'}`}>
        {fmt(valeur)}
      </span>
      <span className="text-kw-sm font-semibold text-kw-green">€/MWh</span>
    </span>
  )
}

/** Le déroulé d'un budget : chaque ingrédient, son opérateur, et le palier atteint. */
function Calcul({ titre, etapes }: { titre: string; etapes: Etape[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-kw-sm font-bold text-kw-label">{titre}</span>
      <div className="flex flex-col">
        {etapes.map((e, i) => (
          <div
            key={`${e.libelle}-${i}`}
            className={`flex items-baseline gap-1.5 ${e.palier ? 'mt-0.5 border-t border-kw-border-faint pt-0.5' : ''}`}
          >
            <span className="w-3 shrink-0 font-mono text-kw-sm text-kw-faint">{e.operateur ?? ''}</span>
            <span className={`min-w-0 flex-1 truncate text-kw-sm ${e.palier ? 'font-bold text-kw-ink' : 'text-kw-meta'}`}>
              {e.libelle}
            </span>
            <span
              className={`shrink-0 font-mono tabular-nums ${e.valeur == null ? 'text-kw-ghost' : 'text-kw-ink'} ${e.palier ? 'text-kw-lg font-extrabold' : 'text-kw-sm'}`}
            >
              {fmt(e.valeur)} {e.unite}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

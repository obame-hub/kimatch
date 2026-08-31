import { useState } from 'react'
import { budgetsDepuisPrix, CHAMPS_DE_PRIX, moleculePresentee, PRIX_GAZ_VIDE } from '@/lib/calculs/prixOffre'
import { SaisiePrixDialog } from './SaisiePrixDialog'
import { Zap, Flame, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEnregistrerPrixCompteur, type PrixParCompteur as PrixSaisi } from '@/lib/data/recommandations'
import type {
  OffreFournisseur,
  OffreFournisseurCompteur,
  VersionRecommandation,
  Compteur,
  PrixOffreGaz,
  PrixOffreElectricite,
} from '@/types/domain'

/**
 * Les prix d'une offre, point de livraison par point de livraison.
 *
 * Demande de la réunion du 17/08/2026 : « Erwan vient saisir les prix dans les compteurs concernés,
 * sachant que dans une offre il peut y avoir plusieurs compteurs, et gaz et élec mélangés. »
 *
 * NAVIGABLE ET PAS SEULEMENT AFFICHÉ : chaque point de livraison renvoie vers sa fiche compteur.
 * La hiérarchie doit se parcourir, pas se contempler.
 *
 * DEUX COLONNES : à gauche les prix unitaires tels que le fournisseur les décompose, à droite ce que
 * ça donne en budget annuel. Un prix au MWh ne dit rien sans le volume, un budget ne dit rien sans le
 * prix qui l'a produit.
 *
 * LES BUDGETS SE CALCULENT TOUT SEULS (19/08/2026). Taper un prix ou une consommation met à jour les
 * montants annuels dans la même écriture : il n'y a rien à cliquer, et on peut donc garantir qu'ils
 * sont à jour. Ils restent modifiables à la main — un fournisseur annonce parfois un budget global
 * sans détailler — et une correction manuelle tient jusqu'à la prochaine saisie de prix.
 *
 * POURQUOI PAS LES HUIT CLASSES DE PRIX EN ÉLECTRICITÉ D'EMBLÉE. Huit classes et sept puissances font
 * quinze champs par compteur, presque tous vides. On n'affiche que les classes que le compteur
 * CONSOMME réellement, lues dans `consoParClasseMwh` (renseigné par la synchronisation Enedis) — et
 * quand cette information manque, ce qui est le cas de 82 % des C5, le sélecteur `AjouterClasse` en
 * ouvre une à la main.
 *
 * LES FORMULES NE SONT PLUS ICI : elles vivent dans `@/lib/calculs/prixOffre`, parce que la modale de
 * saisie et le document comparatif les appliquent aussi. Une formule recopiée finit par diverger — la
 * journée du 19/08/2026 en a donné deux exemples, la marge comptée deux fois puis l'abonnement.
 */









export function PrixParCompteur({
  offre,
  version,
  compteurs,
  peutModifier,
  signaler,
}: {
  offre: OffreFournisseur
  version: VersionRecommandation
  /** Les compteurs chargés par la fiche, pour connaître l'énergie et les classes consommées. */
  compteurs: Compteur[]
  peutModifier: boolean
  signaler: (message: string) => void
}) {
  // Le point de livraison dont le formulaire est ouvert, s'il y en a un.
  const [saisieOuverte, setSaisieOuverte] = useState<string | null>(null)
  // Le menu de choix du point de livraison, quand l'offre en couvre plusieurs.
  const [choixOuvert, setChoixOuvert] = useState(false)
  const enregistrer = useEnregistrerPrixCompteur()

  const parId = new Map(compteurs.map((c) => [c.id, c]))
  const detailParLien = new Map(offre.details_par_compteur.map((d) => [d.version_recommandation_compteur_id, d]))
  const chiffres = offre.details_par_compteur.filter(
    (d) => Object.keys(d.prix_electricite?.prix_mwh_par_classe ?? {}).length > 0 || d.prix_gaz?.prix_energie_mwh != null,
  ).length

  if (version.compteurs.length === 0) {
    return (
      <p className="mt-1 text-km-label text-km-faint">
        Aucun point de livraison rattaché à cette version : les prix par PDL ne peuvent pas être saisis.
      </p>
    )
  }

  /**
   * Enregistre une saisie ET les budgets annuels qu'elle implique, dans la même écriture.
   *
   * C'est la garantie qui manquait : taper un prix met à jour les montants annuels sans rien cliquer.
   * Le calcul repart des prix FUSIONNÉS — ceux en base plus la saisie en cours — sinon il travaillerait
   * sur l'état d'avant et produirait un budget en retard d'une frappe.
   *
   * Seule une saisie de prix ou de consommation déclenche le recalcul : si le conseiller corrige un
   * budget à la main, sa valeur est respectée.
   */
  async function sauver(args: {
    lienId: string
    gaz: boolean
    compteur: Compteur | undefined
    detail: OffreFournisseurCompteur | undefined
    prix: PrixSaisi
    message: string
  }) {
    const { lienId, gaz, compteur, detail, prix, message } = args
    const energie: 'electricite' | 'gaz' = gaz ? 'gaz' : 'electricite'
    let patch: PrixSaisi = prix

    if (CHAMPS_DE_PRIX.some((k) => k in prix)) {
      // La marge et le P0 APRÈS la saisie en cours : `!== undefined` et non `??`, pour qu'un
      // effacement volontaire (null) ne se fasse pas remplacer par la valeur d'avant.
      const marge = prix.marge_reelle_eur_mwh !== undefined
        ? prix.marge_reelle_eur_mwh
        : detail?.marge_reelle_eur_mwh ?? null
      const p0 = prix.prix_molecule_p0_mwh !== undefined
        ? prix.prix_molecule_p0_mwh
        : detail?.prix_gaz?.prix_molecule_p0_mwh ?? null
      // Électricité : un P0 par classe tarifaire. Une saisie ne porte qu'UNE classe, les autres
      // restent — d'où la fusion plutôt qu'un remplacement.
      const p0ParClasse: Record<string, number> = Object.fromEntries(
        Object.entries({
          ...(detail?.prix_electricite?.p0_mwh_par_classe ?? {}),
          ...(prix.p0_mwh_par_classe ?? {}),
        }).filter(([, v]) => v != null) as [string, number][],
      )

      const prixGaz: PrixOffreGaz | null = gaz
        ? {
            ...PRIX_GAZ_VIDE,
            ...(detail?.prix_gaz ?? {}),
            // La molécule n'est plus saisie : elle vaut P0 + marge, et c'est cette valeur que voient
            // le budget énergie et les autres écrans.
            prix_molecule_p0_mwh: p0,
            prix_energie_mwh: moleculePresentee(p0, marge),
            ...(prix.prix_cee_mwh !== undefined ? { prix_cee_mwh: prix.prix_cee_mwh } : {}),
            ...(prix.prix_cpb_mwh !== undefined ? { prix_cpb_mwh: prix.prix_cpb_mwh } : {}),
            ...(prix.prix_atrd_mwh !== undefined ? { prix_atrd_mwh: prix.prix_atrd_mwh } : {}),
            ...(prix.prix_agn_mwh !== undefined ? { prix_agn_mwh: prix.prix_agn_mwh } : {}),
            ...(prix.cta_annuel_ht !== undefined ? { cta_annuel_ht: prix.cta_annuel_ht } : {}),
            ...(prix.abonnement_fourniture_annuel_ht !== undefined
              ? { abonnement_fourniture_annuel_ht: prix.abonnement_fourniture_annuel_ht }
              : {}),
          }
        : null

      const prixElec: PrixOffreElectricite | null = gaz
        ? null
        : {
            type_prix: detail?.prix_electricite?.type_prix ?? null,
            formule_tarifaire: detail?.prix_electricite?.formule_tarifaire ?? null,
            // Fusion classe par classe : une saisie ne porte qu'UNE classe, les autres restent.
            p0_mwh_par_classe: p0ParClasse,
            // Les prix présentés découlent des P0 : chaque classe reçoit la même marge, comme la
            // molécule au gaz. Ils ne se saisissent plus.
            prix_mwh_par_classe: Object.fromEntries(
              Object.entries(p0ParClasse).map(([classe, v]) => [classe, moleculePresentee(v, marge)])
                .filter(([, v]) => v != null) as [string, number][],
            ),
            abonnement_fourniture_annuel_ht: prix.abonnement_fourniture_annuel_ht !== undefined
              ? prix.abonnement_fourniture_annuel_ht
              : detail?.prix_electricite?.abonnement_fourniture_annuel_ht ?? null,
            prix_turpe_annuel_ht: prix.prix_turpe_annuel_ht !== undefined
              ? prix.prix_turpe_annuel_ht
              : detail?.prix_electricite?.prix_turpe_annuel_ht ?? null,
            // Les composantes du compte rendu de consultation. On repart de la base : elles ne se
            // saisissent pas encore ici, mais le type les exige et le calcul les lira.
            prix_cee_mwh: detail?.prix_electricite?.prix_cee_mwh ?? null,
            prix_go_mwh: detail?.prix_electricite?.prix_go_mwh ?? null,
            accise_annuel_ht: detail?.prix_electricite?.accise_annuel_ht ?? null,
            cta_annuel_ht: detail?.prix_electricite?.cta_annuel_ht ?? null,
            // Capacité et TURPE détaillé : repris de la base, ils se saisissent dans le formulaire.
            capacite_mwh_par_classe: detail?.prix_electricite?.capacite_mwh_par_classe ?? {},
            turpe_gestion_annuel_ht: detail?.prix_electricite?.turpe_gestion_annuel_ht ?? null,
            turpe_comptage_annuel_ht: detail?.prix_electricite?.turpe_comptage_annuel_ht ?? null,
            turpe_soutirage_fixe_annuel_ht: detail?.prix_electricite?.turpe_soutirage_fixe_annuel_ht ?? null,
            turpe_soutirage_variable_annuel_ht: detail?.prix_electricite?.turpe_soutirage_variable_annuel_ht ?? null,
          }

      const b = budgetsDepuisPrix({
        gaz,
        compteur,
        detail,
        prixGaz,
        prixElec,
        consoForcee: prix.consommation_annuelle_reference_mwh,
      })
      patch = {
        ...prix,
        // Les prix présentés partent avec le reste : la molécule au gaz, les huit classes en
        // électricité. Dans les deux cas c'est P0 + marge, jamais une saisie directe.
        ...(gaz
          ? { prix_energie_mwh: moleculePresentee(p0, marge) }
          : { p0_mwh_par_classe: p0ParClasse, prix_mwh_par_classe: prixElec?.prix_mwh_par_classe ?? {} }),
        ...(b.energie != null ? { cout_fourniture_annuel_ht: b.energie } : {}),
        // L'acheminement se recalcule dans les deux énergies : ATRD + AGN + CTA au gaz, le TURPE
        // saisi en électricité. Il n'était calculé qu'au gaz tant que l'électricité n'avait pas de
        // source pour lui.
        ...(b.contribution != null ? { cout_acheminement_annuel_ht: b.contribution } : {}),
        ...(b.total != null ? { cout_total_annuel_estime_ht: b.total } : {}),
      }
    }

    try {
      await enregistrer.mutateAsync({ offreId: offre.id, versionCompteurId: lienId, energie, prix: patch })
      signaler(message)
    } catch (e) {
      signaler(messageDErreur(e))
    }
  }

  /**
   * Traduit l'échec d'un enregistrement en quelque chose d'actionnable.
   *
   * POURQUOI CETTE FONCTION EXISTE. Le 20/08/2026, Michel signale que le P0, l'abonnement et le TURPE
   * ne s'enregistrent pas, alors que la marge et la consommation passent. La cause : la colonne
   * `prix_turpe_annuel_ht` n'existait pas encore en base. Dès que le champ était touché, PostgREST
   * rejetait TOUTE l'écriture du prix — les trois champs de cette table partaient donc ensemble, et
   * l'écran affichait « column ... does not exist », un message dans lequel personne ne lit « il
   * manque une migration ».
   */  function messageDErreur(e: unknown): string {
    const brut = e instanceof Error ? e.message : String(e)
    if (/column .* does not exist|PGRST204|42703|schema cache/i.test(brut)) {
      return `Enregistrement refusé : la base n'a pas encore la colonne attendue. Une migration reste à appliquer. (${brut})`
    }
    return `Erreur : ${brut}`
  }

  // Un seul point de livraison : le bouton l'ouvre directement. Plusieurs : il ouvre un choix, parce
  // qu'un bouton qui décide à votre place duquel il s'agit est un bouton qu'on n'ose plus cliquer.
  const unSeul = version.compteurs.length === 1

  return (
    <>
      {peutModifier && (
        <span className="relative inline-flex">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (unSeul) setSaisieOuverte(version.compteurs[0].lien_id)
              else setChoixOuvert((v) => !v)
            }}
            title={`Saisir les prix de cette offre — ${chiffres} point${chiffres > 1 ? 's' : ''} de livraison chiffré${chiffres > 1 ? 's' : ''} sur ${version.compteurs.length}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-km px-2 py-1 text-km-label font-bold',
              chiffres === 0
                ? 'bg-km-green text-white hover:brightness-95'
                : 'border border-km-line bg-white text-km-muted hover:border-km-green hover:text-km-green',
            )}
          >
            <PenLine className="h-2.5 w-2.5" />
            {chiffres === 0 ? 'Saisir les prix' : 'Modifier les prix'}
            {!unSeul && (
              <span className="font-normal text-km-faint">
                {chiffres}/{version.compteurs.length}
              </span>
            )}
          </button>

          {/* Le choix du point de livraison, quand il y en a plusieurs. Chaque ligne dit si elle est
              déjà chiffrée : c'est l'information qui décide où aller. */}
          {choixOuvert && !unSeul && (
            <span
              onClick={(e) => e.stopPropagation()}
              className="animate-kw-fade-slide absolute right-0 top-full z-30 mt-1 flex w-64 flex-col rounded-km-md border border-km-line bg-white py-1 shadow-kw-panel"
            >
              <span className="px-3 py-1 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                Quel point de livraison ?
              </span>
              {version.compteurs.map((lien) => {
                const compteur = parId.get(lien.compteur_id)
                const detail = detailParLien.get(lien.lien_id)
                const chiffre = detail?.prix_gaz?.prix_molecule_p0_mwh != null
                  || detail?.prix_gaz?.prix_energie_mwh != null
                  || Object.keys(detail?.prix_electricite?.p0_mwh_par_classe ?? {}).length > 0
                  || Object.keys(detail?.prix_electricite?.prix_mwh_par_classe ?? {}).length > 0
                return (
                  <button
                    key={lien.lien_id}
                    type="button"
                    onClick={() => { setChoixOuvert(false); setSaisieOuverte(lien.lien_id) }}
                    className="flex items-center gap-2 px-3 py-1.5 text-left hover:bg-km-soft"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-kw-xs',
                        compteur?.type_energie === 'gaz'
                          ? 'bg-kw-gas-light text-kw-gas'
                          : 'bg-kw-gold-light text-kw-gold',
                      )}
                    >
                      {compteur?.type_energie === 'gaz'
                        ? <Flame className="h-2 w-2" />
                        : <Zap className="h-2 w-2" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-km-label">
                      {compteur?.numero_pdl || lien.label || 'Compteur'}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-km-label font-bold',
                        chiffre ? 'text-km-green' : 'text-km-faint',
                      )}
                    >
                      {chiffre ? 'chiffré' : 'à chiffrer'}
                    </span>
                  </button>
                )
              })}
            </span>
          )}
        </span>
      )}

      {/* LE DÉPLIANT DE RELECTURE A DISPARU. Michel, 20/08/2026 : « quand je clique ici j'ai le
          détail, ensuite si je clique sur le détail j'ai ça — donc ça, on peut l'enlever, c'est plus
          propre. » La carte de l'offre montre déjà les prix et les budgets par point de livraison ;
          ce composant ne fait plus qu'ouvrir la saisie. */}
      {version.compteurs.map((lien) => {
        const compteur = parId.get(lien.compteur_id)
        return (
          <SaisiePrixDialog
            key={lien.lien_id}
            ouvert={saisieOuverte === lien.lien_id}
            onFermer={() => setSaisieOuverte(null)}
            gaz={compteur?.type_energie === 'gaz'}
            compteur={compteur}
            libelleCompteur={compteur?.numero_pdl || compteur?.utilisation || lien.label || 'Compteur'}
            detail={detailParLien.get(lien.lien_id)}
            dureeMois={offre.duree_mois}
            enCours={enregistrer.isPending}
            onEnregistrer={(prix) => sauver({
              lienId: lien.lien_id,
              gaz: compteur?.type_energie === 'gaz',
              compteur,
              detail: detailParLien.get(lien.lien_id),
              prix,
              message: '✓ Prix enregistrés',
            })}
          />
        )
      })}
    </>
  )
}

import { useState } from 'react'
import {
  budgetsDepuisPrix,
  CHAMPS_DE_PRIX,
  classesDuCompteur,
  LIBELLE_CLASSE,
  moleculePresentee,
  ORDRE_CLASSES,
  PRIX_GAZ_VIDE,
} from '@/lib/calculs/prixOffre'
import { SaisiePrixDialog } from './SaisiePrixDialog'
import { ChevronDown, ChevronRight, Zap, Flame, ExternalLink, PenLine } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
  const [ouvert, setOuvert] = useState(false)
  // Le point de livraison dont le formulaire est ouvert, s'il y en a un.
  const [saisieOuverte, setSaisieOuverte] = useState<string | null>(null)
  const navigate = useNavigate()
  const enregistrer = useEnregistrerPrixCompteur()

  const parId = new Map(compteurs.map((c) => [c.id, c]))
  const detailParLien = new Map(offre.details_par_compteur.map((d) => [d.version_recommandation_compteur_id, d]))
  const chiffres = offre.details_par_compteur.filter(
    (d) => Object.keys(d.prix_electricite?.prix_mwh_par_classe ?? {}).length > 0 || d.prix_gaz?.prix_energie_mwh != null,
  ).length

  if (version.compteurs.length === 0) {
    return (
      <p className="mt-1 text-kw-tiny text-kw-faint">
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
  return (
    <div className="mt-2 border-t border-kw-border-faint pt-1.5">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="inline-flex items-center gap-1 text-kw-sm font-semibold text-kw-label hover:text-kw-ink"
      >
        {ouvert ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Détail par compteur
        <span className="font-normal text-kw-faint">
          ({chiffres}/{version.compteurs.length} chiffré{chiffres > 1 ? 's' : ''})
        </span>
      </button>

      {ouvert && (
        <div className="mt-1.5 space-y-1.5">
          {version.compteurs.map((lien) => {
            const compteur = parId.get(lien.compteur_id)
            const gaz = compteur?.type_energie === 'gaz'
            const detail = detailParLien.get(lien.lien_id)
            const classes = gaz ? [] : ORDRE_CLASSES.filter((c) => classesDuCompteur(compteur).includes(c))
            const volume = gaz
              ? detail?.consommation_annuelle_reference_mwh ?? compteur?.car_mwh ?? null
              : detail?.consommation_annuelle_reference_mwh ?? compteur?.consommation_annuelle_mwh ?? null
            // « Chiffré » veut dire qu'un PRIX existe, pas qu'un budget existe : c'est le prix qui se
            // saisit, le budget n'en est que la conséquence.
            const chiffre = gaz
              ? detail?.prix_gaz?.prix_molecule_p0_mwh != null || detail?.prix_gaz?.prix_energie_mwh != null
              : Object.keys(detail?.prix_electricite?.p0_mwh_par_classe ?? {}).length > 0
                || Object.keys(detail?.prix_electricite?.prix_mwh_par_classe ?? {}).length > 0

            return (
              <div key={lien.lien_id} className="rounded-kw-md border border-kw-border-subtle bg-kw-subtle px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-kw-sm',
                      gaz ? 'bg-kw-gas-light text-kw-gas' : 'bg-kw-gold-light text-kw-gold',
                    )}
                  >
                    {gaz ? <Flame className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`/compteurs/${lien.compteur_id}`)}
                    className="inline-flex items-center gap-1 text-kw-base font-bold text-kw-ink hover:text-kw-green hover:underline"
                  >
                    {compteur?.utilisation || lien.label || 'Compteur'}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                  <span className="font-mono text-kw-tiny text-kw-faint">{compteur?.numero_pdl ?? ''}</span>
                  {compteur?.segment && (
                    <span className="rounded-kw-xs bg-kw-muted px-1.5 py-px text-kw-micro font-bold text-kw-meta">
                      {compteur.segment}
                    </span>
                  )}
                  <span className="font-mono text-kw-tiny text-kw-faint">
                    {volume != null ? `${volume.toLocaleString('fr-FR')} MWh/an` : 'volume inconnu'}
                  </span>
                  <span className="flex-1" />
                  {peutModifier && (
                    <button
                      type="button"
                      onClick={() => setSaisieOuverte(lien.lien_id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-kw-md px-2 py-[3px] text-kw-tiny font-bold',
                        chiffre
                          ? 'border border-kw-border-strong bg-white text-kw-label hover:border-kw-green hover:text-kw-green'
                          : 'bg-kw-green text-white hover:brightness-95',
                      )}
                    >
                      <PenLine className="h-2.5 w-2.5" />
                      {chiffre ? 'Modifier les prix' : 'Saisir les prix'}
                    </button>
                  )}
                </div>

                <SaisiePrixDialog
                  ouvert={saisieOuverte === lien.lien_id}
                  onFermer={() => setSaisieOuverte(null)}
                  gaz={gaz}
                  compteur={compteur}
                  libelleCompteur={compteur?.numero_pdl || compteur?.utilisation || lien.label || 'Compteur'}
                  detail={detail}
                  dureeMois={offre.duree_mois}
                  enCours={enregistrer.isPending}
                  onEnregistrer={(prix) => sauver({
                    lienId: lien.lien_id, gaz, compteur, detail, prix, message: '✓ Prix enregistrés',
                  })}
                />

                {/* ── Lecture seule ──
                    LA SAISIE INLINE A ÉTÉ RETIRÉE le 19/08/2026, à la demande de Naoëlle :
                    « justement pour enlever l'inline ». Deux endroits pour saisir la même chose, ce
                    sont deux endroits à apprendre — et l'inline n'expliquait aucun de ses champs. Le
                    dépliant lit, le formulaire écrit et explique. */}
                {!chiffre ? (
                  <p className="mt-1.5 text-kw-tiny text-kw-faint">
                    Aucun prix saisi sur ce point de livraison.
                  </p>
                ) : (
                  <div className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-1.5 lg:grid-cols-[1.3fr_1fr]">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {gaz ? (
                        <>
                          <Lu libelle="Molécule" valeur={detail?.prix_gaz?.prix_energie_mwh} unite="€/MWh" fort />
                          <Lu libelle="P0" valeur={detail?.prix_gaz?.prix_molecule_p0_mwh} unite="€/MWh" />
                          <Lu libelle="Marge" valeur={detail?.marge_reelle_eur_mwh} unite="€/MWh" />
                          <Lu libelle="CEE" valeur={detail?.prix_gaz?.prix_cee_mwh} unite="€/MWh" />
                          <Lu libelle="CPB" valeur={detail?.prix_gaz?.prix_cpb_mwh} unite="€/MWh" />
                          <Lu libelle="Abonnement" valeur={detail?.prix_gaz?.abonnement_fourniture_annuel_ht} unite="€/an" />
                          <Lu libelle="ATRD" valeur={detail?.prix_gaz?.prix_atrd_mwh} unite="€/MWh" />
                          <Lu libelle="AGN" valeur={detail?.prix_gaz?.prix_agn_mwh} unite="€/MWh" />
                          <Lu libelle="CTA" valeur={detail?.prix_gaz?.cta_annuel_ht} unite="€/an" />
                        </>
                      ) : (
                        <>
                          {classes.map((classe) => (
                            <Lu
                              key={classe}
                              libelle={LIBELLE_CLASSE[classe] ?? classe}
                              valeur={detail?.prix_electricite?.prix_mwh_par_classe?.[classe]}
                              unite="€/MWh"
                              fort
                            />
                          ))}
                          <Lu libelle="Marge" valeur={detail?.marge_reelle_eur_mwh} unite="€/MWh" />
                          <Lu libelle="Abonnement" valeur={detail?.prix_electricite?.abonnement_fourniture_annuel_ht} unite="€/an" />
                          <Lu libelle="TURPE" valeur={detail?.prix_electricite?.prix_turpe_annuel_ht} unite="€/an" />
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 lg:border-l lg:border-kw-border-faint lg:pl-5">
                      <Lu libelle="Budget énergie" valeur={detail?.cout_fourniture_annuel_ht} unite="€/an" />
                      {gaz && (
                        <Lu libelle="Budget abonnement" valeur={detail?.prix_gaz?.abonnement_fourniture_annuel_ht} unite="€/an" />
                      )}
                      <Lu
                        libelle={gaz ? 'Budget contribution' : 'Budget TURPE'}
                        valeur={detail?.cout_acheminement_annuel_ht}
                        unite="€/an"
                      />
                      <Lu libelle="Budget total" valeur={detail?.cout_total_annuel_estime_ht} unite="€/an" fort />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Traduit l'échec d'un enregistrement en quelque chose d'actionnable.
 *
 * POURQUOI CETTE FONCTION EXISTE. Le 20/08/2026, Michel signale que le P0, l'abonnement et le TURPE
 * ne s'enregistrent pas, alors que la marge et la consommation passent. La cause : la colonne
 * `prix_turpe_annuel_ht` n'existait pas encore en base, la migration n'avait pas été appliquée. Dès
 * que le champ TURPE était touché, PostgREST rejetait TOUTE l'écriture du prix — les trois champs de
 * cette table partaient donc ensemble, et l'écran affichait « Erreur : column ... does not exist »,
 * un message dans lequel personne ne lit « il manque une migration ».
 *
 * Une colonne absente est le seul cas où l'utilisateur ne peut rien faire d'autre qu'appeler à
 * l'aide : autant que le message le dise, plutôt que de laisser chercher.
 */
function messageDErreur(e: unknown): string {
  const brut = e instanceof Error ? e.message : String(e)
  // PostgREST : 42703 en SQL, PGRST204 pour une colonne inconnue du schéma mis en cache.
  if (/column .* does not exist|PGRST204|42703|schema cache/i.test(brut)) {
    return `Enregistrement refusé : la base n'a pas encore la colonne attendue. Une migration reste à appliquer. (${brut})`
  }
  return `Erreur : ${brut}`
}

/** Une valeur en lecture. `null` se lit « — » et jamais « 0 ». */
function Lu({ libelle, valeur, unite, fort }: {
  libelle: string
  valeur: number | null | undefined
  unite: string
  fort?: boolean
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-kw-tiny text-kw-faint">{libelle}</span>
      <span
        className={cn(
          'font-mono tabular-nums',
          valeur == null ? 'text-kw-ghost' : 'text-kw-ink',
          fort ? 'text-kw-base font-bold' : 'text-kw-tiny',
        )}
      >
        {valeur == null
          ? `— ${unite}`
          : `${unite === '€/an' ? Math.round(valeur).toLocaleString('fr-FR') : valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${unite}`}
      </span>
    </span>
  )
}

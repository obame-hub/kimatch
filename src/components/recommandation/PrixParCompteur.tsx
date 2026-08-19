import { useState } from 'react'
import { ChevronDown, ChevronRight, Zap, Flame, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ChampNombre } from '@/components/ui/champ-nombre'
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
 * POURQUOI PAS LES HUIT CLASSES DE PRIX EN ÉLECTRICITÉ. Huit classes et sept puissances font quinze
 * champs par compteur, presque tous vides. On n'affiche que les classes que le compteur CONSOMME
 * réellement, lues dans `consoParClasseMwh` (renseigné par la synchronisation Enedis). Un C5 en base
 * n'a qu'un champ, un C3 en a quatre. Sans information de consommation on propose Base.
 *
 * LE GAZ EST DÉCOMPOSÉ, l'électricité pas encore : les composantes ne sont pas les mêmes (TURPE au
 * lieu d'ATRD, accise, pas de CPB) et personne ne les a cadrées.
 */

/** Les classes temporelles dans l'ordre où un tarif les présente. */
const ORDRE_CLASSES = ['BASE', 'HP', 'HC', 'HPH', 'HCH', 'HPE', 'HCE', 'POINTE'] as const

const LIBELLE_CLASSE: Record<string, string> = {
  BASE: 'Base',
  HP: 'Heures pleines',
  HC: 'Heures creuses',
  HPH: 'Pleines hiver',
  HCH: 'Creuses hiver',
  HPE: 'Pleines été',
  HCE: 'Creuses été',
  POINTE: 'Pointe',
}

/** Les classes à proposer pour un compteur : celles qu'il consomme, Base à défaut. */
function classesDuCompteur(compteur: Compteur | undefined): string[] {
  const conso = compteur?.consoParClasseMwh ?? {}
  const presentes = ORDRE_CLASSES.filter((c) => (conso[c] ?? 0) > 0)
  return presentes.length > 0 ? [...presentes] : ['BASE']
}

/** Somme qui reste `null` si aucun terme n'est connu — zéro et inconnu ne se disent pas pareil. */
function somme(...v: (number | null | undefined)[]): number | null {
  return v.reduce<number | null>((t, x) => (x == null ? t : (t ?? 0) + x), null)
}

/** Un intitulé de groupe, au-dessus de ses champs. */
function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">{titre}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
    </div>
  )
}

/** Un champ nommé, en ligne. */
function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-kw-tiny text-kw-meta">{libelle}</span>
      {children}
    </span>
  )
}

/**
 * Les budgets annuels qu'impliquent les prix unitaires, pour UN point de livraison.
 *
 * `null` si la consommation est inconnue : sans volume, un prix au MWh ne donne aucun budget, et
 * écrire 0 € ferait passer une offre non chiffrable pour gratuite.
 *
 * CE QUI N'EST PAS CALCULÉ, et pourquoi : l'acheminement électrique (TURPE) dépend d'un barème
 * réglementaire annuel que l'application ne connaît pas. On ne l'invente pas — il reste saisi, et le
 * total en tient compte quand il l'est. Côté gaz, l'ATRD et l'AGN sont des prix au MWh donnés par le
 * fournisseur : eux, on sait les multiplier.
 */
function budgetsDepuisPrix(opts: {
  gaz: boolean
  compteur: Compteur | undefined
  detail: OffreFournisseurCompteur | undefined
  /** Les prix APRÈS application de la saisie en cours, pas ceux encore en base. */
  prixGaz?: PrixOffreGaz | null
  prixElec?: PrixOffreElectricite | null
  /** La consommation à retenir, si la saisie en cours la change. */
  consoForcee?: number | null
}): { energie: number | null; contribution: number | null; total: number | null } {
  const { gaz, compteur, detail } = opts

  if (gaz) {
    const p = opts.prixGaz
    const conso = opts.consoForcee
      ?? detail?.consommation_annuelle_reference_mwh
      ?? p?.car_reference_mwh
      ?? compteur?.car_mwh
      ?? null
    if (conso == null) return { energie: null, contribution: null, total: null }
    const partEnergie = somme(p?.prix_energie_mwh, p?.prix_cee_mwh, p?.prix_cpb_mwh)
    const partAcheminement = somme(p?.prix_atrd_mwh, p?.prix_agn_mwh)
    const energie = partEnergie == null ? null : partEnergie * conso
    const contribution = partAcheminement == null && p?.cta_annuel_ht == null
      ? null
      : (partAcheminement ?? 0) * conso + (p?.cta_annuel_ht ?? 0)
    return {
      energie,
      contribution,
      total: somme(energie, p?.abonnement_fourniture_annuel_ht, contribution),
    }
  }

  // Électricité : chaque classe se valorise sur SA consommation, pas sur le total du PDL.
  const p = opts.prixElec
  const conso = opts.consoForcee
    ?? detail?.consommation_annuelle_reference_mwh
    ?? compteur?.consommation_annuelle_mwh
    ?? null
  const consoParClasse = compteur?.consoParClasseMwh ?? {}
  const classesSaisies = Object.entries(p?.prix_mwh_par_classe ?? {})
    .filter(([, v]) => v != null) as [string, number][]
  let energie: number | null = null
  for (const [classe, prix] of classesSaisies) {
    // À défaut de ventilation par classe, un tarif à une seule classe porte sur le volume total.
    const volume = consoParClasse[classe] ?? (classesSaisies.length === 1 ? conso : null)
    if (volume == null) continue
    energie = (energie ?? 0) + prix * volume
  }
  const contribution = detail?.cout_acheminement_annuel_ht ?? null
  return {
    energie,
    contribution,
    total: somme(energie, p?.abonnement_fourniture_annuel_ht, contribution),
  }
}

/** Les champs dont la saisie doit déclencher un recalcul des budgets. */
const CHAMPS_DE_PRIX = [
  'prix_energie_mwh', 'prix_cee_mwh', 'prix_cpb_mwh', 'prix_atrd_mwh', 'prix_agn_mwh',
  'cta_annuel_ht', 'abonnement_fourniture_annuel_ht', 'prix_mwh_par_classe',
  'consommation_annuelle_reference_mwh',
] as const

const PRIX_GAZ_VIDE: PrixOffreGaz = {
  type_prix: null, prix_energie_mwh: null, prix_cee_mwh: null, prix_cpb_mwh: null,
  prix_atrd_mwh: null, prix_agn_mwh: null, car_reference_mwh: null,
  abonnement_fourniture_annuel_ht: null, cta_annuel_ht: null,
}

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
      const prixGaz: PrixOffreGaz | null = gaz
        ? {
            ...PRIX_GAZ_VIDE,
            ...(detail?.prix_gaz ?? {}),
            ...(prix.prix_energie_mwh !== undefined ? { prix_energie_mwh: prix.prix_energie_mwh } : {}),
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
            prix_mwh_par_classe: Object.fromEntries(
              Object.entries({
                ...(detail?.prix_electricite?.prix_mwh_par_classe ?? {}),
                ...(prix.prix_mwh_par_classe ?? {}),
              }).filter(([, v]) => v != null) as [string, number][],
            ),
            abonnement_fourniture_annuel_ht: prix.abonnement_fourniture_annuel_ht !== undefined
              ? prix.abonnement_fourniture_annuel_ht
              : detail?.prix_electricite?.abonnement_fourniture_annuel_ht ?? null,
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
        ...(b.energie != null ? { cout_fourniture_annuel_ht: b.energie } : {}),
        ...(gaz && b.contribution != null ? { cout_acheminement_annuel_ht: b.contribution } : {}),
        ...(b.total != null ? { cout_total_annuel_estime_ht: b.total } : {}),
      }
    }

    try {
      await enregistrer.mutateAsync({ offreId: offre.id, versionCompteurId: lienId, energie, prix: patch })
      signaler(message)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
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
            const classes = gaz ? [] : classesDuCompteur(compteur)
            const base = { lienId: lien.lien_id, gaz, compteur, detail }
            const volumeConnu = gaz
              ? (detail?.consommation_annuelle_reference_mwh ?? detail?.prix_gaz?.car_reference_mwh ?? compteur?.car_mwh) != null
              : (detail?.consommation_annuelle_reference_mwh ?? compteur?.consommation_annuelle_mwh) != null

            return (
              <div key={lien.lien_id} className="rounded-kw-md border border-kw-border-subtle bg-kw-subtle px-2.5 py-2">
                {/* ── En-tête du point de livraison ── */}
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
                  <span className="flex-1" />
                  <span className="font-mono text-kw-tiny text-kw-faint">
                    {gaz
                      ? compteur?.car_mwh != null
                        ? `CAR ${compteur.car_mwh.toLocaleString('fr-FR')} MWh`
                        : 'CAR inconnue'
                      : compteur?.consommation_annuelle_mwh != null
                        ? `${compteur.consommation_annuelle_mwh.toLocaleString('fr-FR')} MWh/an`
                        : 'conso inconnue'}
                  </span>
                </div>

                {/* ── Prix unitaires à gauche, budgets annuels à droite ── */}
                <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 lg:grid-cols-[1.4fr_1fr]">
                  <div className="flex flex-col gap-2">
                    {gaz ? (
                      <>
                        <Groupe titre="Prix de l'énergie — €/MWh">
                          <Champ libelle="Molécule">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.prix_energie_mwh}
                              suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                              titre="Prix de la molécule, l'énergie nue"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { prix_energie_mwh: v, type_prix: offre.type_prix ?? null },
                                message: v != null ? `✓ Molécule : ${v.toLocaleString('fr-FR')} €/MWh` : 'Molécule effacée',
                              })}
                            />
                          </Champ>
                          <Champ libelle="CEE">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.prix_cee_mwh}
                              suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                              titre="Certificats d'économies d'énergie refacturés"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { prix_cee_mwh: v },
                                message: v != null ? `✓ CEE : ${v.toLocaleString('fr-FR')} €/MWh` : 'CEE effacée',
                              })}
                            />
                          </Champ>
                          <Champ libelle="CPB">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.prix_cpb_mwh}
                              suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                              titre="CPB"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { prix_cpb_mwh: v },
                                message: v != null ? `✓ CPB : ${v.toLocaleString('fr-FR')} €/MWh` : 'CPB effacé',
                              })}
                            />
                          </Champ>
                        </Groupe>

                        <Groupe titre="Abonnement">
                          <Champ libelle="Abonnement">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.abonnement_fourniture_annuel_ht}
                              suffixe="€/an" placeholder="— €/an" largeur="w-[86px]"
                              titre="Abonnement fourniture annuel HT"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { abonnement_fourniture_annuel_ht: v },
                                message: v != null ? `✓ Abonnement : ${v.toLocaleString('fr-FR')} €/an` : 'Abonnement effacé',
                              })}
                            />
                          </Champ>
                        </Groupe>

                        <Groupe titre="Contributions">
                          <Champ libelle="ATRD">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.prix_atrd_mwh}
                              suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                              titre="Accès des tiers au réseau de distribution, part variable"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { prix_atrd_mwh: v },
                                message: v != null ? `✓ ATRD : ${v.toLocaleString('fr-FR')} €/MWh` : 'ATRD effacé',
                              })}
                            />
                          </Champ>
                          <Champ libelle="AGN">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.prix_agn_mwh}
                              suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                              titre="AGN"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { prix_agn_mwh: v },
                                message: v != null ? `✓ AGN : ${v.toLocaleString('fr-FR')} €/MWh` : 'AGN effacé',
                              })}
                            />
                          </Champ>
                          <Champ libelle="CTA">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.cta_annuel_ht}
                              suffixe="€/an" placeholder="— €/an" largeur="w-[86px]"
                              titre="Contribution tarifaire d'acheminement — en €/an, pas au MWh"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { cta_annuel_ht: v },
                                message: v != null ? `✓ CTA : ${v.toLocaleString('fr-FR')} €/an` : 'CTA effacée',
                              })}
                            />
                          </Champ>
                        </Groupe>
                      </>
                    ) : (
                      <>
                        <Groupe titre="Prix de l'énergie — €/MWh">
                          {classes.map((classe) => (
                            <Champ key={classe} libelle={LIBELLE_CLASSE[classe] ?? classe}>
                              <ChampNombre
                                valeur={detail?.prix_electricite?.prix_mwh_par_classe?.[classe]}
                                suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                                titre={`Prix ${LIBELLE_CLASSE[classe] ?? classe} annoncé pour ce PDL`}
                                peutModifier={peutModifier}
                                onCommit={(v) => sauver({
                                  ...base,
                                  prix: { prix_mwh_par_classe: { [classe]: v }, type_prix: offre.type_prix ?? null },
                                  message: v != null
                                    ? `✓ ${LIBELLE_CLASSE[classe] ?? classe} : ${v.toLocaleString('fr-FR')} €/MWh`
                                    : 'Prix effacé',
                                })}
                              />
                            </Champ>
                          ))}
                        </Groupe>
                        <Groupe titre="Abonnement">
                          <Champ libelle="Abonnement">
                            <ChampNombre
                              valeur={detail?.prix_electricite?.abonnement_fourniture_annuel_ht}
                              suffixe="€/an" placeholder="— €/an" largeur="w-[86px]"
                              titre="Abonnement fourniture annuel HT"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { abonnement_fourniture_annuel_ht: v },
                                message: v != null ? `✓ Abonnement : ${v.toLocaleString('fr-FR')} €/an` : 'Abonnement effacé',
                              })}
                            />
                          </Champ>
                        </Groupe>
                      </>
                    )}
                  </div>

                  {/* ── Budgets annuels ── */}
                  <div className="flex flex-col gap-1 lg:border-l lg:border-kw-border-faint lg:pl-5">
                    <span className="text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">
                      Budget — €/an
                    </span>
                    <Champ libelle="Énergie">
                      <ChampNombre
                        valeur={detail?.cout_fourniture_annuel_ht}
                        suffixe="€/an" placeholder="— €/an" largeur="w-[90px]"
                        titre="Budget énergie annuel HT — recalculé à chaque saisie de prix"
                        peutModifier={peutModifier}
                        onCommit={(v) => sauver({
                          ...base,
                          prix: { cout_fourniture_annuel_ht: v },
                          message: v != null ? `✓ Budget énergie : ${v.toLocaleString('fr-FR')} €/an` : 'Budget énergie effacé',
                        })}
                      />
                    </Champ>
                    <Champ libelle="Abonnement">
                      {/* Miroir de l'abonnement saisi à gauche : un seul chiffre, une seule saisie. */}
                      {(() => {
                        const abo = gaz
                          ? detail?.prix_gaz?.abonnement_fourniture_annuel_ht
                          : detail?.prix_electricite?.abonnement_fourniture_annuel_ht
                        return abo != null ? (
                          <span className="font-mono text-kw-base font-bold text-kw-ink">
                            {abo.toLocaleString('fr-FR')} €/an
                          </span>
                        ) : (
                          <span className="font-mono text-kw-base text-kw-ghost">— €/an</span>
                        )
                      })()}
                    </Champ>
                    <Champ libelle="Contribution">
                      <ChampNombre
                        valeur={detail?.cout_acheminement_annuel_ht}
                        suffixe="€/an" placeholder="— €/an" largeur="w-[90px]"
                        titre={gaz
                          ? "Budget des contributions — recalculé depuis l'ATRD, l'AGN et la CTA"
                          : "Acheminement (TURPE) — à saisir : le barème réglementaire n'est pas dans l'application"}
                        peutModifier={peutModifier}
                        onCommit={(v) => sauver({
                          ...base,
                          prix: { cout_acheminement_annuel_ht: v },
                          message: v != null ? `✓ Budget contribution : ${v.toLocaleString('fr-FR')} €/an` : 'Budget contribution effacé',
                        })}
                      />
                    </Champ>
                    <Champ libelle="Total">
                      <ChampNombre
                        valeur={detail?.cout_total_annuel_estime_ht}
                        suffixe="€/an" placeholder="— €/an" largeur="w-[90px]"
                        titre="Budget total annuel HT — c'est ce montant qu'additionne la ligne de l'offre"
                        peutModifier={peutModifier}
                        onCommit={(v) => sauver({
                          ...base,
                          prix: { cout_total_annuel_estime_ht: v },
                          message: v != null ? `✓ Budget total : ${v.toLocaleString('fr-FR')} €/an` : 'Budget total effacé',
                        })}
                      />
                    </Champ>
                    <Champ libelle="Économie">
                      <ChampNombre
                        valeur={detail?.economie_annuelle_estimee}
                        suffixe="€/an" placeholder="— €/an" largeur="w-[90px]"
                        titre="Économie annuelle face au contrat en cours sur ce PDL"
                        peutModifier={peutModifier}
                        onCommit={(v) => sauver({
                          ...base,
                          prix: { economie_annuelle_estimee: v },
                          message: v != null ? `✓ Économie : ${v.toLocaleString('fr-FR')} €/an` : 'Économie effacée',
                        })}
                      />
                    </Champ>
                    <Champ libelle="Conso retenue">
                      <ChampNombre
                        valeur={detail?.consommation_annuelle_reference_mwh}
                        suffixe="MWh" placeholder="— MWh" largeur="w-[90px]"
                        titre="Consommation retenue par le fournisseur — c'est elle qui convertit les €/MWh en €/an"
                        peutModifier={peutModifier}
                        onCommit={(v) => sauver({
                          ...base,
                          prix: { consommation_annuelle_reference_mwh: v },
                          message: v != null ? `✓ Conso retenue : ${v.toLocaleString('fr-FR')} MWh` : 'Conso effacée',
                        })}
                      />
                    </Champ>

                    {/* Sans volume, aucun budget ne peut se déduire d'un prix au MWh. On le dit ici
                        plutôt que de laisser les budgets vides sans raison apparente. */}
                    {!volumeConnu && (
                      <p className="mt-0.5 text-kw-tiny leading-snug text-kw-amber-dark">
                        Consommation inconnue : les budgets ne peuvent pas se calculer. Saisissez la
                        conso retenue.
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Marges ── */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-kw-border-faint pt-1.5">
                  <Champ libelle="Marge retenue">
                    <ChampNombre
                      valeur={detail?.marge_retenue_eur_mwh}
                      suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                      titre="Marge décidée en cotant cette offre sur ce PDL"
                      peutModifier={peutModifier}
                      onCommit={(v) => sauver({
                        ...base,
                        prix: { marge_retenue_eur_mwh: v },
                        message: v != null ? `✓ Marge retenue : ${v.toLocaleString('fr-FR')} €/MWh` : 'Marge retenue effacée',
                      })}
                    />
                  </Champ>
                  <Champ libelle="Marge réelle">
                    <ChampNombre
                      valeur={detail?.marge_reelle_eur_mwh}
                      suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                      titre="Marge effectivement obtenue sur ce PDL"
                      peutModifier={peutModifier}
                      onCommit={(v) => sauver({
                        ...base,
                        prix: { marge_reelle_eur_mwh: v },
                        message: v != null ? `✓ Marge réelle : ${v.toLocaleString('fr-FR')} €/MWh` : 'Marge réelle effacée',
                      })}
                    />
                  </Champ>
                  {detail?.marge_retenue_eur_mwh != null && detail?.marge_reelle_eur_mwh != null
                    && detail.marge_reelle_eur_mwh !== detail.marge_retenue_eur_mwh && (
                    <span
                      className={cn(
                        'rounded-kw-xs px-1.5 py-px text-kw-micro font-extrabold uppercase tracking-[0.05em]',
                        detail.marge_reelle_eur_mwh < detail.marge_retenue_eur_mwh
                          ? 'bg-kw-red-light text-kw-red'
                          : 'bg-kw-green-light text-kw-green',
                      )}
                      title="Écart entre la marge obtenue et celle décidée en cotant"
                    >
                      {detail.marge_reelle_eur_mwh > detail.marge_retenue_eur_mwh ? '+' : ''}
                      {(detail.marge_reelle_eur_mwh - detail.marge_retenue_eur_mwh).toLocaleString('fr-FR', {
                        maximumFractionDigits: 2,
                      })}{' '}
                      €/MWh
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

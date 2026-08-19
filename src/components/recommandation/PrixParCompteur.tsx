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

/**
 * Ajouter une classe que le compteur ne déclare pas.
 *
 * POURQUOI C'EST NÉCESSAIRE. `classesDuCompteur` lit les volumes venus d'Enedis, et ces volumes
 * manquent souvent : sur 2193 compteurs C5, 302 déclarent BASE, 61 déclarent HP/HC, et 1802 — 82 % —
 * ne déclarent AUCUNE classe (vérifié le 19/08/2026 ; ni profil_tarifaire, ni tarif_distribution, ni
 * profil_consommation ne comblent le trou, les trois sont vides sur ces 1802). Sans ce sélecteur, un
 * C5 réellement en heures pleines / creuses n'offrait qu'un champ « Base » et son prix ne pouvait pas
 * être saisi du tout.
 *
 * L'ajout ne vaut que pour l'affichage en cours : il ne modifie pas le compteur, il ouvre un champ.
 * Le prix saisi, lui, est bien enregistré sur sa classe.
 */
function AjouterClasse({ presentes, onAjouter }: {
  presentes: string[]
  onAjouter: (classe: string) => void
}) {
  const absentes = ORDRE_CLASSES.filter((c) => !presentes.includes(c))
  if (absentes.length === 0) return null
  return (
    <label className="flex items-center gap-1 text-kw-tiny text-kw-meta">
      <span className="sr-only">Ajouter une classe tarifaire</span>
      <select
        value=""
        onChange={(e) => { if (e.target.value) onAjouter(e.target.value) }}
        title="Le compteur ne déclare pas cette classe, mais le fournisseur la cote : l'ajouter ouvre son champ de saisie."
        className="cursor-pointer rounded-kw-xs border border-dashed border-kw-border-strong bg-transparent px-1.5 py-px text-kw-micro font-bold text-kw-meta hover:border-kw-green hover:text-kw-green"
      >
        <option value="">+ classe</option>
        {absentes.map((c) => <option key={c} value={c}>{LIBELLE_CLASSE[c] ?? c}</option>)}
      </select>
    </label>
  )
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
  // Les classes ouvertes à la main, par point de livraison — voir AjouterClasse pour le pourquoi.
  const [classesEnPlus, setClassesEnPlus] = useState<Record<string, string[]>>({})
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
            // Les classes du compteur, plus celles qu'on a ouvertes à la main sur ce PDL, remises
            // dans l'ordre d'un tarif pour que la lecture ne dépende pas de l'ordre des clics.
            const classes = gaz
              ? []
              : ORDRE_CLASSES.filter((c) => classesDuCompteur(compteur).includes(c)
                  || (classesEnPlus[lien.lien_id] ?? []).includes(c))
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
                  {/* Le formulaire complet, demandé par Michel le 19/08/2026. Les champs inline
                      restent : ils vont plus vite pour corriger UNE valeur, la modale sert à saisir
                      une grille entière et montre les budgets avant d'enregistrer. */}
                  {peutModifier && (
                    <button
                      type="button"
                      onClick={() => setSaisieOuverte(lien.lien_id)}
                      className="inline-flex items-center gap-1 rounded-kw-xs border border-kw-border-strong bg-white px-1.5 py-px text-kw-micro font-bold text-kw-label hover:border-kw-green hover:text-kw-green"
                    >
                      <PenLine className="h-2.5 w-2.5" />
                      Saisir les prix
                    </button>
                  )}
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

                <SaisiePrixDialog
                  ouvert={saisieOuverte === lien.lien_id}
                  onFermer={() => setSaisieOuverte(null)}
                  gaz={gaz}
                  compteur={compteur}
                  libelleCompteur={compteur?.numero_pdl || compteur?.utilisation || lien.label || 'Compteur'}
                  detail={detail}
                  enCours={enregistrer.isPending}
                  onEnregistrer={(prix) => sauver({ ...base, prix, message: '✓ Prix enregistrés' })}
                />

                {/* ── Prix unitaires à gauche, budgets annuels à droite ── */}
                <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 lg:grid-cols-[1.4fr_1fr]">
                  <div className="flex flex-col gap-2">
                    {gaz ? (
                      <>
                        <Groupe titre="Prix de l'énergie — €/MWh">
                          {/* CALCULÉE depuis le 19/08/2026, et non plus saisie : Michel — « le prix
                              de la molécule ne peut pas être saisi de manière brute », c'est le prix
                              présenté au client. Il se tape en deux morceaux plus bas, P0 et marge. */}
                          <Champ libelle="Molécule">
                            {(() => {
                              const m = moleculePresentee(
                                detail?.prix_gaz?.prix_molecule_p0_mwh,
                                detail?.marge_reelle_eur_mwh,
                              )
                              return m != null ? (
                                <span
                                  title="Molécule P0 + marge de référence — c'est le prix présenté au client, et c'est lui qui entre dans le budget énergie"
                                  className="cursor-help font-mono text-kw-base font-bold text-kw-ink"
                                >
                                  {m.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh
                                </span>
                              ) : (
                                <span
                                  title="Se calcule dès que la molécule P0 ou la marge de référence est saisie, en bas de ce bloc"
                                  className="cursor-help font-mono text-kw-base text-kw-ghost"
                                >
                                  — €/MWh
                                </span>
                              )
                            })()}
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
                        {/* CALCULÉS depuis le 19/08/2026, comme la molécule au gaz : chaque classe
                            vaut son P0 plus la marge de référence. Les P0 se saisissent juste après. */}
                        <Groupe titre="Prix de l'énergie — €/MWh">
                          {classes.map((classe) => {
                            const px = moleculePresentee(
                              detail?.prix_electricite?.p0_mwh_par_classe?.[classe],
                              detail?.marge_reelle_eur_mwh,
                            )
                            return (
                              <Champ key={classe} libelle={LIBELLE_CLASSE[classe] ?? classe}>
                                {px != null ? (
                                  <span
                                    title={`P0 ${LIBELLE_CLASSE[classe] ?? classe} + marge de référence — prix présenté au client`}
                                    className="cursor-help font-mono text-kw-base font-bold text-kw-ink"
                                  >
                                    {px.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh
                                  </span>
                                ) : (
                                  <span
                                    title={`Se calcule dès que le P0 ${LIBELLE_CLASSE[classe] ?? classe} ou la marge est saisi`}
                                    className="cursor-help font-mono text-kw-base text-kw-ghost"
                                  >
                                    — €/MWh
                                  </span>
                                )}
                              </Champ>
                            )
                          })}
                        </Groupe>
                        <Groupe titre="Abonnement et acheminement — €/an">
                          <Champ libelle="Abonnement">
                            <ChampNombre
                              valeur={detail?.prix_electricite?.abonnement_fourniture_annuel_ht}
                              suffixe="€/an" placeholder="— €/an" largeur="w-[86px]"
                              titre="Abonnement fourniture annuel HT. En électricité il est compté DANS le budget énergie, contrairement au gaz où il fait son propre budget."
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { abonnement_fourniture_annuel_ht: v },
                                message: v != null ? `✓ Abonnement : ${v.toLocaleString('fr-FR')} €/an` : 'Abonnement effacé',
                              })}
                            />
                          </Champ>
                          {/* Saisi à la main, assumé provisoire : Michel, 19/08/2026 — « dans un
                              premier temps on pourra le calculer nous-mêmes avec Kiwee Tools ». Le
                              barème réglementaire n'est pas dans l'application. */}
                          <Champ libelle="Prix TURPE">
                            <ChampNombre
                              valeur={detail?.prix_electricite?.prix_turpe_annuel_ht}
                              suffixe="€/an" placeholder="— €/an" largeur="w-[86px]"
                              titre="TURPE annuel HT de ce PDL, en €/an et non au MWh. À calculer à côté puis reporter ici — il alimente le budget TURPE de l'offre."
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver({
                                ...base,
                                prix: { prix_turpe_annuel_ht: v },
                                message: v != null ? `✓ Prix TURPE : ${v.toLocaleString('fr-FR')} €/an` : 'Prix TURPE effacé',
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
                    <Champ libelle={gaz ? 'Contribution' : 'TURPE'}>
                      <ChampNombre
                        valeur={detail?.cout_acheminement_annuel_ht}
                        suffixe="€/an" placeholder="— €/an" largeur="w-[90px]"
                        titre={gaz
                          ? "Budget des contributions — recalculé depuis l'ATRD, l'AGN et la CTA"
                          : 'Budget TURPE — reprend le prix TURPE saisi à gauche'}
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

                {/* ── Ce qui compose la molécule ──
                    Michel, 19/08/2026 : « là où tu as mis les informations de marge de référence, ici
                    je mettrai molécule P0, marge de référence tout simplement. Et c'est ça qui calcule
                    molécule. » Les deux seules saisies, côte à côte, à l'endroit où on lit le résultat.

                    MARGE AJUSTABLE ET MARGE RETENUE SONT PARTIES : « on n'a plus besoin des trois
                    autres types de marge, on a besoin d'une seule marge […] dès que je change la
                    marge, ce sera forcément la marge réelle que j'ajoute. » Leurs colonnes restent en
                    base, vides — la logique a changé trois fois ce matin, un drop ne se rejoue pas. */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-kw-border-faint pt-1.5">
                  {!gaz && (
                    <Groupe titre="P0 · Prix de l'énergie — €/MWh">
                      {classes.map((classe) => (
                        <Champ key={classe} libelle={LIBELLE_CLASSE[classe] ?? classe}>
                          <ChampNombre
                            valeur={detail?.prix_electricite?.p0_mwh_par_classe?.[classe]}
                            suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                            titre={`P0 ${LIBELLE_CLASSE[classe] ?? classe} : prix net du fournisseur pour cette classe, hors marge`}
                            peutModifier={peutModifier}
                            onCommit={(v) => sauver({
                              ...base,
                              prix: { p0_mwh_par_classe: { [classe]: v }, type_prix: offre.type_prix ?? null },
                              message: v != null
                                ? `✓ P0 ${LIBELLE_CLASSE[classe] ?? classe} : ${v.toLocaleString('fr-FR')} €/MWh`
                                : 'P0 effacé',
                            })}
                          />
                        </Champ>
                      ))}
                      <AjouterClasse
                        presentes={classes}
                        onAjouter={(classe) => setClassesEnPlus((m) => ({
                          ...m,
                          [lien.lien_id]: [...(m[lien.lien_id] ?? []), classe],
                        }))}
                      />
                    </Groupe>
                  )}
                  {gaz && (
                    <Champ libelle="Molécule P0">
                      <ChampNombre
                        valeur={detail?.prix_gaz?.prix_molecule_p0_mwh}
                        suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                        titre="Prix net de la molécule, hors marge — le P0 du fournisseur"
                        peutModifier={peutModifier}
                        onCommit={(v) => sauver({
                          ...base,
                          prix: { prix_molecule_p0_mwh: v, type_prix: offre.type_prix ?? null },
                          message: v != null ? `✓ Molécule P0 : ${v.toLocaleString('fr-FR')} €/MWh` : 'Molécule P0 effacée',
                        })}
                      />
                    </Champ>
                  )}
                  <Champ libelle="Marge référence">
                    <ChampNombre
                      valeur={detail?.marge_reelle_eur_mwh}
                      suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                      titre={gaz
                        ? 'La marge, en €/MWh. La changer change la molécule présentée, et donc le budget énergie.'
                        : "La marge, en €/MWh. Elle s'ajoute à CHAQUE classe tarifaire, et change donc tous les prix présentés."}
                      peutModifier={peutModifier}
                      onCommit={(v) => sauver({
                        ...base,
                        prix: { marge_reelle_eur_mwh: v },
                        message: v != null ? `✓ Marge référence : ${v.toLocaleString('fr-FR')} €/MWh` : 'Marge référence effacée',
                      })}
                    />
                  </Champ>
                  <span className="text-kw-tiny text-kw-faint">
                    {gaz
                      ? 'Molécule = Molécule P0 + Marge référence'
                      : 'Chaque prix de classe = son P0 + Marge référence'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

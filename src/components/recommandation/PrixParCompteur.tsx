import { useState } from 'react'
import { ChevronDown, ChevronRight, Zap, Flame, ExternalLink, Calculator } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ChampNombre } from '@/components/ui/champ-nombre'
import { useEnregistrerPrixCompteur, type PrixParCompteur as PrixSaisi } from '@/lib/data/recommandations'
import type { OffreFournisseur, OffreFournisseurCompteur, VersionRecommandation, Compteur } from '@/types/domain'

/**
 * Les prix d'une offre, point de livraison par point de livraison.
 *
 * Demande de la réunion du 17/08/2026 : « Erwan vient saisir les prix dans les compteurs concernés,
 * sachant que dans une offre il peut y avoir plusieurs compteurs, et gaz et élec mélangés. »
 *
 * NAVIGABLE ET PAS SEULEMENT AFFICHÉ : chaque point de livraison renvoie vers sa fiche compteur.
 * C'est le point sur lequel Naoëlle a insisté — la hiérarchie doit se parcourir, pas se contempler.
 *
 * DEUX COLONNES, ET C'EST LA STRUCTURE DE L'ÉCRAN (demande du 19/08/2026) : à gauche les prix
 * unitaires tels que le fournisseur les décompose, à droite ce que ça donne en budget annuel. Les
 * deux se lisent ensemble — un prix au MWh ne dit rien sans le volume, un budget ne dit rien sans le
 * prix qui l'a produit.
 *
 * POURQUOI PAS LES HUIT CLASSES DE PRIX EN ÉLECTRICITÉ. Huit classes et sept puissances font quinze
 * champs par compteur, presque tous vides. On n'affiche que les classes que le compteur CONSOMME
 * réellement, lues dans `consoParClasseMwh` (renseigné par la synchronisation Enedis). Un C5 en base
 * n'a qu'un champ, un C3 en a quatre. Sans information de consommation on propose Base.
 *
 * LE GAZ EST DÉCOMPOSÉ, l'électricité pas encore : les composantes ne sont pas les mêmes (TURPE au
 * lieu d'ATRD, accise, pas de CPB) et personne ne les a cadrées. Recopier la structure gaz sur
 * l'électricité aurait produit des champs qui ne veulent rien dire.
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
 * Le budget annuel que les prix unitaires impliquent.
 *
 * Rendu séparément de la saisie : on le PROPOSE, on ne l'écrit jamais tout seul. Un budget calculé
 * qui s'installerait sans geste humain deviendrait indiscernable d'un budget reçu du fournisseur, et
 * c'est exactement ce qu'il ne faut pas pour un chiffre qui part au client.
 */
function budgetsGazCalcules(detail: OffreFournisseurCompteur | undefined, compteur: Compteur | undefined) {
  const p = detail?.prix_gaz
  const car = detail?.consommation_annuelle_reference_mwh ?? p?.car_reference_mwh ?? compteur?.car_mwh ?? null
  if (car == null) return null
  const somme = (...v: (number | null | undefined)[]) =>
    v.reduce<number | null>((t, x) => (x == null ? t : (t ?? 0) + x), null)

  const partEnergie = somme(p?.prix_energie_mwh, p?.prix_cee_mwh, p?.prix_cpb_mwh)
  const partContribution = somme(p?.prix_atrd_mwh, p?.prix_agn_mwh)
  const energie = partEnergie == null ? null : partEnergie * car
  const contribution =
    partContribution == null && p?.cta_annuel_ht == null
      ? null
      : (partContribution ?? 0) * car + (p?.cta_annuel_ht ?? 0)
  const abonnement = p?.abonnement_fourniture_annuel_ht ?? null
  const total = somme(energie, abonnement, contribution)
  return { car, energie, abonnement, contribution, total }
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

  async function sauver(lienId: string, energie: 'electricite' | 'gaz', prix: PrixSaisi, message: string) {
    try {
      await enregistrer.mutateAsync({ offreId: offre.id, versionCompteurId: lienId, energie, prix })
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
            const calcule = gaz ? budgetsGazCalcules(detail, compteur) : null

            return (
              <div key={lien.lien_id} className="rounded-kw-md border border-kw-border-subtle bg-kw-subtle px-2.5 py-2">
                {/* ── En-tête du PDL ── */}
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
                              onCommit={(v) => sauver(lien.lien_id, 'gaz',
                                { prix_energie_mwh: v, type_prix: offre.type_prix ?? null },
                                v != null ? `✓ Molécule : ${v.toLocaleString('fr-FR')} €/MWh` : 'Molécule effacée')}
                            />
                          </Champ>
                          <Champ libelle="CEE">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.prix_cee_mwh}
                              suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                              titre="Certificats d'économies d'énergie refacturés"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver(lien.lien_id, 'gaz', { prix_cee_mwh: v },
                                v != null ? `✓ CEE : ${v.toLocaleString('fr-FR')} €/MWh` : 'CEE effacée')}
                            />
                          </Champ>
                          <Champ libelle="CPB">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.prix_cpb_mwh}
                              suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                              titre="CPB"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver(lien.lien_id, 'gaz', { prix_cpb_mwh: v },
                                v != null ? `✓ CPB : ${v.toLocaleString('fr-FR')} €/MWh` : 'CPB effacé')}
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
                              onCommit={(v) => sauver(lien.lien_id, 'gaz', { abonnement_fourniture_annuel_ht: v },
                                v != null ? `✓ Abonnement : ${v.toLocaleString('fr-FR')} €/an` : 'Abonnement effacé')}
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
                              onCommit={(v) => sauver(lien.lien_id, 'gaz', { prix_atrd_mwh: v },
                                v != null ? `✓ ATRD : ${v.toLocaleString('fr-FR')} €/MWh` : 'ATRD effacé')}
                            />
                          </Champ>
                          <Champ libelle="AGN">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.prix_agn_mwh}
                              suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                              titre="AGN"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver(lien.lien_id, 'gaz', { prix_agn_mwh: v },
                                v != null ? `✓ AGN : ${v.toLocaleString('fr-FR')} €/MWh` : 'AGN effacé')}
                            />
                          </Champ>
                          <Champ libelle="CTA">
                            <ChampNombre
                              valeur={detail?.prix_gaz?.cta_annuel_ht}
                              suffixe="€/an" placeholder="— €/an" largeur="w-[86px]"
                              titre="Contribution tarifaire d'acheminement — en €/an, pas au MWh"
                              peutModifier={peutModifier}
                              onCommit={(v) => sauver(lien.lien_id, 'gaz', { cta_annuel_ht: v },
                                v != null ? `✓ CTA : ${v.toLocaleString('fr-FR')} €/an` : 'CTA effacée')}
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
                                onCommit={(v) => sauver(lien.lien_id, 'electricite',
                                  { prix_mwh_par_classe: { [classe]: v }, type_prix: offre.type_prix ?? null },
                                  v != null
                                    ? `✓ ${LIBELLE_CLASSE[classe] ?? classe} : ${v.toLocaleString('fr-FR')} €/MWh`
                                    : 'Prix effacé')}
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
                              onCommit={(v) => sauver(lien.lien_id, 'electricite', { abonnement_fourniture_annuel_ht: v },
                                v != null ? `✓ Abonnement : ${v.toLocaleString('fr-FR')} €/an` : 'Abonnement effacé')}
                            />
                          </Champ>
                        </Groupe>
                      </>
                    )}
                  </div>

                  {/* ── Les budgets annuels ── */}
                  <div className="flex flex-col gap-2 lg:border-l lg:border-kw-border-faint lg:pl-5">
                    <Groupe titre="Budget — €/an">
                      <div className="flex w-full flex-col gap-1">
                        <Champ libelle="Énergie">
                          <ChampNombre
                            valeur={detail?.cout_fourniture_annuel_ht}
                            suffixe="€/an" placeholder="— €/an" largeur="w-[90px]"
                            titre="Budget énergie annuel HT pour ce PDL"
                            peutModifier={peutModifier}
                            onCommit={(v) => sauver(lien.lien_id, gaz ? 'gaz' : 'electricite',
                              { cout_fourniture_annuel_ht: v },
                              v != null ? `✓ Budget énergie : ${v.toLocaleString('fr-FR')} €/an` : 'Budget énergie effacé')}
                          />
                        </Champ>
                        <Champ libelle="Abonnement">
                          {/* Miroir de l'abonnement saisi à gauche : un seul chiffre, une seule saisie. */}
                          <span className="font-mono text-kw-base font-bold text-kw-ink">
                            {(gaz
                              ? detail?.prix_gaz?.abonnement_fourniture_annuel_ht
                              : detail?.prix_electricite?.abonnement_fourniture_annuel_ht) != null
                              ? `${(gaz
                                  ? detail!.prix_gaz!.abonnement_fourniture_annuel_ht!
                                  : detail!.prix_electricite!.abonnement_fourniture_annuel_ht!
                                ).toLocaleString('fr-FR')} €/an`
                              : <span className="font-normal text-kw-ghost">— €/an</span>}
                          </span>
                        </Champ>
                        <Champ libelle="Contribution">
                          <ChampNombre
                            valeur={detail?.cout_acheminement_annuel_ht}
                            suffixe="€/an" placeholder="— €/an" largeur="w-[90px]"
                            titre="Budget des contributions : acheminement et taxes"
                            peutModifier={peutModifier}
                            onCommit={(v) => sauver(lien.lien_id, gaz ? 'gaz' : 'electricite',
                              { cout_acheminement_annuel_ht: v },
                              v != null ? `✓ Budget contribution : ${v.toLocaleString('fr-FR')} €/an` : 'Budget contribution effacé')}
                          />
                        </Champ>
                        <Champ libelle="Total">
                          <ChampNombre
                            valeur={detail?.cout_total_annuel_estime_ht}
                            suffixe="€/an" placeholder="— €/an" largeur="w-[90px]"
                            titre="Budget total annuel HT — c'est ce montant qu'additionne le comparatif"
                            peutModifier={peutModifier}
                            onCommit={(v) => sauver(lien.lien_id, gaz ? 'gaz' : 'electricite',
                              { cout_total_annuel_estime_ht: v },
                              v != null ? `✓ Budget total : ${v.toLocaleString('fr-FR')} €/an` : 'Budget total effacé')}
                          />
                        </Champ>
                        <Champ libelle="Économie">
                          <ChampNombre
                            valeur={detail?.economie_annuelle_estimee}
                            suffixe="€/an" placeholder="— €/an" largeur="w-[90px]"
                            titre="Économie annuelle face au contrat en cours sur ce PDL"
                            peutModifier={peutModifier}
                            onCommit={(v) => sauver(lien.lien_id, gaz ? 'gaz' : 'electricite',
                              { economie_annuelle_estimee: v },
                              v != null ? `✓ Économie : ${v.toLocaleString('fr-FR')} €/an` : 'Économie effacée')}
                          />
                        </Champ>
                        <Champ libelle="Conso retenue">
                          <ChampNombre
                            valeur={detail?.consommation_annuelle_reference_mwh}
                            suffixe="MWh" placeholder="— MWh" largeur="w-[90px]"
                            titre="Consommation de référence retenue par le fournisseur — c'est elle qui convertit les €/MWh en €/an"
                            peutModifier={peutModifier}
                            onCommit={(v) => sauver(lien.lien_id, gaz ? 'gaz' : 'electricite',
                              { consommation_annuelle_reference_mwh: v },
                              v != null ? `✓ Conso retenue : ${v.toLocaleString('fr-FR')} MWh` : 'Conso effacée')}
                          />
                        </Champ>
                      </div>
                    </Groupe>

                    {/*
                      Le calcul est PROPOSÉ, jamais appliqué tout seul. Un budget qui s'installerait
                      sans geste humain deviendrait indiscernable d'un budget reçu du fournisseur —
                      et c'est un chiffre qui part au client.
                    */}
                    {gaz && peutModifier && calcule && calcule.total != null && (
                      <button
                        type="button"
                        title={`Sur ${calcule.car.toLocaleString('fr-FR')} MWh : énergie ${Math.round(calcule.energie ?? 0).toLocaleString('fr-FR')} € + abonnement ${Math.round(calcule.abonnement ?? 0).toLocaleString('fr-FR')} € + contributions ${Math.round(calcule.contribution ?? 0).toLocaleString('fr-FR')} €`}
                        onClick={() => sauver(lien.lien_id, 'gaz', {
                          cout_fourniture_annuel_ht: calcule.energie,
                          cout_acheminement_annuel_ht: calcule.contribution,
                          cout_total_annuel_estime_ht: calcule.total,
                          consommation_annuelle_reference_mwh: calcule.car,
                        }, `✓ Budgets calculés sur ${calcule.car.toLocaleString('fr-FR')} MWh`)}
                        className="inline-flex items-center gap-1.5 self-start rounded-kw-sm border border-dashed border-kw-border-strong px-2 py-0.5 text-kw-base font-semibold text-kw-meta hover:border-kw-green hover:text-kw-green"
                      >
                        <Calculator className="h-3 w-3" />
                        Calculer d'après les prix ({Math.round(calcule.total).toLocaleString('fr-FR')} €/an)
                      </button>
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
                      onCommit={(v) => sauver(lien.lien_id, gaz ? 'gaz' : 'electricite', { marge_retenue_eur_mwh: v },
                        v != null ? `✓ Marge retenue : ${v.toLocaleString('fr-FR')} €/MWh` : 'Marge retenue effacée')}
                    />
                  </Champ>
                  <Champ libelle="Marge réelle">
                    <ChampNombre
                      valeur={detail?.marge_reelle_eur_mwh}
                      suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[76px]"
                      titre="Marge effectivement obtenue sur ce PDL"
                      peutModifier={peutModifier}
                      onCommit={(v) => sauver(lien.lien_id, gaz ? 'gaz' : 'electricite', { marge_reelle_eur_mwh: v },
                        v != null ? `✓ Marge réelle : ${v.toLocaleString('fr-FR')} €/MWh` : 'Marge réelle effacée')}
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

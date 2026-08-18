import { useState } from 'react'
import { ChevronDown, ChevronRight, Zap, Flame, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ChampNombre } from '@/components/ui/champ-nombre'
import { useEnregistrerPrixCompteur, type PrixParCompteur as PrixSaisi } from '@/lib/data/recommandations'
import type { OffreFournisseur, VersionRecommandation, Compteur } from '@/types/domain'

/**
 * Les prix d'une offre, point de livraison par point de livraison.
 *
 * Demande de la réunion du 17/08/2026 : « Erwan vient saisir les prix dans les compteurs concernés,
 * sachant que dans une offre il peut y avoir plusieurs compteurs, et gaz et élec mélangés. »
 *
 * NAVIGABLE ET PAS SEULEMENT AFFICHÉ : chaque point de livraison renvoie vers sa fiche compteur.
 * C'est le point sur lequel Naoëlle a insisté — la hiérarchie doit se parcourir, pas se contempler.
 *
 * POURQUOI PAS LES HUIT CLASSES DE PRIX. L'électricité en compte huit (base, HP, HC, HPH, HCH, HPE,
 * HCE, pointe), et quinze champs par compteur avec les puissances — dont l'immense majorité vides. On
 * n'affiche donc que les classes que le compteur CONSOMME réellement, lues dans `consoParClasseMwh`
 * (renseigné par la synchronisation Enedis). Un C5 en base n'a qu'un champ, un C3 en a quatre. Sans
 * information de consommation on propose Base : c'est le cas le plus courant, et le prix reste
 * saisissable.
 *
 * Le gaz n'a qu'un prix d'énergie — même structure, formulaire plus court.
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

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {gaz ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Prix énergie</span>
                        <ChampNombre
                          valeur={detail?.prix_gaz?.prix_energie_mwh}
                          suffixe="€/MWh"
                          placeholder="— €/MWh"
                          decimales={2}
                          largeur="w-[80px]"
                          titre="Prix de l'énergie annoncé pour ce PDL"
                          peutModifier={peutModifier}
                          onCommit={(v) => sauver(
                            lien.lien_id,
                            'gaz',
                            { prix_energie_mwh: v, type_prix: offre.type_prix ?? null },
                            v != null ? `✓ ${lien.label} : ${v.toLocaleString('fr-FR')} €/MWh` : 'Prix effacé',
                          )}
                        />
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Abonnement</span>
                        <ChampNombre
                          valeur={detail?.prix_gaz?.abonnement_fourniture_annuel_ht}
                          suffixe="€/an"
                          placeholder="— €/an"
                          largeur="w-[80px]"
                          titre="Abonnement fourniture annuel HT"
                          peutModifier={peutModifier}
                          onCommit={(v) => sauver(
                            lien.lien_id,
                            'gaz',
                            { abonnement_fourniture_annuel_ht: v },
                            v != null ? `✓ Abonnement : ${v.toLocaleString('fr-FR')} €/an` : 'Abonnement effacé',
                          )}
                        />
                      </span>
                    </>
                  ) : (
                    <>
                      {classes.map((classe) => (
                        <span key={classe} className="flex items-center gap-1.5">
                          <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">
                            {LIBELLE_CLASSE[classe] ?? classe}
                          </span>
                          <ChampNombre
                            valeur={detail?.prix_electricite?.prix_mwh_par_classe?.[classe]}
                            suffixe="€/MWh"
                            placeholder="— €/MWh"
                            decimales={2}
                            largeur="w-[80px]"
                            titre={`Prix ${LIBELLE_CLASSE[classe] ?? classe} annoncé pour ce PDL`}
                            peutModifier={peutModifier}
                            onCommit={(v) => sauver(
                              lien.lien_id,
                              'electricite',
                              { prix_mwh_par_classe: { [classe]: v }, type_prix: offre.type_prix ?? null },
                              v != null
                                ? `✓ ${LIBELLE_CLASSE[classe] ?? classe} : ${v.toLocaleString('fr-FR')} €/MWh`
                                : 'Prix effacé',
                            )}
                          />
                        </span>
                      ))}
                      <span className="flex items-center gap-1.5">
                        <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Abonnement</span>
                        <ChampNombre
                          valeur={detail?.prix_electricite?.abonnement_fourniture_annuel_ht}
                          suffixe="€/an"
                          placeholder="— €/an"
                          largeur="w-[80px]"
                          titre="Abonnement fourniture annuel HT"
                          peutModifier={peutModifier}
                          onCommit={(v) => sauver(
                            lien.lien_id,
                            'electricite',
                            { abonnement_fourniture_annuel_ht: v },
                            v != null ? `✓ Abonnement : ${v.toLocaleString('fr-FR')} €/an` : 'Abonnement effacé',
                          )}
                        />
                      </span>
                    </>
                  )}
                </div>

                {/*
                  Les marges de KiWee sur ce PDL (demande de Michel, 18/08/2026). En €/MWh, comme un
                  courtier les décide. Les deux sont côte à côte pour que l'ÉCART se voie : c'est lui
                  qui dit si la cotation a tenu ses promesses, et il ne saute pas aux yeux quand les
                  deux chiffres vivent dans deux écrans.
                */}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-kw-border-faint pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Marge retenue</span>
                    <ChampNombre
                      valeur={detail?.marge_retenue_eur_mwh}
                      suffixe="€/MWh"
                      placeholder="— €/MWh"
                      decimales={2}
                      largeur="w-[80px]"
                      titre="Marge décidée en cotant cette offre sur ce PDL"
                      peutModifier={peutModifier}
                      onCommit={(v) => sauver(
                        lien.lien_id,
                        gaz ? 'gaz' : 'electricite',
                        { marge_retenue_eur_mwh: v },
                        v != null ? `✓ Marge retenue : ${v.toLocaleString('fr-FR')} €/MWh` : 'Marge retenue effacée',
                      )}
                    />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Marge réelle</span>
                    <ChampNombre
                      valeur={detail?.marge_reelle_eur_mwh}
                      suffixe="€/MWh"
                      placeholder="— €/MWh"
                      decimales={2}
                      largeur="w-[80px]"
                      titre="Marge effectivement obtenue sur ce PDL"
                      peutModifier={peutModifier}
                      onCommit={(v) => sauver(
                        lien.lien_id,
                        gaz ? 'gaz' : 'electricite',
                        { marge_reelle_eur_mwh: v },
                        v != null ? `✓ Marge réelle : ${v.toLocaleString('fr-FR')} €/MWh` : 'Marge réelle effacée',
                      )}
                    />
                  </span>
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

                {/* Le coût annuel de CE PDL : c'est lui qu'additionne le comparatif, et c'est lui qui
                    permet de calculer un prix moyen pondéré par les volumes. */}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-kw-border-faint pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Coût fourniture</span>
                    <ChampNombre
                      valeur={detail?.cout_fourniture_annuel_ht}
                      suffixe="€/an"
                      placeholder="— €/an"
                      titre="Coût de fourniture annuel HT pour ce PDL"
                      peutModifier={peutModifier}
                      onCommit={(v) => sauver(
                        lien.lien_id,
                        gaz ? 'gaz' : 'electricite',
                        { cout_fourniture_annuel_ht: v },
                        v != null ? `✓ Coût fourniture : ${v.toLocaleString('fr-FR')} €/an` : 'Coût effacé',
                      )}
                    />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Conso retenue</span>
                    <ChampNombre
                      valeur={detail?.consommation_annuelle_reference_mwh}
                      suffixe="MWh"
                      placeholder="— MWh"
                      titre="Consommation de référence retenue par le fournisseur"
                      peutModifier={peutModifier}
                      onCommit={(v) => sauver(
                        lien.lien_id,
                        gaz ? 'gaz' : 'electricite',
                        { consommation_annuelle_reference_mwh: v },
                        v != null ? `✓ Conso retenue : ${v.toLocaleString('fr-FR')} MWh` : 'Conso effacée',
                      )}
                    />
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

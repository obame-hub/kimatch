import { useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { ChampNombre } from '@/components/ui/champ-nombre'
import {
  budgetsDepuisPrix,
  classesDuCompteur,
  LIBELLE_CLASSE,
  moleculePresentee,
  ORDRE_CLASSES,
  PRIX_GAZ_VIDE,
} from '@/lib/calculs/prixOffre'
import type { PrixParCompteur as PrixSaisi } from '@/lib/data/recommandations'
import type { Compteur, OffreFournisseurCompteur, PrixOffreElectricite } from '@/types/domain'

/**
 * Saisir d'un coup tous les prix d'une offre sur UN point de livraison.
 *
 * DEMANDE DE MICHEL, 19/08/2026 : « il vous faudra avoir une espèce de formulaire qui permet
 * justement la saisie des informations. » La saisie inline du dépliant tenait quand un compteur gaz
 * avait trois champs ; elle ne tient plus avec huit P0, huit prix présentés, l'abonnement, le TURPE,
 * la marge, la consommation et cinq budgets.
 *
 * CE QUE LE FORMULAIRE APPORTE, au-delà de la place :
 *
 *   · les budgets se recalculent À CHAQUE FRAPPE, avant d'enregistrer quoi que ce soit — on voit
 *     l'effet d'une marge ou d'un P0 sans avoir à valider pour le découvrir ;
 *   · une seule écriture à la validation, au lieu d'une par champ. Saisir huit classes ne déclenche
 *     plus huit enregistrements, huit recalculs et huit rechargements ;
 *   · fermer sans valider ne laisse rien derrière, ce qui permet d'essayer un prix.
 *
 * LES FORMULES NE SONT PAS ICI. Elles viennent de `@/lib/calculs/prixOffre`, les mêmes que le
 * dépliant et le comparatif : c'est tout l'intérêt de les avoir sorties.
 */
export function SaisiePrixDialog({
  ouvert,
  onFermer,
  gaz,
  compteur,
  libelleCompteur,
  detail,
  onEnregistrer,
  enCours,
}: {
  ouvert: boolean
  onFermer: () => void
  gaz: boolean
  compteur: Compteur | undefined
  libelleCompteur: string
  detail: OffreFournisseurCompteur | undefined
  /** Reçoit le patch complet : c'est l'appelant qui sait écrire, et qui recalcule à son tour. */
  onEnregistrer: (prix: PrixSaisi) => Promise<void>
  enCours: boolean
}) {
  // Un brouillon, distinct de la base : rien ne part avant la validation. `undefined` veut dire
  // « pas touché », `null` « effacé volontairement » — la même convention que le patch envoyé.
  const [brouillon, setBrouillon] = useState<PrixSaisi>({})
  // Les classes ouvertes à la main, pour un compteur qui ne déclare pas la sienne (82 % des C5).
  const [classesEnPlus, setClassesEnPlus] = useState<string[]>([])

  const classes = useMemo(
    () => (gaz ? [] : ORDRE_CLASSES.filter((c) => classesDuCompteur(compteur).includes(c) || classesEnPlus.includes(c))),
    [gaz, compteur, classesEnPlus],
  )

  /** La valeur à afficher : le brouillon s'il touche ce champ, la base sinon. */
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
  function poserP0(classe: string, v: number | null) {
    setBrouillon((b) => ({ ...b, p0_mwh_par_classe: { ...(b.p0_mwh_par_classe ?? {}), [classe]: v } }))
  }

  const marge = valeur('marge_reelle_eur_mwh', detail?.marge_reelle_eur_mwh)
  const conso = valeur('consommation_annuelle_reference_mwh', detail?.consommation_annuelle_reference_mwh)
  const abonnement = valeur(
    'abonnement_fourniture_annuel_ht',
    gaz ? detail?.prix_gaz?.abonnement_fourniture_annuel_ht : detail?.prix_electricite?.abonnement_fourniture_annuel_ht,
  )

  // Les budgets du brouillon, recalculés à chaque frappe par les MÊMES fonctions que l'écriture.
  const budgets = useMemo(() => {
    const p0 = valeur('prix_molecule_p0_mwh', detail?.prix_gaz?.prix_molecule_p0_mwh)
    const prixGaz = gaz
      ? {
          ...PRIX_GAZ_VIDE,
          ...(detail?.prix_gaz ?? {}),
          prix_molecule_p0_mwh: p0,
          prix_energie_mwh: moleculePresentee(p0, marge),
          prix_cee_mwh: valeur('prix_cee_mwh', detail?.prix_gaz?.prix_cee_mwh),
          prix_cpb_mwh: valeur('prix_cpb_mwh', detail?.prix_gaz?.prix_cpb_mwh),
          prix_atrd_mwh: valeur('prix_atrd_mwh', detail?.prix_gaz?.prix_atrd_mwh),
          prix_agn_mwh: valeur('prix_agn_mwh', detail?.prix_gaz?.prix_agn_mwh),
          cta_annuel_ht: valeur('cta_annuel_ht', detail?.prix_gaz?.cta_annuel_ht),
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
              .map((c) => [c, moleculePresentee(p0DeClasse(c), marge)])
              .filter(([, v]) => v != null) as [string, number][],
          ),
          abonnement_fourniture_annuel_ht: abonnement,
          prix_turpe_annuel_ht: valeur('prix_turpe_annuel_ht', detail?.prix_electricite?.prix_turpe_annuel_ht),
        }
    return budgetsDepuisPrix({ gaz, compteur, detail, prixGaz, prixElec, consoForcee: conso })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brouillon, detail, gaz, compteur, classes, marge, conso, abonnement])

  const volumeConnu = conso != null || (gaz ? compteur?.car_mwh : compteur?.consommation_annuelle_mwh) != null
  const rienDeSaisi = Object.keys(brouillon).length === 0

  async function valider() {
    if (rienDeSaisi) return onFermer()
    await onEnregistrer(brouillon)
    setBrouillon({})
    onFermer()
  }

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title={`Prix — ${libelleCompteur}`}
      description={gaz ? 'Compteur gaz' : 'Compteur électricité'}
      className="max-w-2xl"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
        <div className="flex flex-col gap-3">
          {gaz ? (
            <>
              <Bloc titre="Prix de l'énergie — €/MWh">
                <Ligne libelle="Molécule P0">
                  <ChampNombre
                    valeur={valeur('prix_molecule_p0_mwh', detail?.prix_gaz?.prix_molecule_p0_mwh)}
                    suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[92px]"
                    titre="Prix net de la molécule, hors marge"
                    peutModifier
                    onCommit={(v) => poser('prix_molecule_p0_mwh', v)}
                  />
                </Ligne>
                <Ligne libelle="Marge référence">
                  <ChampNombre
                    valeur={marge}
                    suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[92px]"
                    titre="La marge. Molécule présentée = Molécule P0 + marge."
                    peutModifier
                    onCommit={(v) => poser('marge_reelle_eur_mwh', v)}
                  />
                </Ligne>
                <Resultat
                  libelle="= Molécule"
                  valeur={moleculePresentee(valeur('prix_molecule_p0_mwh', detail?.prix_gaz?.prix_molecule_p0_mwh), marge)}
                  unite="€/MWh"
                />
                <Ligne libelle="CEE">
                  <ChampNombre
                    valeur={valeur('prix_cee_mwh', detail?.prix_gaz?.prix_cee_mwh)}
                    suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[92px]"
                    titre="Certificats d'économies d'énergie refacturés" peutModifier
                    onCommit={(v) => poser('prix_cee_mwh', v)}
                  />
                </Ligne>
                <Ligne libelle="CPB">
                  <ChampNombre
                    valeur={valeur('prix_cpb_mwh', detail?.prix_gaz?.prix_cpb_mwh)}
                    suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[92px]"
                    titre="CPB" peutModifier
                    onCommit={(v) => poser('prix_cpb_mwh', v)}
                  />
                </Ligne>
              </Bloc>
              <Bloc titre="Abonnement — €/an">
                <Ligne libelle="Abonnement">
                  <ChampNombre
                    valeur={abonnement}
                    suffixe="€/an" placeholder="— €/an" largeur="w-[92px]"
                    titre="Abonnement fourniture annuel HT. Au gaz il fait son propre budget." peutModifier
                    onCommit={(v) => poser('abonnement_fourniture_annuel_ht', v)}
                  />
                </Ligne>
              </Bloc>
              <Bloc titre="Contributions">
                <Ligne libelle="ATRD">
                  <ChampNombre
                    valeur={valeur('prix_atrd_mwh', detail?.prix_gaz?.prix_atrd_mwh)}
                    suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[92px]"
                    titre="Accès des tiers au réseau de distribution, part variable" peutModifier
                    onCommit={(v) => poser('prix_atrd_mwh', v)}
                  />
                </Ligne>
                <Ligne libelle="AGN">
                  <ChampNombre
                    valeur={valeur('prix_agn_mwh', detail?.prix_gaz?.prix_agn_mwh)}
                    suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[92px]"
                    titre="AGN" peutModifier
                    onCommit={(v) => poser('prix_agn_mwh', v)}
                  />
                </Ligne>
                <Ligne libelle="CTA">
                  <ChampNombre
                    valeur={valeur('cta_annuel_ht', detail?.prix_gaz?.cta_annuel_ht)}
                    suffixe="€/an" placeholder="— €/an" largeur="w-[92px]"
                    titre="Contribution tarifaire d'acheminement — en €/an, pas au MWh" peutModifier
                    onCommit={(v) => poser('cta_annuel_ht', v)}
                  />
                </Ligne>
              </Bloc>
            </>
          ) : (
            <>
              <Bloc titre="P0 · Prix de l'énergie — €/MWh">
                {classes.map((classe) => (
                  <Ligne key={classe} libelle={LIBELLE_CLASSE[classe] ?? classe}>
                    <ChampNombre
                      valeur={p0DeClasse(classe)}
                      suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[92px]"
                      titre={`P0 ${LIBELLE_CLASSE[classe] ?? classe} : prix net du fournisseur, hors marge`}
                      peutModifier
                      onCommit={(v) => poserP0(classe, v)}
                    />
                    <Resultat
                      libelle="→"
                      valeur={moleculePresentee(p0DeClasse(classe), marge)}
                      unite="€/MWh"
                      discret
                    />
                  </Ligne>
                ))}
                {/* Le compteur ne déclare pas toujours ses classes : 82 % des C5 n'en déclarent
                    aucune. On peut donc en ouvrir une à la main. */}
                {ORDRE_CLASSES.filter((c) => !classes.includes(c)).length > 0 && (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) setClassesEnPlus((l) => [...l, e.target.value]) }}
                    className="w-fit cursor-pointer rounded-kw-xs border border-dashed border-kw-border-strong bg-transparent px-1.5 py-0.5 text-kw-micro font-bold text-kw-meta hover:border-kw-green hover:text-kw-green"
                  >
                    <option value="">+ classe</option>
                    {ORDRE_CLASSES.filter((c) => !classes.includes(c)).map((c) => (
                      <option key={c} value={c}>{LIBELLE_CLASSE[c] ?? c}</option>
                    ))}
                  </select>
                )}
              </Bloc>
              <Bloc titre="Marge">
                <Ligne libelle="Marge référence">
                  <ChampNombre
                    valeur={marge}
                    suffixe="€/MWh" placeholder="— €/MWh" decimales={2} largeur="w-[92px]"
                    titre="La marge s'ajoute à CHAQUE classe tarifaire." peutModifier
                    onCommit={(v) => poser('marge_reelle_eur_mwh', v)}
                  />
                </Ligne>
              </Bloc>
              <Bloc titre="Abonnement et acheminement — €/an">
                <Ligne libelle="Abonnement">
                  <ChampNombre
                    valeur={abonnement}
                    suffixe="€/an" placeholder="— €/an" largeur="w-[92px]"
                    titre="En électricité l'abonnement est compté DANS le budget énergie." peutModifier
                    onCommit={(v) => poser('abonnement_fourniture_annuel_ht', v)}
                  />
                </Ligne>
                <Ligne libelle="Prix TURPE">
                  <ChampNombre
                    valeur={valeur('prix_turpe_annuel_ht', detail?.prix_electricite?.prix_turpe_annuel_ht)}
                    suffixe="€/an" placeholder="— €/an" largeur="w-[92px]"
                    titre="TURPE annuel HT — calculé à côté puis reporté ici" peutModifier
                    onCommit={(v) => poser('prix_turpe_annuel_ht', v)}
                  />
                </Ligne>
              </Bloc>
            </>
          )}

          <Bloc titre="Volume">
            <Ligne libelle="Conso retenue">
              <ChampNombre
                valeur={conso}
                suffixe="MWh" placeholder="— MWh" largeur="w-[92px]"
                titre="Consommation retenue par le fournisseur — c'est elle qui convertit les €/MWh en €/an"
                peutModifier
                onCommit={(v) => poser('consommation_annuelle_reference_mwh', v)}
              />
            </Ligne>
            {!volumeConnu && (
              <p className="text-kw-tiny leading-snug text-kw-amber-dark">
                Sans consommation, les budgets ne peuvent pas se calculer.
              </p>
            )}
          </Bloc>
        </div>

        {/* Les budgets, recalculés en direct : on voit l'effet de la saisie avant d'enregistrer. */}
        <div className="flex flex-col gap-1.5 rounded-kw-lg border border-kw-border bg-kw-subtle p-3 lg:self-start">
          <span className="text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">
            Budget — €/an
          </span>
          <BudgetLu libelle="Énergie" valeur={budgets.energie} />
          {gaz && <BudgetLu libelle="Abonnement gaz" valeur={abonnement} />}
          <BudgetLu libelle={gaz ? 'Contribution' : 'TURPE'} valeur={budgets.contribution} />
          <div className="mt-0.5 border-t border-kw-border-faint pt-1.5">
            <BudgetLu libelle="Total" valeur={budgets.total} fort />
          </div>
          {!gaz && (
            <p className="mt-1 text-kw-micro leading-snug text-kw-faint">
              L'abonnement est compté dans le budget énergie, pas à part.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-kw-border pt-3">
        <span className="mr-auto text-kw-tiny text-kw-faint">
          {rienDeSaisi ? 'Aucune modification' : 'Fermer sans enregistrer annule la saisie'}
        </span>
        <button
          type="button"
          onClick={onFermer}
          className="rounded-kw-md border border-kw-border-strong bg-white px-3 py-[7px] text-kw-sm font-bold text-kw-label hover:bg-kw-subtle"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={valider}
          disabled={enCours || rienDeSaisi}
          className="rounded-kw-md bg-kw-green px-3 py-[7px] text-kw-sm font-bold text-white hover:brightness-95 disabled:opacity-50"
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Dialog>
  )
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">{titre}</span>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-[118px] text-kw-sm text-kw-meta">{libelle}</span>
      {children}
    </div>
  )
}

function Resultat({ libelle, valeur, unite, discret }: {
  libelle: string
  valeur: number | null
  unite: string
  discret?: boolean
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={discret ? 'text-kw-tiny text-kw-ghost' : 'text-kw-sm text-kw-meta'}>{libelle}</span>
      <span className={`font-mono ${valeur == null ? 'text-kw-ghost' : 'font-bold text-kw-ink'} ${discret ? 'text-kw-sm' : 'text-kw-base'}`}>
        {valeur == null ? `— ${unite}` : `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${unite}`}
      </span>
    </span>
  )
}

function BudgetLu({ libelle, valeur, fort }: { libelle: string; valeur: number | null; fort?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-kw-sm text-kw-meta">{libelle}</span>
      <span className={`font-mono ${valeur == null ? 'text-kw-ghost' : 'text-kw-ink'} ${fort ? 'text-kw-md font-extrabold' : 'text-kw-base font-bold'}`}>
        {valeur == null ? '— €' : `${Math.round(valeur).toLocaleString('fr-FR')} €`}
      </span>
    </div>
  )
}

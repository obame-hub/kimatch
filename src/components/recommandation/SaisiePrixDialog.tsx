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

  const p0 = valeur('prix_molecule_p0_mwh', detail?.prix_gaz?.prix_molecule_p0_mwh)
  // VARIABLE ou FIXE — réunion du 20/08/2026. En fixe, le fournisseur impose sa marge : elle est
  // déjà dans son P0, donc elle ne s'y ajoute pas.
  const typeMarge: TypeMarge = brouillon.type_marge ?? detail?.type_marge ?? 'VARIABLE'
  const margeVariable = valeur('marge_reelle_eur_mwh', detail?.marge_reelle_eur_mwh)
  const margeFixe = valeur('marge_fixe_eur', detail?.marge_fixe_eur)
  const contributions = valeur('cout_taxes_annuel', detail?.cout_taxes_annuel)
  const cee = valeur('prix_cee_mwh', detail?.prix_gaz?.prix_cee_mwh)
  const cpb = valeur('prix_cpb_mwh', detail?.prix_gaz?.prix_cpb_mwh)
  const atrd = valeur('prix_atrd_mwh', detail?.prix_gaz?.prix_atrd_mwh)
  const agn = valeur('prix_agn_mwh', detail?.prix_gaz?.prix_agn_mwh)
  const cta = valeur('cta_annuel_ht', detail?.prix_gaz?.cta_annuel_ht)
  const turpe = valeur('prix_turpe_annuel_ht', detail?.prix_electricite?.prix_turpe_annuel_ht)
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
          prix_turpe_annuel_ht: turpe,
        }
    return budgetsDepuisPrix({ gaz, compteur, detail, prixGaz, prixElec, consoForcee: conso, contributionSaisie: contributions })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brouillon, detail, gaz, compteur, classes, conso, contributions, typeMarge])

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
    : [{ libelle: 'TURPE saisi', valeur: turpe, unite: '€/an', palier: true }]

  const rienDeSaisi = Object.keys(brouillon).length === 0

  async function valider() {
    if (rienDeSaisi) return onFermer()
    await onEnregistrer(brouillon)
    setBrouillon({})
    setBudgetsForces(false)
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Les saisies ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {gaz ? (
            <>
              <Section
                numero={1}
                titre="Le prix de l’énergie"
                aide="Ce que le fournisseur facture pour le gaz lui-même, au mégawattheure."
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
                  aide="Contribution passage biométhane, au mégawattheure."
                  unite="€/MWh"
                  valeur={cpb}
                  onCommit={(v) => poser('prix_cpb_mwh', v)}
                />
              </Section>

              <Section
                numero={2}
                titre="L’abonnement"
                aide="Facturé à l’année quel que soit le volume consommé. Au gaz, il forme son propre budget."
              >
                <Champ
                  libelle="Abonnement"
                  aide="Montant annuel hors taxes de l’abonnement fourniture."
                  unite="€/an"
                  valeur={abonnement}
                  onCommit={(v) => poser('abonnement_fourniture_annuel_ht', v)}
                />
              </Section>

              <Section
                numero={3}
                titre="Les contributions"
                aide="Ce qui ne revient pas au fournisseur : l’acheminement et les taxes. Le client les paie dans tous les cas."
              >
                <Champ
                  libelle="ATRD"
                  aide="Accès des tiers au réseau de distribution, part variable au mégawattheure."
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
              </Section>
            </>
          ) : (
            <>
              <Section
                numero={1}
                titre="Les prix P0 par classe"
                aide="Un prix nu par plage horosaisonnière, tel que le fournisseur le cote. Seules les classes que le compteur consomme sont proposées."
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
                      <Fleche valeur={moleculePresentee(p0DeClasse(classe), margeVariable, typeMarge)} />
                    }
                  />
                ))}
                {ORDRE_CLASSES.filter((c) => !classes.includes(c)).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) setClassesEnPlus((l) => [...l, e.target.value]) }}
                      className="cursor-pointer rounded-kw-xs border border-dashed border-kw-border-strong bg-transparent px-1.5 py-0.5 text-kw-micro font-bold text-kw-meta hover:border-kw-green hover:text-kw-green"
                    >
                      <option value="">+ ajouter une classe</option>
                      {ORDRE_CLASSES.filter((c) => !classes.includes(c)).map((c) => (
                        <option key={c} value={c}>{LIBELLE_CLASSE[c] ?? c}</option>
                      ))}
                    </select>
                    <span className="text-kw-tiny text-kw-faint">
                      si le fournisseur cote une plage que le compteur ne déclare pas
                    </span>
                  </div>
                )}
              </Section>

              <Section
                numero={2}
                titre="La marge"
                aide="Une seule marge pour ce point de livraison, quelle que soit la classe tarifaire."
              >
                <ChoixMarge
                  valeur={typeMarge}
                  onChoisir={(t) => setBrouillon((b) => ({ ...b, type_marge: t }))}
                />
                {typeMarge === 'VARIABLE' ? (
                  <Champ
                    libelle="Marge de référence"
                    aide="Votre marge, au mégawattheure. Chaque prix présenté au client vaut son P0 plus cette marge."
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
              </Section>

              <Section
                numero={3}
                titre="L’abonnement et l’acheminement"
                aide="En électricité l’abonnement est compté DANS le budget énergie, et l’acheminement s’appelle le TURPE."
              >
                <Champ
                  libelle="Abonnement"
                  aide="Supplément annuel que le fournisseur ajoute librement. Il entre dans le budget énergie, pas dans un budget à part."
                  unite="€/an"
                  valeur={abonnement}
                  onCommit={(v) => poser('abonnement_fourniture_annuel_ht', v)}
                />
                <Champ
                  libelle="Prix TURPE"
                  aide="Tarif d’utilisation des réseaux, en euros par an. À calculer à côté (Kiwee Tools) puis reporter ici : le barème réglementaire n’est pas dans l’application."
                  unite="€/an"
                  valeur={turpe}
                  onCommit={(v) => poser('prix_turpe_annuel_ht', v)}
                />
                {/* Michel, 20/08/2026 : « là, il manque les informations de contribution qu'il
                    faudrait qu'on rajoute ». Il doit envoyer les documents qui en listent les
                    composantes — « ça, je vais te l'envoyer parce que ça, tu l'as pas forcément ».
                    En attendant, un montant annuel global : mieux vaut une ligne juste qu'une
                    décomposition inventée qu'il faudrait défaire. */}
                <Champ
                  libelle="Contributions"
                  aide="Total annuel des contributions et taxes, hors TURPE. En un seul montant pour l’instant : les composantes de l’électricité restent à cadrer avec Michel."
                  unite="€/an"
                  valeur={contributions}
                  onCommit={(v) => poser('cout_taxes_annuel', v)}
                />
              </Section>
            </>
          )}

          <Section
            numero={4}
            titre="Le volume"
            aide="C’est lui qui transforme les euros par mégawattheure en euros par an. Sans lui, aucun budget ne peut se calculer."
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
              <p className="rounded-kw-xs bg-kw-amber-light px-2 py-1 text-kw-tiny leading-snug text-kw-amber-dark">
                Sans volume, les budgets restent vides. Ils ne valent pas zéro : ils sont inconnus.
              </p>
            )}
          </Section>
        </div>

        {/* ── Le calcul, déroulé ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 rounded-kw-lg border border-kw-border bg-kw-subtle p-3 lg:self-start">
          <div>
            <span className="text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">
              Comment le budget se calcule
            </span>
            <p className="mt-0.5 text-kw-tiny leading-snug text-kw-meta">
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

          <div className="rounded-kw-md border border-kw-ink bg-white px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-kw-sm font-extrabold">Budget total</span>
              <span className={`font-mono text-kw-md font-extrabold tabular-nums ${budgets.total == null ? 'text-kw-ghost' : 'text-kw-ink'}`}>
                {budgets.total == null ? '— €' : `${Math.round(budgets.total).toLocaleString('fr-FR')} €`}
              </span>
            </div>
            <p className="mt-0.5 text-kw-micro leading-snug text-kw-faint">
              {gaz
                ? 'Énergie + abonnement + contributions.'
                : 'Énergie (abonnement compris) + TURPE.'}
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
                className="text-kw-tiny font-bold text-kw-meta underline decoration-dotted hover:text-kw-green"
              >
                Le fournisseur n’a donné qu’un budget global ?
              </button>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="text-kw-tiny leading-snug text-kw-meta">
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

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-kw-border pt-3">
        <span className="mr-auto text-kw-tiny text-kw-faint">
          {rienDeSaisi ? 'Aucune modification' : 'Annuler ferme sans rien enregistrer'}
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
          {enCours ? 'Enregistrement…' : 'Enregistrer les prix'}
        </button>
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
                ? 'rounded-kw-sm bg-kw-ink px-3 py-1 text-kw-sm font-bold text-white'
                : 'rounded-kw-sm px-3 py-1 text-kw-sm font-bold text-kw-meta hover:text-kw-ink'
            }
          >
            {o.libelle}
          </button>
        ))}
      </div>
      <p className="text-kw-tiny leading-snug text-kw-faint">
        {valeur === 'VARIABLE'
          ? 'Votre marge s’ajoute au P0 : elle augmente le prix présenté au client.'
          : 'Le fournisseur arrête un montant en euros pour toute la durée du contrat, indépendant du volume et déjà compris dans son P0. Il ne s’ajoute pas au prix : on l’enregistre pour savoir ce que rapporte le dossier.'}
      </p>
    </div>
  )
}

function Section({ numero, titre, aide, children }: {
  numero: number
  titre: string
  aide: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-kw-ink text-kw-micro font-extrabold text-white">
          {numero}
        </span>
        <div>
          <h4 className="text-kw-base font-extrabold text-kw-ink">{titre}</h4>
          <p className="text-kw-tiny leading-snug text-kw-meta">{aide}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 pl-[26px]">{children}</div>
    </section>
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
        <label className={`${compact ? 'min-w-[92px]' : 'min-w-[132px]'} text-kw-sm font-semibold text-kw-label`}>
          {libelle}
        </label>
        <ChampNombre
          valeur={valeur}
          suffixe={unite}
          placeholder={`— ${unite}`}
          decimales={unite === '€/MWh' ? 2 : undefined}
          largeur={compact ? 'w-[86px]' : 'w-[100px]'}
          titre={aide}
          peutModifier
          onCommit={onCommit}
        />
        {apres}
      </div>
      {aide && !compact && (
        <p className={`${compact ? '' : 'ml-[140px]'} text-kw-tiny leading-snug text-kw-faint`}>{aide}</p>
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
      <span className="min-w-[132px] text-kw-sm font-bold text-kw-green">{libelle}</span>
      <span className="font-mono text-kw-tiny text-kw-meta">{calcul} =</span>
      <span className={`font-mono text-[19px] font-extrabold leading-none tabular-nums ${valeur == null ? 'text-kw-ghost' : 'text-kw-green'}`}>
        {fmt(valeur)}
      </span>
      <span className="text-kw-tiny font-semibold text-kw-green">{unite}</span>
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
      <span className="text-kw-micro font-bold uppercase tracking-[0.08em] text-kw-green">
        Prix client
      </span>
      <span className={`font-mono text-kw-md font-extrabold tabular-nums ${valeur == null ? 'text-kw-ghost' : 'text-kw-green'}`}>
        {fmt(valeur)}
      </span>
      <span className="text-kw-tiny font-semibold text-kw-green">€/MWh</span>
    </span>
  )
}

/** Le déroulé d'un budget : chaque ingrédient, son opérateur, et le palier atteint. */
function Calcul({ titre, etapes }: { titre: string; etapes: Etape[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-kw-tiny font-bold text-kw-label">{titre}</span>
      <div className="flex flex-col">
        {etapes.map((e, i) => (
          <div
            key={`${e.libelle}-${i}`}
            className={`flex items-baseline gap-1.5 ${e.palier ? 'mt-0.5 border-t border-kw-border-faint pt-0.5' : ''}`}
          >
            <span className="w-3 shrink-0 font-mono text-kw-tiny text-kw-faint">{e.operateur ?? ''}</span>
            <span className={`min-w-0 flex-1 truncate text-kw-tiny ${e.palier ? 'font-bold text-kw-ink' : 'text-kw-meta'}`}>
              {e.libelle}
            </span>
            <span
              className={`shrink-0 font-mono tabular-nums ${e.valeur == null ? 'text-kw-ghost' : 'text-kw-ink'} ${e.palier ? 'text-kw-sm font-extrabold' : 'text-kw-tiny'}`}
            >
              {fmt(e.valeur)} {e.unite}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Plus, Trash2, Star, Check, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChampNombre } from '@/components/ui/champ-nombre'
import { PrixParCompteur } from '@/components/recommandation/PrixParCompteur'
import { CarteOffreEtude } from '@/components/recommandation/CarteOffreEtude'
import { FichierOffre } from '@/components/recommandation/FichierOffre'
import { useTauxMargeKiwee } from '@/lib/data/montantAffaire'
import {
  useAjouterOffre,
  useUpdateOffrePartiel,
  useSupprimerOffre,
  useRetenirOffre,
  useDesignerOffreReference,
  libelleOffre,
  STATUTS_OFFRE,
  NATURES_OFFRE,
  natureDeLOffre,
  type PatchOffre,
} from '@/lib/data/recommandations'
import type { FournisseurConsulte, OffreFournisseur, VersionRecommandation, Compteur } from '@/types/domain'

/**
 * Les offres d'UN fournisseur consulté.
 *
 * « Il faut qu'on voie sous chaque fournisseur consulté la ou les offres différentes, sinon la
 * version ne sert à rien » (Michel, 17/08/2026). Un fournisseur interrogé sur 24 et 36 mois, en fixe
 * et en indexé, peut répondre plusieurs offres : c'est entre elles qu'on arbitre, et l'une d'elles
 * est retenue — celle que lit le comparatif des versions.
 *
 * La grille est créée dès la consultation, une ligne par combinaison demandée, « en attente » et
 * sans montant : chaque ligne est une réponse attendue. Le conseiller saisit le prix quand le mail
 * arrive, en cliquant sur le pointillé — pas de modale, pas de formulaire à ouvrir.
 *
 * CE QUI SE SAISIT ICI ET PAS AILLEURS : le prix €/MWh et le montant annuel sont ceux que le
 * fournisseur ANNONCE. Le détail par PDL (`offres_fournisseurs_compteurs`) est un autre niveau, plus
 * fin, qui n'est pas encore alimenté — quand il le sera, il précisera ces chiffres sans les
 * remplacer.
 */

const TON_STATUT: Record<string, string> = {
  EN_ATTENTE: 'bg-km-soft text-km-muted',
  ACCEPTEE: 'bg-km-blue-soft text-km-blue',
  REFUSEE: 'bg-km-red-soft text-km-red',
  RECUE: 'bg-km-green-soft text-km-green',
}


/**
 * Les budgets de l'offre, additionnés sur ses points de livraison.
 *
 * `null` et non zéro quand rien n'est saisi : un budget de 0 € et un budget inconnu ne se disent pas
 * de la même façon, et confondre les deux ferait passer une offre non chiffrée pour gratuite.
 */
function sommesDesPdl(offre: OffreFournisseur) {
  const somme = (extrait: (d: OffreFournisseur['details_par_compteur'][number]) => number | null | undefined) =>
    offre.details_par_compteur.reduce<number | null>((total, d) => {
      const v = extrait(d)
      return v == null ? total : (total ?? 0) + v
    }, null)

  // GAZ ET ÉLECTRICITÉ NE SE COMPTENT PAS PAREIL, décision de Michel du 19/08/2026 :
  //
  //   · l'abonnement gaz fait son propre budget — « quand c'est abonnement gaz, il y aura un budget
  //     abonnement » ;
  //   · l'abonnement électrique est déjà DANS le budget énergie — « quand c'est abonnement
  //     électricité, ça rentre dans le budget énergie » — donc l'additionner ici le compterait deux
  //     fois ;
  //   · et à la place, l'électricité montre le TURPE : « il n'y a pas un budget abonnement en
  //     électricité, à la place on peut mettre TURPE ».
  //
  // Chaque somme reste `null` quand aucun PDL ne la renseigne, et l'écran n'affiche alors pas la
  // ligne. Une offre 100 % électrique ne montre donc aucune ligne gaz, et une offre mixte — il en
  // existe — montre les deux sans qu'on ait à la configurer.
  return {
    energie: somme((d) => d.cout_fourniture_annuel_ht),
    abonnementGaz: somme((d) => d.prix_gaz?.abonnement_fourniture_annuel_ht),
    turpe: somme((d) => d.prix_electricite?.prix_turpe_annuel_ht),
    contribution: somme((d) => (d.prix_gaz ? d.cout_acheminement_annuel_ht : null)),
    total: somme((d) => d.cout_total_annuel_estime_ht),
  }
}

export function OffresDuFournisseur({
  fournisseur,
  optimisationId,
  version,
  compteurs,
  typeDocumentOffreId,
  dureesDemandees,
  typesPrixDemandes,
  repere,
  peutModifier,
  signaler,
}: {
  fournisseur: FournisseurConsulte
  optimisationId: string
  /**
   * L'OFFRE À LAQUELLE ON SE COMPARE, calculée sur TOUTE la cotation et non par fournisseur.
   *
   * C'était le défaut : chaque fournisseur prenait sa propre offre la moins chère comme repère, donc
   * deux offres de deux fournisseurs n'étaient pas comparées à la même chose. La colonne d'écart
   * était illisible sans qu'on puisse dire pourquoi.
   *
   * `null` quand aucune offre n'est chiffrée : la colonne se tait alors, plutôt que d'afficher un
   * écart contre rien.
   */
  repere: OffreFournisseur | null
  /** La version, pour ses points de livraison — c'est sur eux que se saisissent les prix. */
  version: VersionRecommandation
  compteurs: Compteur[]
  /** Type de document à poser sur les offres jointes, si la table de référence en propose un. */
  typeDocumentOffreId: string | null
  /** Durées demandées à la consultation — proposées en premier à l'ajout d'une offre. */
  dureesDemandees: number[]
  typesPrixDemandes: string[]
  peutModifier: boolean
  signaler: (message: string) => void
}) {
  /* LE TAUX DE PARTAGE DE CE FOURNISSEUR, lu ici parce que c'est ici qu'on sait de quel compte
     fournisseur il s'agit : une offre ne porte que le NOM du fournisseur, et se fier au nom pour
     retrouver un compte est exactement ce qui a produit les doublons de la reprise Salesforce.
     Il descend jusqu'à la modale de saisie des prix, qui affichait « ÷ 2 » en dur. */
  const { data: tauxMargeKiwee } = useTauxMargeKiwee(fournisseur.fournisseur_compte_id)

  const ajouter = useAjouterOffre()
  const majOffre = useUpdateOffrePartiel()
  const supprimer = useSupprimerOffre()
  const retenir = useRetenirOffre()
  const designerReference = useDesignerOffreReference()
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  /* « INDISPONIBLE » : le fournisseur n'a rien à proposer sur ce dossier.
     Naoëlle, 27/08/2026 : faute de pouvoir le dire, on inventait une durée — et le comparatif
     présentait au client une offre d'un mois qui n'existait pas. Une offre sans durée porte
     désormais ce sens, et rien d'autre ne le porte : un seul marqueur, pas deux à maintenir. */
  const [indisponible, setIndisponible] = useState(false)
  const [nouvelleDuree, setNouvelleDuree] = useState<string>(String(dureesDemandees[0] ?? 36))
  const [nouveauType, setNouveauType] = useState<string>(typesPrixDemandes[0] ?? 'Fixe')

  const offres = fournisseur.offres

  async function patcher(offre: OffreFournisseur, patch: PatchOffre, message: string) {
    try {
      await majOffre.mutateAsync({ offreId: offre.id, patch })
      signaler(message)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      {offres.length === 0 ? (
        <p className="text-km-body text-km-faint">
          Aucune offre attendue enregistrée pour ce fournisseur.
          {peutModifier && ' Ajoutez-en une dès qu\'il répond.'}
        </p>
      ) : (
        offres.map((offre) => {
          const sommes = sommesDesPdl(offre)
          // Une offre ne se compare pas à elle-même : c'est ELLE le repère, et la carte l'écrit.
          const repereDeCetteOffre = repere && repere.id !== offre.id ? repere : null
          const nature = natureDeLOffre(offre.nature_offre)

          /* ══ POURQUOI « RETENIR » PEUT ÊTRE HORS D'USAGE ══
             Deux raisons, et jusqu'ici aucune ne se lisait à l'écran : elles n'existaient que dans
             l'infobulle du bouton. Naoëlle, 27/08/2026 : « explique-moi pourquoi je n'arrive pas à
             retenir les offres de GAZ EUROPEEN ». Un bouton grisé sans motif visible est un bouton
             qu'on croit cassé — le motif s'affiche donc maintenant à côté. */
          const indisponibleOffre = offre.duree_mois == null
          const retenable = nature.retenable && !indisponibleOffre
          const blocage = indisponibleOffre
            ? 'Indisponible : ce fournisseur n’a rien à proposer, il n’y a rien à retenir.'
            : !nature.retenable
              ? `${nature.libelle} : ${nature.aide}`
              : null
          const recue = offre.statut === 'RECUE'
          const refusee = offre.statut === 'REFUSEE'
          return (
            <div
              key={offre.id}
              className={cn(
                'rounded-km border px-2.5 py-2',
                offre.est_offre_recommandee
                  ? 'border-[#dcc39c] bg-[#fdf9f0]'
                  : refusee
                    ? 'border-km-line-soft bg-km-soft opacity-70'
                    : 'border-km-line-soft bg-white',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {/* Ce qui distingue l'offre : durée et type de prix. Tous deux modifiables — un
                    fournisseur répond parfois sur une durée qu'on ne lui a pas demandée. */}
                <span className="font-mono text-km-body font-extrabold text-km-text">
                  {libelleOffre(offre.duree_mois, offre.type_prix)}
                </span>

                {peutModifier ? (
                  <select
                    value={offre.statut ?? 'EN_ATTENTE'}
                    onChange={(e) => patcher(offre, { statut: e.target.value }, `✓ ${libelleOffre(offre.duree_mois, offre.type_prix)} : ${STATUTS_OFFRE.find((st) => st.code === e.target.value)?.libelle}`)}
                    className={cn(
                      'rounded-km-sm border-0 px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em] outline-none',
                      TON_STATUT[offre.statut ?? 'EN_ATTENTE'] ?? 'bg-km-soft text-km-muted',
                    )}
                  >
                    {STATUTS_OFFRE.map((st) => (
                      <option key={st.code} value={st.code}>{st.libelle}</option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={cn(
                      'rounded-km-sm px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em]',
                      TON_STATUT[offre.statut ?? 'EN_ATTENTE'] ?? 'bg-km-soft text-km-muted',
                    )}
                  >
                    {STATUTS_OFFRE.find((st) => st.code === offre.statut)?.libelle ?? offre.statut ?? 'En attente'}
                  </span>
                )}

                {/* ── LA NATURE DE L'OFFRE ──
                    Michel, 21/08/2026 : « t'as trois types d'offres. T'as l'offre proposée, t'as
                    l'offre de reconduction, et t'as l'offre en cours. »

                    Elle se règle ici, sur la ligne de l'offre, parce que c'est là qu'on la découvre :
                    « en réalité, peu importe l'offre, même si c'est déjà une offre qu'on a proposée,
                    je peux venir ici sur l'offre et juste indiquer que c'est l'offre de
                    reconduction ». On ne la demande donc pas à la création. */}
                {peutModifier ? (
                  <select
                    value={nature.code}
                    title={nature.aide}
                    onChange={(e) => patcher(
                      offre,
                      { nature_offre: e.target.value },
                      `✓ ${libelleOffre(offre.duree_mois, offre.type_prix)} : ${NATURES_OFFRE.find((n) => n.code === e.target.value)?.libelle}`,
                    )}
                    className={cn(
                      'rounded-km-sm border-0 px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em] outline-none',
                      nature.retenable ? 'bg-km-soft text-km-muted' : 'bg-km-amber-soft text-km-amber',
                    )}
                  >
                    {NATURES_OFFRE.map((n) => (
                      <option key={n.code} value={n.code}>{n.libelle}</option>
                    ))}
                  </select>
                ) : (
                  !nature.retenable && (
                    <span
                      title={nature.aide}
                      className="rounded-km-sm bg-km-amber-soft px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em] text-km-amber"
                    >
                      {nature.libelle}
                    </span>
                  )
                )}

                {/* ══════════ LA DATE DE VALIDITÉ DE L'OFFRE ══════════
                    Michel, appel du 24/08/2026 à 31:08 : « on est sur des dates de validité dans le
                    général d'un jour [...] une recommandation quand elle est lancée, c'est comme si
                    j'ai lancé un appel d'offres : j'ai une DATE FIXE. » Et il veut l'alerte qui va
                    avec : « recommandation en statut offre — attention, vous devez l'envoyer
                    aujourd'hui ».

                    LA COLONNE EXISTAIT, LE CHAMP NON. Constaté le 24/08/2026 : `date_validite` est
                    AFFICHÉE sur la carte d'étude (« valable jusqu'au… ») et lue par le comparatif
                    des versions, `PatchOffre` la porte, `useUpdateOffrePartiel` sait l'écrire — mais
                    aucun écran ne permettait de la saisir. Résultat : 0 des 42 offres en base en a
                    une, et l'alerte qu'il demande n'avait aucune donnée pour se calculer.

                    Elle se règle ici, sur la ligne de l'offre, pour la même raison que la nature :
                    c'est là qu'on la découvre en lisant la réponse du fournisseur. */}
                {peutModifier ? (
                  <label
                    className="flex items-center gap-1 text-km-label font-bold uppercase tracking-[0.05em] text-km-muted"
                    title="Date de validité indiquée par le fournisseur. Passé cette date, l’offre n’est plus opposable."
                  >
                    valable au
                    <input
                      type="date"
                      value={offre.date_validite?.slice(0, 10) ?? ''}
                      onChange={(e) =>
                        patcher(
                          offre,
                          { date_validite: e.target.value || null },
                          e.target.value
                            ? `✓ ${libelleOffre(offre.duree_mois, offre.type_prix)} : valable jusqu’au ${new Date(e.target.value + 'T12:00:00').toLocaleDateString('fr-FR')}`
                            : 'Date de validité effacée',
                        )
                      }
                      className="rounded-km-sm border-0 bg-km-soft px-1.5 py-0.5 font-mono text-km-label font-extrabold text-km-muted outline-none"
                    />
                  </label>
                ) : (
                  offre.date_validite && (
                    <span className="rounded-km-sm bg-km-soft px-1.5 py-0.5 font-mono text-km-label font-extrabold text-km-muted">
                      valable au {new Date(offre.date_validite + 'T12:00:00').toLocaleDateString('fr-FR')}
                    </span>
                  )
                )}

                <span className="flex-1" />

                {peutModifier && (
                  <>
                    <button
                      type="button"
                      disabled={!retenable && !offre.est_offre_recommandee}
                      title={
                        !retenable && !offre.est_offre_recommandee
                          ? blocage ?? ''
                          : offre.est_offre_recommandee
                            ? 'Offre retenue — cliquer pour ne plus la retenir'
                            : 'Retenir cette offre : c\'est elle que reprend le comparatif des versions'
                      }
                      onClick={async () => {
                        // ON NE RETIENT PAS UNE RECONDUCTION NI L'OFFRE EN COURS. Michel, 21/08/2026 :
                        // « s'ils retiennent la reconduction, c'est qu'en fait on a perdu le
                        // dossier. » Dans ce cas on marque la proposition refusée et l'on note que le
                        // client a conservé son offre — retenir voudrait dire l'inverse.
                        //
                        // Le garde laisse passer le DÉTRICOTAGE : une offre déjà retenue qu'on
                        // requalifie en reconduction doit pouvoir être dé-retenue, sinon elle reste
                        // coincée.
                        if (!retenable && !offre.est_offre_recommandee) return
                        try {
                          await retenir.mutateAsync({ optimisationId, offreId: offre.est_offre_recommandee ? null : offre.id })
                          signaler(
                            offre.est_offre_recommandee
                              ? '☆ Offre retenue retirée'
                              : `★ Offre retenue : ${fournisseur.fournisseur_nom} ${libelleOffre(offre.duree_mois, offre.type_prix)}`,
                          )
                        } catch (e) {
                          signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-km-sm px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em]',
                        // Un bouton hors d'usage doit le montrer, sinon on clique et rien ne se
                        // passe — le pire des retours.
                        'disabled:cursor-not-allowed disabled:opacity-40',
                        offre.est_offre_recommandee
                          ? 'bg-[#8a4b2a] text-white'
                          : 'border border-km-line bg-white text-km-muted hover:bg-km-bg',
                      )}
                    >
                      <Star className={cn('h-2.5 w-2.5', offre.est_offre_recommandee && 'fill-current')} />
                      {offre.est_offre_recommandee ? 'Retenue' : 'Retenir'}
                    </button>

                    {/* ══ DÉSIGNER LA RÉFÉRENCE ══
                        Michel, 27/08/2026 : « une offre de référence peut être n'importe quelle
                        offre. C'est un peu comme retenir une offre. Je décide que c'est sur cette
                        offre-là que je vais me baser pour faire le comparatif. »

                        AUCUNE CONDITION DE NATURE ICI, contrairement à « Retenir » : l'offre en
                        cours est même le repère le plus fréquent — on se compare à ce que le client
                        paie aujourd'hui. Une offre qu'on ne peut pas retenir peut parfaitement
                        servir de base de comparaison ; ce sont deux questions différentes. */}
                    <button
                      type="button"
                      title={
                        offre.est_offre_reference
                          ? 'Base du comparatif — cliquer pour ne plus s’y comparer'
                          : 'Se comparer à cette offre : les autres s’afficheront plus chères ou moins chères qu’elle'
                      }
                      onClick={async () => {
                        try {
                          await designerReference.mutateAsync({
                            optimisationId,
                            offreId: offre.est_offre_reference ? null : offre.id,
                          })
                          signaler(
                            offre.est_offre_reference
                              ? '◎ Référence retirée'
                              : `◉ Référence : ${fournisseur.fournisseur_nom} ${libelleOffre(offre.duree_mois, offre.type_prix)}`,
                          )
                        } catch (e) {
                          signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-km-sm px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em]',
                        offre.est_offre_reference
                          ? 'bg-km-blue text-white'
                          : 'border border-km-line bg-white text-km-muted hover:bg-km-bg',
                      )}
                    >
                      <Target className="h-2.5 w-2.5" />
                      Référence
                    </button>

                    {/* ── LE MOTIF DU BLOCAGE, ÉCRIT ── Il n'existait que dans l'infobulle, donc il
                           fallait deviner qu'il y avait quelque chose à survoler. Une seule phrase
                           courte suffit à transformer « ça ne marche pas » en « il faut changer la
                           nature de l'offre ». */}
                    {blocage && !offre.est_offre_recommandee && (
                      <span className="max-w-[26ch] text-right text-km-label leading-tight text-km-amber">
                        {blocage}
                      </span>
                    )}

                    <button
                      type="button"
                      title="Supprimer cette offre"
                      onClick={async () => {
                        try {
                          await supprimer.mutateAsync(offre.id)
                          signaler('Offre supprimée')
                        } catch (e) {
                          signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                        }
                      }}
                      className="rounded-km-sm p-0.5 text-km-faint hover:bg-km-red-soft hover:text-km-red"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>

              {/* ── L'offre à la façon de l'étude client ──
                  Michel, 20/08/2026 à 13h15, après nous avoir montré la maquette de William :
                  « dans le détail des offres, le même modèle que dans fiche étude clients […] tu vois
                  comme ça, là on pourra venir saisir les informations. »

                  La carte remplace la ligne des cinq budgets. Elle dit la même chose et deux de plus :
                  la RÉPARTITION du budget en une barre, et l'écart avec la moins chère. Le détail se
                  déplie en cascade — offre, puis point de livraison, puis composantes — au lieu de
                  tout étaler d'emblée.

                  LA LECTURE EST ICI, L'ÉCRITURE RESTE EN DESSOUS. `PrixParCompteur` garde le bouton
                  de saisie par point de livraison : la carte ne montre que les PDL déjà chiffrés,
                  alors qu'il faut pouvoir saisir sur ceux qui ne le sont pas encore. */}
              <div className="mt-2">
                <CarteOffreEtude
                  offre={offre}
                  compteurs={compteurs}
                  reference={repereDeCetteOffre}
                  estLeRepere={repere != null && repere.id === offre.id}
                  // L'ÉCONOMIE EST UN CHIFFRE : elle rejoint le budget au centre, pas les boutons.
                  chiffresEnPlus={
                    <span onClick={(e) => e.stopPropagation()}>
                      <span className="block">
                        <ChampNombre
                          valeur={offre.economie_annuelle_estimee}
                          suffixe="€/an"
                          placeholder="— €/an"
                          titre="Économie annuelle estimée face au contrat actuel"
                          peutModifier={peutModifier}
                          onCommit={(v) => patcher(offre, { economie_annuelle_estimee: v }, v != null ? `✓ Économie : ${v.toLocaleString('fr-FR')} €/an` : 'Économie effacée')}
                        />
                      </span>
                      <span className="block text-km-label text-km-faint">économie</span>
                    </span>
                  }
                  // LA SAISIE EST À DROITE DU BLOC, demande de Naoëlle du 20/08/2026. Elle était en
                  // dessous : un bouton posé sous la ligne se lit comme s'il appartenait au dépliant,
                  // alors qu'il commande la ligne elle-même.
                  actions={
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                      <FichierOffre
                        offreId={offre.id}
                        libelleOffre={libelleOffre(offre.duree_mois, offre.type_prix)}
                        typeDocumentOffreId={typeDocumentOffreId}
                        peutModifier={peutModifier}
                        signaler={signaler}
                      />
                      <PrixParCompteur
                        offre={offre}
                        version={version}
                        compteurs={compteurs}
                        tauxMargeKiwee={tauxMargeKiwee}
                        peutModifier={peutModifier}
                        signaler={signaler}
                      />
                    </span>
                  }
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                {recue && offre.montant_annuel_ht == null && sommes.total == null && (
                  // Une offre marquée reçue sans aucun chiffre est une contradiction visible : on le
                  // signale plutôt que de la laisser passer pour renseignée.
                  <span className="text-km-label font-semibold text-km-amber">
                    marquée reçue, mais aucun chiffre saisi
                  </span>
                )}
              </div>
            </div>
          )
        })
      )}

      {peutModifier && (
        ajoutOuvert ? (
          <div className="flex flex-wrap items-center gap-2 rounded-km border border-dashed border-[#dcc39c] bg-km-amber-soft px-2.5 py-2">
            <span className="text-km-body text-km-muted">Offre supplémentaire :</span>
            <input
              type="number"
              min={1}
              max={60}
              value={indisponible ? '' : nouvelleDuree}
              disabled={indisponible}
              onChange={(e) => setNouvelleDuree(e.target.value.replace(/\D/g, ''))}
              className="w-16 rounded-km-sm border border-km-line bg-white px-1.5 py-0.5 font-mono text-km-body text-km-text outline-none disabled:bg-km-soft disabled:text-km-faint"
            />
            <span className={cn('text-km-body', indisponible ? 'text-km-faint' : 'text-km-muted')}>mois</span>

            {/* ── LA BASCULE « INDISPONIBLE » ──
                   Posée À CÔTÉ de la durée et non dans une liste déroulante à part : c'est une
                   réponse à la même question — « sur quelle durée ? » — et sa réponse est « aucune ».
                   Elle éteint le champ des mois plutôt que de le laisser saisissable, sinon on
                   pourrait enregistrer « 36 mois indisponible », qui ne veut rien dire. */}
            <button
              type="button"
              onClick={() => setIndisponible((v) => !v)}
              aria-pressed={indisponible}
              title="Le fournisseur n’a aucune offre à proposer sur cette recommandation"
              className={cn(
                'rounded-km-sm border px-2 py-0.5 text-km-body font-bold transition-colors',
                indisponible
                  ? 'border-km-red bg-km-red-soft text-km-red'
                  : 'border-km-line bg-white text-km-muted hover:bg-km-bg',
              )}
            >
              Indisponible
            </button>
            <select
              value={nouveauType}
              onChange={(e) => setNouveauType(e.target.value)}
              disabled={indisponible}
              className="rounded-km-sm border border-km-line bg-white px-1.5 py-0.5 text-km-body text-km-text outline-none disabled:bg-km-soft disabled:text-km-faint"
            >
              {[...new Set([...typesPrixDemandes, 'Fixe', 'Indexé'])].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => { setAjoutOuvert(false); setIndisponible(false) }}
              className="rounded-km-sm px-2 py-0.5 text-km-body font-semibold text-km-muted hover:bg-white"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={ajouter.isPending || (!indisponible && !nouvelleDuree)}
              onClick={async () => {
                // ══ LE CAS « INDISPONIBLE » ══
                // Une seule ligne suffit par fournisseur : « ce fournisseur n'a rien » ne se dit pas
                // deux fois. Le statut passe à REFUSEE, qui est déjà le vocabulaire existant pour
                // « le fournisseur n'accepte pas de coter » — aucun nouveau statut à inventer.
                if (indisponible) {
                  if (offres.some((o) => o.duree_mois == null)) {
                    return signaler(`${fournisseur.fournisseur_nom} est déjà marqué indisponible`)
                  }
                  try {
                    await ajouter.mutateAsync({
                      optimisationId,
                      optimisationFournisseurId: fournisseur.id,
                      fournisseurCompteId: fournisseur.fournisseur_compte_id,
                      duree_mois: null,
                      type_prix: null,
                      statut: 'REFUSEE',
                    })
                    setAjoutOuvert(false)
                    setIndisponible(false)
                    signaler(`✕ ${fournisseur.fournisseur_nom} marqué indisponible`)
                  } catch (e) {
                    signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                  }
                  return
                }

                const duree = Number(nouvelleDuree)
                if (!Number.isFinite(duree) || duree < 1 || duree > 60) return signaler('Durée attendue entre 1 et 60 mois')
                // Doublon : deux offres identiques du même fournisseur ne veulent rien dire, et la
                // base ne l'interdit pas — c'est ici que ça se joue.
                if (offres.some((o) => o.duree_mois === duree && (o.type_prix ?? null) === nouveauType)) {
                  return signaler(`${libelleOffre(duree, nouveauType)} existe déjà pour ce fournisseur`)
                }
                try {
                  await ajouter.mutateAsync({
                    optimisationId,
                    optimisationFournisseurId: fournisseur.id,
                    fournisseurCompteId: fournisseur.fournisseur_compte_id,
                    duree_mois: duree,
                    type_prix: nouveauType,
                  })
                  setAjoutOuvert(false)
                  signaler(`＋ ${libelleOffre(duree, nouveauType)} ajoutée pour ${fournisseur.fournisseur_nom}`)
                } catch (e) {
                  signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                }
              }}
              className="inline-flex items-center gap-1 rounded-km-sm bg-[#8a4b2a] px-2 py-0.5 text-km-body font-bold text-white disabled:opacity-60"
            >
              <Check className="h-3 w-3" /> Ajouter
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAjoutOuvert(true)}
            className="inline-flex items-center gap-1 text-km-body font-semibold text-km-green hover:underline"
          >
            <Plus className="h-3 w-3" /> Ajouter une offre de {fournisseur.fournisseur_nom}
          </button>
        )
      )}
    </div>
  )
}

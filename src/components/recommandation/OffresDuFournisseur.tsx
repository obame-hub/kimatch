import { useState } from 'react'
import { Plus, Trash2, Star, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChampNombre } from '@/components/ui/champ-nombre'
import { PrixParCompteur } from '@/components/recommandation/PrixParCompteur'
import { FichierOffre } from '@/components/recommandation/FichierOffre'
import {
  useAjouterOffre,
  useUpdateOffrePartiel,
  useSupprimerOffre,
  useRetenirOffre,
  libelleOffre,
  STATUTS_OFFRE,
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
  EN_ATTENTE: 'bg-kw-muted text-kw-meta',
  ACCEPTEE: 'bg-kw-blue-light text-kw-blue',
  REFUSEE: 'bg-kw-red-light text-kw-red',
  RECUE: 'bg-kw-green-light text-kw-green',
}

/** Affiche un budget somme des points de livraison — lecture seule, il se saisit dans le détail. */
function BudgetCalcule({ valeur }: { valeur: number | null }) {
  if (valeur == null) {
    return (
      <span
        title="Se calcule en additionnant les points de livraison — saisir les prix dans « Détail par compteur »"
        className="cursor-help font-mono text-kw-base text-kw-ghost"
      >
        — €/an
      </span>
    )
  }
  return (
    <span
      title="Somme des points de livraison de cette offre"
      className="cursor-help font-mono text-kw-base font-bold text-kw-ink"
    >
      {Math.round(valeur).toLocaleString('fr-FR')} €/an
    </span>
  )
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

  const volume = somme((d) => d.consommation_annuelle_reference_mwh)
  const energie = somme((d) => d.cout_fourniture_annuel_ht)
  return {
    // Prix moyen : le budget énergie rapporté aux volumes. C'est un RÉSULTAT, plus une saisie — le
    // prix se tape par composante et par PDL, l'offre en affiche le résumé. Un seul endroit pour
    // écrire, un seul pour lire.
    prixMoyen: energie != null && volume != null && volume > 0 ? energie / volume : null,
    energie,
    abonnement: somme((d) => d.prix_gaz?.abonnement_fourniture_annuel_ht ?? d.prix_electricite?.abonnement_fourniture_annuel_ht),
    contribution: somme((d) => d.cout_acheminement_annuel_ht),
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
  peutModifier,
  signaler,
}: {
  fournisseur: FournisseurConsulte
  optimisationId: string
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
  const ajouter = useAjouterOffre()
  const majOffre = useUpdateOffrePartiel()
  const supprimer = useSupprimerOffre()
  const retenir = useRetenirOffre()
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
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
        <p className="text-kw-base text-kw-faint">
          Aucune offre attendue enregistrée pour ce fournisseur.
          {peutModifier && ' Ajoutez-en une dès qu\'il répond.'}
        </p>
      ) : (
        offres.map((offre) => {
          const sommes = sommesDesPdl(offre)
          const recue = offre.statut === 'RECUE'
          const refusee = offre.statut === 'REFUSEE'
          return (
            <div
              key={offre.id}
              className={cn(
                'rounded-kw-md border px-2.5 py-2',
                offre.est_offre_recommandee
                  ? 'border-[#dcc39c] bg-[#fdf9f0]'
                  : refusee
                    ? 'border-kw-border-subtle bg-kw-subtle opacity-70'
                    : 'border-kw-border-subtle bg-white',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {/* Ce qui distingue l'offre : durée et type de prix. Tous deux modifiables — un
                    fournisseur répond parfois sur une durée qu'on ne lui a pas demandée. */}
                <span className="font-mono text-kw-md font-extrabold text-kw-ink">
                  {libelleOffre(offre.duree_mois, offre.type_prix)}
                </span>

                {peutModifier ? (
                  <select
                    value={offre.statut ?? 'EN_ATTENTE'}
                    onChange={(e) => patcher(offre, { statut: e.target.value }, `✓ ${libelleOffre(offre.duree_mois, offre.type_prix)} : ${STATUTS_OFFRE.find((st) => st.code === e.target.value)?.libelle}`)}
                    className={cn(
                      'rounded-kw-xs border-0 px-1.5 py-0.5 text-kw-micro font-extrabold uppercase tracking-[0.05em] outline-none',
                      TON_STATUT[offre.statut ?? 'EN_ATTENTE'] ?? 'bg-kw-muted text-kw-meta',
                    )}
                  >
                    {STATUTS_OFFRE.map((st) => (
                      <option key={st.code} value={st.code}>{st.libelle}</option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={cn(
                      'rounded-kw-xs px-1.5 py-0.5 text-kw-micro font-extrabold uppercase tracking-[0.05em]',
                      TON_STATUT[offre.statut ?? 'EN_ATTENTE'] ?? 'bg-kw-muted text-kw-meta',
                    )}
                  >
                    {STATUTS_OFFRE.find((st) => st.code === offre.statut)?.libelle ?? offre.statut ?? 'En attente'}
                  </span>
                )}

                <span className="flex-1" />

                {peutModifier && (
                  <>
                    <button
                      type="button"
                      title={offre.est_offre_recommandee ? 'Offre retenue — cliquer pour ne plus la retenir' : 'Retenir cette offre : c\'est elle que reprend le comparatif des versions'}
                      onClick={async () => {
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
                        'inline-flex items-center gap-1 rounded-kw-sm px-1.5 py-0.5 text-kw-micro font-extrabold uppercase tracking-[0.05em]',
                        offre.est_offre_recommandee
                          ? 'bg-[#8a4b2a] text-white'
                          : 'border border-kw-border-strong bg-white text-kw-meta hover:bg-kw-bg',
                      )}
                    >
                      <Star className={cn('h-2.5 w-2.5', offre.est_offre_recommandee && 'fill-current')} />
                      {offre.est_offre_recommandee ? 'Retenue' : 'Retenir'}
                    </button>
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
                      className="rounded-kw-sm p-0.5 text-kw-ghost hover:bg-kw-red-light hover:text-kw-red"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>

              {/*
                Les cinq budgets de l'offre, en €/an (demande du 19/08/2026). Ils remplacent le
                triptyque « prix / budget / économie » : le prix au MWh n'était pas de la même nature
                que les deux autres, et il manquait la décomposition.

                Énergie, abonnement et contribution sont la SOMME des points de livraison : ils ne
                sont pas saisissables ici, parce qu'ils se saisissent là où ils se décident — dans le
                détail par compteur. Deux endroits pour un même chiffre finissent toujours par se
                contredire.

                Le total et l'économie, eux, existent en propre sur l'offre : un fournisseur annonce
                parfois un budget global sans détailler, et il faut pouvoir le noter tel quel.
              */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Prix moyen</span>
                  {sommes.prixMoyen != null ? (
                    <span
                      title="Budget énergie rapporté aux volumes des points de livraison — calculé, non saisi"
                      className="cursor-help font-mono text-kw-base font-bold text-kw-ink"
                    >
                      {sommes.prixMoyen.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh
                    </span>
                  ) : (
                    <span
                      title="Se calcule dès qu'un prix et une consommation sont saisis dans « Détail par compteur »"
                      className="cursor-help font-mono text-kw-base text-kw-ghost"
                    >
                      — €/MWh
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Budget énergie</span>
                  <BudgetCalcule valeur={sommes.energie} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Budget abonnement</span>
                  <BudgetCalcule valeur={sommes.abonnement} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Budget contribution</span>
                  <BudgetCalcule valeur={sommes.contribution} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Budget total</span>
                  <ChampNombre
                    valeur={offre.montant_annuel_ht}
                    suffixe="€/an"
                    placeholder="— €/an"
                    titre="Budget total annuel HT de l'offre — c'est ce montant que reprend le comparatif des versions"
                    peutModifier={peutModifier}
                    onCommit={(v) => patcher(offre, { montant_annuel_ht: v }, v != null ? `✓ Budget total : ${v.toLocaleString('fr-FR')} €/an` : 'Budget total effacé')}
                  />
                  {/* Le total des PDL ne colle pas au total saisi : on le signale sans rien réécrire,
                      et on propose de l'aligner. L'écart est souvent la vraie information. */}
                  {sommes.total != null && Math.round(sommes.total) !== Math.round(offre.montant_annuel_ht ?? -1) && peutModifier && (
                    <button
                      type="button"
                      onClick={() => patcher(offre, { montant_annuel_ht: sommes.total }, `✓ Budget total : ${Math.round(sommes.total!).toLocaleString('fr-FR')} €/an`)}
                      title="Reprendre la somme des points de livraison"
                      className="rounded-kw-xs border border-dashed border-kw-border-strong px-1.5 py-px text-kw-micro font-bold text-kw-meta hover:border-kw-green hover:text-kw-green"
                    >
                      = {Math.round(sommes.total).toLocaleString('fr-FR')} €/an
                    </button>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Économie</span>
                  <ChampNombre
                    valeur={offre.economie_annuelle_estimee}
                    suffixe="€/an"
                    placeholder="— €/an"
                    titre="Économie annuelle estimée face au contrat actuel"
                    peutModifier={peutModifier}
                    onCommit={(v) => patcher(offre, { economie_annuelle_estimee: v }, v != null ? `✓ Économie : ${v.toLocaleString('fr-FR')} €/an` : 'Économie effacée')}
                  />
                </span>
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
                  peutModifier={peutModifier}
                  signaler={signaler}
                />

              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                {recue && offre.montant_annuel_ht == null && sommes.total == null && (
                  // Une offre marquée reçue sans aucun chiffre est une contradiction visible : on le
                  // signale plutôt que de la laisser passer pour renseignée.
                  <span className="text-kw-tiny font-semibold text-kw-amber-dark">
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
          <div className="flex flex-wrap items-center gap-2 rounded-kw-md border border-dashed border-[#dcc39c] bg-kw-amber-light px-2.5 py-2">
            <span className="text-kw-base text-kw-label">Offre supplémentaire :</span>
            <input
              type="number"
              min={1}
              max={60}
              value={nouvelleDuree}
              onChange={(e) => setNouvelleDuree(e.target.value.replace(/\D/g, ''))}
              className="w-16 rounded-kw-sm border border-kw-border-strong bg-white px-1.5 py-0.5 font-mono text-kw-base text-kw-ink outline-none"
            />
            <span className="text-kw-base text-kw-meta">mois</span>
            <select
              value={nouveauType}
              onChange={(e) => setNouveauType(e.target.value)}
              className="rounded-kw-sm border border-kw-border-strong bg-white px-1.5 py-0.5 text-kw-base text-kw-ink outline-none"
            >
              {[...new Set([...typesPrixDemandes, 'Fixe', 'Indexé'])].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setAjoutOuvert(false)}
              className="rounded-kw-sm px-2 py-0.5 text-kw-base font-semibold text-kw-meta hover:bg-white"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={ajouter.isPending || !nouvelleDuree}
              onClick={async () => {
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
              className="inline-flex items-center gap-1 rounded-kw-sm bg-[#8a4b2a] px-2 py-0.5 text-kw-base font-bold text-white disabled:opacity-60"
            >
              <Check className="h-3 w-3" /> Ajouter
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAjoutOuvert(true)}
            className="inline-flex items-center gap-1 text-kw-base font-semibold text-kw-green hover:underline"
          >
            <Plus className="h-3 w-3" /> Ajouter une offre de {fournisseur.fournisseur_nom}
          </button>
        )
      )}
    </div>
  )
}

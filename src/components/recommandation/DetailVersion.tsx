import { Mail, Lock, Trash2, ExternalLink, ChevronDown } from 'lucide-react'
import { useMajStatutVersion } from '@/lib/data/recommandations'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { OffresDuFournisseur } from '@/components/recommandation/OffresDuFournisseur'
import { budgetAnnuelDeLOffre } from '@/components/recommandation/CarteOffreEtude'
import { cn } from '@/lib/utils'
import type { ReferenceRow } from '@/lib/data/referenceTables'
import type { VersionRecommandation, Optimisation, FournisseurConsulte, Compteur, OffreFournisseur } from '@/types/domain'

const MISE_EN_CONCURRENCE = 'MISE_EN_CONCURRENCE'

/**
 * L'OFFRE À LAQUELLE TOUTES LES AUTRES SE COMPARENT, sur l'ensemble de la cotation.
 *
 * Michel, 27/08/2026 : la référence est DÉSIGNÉE, pas calculée — « je décide que c'est sur cette
 * offre-là que je vais me baser pour faire le comparatif ». Elle peut être de n'importe quelle
 * nature, y compris l'offre en cours, qui est même le cas le plus fréquent.
 *
 * DEUX DÉFAUTS CORRIGÉS ICI. Avant, le repère était calculé DANS chaque fournisseur : c'était la
 * moins chère de SES offres. Donc (1) ce n'était pas un choix mais un calcul, et (2) chaque
 * fournisseur se comparait à un repère différent — deux offres côte à côte n'étaient pas mesurées à
 * la même aune, et rien ne le disait.
 *
 * LE REPLI RESTE LA MOINS CHÈRE DE TOUTE LA COTATION, tant qu'aucune référence n'est désignée : sans
 * lui, la colonne d'écart serait vide sur tous les dossiers existants. Mais il porte désormais sur
 * l'ensemble, donc il est au moins cohérent d'une offre à l'autre.
 *
 * ══ « LA MOINS CHÈRE » SE MESURE COMME LE BUDGET AFFICHÉ (03/09/2026) ══
 *
 * Le repli ne regardait que `montant_annuel_ht`, le total annuel saisi à la main sur l'offre. Or la
 * carte d'offre affiche ce total À DÉFAUT la somme de ses points de livraison — et c'est cette somme
 * que produit la modale de saisie des prix, qui ne remplit pas le total annuel. Une cotation entière
 * chiffrée point par point n'avait donc aucun repère, et la colonne d'écart restait vide partout.
 *
 * Les deux endroits mesurent désormais un budget de la même façon, celle de `budgetAnnuelDeLOffre` :
 * une seule définition de « la moins chère » pour toute l'application.
 */
function repereDeLaCotation(optimisation: Optimisation): OffreFournisseur | null {
  const toutes = optimisation.fournisseurs_consultes.flatMap((f) => f.offres)
  const designee = toutes.find((o) => o.est_offre_reference)
  if (designee) return designee
  return toutes
    .filter((o) => budgetAnnuelDeLOffre(o) != null)
    .reduce<OffreFournisseur | null>(
      (a, o) => (a == null || budgetAnnuelDeLOffre(o)! < budgetAnnuelDeLOffre(a)! ? o : a),
      null,
    )
}

/**
 * Détail de la version affichée : optimisations, offres reçues, et suivi des fournisseurs consultés.
 *
 * CE BLOC N'EST PAS DANS LA MAQUETTE, et il est gardé volontairement. Le design s'arrête au
 * comparatif, qui compare des versions mais ne dit rien de la mise en concurrence : qui a été
 * consulté, où en est chacun, quelle offre est arrivée. C'est la matière même d'une cotation, et
 * c'est le seul endroit de l'application où l'on peut enregistrer un suivi de consultation. Le
 * supprimer pour coller au dessin ferait perdre une fonction, pas un ornement.
 *
 * Il est simplement resserré sur LA version affichée, au lieu de dérouler toutes les versions les
 * unes sous les autres comme avant le portage.
 */
export function DetailVersion({
  version,
  statutsVersions,
  onEnvoyerEmail,
  onAjouterFournisseur,
  onChangerStatut,
  statutsConsultation,
  compteurs,
  typeDocumentOffreId,
  peutModifier,
  signaler,
  onSupprimer,
}: {
  version: VersionRecommandation
  statutsVersions: ReferenceRow[]
  onEnvoyerEmail: () => void
  onAjouterFournisseur: (optimisation: Optimisation) => void
  /** Change le statut de la demande, en enregistrant un événement de suivi daté. */
  onChangerStatut: (fc: FournisseurConsulte, statutId: string) => void
  statutsConsultation: ReferenceRow[]
  /** Les compteurs du périmètre, pour la saisie des prix par PDL. */
  compteurs: Compteur[]
  typeDocumentOffreId: string | null
  peutModifier: boolean
  signaler: (message: string) => void
  /** Ouvre la confirmation de suppression, tenue par la fiche : elle sait ce qui va être perdu. */
  onSupprimer: () => void
}) {
  const statutLabel = statutsVersions.find((s) => s.code === version.statut)?.libelle ?? version.statut

  /* ══ LE STATUT DE VERSION, CORRIGEABLE À LA MAIN ══
     Michel, 27/08/2026 : « il faut rendre les statuts de version manuels car il y a eu trop de bugs
     à l'import Salesforce ». Depuis que le Pricing écarte les versions au statut terminal, un statut
     faux hérité de la reprise fait disparaître une consultation de l'écran — il faut donc pouvoir
     le rattraper. Voir useMajStatutVersion. */
  const majStatut = useMajStatutVersion()

  const changerStatutVersion = async (code: string) => {
    const cible = statutsVersions.find((st) => st.code === code)
    // Les tables de référence ont un repli local dont les identifiants ne sont PAS des UUID ('1',
    // 'd1'…). Écrire avec l'un d'eux échoue en base tout en paraissant réussir à l'écran : on
    // refuse donc explicitement au lieu de laisser croire à une correction enregistrée.
    if (!cible || !/^[0-9a-f-]{36}$/i.test(cible.id)) {
      signaler('Statuts de version indisponibles — rechargez la page avant de corriger.')
      return
    }
    try {
      await majStatut.mutateAsync({ versionId: version.id, statutVersionId: cible.id })
      signaler(`✓ Statut de la version : ${cible.libelle}`)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="rounded-[13px] border border-km-line bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-km-line-soft px-[17px] py-3">
        <span className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
          Détail de {version.nom || `la version ${version.numero_version ?? ''}`}
        </span>
        {version.est_figee && (
          <span title="Version figée">
            <Lock className="h-3 w-3 text-km-faint" />
          </span>
        )}
        <span className="flex-1" />
        {version.version_actuelle && <Badge tone="kiwi">Actuelle</Badge>}
        {/* ══ LE STATUT NE S'AFFICHE PLUS ICI ══
            Michel et Naoëlle, appel du 28/08/2026 à 16 h : « c'est la même chose qu'il y a au-dessus
            donc on peut l'enlever » — « parce que sinon ça embrouille trop, il y a trop de statut ».
            Le rail du cycle de vie porte déjà le statut de cette version, en gros et avec le mot
            « actuel ». Le répéter en badge deux lignes plus bas leur a fait croire à une
            désynchronisation entre les deux.

            MAIS LA CORRECTION RESTE, et c'est délibéré : Michel avait demandé la veille de pouvoir
            reprendre un statut à la main, « car il y a eu trop de bugs à l'import Salesforce ». Le
            rail ne sait qu'avancer et clôturer — il ne revient jamais en arrière. Sans ce point de
            reprise, un statut faux hérité de la reprise serait définitif.

            Ce n'est donc plus un second affichage du statut, c'est une action de rattrapage : elle
            porte le mot « corriger » et rien d'autre. */}
        {peutModifier ? (
          <span className="relative inline-flex items-center rounded-km-sm px-1.5 py-0.5 text-km-label font-bold text-km-faint transition-colors hover:bg-km-soft hover:text-km-muted focus-within:bg-km-soft focus-within:text-km-muted">
            <span className="inline-flex items-center gap-1">
              {majStatut.isPending ? 'Enregistrement…' : 'Corriger le statut'}
              <ChevronDown className="h-2.5 w-2.5 opacity-70" />
            </span>
            <select
              aria-label="Corriger le statut de cette version"
              title="Corriger le statut de cette version"
              value={version.statut ?? ''}
              disabled={majStatut.isPending}
              onChange={(e) => changerStatutVersion(e.target.value)}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            >
              {/* Le statut courant reste en tête même s'il a disparu de la table de référence :
                  sinon la liste s'ouvrirait sur une autre valeur et le premier clic écraserait le
                  statut sans que personne l'ait demandé. */}
              {!statutsVersions.some((st) => st.code === version.statut) && version.statut && (
                <option value={version.statut}>{statutLabel}</option>
              )}
              {statutsVersions.map((st) => (
                <option key={st.id} value={st.code ?? ''}>
                  {st.libelle}
                </option>
              ))}
            </select>
          </span>
        ) : null}
        {/* Supprimer une version créée par erreur (demande de la réunion du 17/08/2026). Discret et
            à droite : c'est un geste de rattrapage, pas une action courante. */}
        {peutModifier && (
          <button
            type="button"
            onClick={onSupprimer}
            title="Supprimer cette version"
            className="rounded-km-sm p-1 text-km-faint hover:bg-km-red-soft hover:text-km-red"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3 px-[17px] py-3.5">
        <div>
          <p className="text-km-name text-km-muted">{version.resume || 'Aucun résumé.'}</p>
          {version.contexte_et_hypotheses && (
            <p className="mt-1 text-km-body text-km-muted">{version.contexte_et_hypotheses}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-km-body text-km-faint">
          <span>Motif : {version.motif_creation || '—'}</span>
          {version.economie_pourcentage !== null && (
            <span>Économie : <span className="font-medium text-km-green">{version.economie_pourcentage} %</span></span>
          )}
          {version.niveau_confiance !== null && <span>Confiance : {version.niveau_confiance} %</span>}
          {version.date_presentation_client && (
            <span>Présentée le {new Date(version.date_presentation_client).toLocaleDateString('fr-FR')}</span>
          )}
          {version.date_decision_client && (
            <span>Décision le {new Date(version.date_decision_client).toLocaleDateString('fr-FR')}</span>
          )}
          {version.types_prix.length > 0 && <span>Type de prix : {version.types_prix.join(', ')}</span>}
          {version.contact_id && (
            <span>
              Contact de la version :{' '}
              <EntityLink to={`/contacts/${version.contact_id}`}>{version.contact_nom}</EntityLink>
            </span>
          )}
        </div>

        {version.optimisations.length === 0 ? (
          <p className="text-km-body text-km-faint">Aucune optimisation sur cette version.</p>
        ) : (
          <div className="space-y-2.5 border-t border-km-line pt-3">
            {version.optimisations.map((optimisation) => (
              <div key={optimisation.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-km-body font-semibold text-km-muted">
                    {optimisation.type_optimisation || optimisation.nom}
                  </p>
                  {optimisation.est_retenue && <Badge tone="kiwi">Retenue</Badge>}
                </div>
                {optimisation.gain_estime_annuel !== null && (
                  <p className="text-km-body text-km-muted">
                    Gain estimé : {optimisation.gain_estime_annuel.toLocaleString('fr-FR')} €/an
                    {optimisation.roi_mois !== null ? ` · ROI ${optimisation.roi_mois} mois` : ''}
                  </p>
                )}

                {/*
                  Fournisseurs consultés, et SOUS CHACUN ses offres.
                  « Il faut qu'on voie sous chaque fournisseur consulté la ou les offres
                  différentes, sinon la version ne sert à rien » (Michel, 17/08/2026). Les offres
                  étaient listées à plat sous l'optimisation, sans qu'on sache laquelle venait de
                  qui, et sans pouvoir en comparer deux d'un même fournisseur.
                */}
                {(optimisation.type_optimisation_code === MISE_EN_CONCURRENCE
                  || optimisation.fournisseurs_consultes.length > 0) && (
                  <div className="mt-2 border-t border-km-line pt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-km-body font-bold uppercase tracking-wide text-km-faint">
                        Fournisseurs consultés et offres reçues
                      </p>
                      {peutModifier && (
                        <button
                          type="button"
                          onClick={() => onAjouterFournisseur(optimisation)}
                          className="text-km-body font-semibold text-km-green hover:underline"
                        >
                          + Consulter un fournisseur
                        </button>
                      )}
                    </div>
                    {optimisation.fournisseurs_consultes.length === 0 ? (
                      <p className="pl-2 text-km-body text-km-faint">Aucun fournisseur consulté pour l'instant.</p>
                    ) : (
                      <div className="mt-1.5 space-y-2">
                        {optimisation.fournisseurs_consultes.map((fc) => {
                          const retenue = fc.offres.find((o) => o.est_offre_recommandee)
                          const chiffrees = fc.offres.filter((o) => o.montant_annuel_ht != null || o.prix_moyen_mwh != null)
                          return (
                            <div
                              key={fc.id}
                              className={cn(
                                'rounded-km-md border px-2.5 py-2',
                                retenue ? 'border-[#dcc39c] bg-[#fdf9f0]/60' : 'border-km-line bg-km-soft',
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-km-body font-bold text-km-text">{fc.fournisseur_nom}</p>
                                {/* Ce que ce fournisseur a répondu, d'un coup d'œil. */}
                                {/*
                                  Le circuit de ce fournisseur. « Outil en ligne » veut dire qu'aucune
                                  demande ne part : Erwan va lire les prix chez le fournisseur, et le
                                  suivi démarre directement à « Demande acceptée » (réunion du
                                  17/08/2026, 23:49).
                                */}
                                {fc.mode_consultation === 'OUTIL_EN_LIGNE' ? (
                                  fc.url_outil_consultation ? (
                                    <a
                                      href={fc.url_outil_consultation}
                                      target="_blank"
                                      rel="noreferrer"
                                      title="Ouvrir l'outil de pricing du fournisseur"
                                      className="inline-flex items-center gap-1 rounded-km-sm bg-km-blue-soft px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em] text-km-blue hover:underline"
                                    >
                                      Outil en ligne <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                  ) : (
                                    <span
                                      title="Les prix se consultent directement chez le fournisseur — aucune demande à envoyer. L'adresse de l'outil n'est pas renseignée."
                                      className="rounded-km-sm bg-km-blue-soft px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em] text-km-blue"
                                    >
                                      Outil en ligne
                                    </span>
                                  )
                                ) : (
                                  <span
                                    title="La demande d'offre part par email, puis on attend l'accusé de réception"
                                    className="rounded-km-sm bg-km-soft px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em] text-km-muted"
                                  >
                                    Par email
                                  </span>
                                )}
                                <span className="text-km-body text-km-muted">
                                  {fc.offres.length === 0
                                    ? 'aucune offre suivie'
                                    : `${chiffrees.length}/${fc.offres.length} offre${fc.offres.length > 1 ? 's' : ''} chiffrée${chiffrees.length > 1 ? 's' : ''}`}
                                </span>
                                {/* ══ ELLE NE POUVAIT JAMAIS S'AFFICHER ══
                                    La condition cherchait des offres au statut REFUSEE ou ACCEPTEE.
                                    Or une offre n'a que trois statuts — EN_ATTENTE, DISPONIBLE,
                                    INDISPONIBLE : la pastille était morte depuis la refonte du
                                    28/08/2026, avec le statut « acceptée partiellement » qu'elle
                                    accompagnait.

                                    SON INTENTION RESTE JUSTE, et redevient même possible : un
                                    fournisseur qui répond sur deux sites et pas sur le troisième
                                    produit désormais un vrai mélange, depuis que la propagation qui
                                    aplatissait les offres a été retirée. On la rebranche sur les
                                    statuts réels. */}
                                {fc.offres.some((o) => o.statut === 'INDISPONIBLE') && fc.offres.some((o) => o.statut === 'DISPONIBLE') && (
                                  <span
                                    title="Ce fournisseur a répondu sur une partie du périmètre seulement."
                                    className="rounded-km-sm bg-km-amber-soft px-1.5 py-0.5 text-km-label font-extrabold uppercase tracking-[0.05em] text-km-amber"
                                  >
                                    partiellement disponible
                                  </span>
                                )}
                                <span className="flex-1" />
                                {/*
                                  Le statut de la DEMANDE, au niveau du fournisseur consulté : elle
                                  porte sur toutes ses offres à la fois. Chaque changement ajoute une
                                  ligne datée dans l'historique — c'est un objet d'activité, pas un
                                  champ (réunion du 17/08/2026). « Offre reçue » fait basculer en
                                  reçues les seules offres acceptées.
                                */}
                                {/* Le statut courant se lit sur le badge, le menu ne sert qu'à le
                                    changer. L'invite du menu ne répète donc pas le statut en cours —
                                    elle le faisait, et « Demande envoyée » apparaissait deux fois. */}
                                {fc.statut_actuel && <Badge tone="neutral">{fc.statut_actuel}</Badge>}
                                {peutModifier && (
                                  <select
                                    value=""
                                    onChange={(e) => { if (e.target.value) onChangerStatut(fc, e.target.value) }}
                                    /* LE STATUT SE RECALCULE, ET LE MENU LE DIT. Depuis le
                                       01/09/2026 il se déduit des offres : au moins une en attente
                                       → acceptée, aucune disponible → refusée, sinon disponible. Un
                                       choix manuel reste possible et prime jusqu'au fait suivant —
                                       mais sans cette phrase, le voir changer tout seul après avoir
                                       saisi une offre passerait pour un bogue. */
                                    title="Le statut se recalcule automatiquement d'après les offres du fournisseur. Un choix manuel tient jusqu'au prochain changement d'offre."
                                    className="rounded-km-sm border border-km-line bg-white px-1.5 py-0.5 text-km-body font-semibold text-km-muted outline-none"
                                  >
                                    <option value="">{fc.statut_actuel ? 'Changer…' : 'Statut de la demande…'}</option>
                                    {statutsConsultation
                                      // Le statut deja en cours n'a pas a etre reproposé : le choisir
                                      // ajouterait un evenement de suivi identique au precedent.
                                      .filter((st) => st.libelle !== fc.statut_actuel)
                                      // Chez un fournisseur a outil en ligne, « Demande envoyee » ne
                                      // veut rien dire : rien n'est jamais envoye. Le suivi demarre
                                      // a « Demande acceptee ».
                                      .filter((st) => fc.mode_consultation !== 'OUTIL_EN_LIGNE' || st.code !== 'ENVOYEE')
                                      .map((st) => (
                                        <option key={st.id} value={st.id}>{st.libelle}</option>
                                      ))}
                                  </select>
                                )}
                              </div>

                              {fc.historique.length > 0 && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-km-body text-km-faint hover:text-km-muted">
                                    Historique de consultation ({fc.historique.length})
                                  </summary>
                                  <div className="mt-1 space-y-0.5 border-t border-km-line pt-1">
                                    {fc.historique.map((h) => (
                                      <p key={h.id} className="text-km-body text-km-muted">
                                        {new Date(h.date_evenement).toLocaleDateString('fr-FR')} — {h.statut}
                                        {h.commentaire ? ` · ${h.commentaire}` : ''}
                                      </p>
                                    ))}
                                  </div>
                                </details>
                              )}

                              <OffresDuFournisseur
                                fournisseur={fc}
                                optimisationId={optimisation.id}
                                repere={repereDeLaCotation(optimisation)}
                                version={version}
                                compteurs={compteurs}
                                typeDocumentOffreId={typeDocumentOffreId}
                                dureesDemandees={version.durees}
                                typesPrixDemandes={version.types_prix}
                                peutModifier={peutModifier}
                                signaler={signaler}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Offres sans fournisseur consulté : les 0 ligne actuelles n'en produiront pas, mais
                    une offre orpheline ne doit pas devenir invisible sous prétexte qu'elle ne se
                    range nulle part. */}
                {optimisation.offres.some((o) => !o.optimisation_fournisseur_id) && (
                  <div className="mt-2 border-t border-km-line pt-2">
                    <p className="text-km-body font-bold uppercase tracking-wide text-km-faint">
                      Offres non rattachées à un fournisseur consulté
                    </p>
                    {optimisation.offres
                      .filter((o) => !o.optimisation_fournisseur_id)
                      .map((offre) => (
                        <div key={offre.id} className="mt-1 flex items-center justify-between gap-2 rounded-km bg-km-bg px-2.5 py-1.5">
                          <span className="truncate text-km-body font-semibold text-km-text">
                            {offre.fournisseur_nom} · {offre.nom || offre.reference_offre || 'Offre'}
                          </span>
                          <span className="shrink-0 font-mono text-km-body text-km-muted">
                            {offre.montant_annuel_ht != null ? `${offre.montant_annuel_ht.toLocaleString('fr-FR')} €/an` : '—'}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-km-line pt-2.5">
          <button
            type="button"
            onClick={onEnvoyerEmail}
            className="inline-flex items-center gap-1.5 text-km-body font-semibold text-km-green hover:underline"
          >
            <Mail className="h-3.5 w-3.5" />
            Envoyer cette version par email
          </button>
        </div>
      </div>
    </div>
  )
}

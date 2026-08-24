import { useEffect, useMemo } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Printer } from 'lucide-react'
import { libelleOffre } from '@/lib/data/recommandations'
import { cn } from '@/lib/utils'
import kiweePicto from '@/assets/kiwee-picto.png'
import type {
  Compte,
  Compteur,
  Contact,
  OffreFournisseur,
  Recommandation,
  VersionRecommandation,
} from '@/types/domain'

/**
 * Le compte rendu de consultation : le document qu'on remet au client pour qu'il choisisse.
 *
 * TROIS PAGES, ET PAS UNE DE PLUS. Michel a fourni le 24/08/2026 le cahier des charges exact —
 * page 1 « Décision », page 2 « Comparaison », page 3 « Conditions essentielles » — avec un objectif
 * qui commande tout le reste : « le résultat doit permettre au client de comprendre en moins d'une
 * minute quelle offre retenir, combien elle coûte, combien elle économise et avant quelle date il
 * doit décider ».
 *
 * CE QUI A ÉTÉ SUPPRIMÉ, sur sa liste, et c'est beaucoup : les courbes de marché, la présentation des
 * fournisseurs, le lexique complet, les définitions des producteurs/transporteurs/distributeurs, la
 * répétition de la recommandation sur plusieurs pages, les longues descriptions des composantes
 * tarifaires, les pages ne portant qu'une note, les codes couleur multiples et les jauges peu
 * explicites, la mention « dépliez pour le détail » dans un PDF qui n'est pas interactif, et les
 * informations administratives répétées.
 *
 * CELA REVIENT SUR SA DEMANDE DU 21/08, et il le sait : « chaque offre prend une page, dépliée
 * entièrement » disparaît, puisque « répétition de la recommandation sur plusieurs pages » et
 * « longues descriptions des composantes tarifaires » figurent maintenant parmi les éléments à
 * supprimer. Seule l'offre RETENUE garde ses conditions, en page 3.
 *
 * SA RÈGLE GÉNÉRALE, répétée deux fois pendant l'appel : « on ne met rien qui n'est pas utile. Si ce
 * n'est pas nécessaire, on ne met pas. » Son exemple de ce qu'il faut retirer : la répartition
 * énergie / taxes / acheminement — « c'est joli, c'est vrai, mais personne ne regarde ça ».
 *
 * DEUX POINTS OÙ JE NE PEUX PAS INVENTER, et qui s'affichent donc pour ce qu'ils sont :
 *
 * · LA DATE DE DÉBUT n'existe nulle part dans nos données — ni sur l'offre, ni sur la version. Ce
 *   qui existe, depuis l'import des échéances du 24/08, c'est l'échéance du contrat actuel : la
 *   fourniture commence quand le précédent s'arrête. La ligne l'affiche donc en le disant
 *   (« échéance du contrat actuel »), plutôt que d'annoncer au client une date qu'il n'a pas donnée.
 *
 * · LES COMPOSANTES manquantes affichent « à vérifier » et non un tiret ni un zéro. C'est le mot que
 *   Michel emploie lui-même dans son modèle, et sa règle est explicite : « chaque total doit pouvoir
 *   être reconstitué à partir des colonnes ». Un blanc laisserait croire à une absence de coût.
 */

/** Un montant en euros, ou « à vérifier » quand la composante n'est pas saisie. */
function euros(v: number | null | undefined): string {
  if (v == null) return 'à vérifier'
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'
}

function dateFr(iso: string | null | undefined): string {
  if (!iso) return 'à confirmer'
  return new Date(iso).toLocaleDateString('fr-FR')
}

/** Les composantes d'une offre, additionnées sur tous ses points de livraison. */
function composantes(offre: OffreFournisseur) {
  const lignes = offre.details_par_compteur
  const somme = (lire: (l: (typeof lignes)[number]) => number | null | undefined) => {
    const valeurs = lignes.map(lire).filter((v): v is number => v != null)
    return valeurs.length === 0 ? null : valeurs.reduce((t, v) => t + v, 0)
  }
  return {
    abonnement: somme((l) => l.prix_gaz?.abonnement_fourniture_annuel_ht ?? l.prix_electricite?.abonnement_fourniture_annuel_ht),
    energie: somme((l) => l.cout_fourniture_annuel_ht),
    // « Réseau et taxes » en une seule colonne : c'est ainsi que Michel l'a écrit, et le client ne
    // décide pas sur la répartition entre acheminement et fiscalité.
    reseauEtTaxes: (() => {
      const acheminement = somme((l) => l.cout_acheminement_annuel_ht)
      const taxes = somme((l) => l.cout_taxes_annuel)
      if (acheminement == null && taxes == null) return null
      return (acheminement ?? 0) + (taxes ?? 0)
    })(),
  }
}

export function DocumentComparatif({
  ouvert,
  onFermer,
  reco,
  version,
  compte,
  compteurs,
  contactClient,
  conseiller,
}: {
  ouvert: boolean
  onFermer: () => void
  reco: Recommandation
  version: VersionRecommandation
  compte: Compte | null | undefined
  compteurs: Compteur[]
  /** Le destinataire du document. */
  contactClient: Contact | null | undefined
  /** Le conseiller qui suit le dossier — la recommandation n'en porte que l'identifiant. */
  conseiller: { nom: string; email?: string | null; telephone?: string | null } | null
}) {
  const parId = useMemo(() => new Map(compteurs.map((c) => [c.id, c])), [compteurs])

  // Les offres chiffrées, de la moins chère à la plus chère. Cet ordre définit la référence d'écart.
  const offres = useMemo(
    () =>
      version.optimisations
        .flatMap((o) => o.offres)
        .filter((o) => o.montant_annuel_ht != null)
        .sort((a, b) => (a.montant_annuel_ht ?? 0) - (b.montant_annuel_ht ?? 0)),
    [version],
  )

  const retenue = offres.find((o) => o.est_offre_recommandee) ?? offres[0] ?? null

  // L'ÉCONOMIE ANNONCÉE EST CELLE DE SON MODÈLE : « économie par rapport à l'offre suivante », et non
  // face au contrat actuel. C'est l'écart avec la première offre plus chère que celle retenue.
  const suivante = useMemo(() => {
    if (!retenue) return null
    return offres.find((o) => o.id !== retenue.id && (o.montant_annuel_ht ?? 0) >= (retenue.montant_annuel_ht ?? 0)) ?? null
  }, [offres, retenue])
  const economie =
    retenue && suivante && retenue.montant_annuel_ht != null && suivante.montant_annuel_ht != null
      ? suivante.montant_annuel_ht - retenue.montant_annuel_ht
      : null

  const pdl = useMemo(
    () =>
      version.compteurs.map((lien) => {
        const c = parId.get(lien.compteur_id)
        const gaz = c?.type_energie === 'gaz'
        return {
          reference: c?.numero_pdl || lien.label || 'Point de livraison',
          site: c?.site_nom ?? null,
          energie: gaz ? 'Gaz naturel' : 'Électricité',
          volume: gaz ? c?.car_mwh ?? null : c?.consommation_annuelle_mwh ?? null,
          echeance: c?.date_echeance ?? null,
        }
      }),
    [version, parId],
  )

  const energies = [...new Set(pdl.map((l) => l.energie))]
  const volumeTotal = pdl.map((l) => l.volume).filter((v): v is number => v != null).reduce((t, v) => t + v, 0)
  const sites = [...new Set(pdl.map((l) => l.site).filter(Boolean))] as string[]

  // La validité annoncée est la PLUS PROCHE des offres comparées : passé cette date, le comparatif
  // n'est plus opposable, même si d'autres offres tiennent plus longtemps.
  const validite = offres.map((o) => o.date_validite).filter((d): d is string => !!d).sort()[0] ?? null

  // LA DATE DE DÉBUT EST UNE DONNÉE, PAS UNE DÉDUCTION. `version.date_souhaitee` porte la date de
  // livraison attendue, reprise de `Cotation__c.Livraison_attendue_le__c` — renseignée sur 1 899 des
  // 2 022 versions. Ma première version affichait à sa place l'échéance du contrat actuel, faute
  // d'avoir cherché ce champ : une déduction correcte, mais ce n'est pas ce que le client a demandé.
  //
  // L'échéance reste le repli quand la date souhaitée manque : la fourniture commence bien quand le
  // contrat précédent s'arrête, et la ligne dit alors d'où vient la date.
  const echeances = pdl.map((l) => l.echeance).filter((d): d is string => !!d).sort()
  const debutSouhaite = version.date_souhaitee ?? null
  const debut = debutSouhaite ?? echeances[0] ?? null
  const debutsDifferents = !debutSouhaite && new Set(echeances).size > 1

  const nomDuClient = compte?.nom ?? reco.compte_nom ?? null

  // Le navigateur écrit le titre de l'onglet en tête de chaque page : le rapport client sortait
  // marqué « Kimatch », qui est notre CRM interne (signalé le 20/08/2026). On lui substitue le nom du
  // document le temps de l'impression.
  useEffect(() => {
    if (!ouvert) return
    const titreDeLOnglet = document.title
    const titreDuRapport = ['Kiwee - Compte rendu de consultation', nomDuClient].filter(Boolean).join(' - ')
    const avant = () => { document.title = titreDuRapport }
    const apres = () => { document.title = titreDeLOnglet }
    window.addEventListener('beforeprint', avant)
    window.addEventListener('afterprint', apres)
    return () => {
      window.removeEventListener('beforeprint', avant)
      window.removeEventListener('afterprint', apres)
      document.title = titreDeLOnglet
    }
  }, [ouvert, nomDuClient])

  const comp = retenue ? composantes(retenue) : null
  const detailRetenue = retenue?.details_par_compteur[0] ?? null

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Compte rendu de consultation"
      description={`Version ${version.numero_version ?? ''} — ${offres.length} offre${offres.length > 1 ? 's' : ''} chiffrée${offres.length > 1 ? 's' : ''} · trois pages`}
      className="max-w-5xl print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      <div className="mb-4 flex items-center gap-2 border-b border-kw-border pb-3 print:hidden">
        <p className="mr-auto text-kw-sm text-kw-meta">
          Trois pages : la décision, la comparaison, les conditions. Le bouton ouvre la fenêtre
          d'impression du navigateur, où « Enregistrer au format PDF » produit le fichier.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={offres.length === 0}
          className="inline-flex items-center gap-1.5 rounded-kw-md bg-kw-green px-3.5 py-2 text-kw-sm font-bold text-white shadow-kw-green hover:brightness-95 disabled:opacity-50 disabled:shadow-none"
        >
          <Printer className="h-3.5 w-3.5" />
          Télécharger le rapport
        </button>
      </div>

      {offres.length === 0 || !retenue ? (
        <p className="rounded-kw-lg border border-dashed border-kw-border-strong bg-kw-subtle p-4 text-kw-base text-kw-meta">
          Aucune offre de cette version n'a de budget annuel. Le compte rendu se remplit dès qu'un prix
          est saisi sur un point de livraison : le budget de chaque offre en découle.
        </p>
      ) : (
        <div id="document-comparatif" className="bg-white text-kw-ink">

          {/* ══════════ PAGE 1 — DÉCISION ══════════ */}
          <section>
            {/* L'expéditeur et le destinataire, une fois et sur cette page seulement. « Informations
                administratives répétées » est sur la liste des choses à supprimer : elles ne sont
                donc plus reprises en pied de page ni en tête des suivantes. */}
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-kw-border pb-3">
              <div className="flex items-center gap-2">
                <img src={kiweePicto} alt="" className="h-6 w-auto" />
                <span className="font-display text-kw-md font-extrabold leading-none tracking-[-0.02em]">Kiwee</span>
              </div>
              <div className="text-right text-kw-tiny leading-snug text-kw-body">
                {conseiller?.nom && <span className="block font-bold">{conseiller.nom}</span>}
                {conseiller?.email && <span className="block text-kw-faint">{conseiller.email}</span>}
                {conseiller?.telephone && <span className="block text-kw-faint">{conseiller.telephone}</span>}
              </div>
            </header>

            <h1 className="mt-5 font-display text-kw-lg font-extrabold uppercase leading-tight tracking-[-0.01em]">
              Compte rendu de consultation — {energies.join(' et ')}
            </h1>

            <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
              <Ligne libelle="Client" valeur={nomDuClient ?? '—'} />
              <Ligne
                libelle={sites.length > 1 ? 'Sites' : 'Site'}
                valeur={sites.length === 0 ? '—' : sites.length <= 2 ? sites.join(', ') : `${sites.length} sites`}
              />
              <Ligne
                libelle="Consommation de référence"
                valeur={volumeTotal > 0 ? `${volumeTotal.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh/an` : 'à vérifier'}
              />
              <Ligne
                libelle="Date de début"
                valeur={debut ? `${dateFr(debut)}${debutsDifferents ? ' au plus tôt' : ''}` : 'à confirmer'}
                precision={debutSouhaite ? undefined : debut ? 'échéance du contrat actuel' : undefined}
              />
              <Ligne libelle="Validité des offres" valeur={dateFr(validite)} />
              {contactClient && (
                <Ligne
                  libelle="À l'attention de"
                  valeur={[contactClient.prenom, contactClient.nom].filter(Boolean).join(' ')}
                />
              )}
            </dl>

            {/* L'OFFRE RECOMMANDÉE. C'est la seule chose que le client doit retenir de la page. */}
            <div className="mt-6 rounded-kw-lg border-2 border-kw-green bg-kw-green-tint p-4">
              <p className="text-kw-tiny font-extrabold uppercase tracking-[0.09em] text-kw-green">
                Offre recommandée
              </p>
              <p className="mt-1 font-display text-kw-lg font-extrabold leading-tight">
                {retenue.fournisseur_nom} — {libelleOffre(retenue.duree_mois, retenue.type_prix)}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-10 gap-y-2">
                <div>
                  <p className="text-kw-tiny font-bold uppercase tracking-[0.07em] text-kw-meta">Budget annuel</p>
                  <p className="font-mono text-kw-lg font-extrabold tabular-nums">
                    {euros(retenue.montant_annuel_ht)} <span className="text-kw-sm font-bold">HTVA</span>
                  </p>
                </div>
                {economie != null && economie > 0 && (
                  <div>
                    <p className="text-kw-tiny font-bold uppercase tracking-[0.07em] text-kw-meta">
                      Économie par rapport à l'offre suivante
                    </p>
                    <p className="font-mono text-kw-lg font-extrabold tabular-nums text-kw-green">
                      {euros(economie)}/an
                    </p>
                  </div>
                )}
              </div>
            </div>

            <h2 className="mt-5 text-kw-base font-extrabold">Pourquoi cette offre ?</h2>
            <ul className="mt-1 space-y-0.5 text-kw-base leading-snug">
              {/* Chaque raison est vérifiable sur les données affichées, sauf la dernière, qui est la
                  phrase de Michel : elle dit que le commercial a contrôlé la conformité au besoin. */}
              {offres[0]?.id === retenue.id && <li>• Offre la moins chère.</li>}
              {retenue.type_prix && retenue.duree_mois != null && (
                <li>• Prix {retenue.type_prix.toLowerCase()} pendant {retenue.duree_mois} mois.</li>
              )}
              <li>• Conditions conformes au besoin exprimé.</li>
            </ul>

            {validite ? (
              <p className="mt-5 rounded-kw-md bg-kw-muted px-3 py-2 text-kw-base font-bold">
                Décision attendue avant le {dateFr(validite)}.
              </p>
            ) : (
              /* SANS DATE DE VALIDITÉ, PAS DE PHRASE — mais le commercial doit le savoir. Écrire
                 « décision attendue avant le à confirmer » dans un document client serait pire que
                 de ne rien écrire ; taire le manque au commercial le serait aussi. D'où un
                 avertissement qui ne s'imprime pas. */
              <p className="mt-5 rounded-kw-md border border-dashed border-kw-amber bg-kw-amber-light px-3 py-2 text-kw-sm font-semibold text-kw-amber-dark print:hidden">
                Aucune date de validité n'est saisie sur les offres : la phrase « décision attendue
                avant le… » ne peut pas s'écrire, et c'est elle qui fait décider. À renseigner sur
                l'offre avant d'envoyer le document.
              </p>
            )}
          </section>

          {/* ══════════ PAGE 2 — COMPARAISON ══════════ */}
          <section className="mt-10 print:break-before-page">
            <h2 className="font-display text-kw-md font-extrabold">Comparaison des offres</h2>

            {/* UN TABLEAU, PAS DES JAUGES. « Codes couleur multiples et jauges peu explicites » est
                sur la liste à supprimer : les barres de composantes et leur légende disparaissent au
                profit de colonnes qu'on peut additionner. */}
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-kw-sm">
                <thead>
                  <tr className="border-b-2 border-kw-ink text-left">
                    <th className="py-1.5 pr-3 font-bold">Fournisseur</th>
                    <th className="py-1.5 pr-3 font-bold">Durée</th>
                    <th className="py-1.5 pr-3 font-bold">Type de prix</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Abonnement</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Énergie</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Réseau et taxes</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Budget annuel</th>
                    <th className="py-1.5 text-right font-bold">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {offres.map((o) => {
                    const c = composantes(o)
                    const estRetenue = o.id === retenue.id
                    const ecart =
                      o.montant_annuel_ht != null && retenue.montant_annuel_ht != null
                        ? o.montant_annuel_ht - retenue.montant_annuel_ht
                        : null
                    return (
                      <tr
                        key={o.id}
                        className={cn('border-b border-kw-border-faint', estRetenue && 'bg-kw-green-tint font-bold')}
                      >
                        <td className="py-1.5 pr-3">{o.fournisseur_nom}</td>
                        <td className="py-1.5 pr-3">{o.duree_mois != null ? `${o.duree_mois} mois` : '—'}</td>
                        <td className="py-1.5 pr-3">{o.type_prix ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{euros(c.abonnement)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{euros(c.energie)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{euros(c.reseauEtTaxes)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{euros(o.montant_annuel_ht)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {estRetenue ? 'Référence' : ecart == null ? '—' : `+${euros(ecart)}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-kw-tiny leading-snug text-kw-body">
              Tous les montants sont présentés sur une même base, hors TVA. Chaque budget annuel doit
              pouvoir être reconstitué à partir des colonnes qui le précèdent ; « à vérifier » signale
              une composante non saisie, et non un montant nul.
            </p>
          </section>

          {/* ══════════ PAGE 3 — CONDITIONS ESSENTIELLES ══════════ */}
          <section className="mt-10 print:break-before-page">
            <h2 className="font-display text-kw-md font-extrabold">
              Conditions essentielles — {retenue.fournisseur_nom}
            </h2>

            <dl className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
              <Ligne libelle="Durée" valeur={retenue.duree_mois != null ? `${retenue.duree_mois} mois` : 'à vérifier'} />
              <Ligne libelle="Prix" valeur={retenue.type_prix ?? 'à vérifier'} />
              <Ligne libelle="Date de début" valeur={debut ? dateFr(debut) : 'à confirmer'} />
              <Ligne libelle="Budget annuel" valeur={`${euros(retenue.montant_annuel_ht)} HTVA`} />
              <Ligne
                libelle="Prix de la molécule"
                valeur={
                  detailRetenue?.prix_gaz?.prix_energie_mwh != null
                    ? `${detailRetenue.prix_gaz.prix_energie_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh`
                    : retenue.prix_moyen_mwh != null
                      ? `${retenue.prix_moyen_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh`
                      : 'à vérifier'
                }
              />
              <Ligne libelle="Abonnement" valeur={euros(comp?.abonnement)} />
              <Ligne
                libelle="CEE"
                valeur={
                  detailRetenue?.prix_gaz?.prix_cee_mwh != null
                    ? `${detailRetenue.prix_gaz.prix_cee_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh`
                    : 'à vérifier'
                }
              />
              <Ligne
                libelle="CPB"
                valeur={
                  detailRetenue?.prix_gaz?.prix_cpb_mwh != null
                    ? `${detailRetenue.prix_gaz.prix_cpb_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh`
                    : 'à vérifier'
                }
              />
            </dl>

            {/* « Conditions particulières : uniquement si elles influencent la décision » — donc rien
                du tout quand le champ est vide, et pas une ligne « — » qui occuperait la place. */}
            {retenue.description && (
              <div className="mt-3">
                <p className="text-kw-tiny font-bold uppercase tracking-[0.07em] text-kw-meta">
                  Conditions particulières
                </p>
                <p className="mt-0.5 text-kw-base leading-snug">{retenue.description}</p>
              </div>
            )}

            <h3 className="mt-6 text-kw-base font-extrabold">Méthode</h3>
            <p className="mt-0.5 text-kw-sm leading-snug text-kw-body">
              Budget calculé à partir d'une consommation annuelle de{' '}
              {volumeTotal > 0
                ? `${volumeTotal.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh`
                : 'la consommation de référence indiquée'}{' '}
              et des composantes réglementaires applicables à la date de l'analyse. Les mêmes
              hypothèses sont appliquées à toutes les offres comparées.
            </p>
            <p className="mt-2 text-kw-sm leading-snug text-kw-body">
              Kiwee intervient comme courtier et est rémunéré par le fournisseur retenu, sans
              facturation directe au client.
            </p>
          </section>
        </div>
      )}
    </Dialog>
  )
}

/** Une ligne « libellé : valeur », avec sa précision facultative sous la valeur. */
function Ligne({ libelle, valeur, precision }: { libelle: string; valeur: string; precision?: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-kw-border-faint py-1">
      <dt className="shrink-0 text-kw-sm text-kw-meta">{libelle}</dt>
      <dd className="ml-auto text-right text-kw-base font-bold">
        {valeur}
        {precision && <span className="block text-kw-tiny font-normal text-kw-faint">{precision}</span>}
      </dd>
    </div>
  )
}

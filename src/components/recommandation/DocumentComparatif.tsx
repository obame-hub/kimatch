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
 * · LA DATE DE DÉBUT vient de `version.date_souhaitee`, reprise de
 *   `Cotation__c.Livraison_attendue_le__c` — renseignée sur 1 899 des 2 022 versions. J'avais
 *   d'abord écrit qu'elle n'existait pas dans nos données, puis qu'elle n'avait pas été importée :
 *   les deux étaient faux. L'échéance du contrat actuel ne sert que de repli, et la ligne le dit
 *   alors.
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
      className="max-w-6xl print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      <div className="mb-4 flex items-center gap-2 border-b border-kw-border pb-3 print:hidden">
        <p className="mr-auto text-kw-sm text-kw-meta">
          Trois pages en paysage, une par question : quelle offre, à quel prix, à quelles conditions.
          Le bouton ouvre la fenêtre d'impression, où « Enregistrer au format PDF » produit le fichier.
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
        <div id="document-comparatif" className="space-y-6 print:space-y-0">

          {/* ══════════ DIAPOSITIVE 1 — DÉCISION ══════════ */}
          <Diapo>
            <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] print:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex flex-col">
                <Chapeau>Compte rendu de consultation</Chapeau>
                <h1 className="mt-1 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#17211D]">
                  {nomDuClient ?? 'Client'}
                  <span className="block text-[#61706A]">{energies.join(' et ')}</span>
                </h1>

                <dl className="mt-5 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
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
                  <Ligne libelle="Votre conseiller" valeur={conseiller?.nom ?? '—'} precision={conseiller?.email ?? undefined} />
                </dl>

                <span className="flex-1" />

                <h2 className="mt-5 text-[15px] font-extrabold text-[#17211D]">Pourquoi cette offre ?</h2>
                <ul className="mt-1.5 space-y-1">
                  {/* Chaque raison est vérifiable sur les chiffres de la page suivante, sauf la
                      dernière, qui est la phrase de Michel : elle dit que le commercial a contrôlé
                      la conformité au besoin. */}
                  {offres[0]?.id === retenue.id && <Puce>Offre la moins chère des {offres.length} comparées.</Puce>}
                  {retenue.type_prix && retenue.duree_mois != null && (
                    <Puce>Prix {retenue.type_prix.toLowerCase()} pendant {retenue.duree_mois} mois.</Puce>
                  )}
                  <Puce>Conditions conformes au besoin exprimé.</Puce>
                </ul>
              </div>

              {/* LA DÉCISION, À DROITE ET EN GRAND. C'est la seule chose que le client doit retenir
                  de la page ; elle occupe donc une colonne entière plutôt qu'un encadré posé sous
                  du texte. */}
              <div className="flex flex-col justify-center rounded-[18px] bg-gradient-to-br from-[#0D7A5F] to-[#199B78] p-6 text-white">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/70">
                  Offre recommandée
                </p>
                <p className="mt-2 font-display text-[30px] font-extrabold leading-none">{retenue.fournisseur_nom}</p>
                <p className="mt-1 text-[14px] font-semibold text-white/80">
                  {libelleOffre(retenue.duree_mois, retenue.type_prix)}
                </p>

                <div className="mt-6 border-t border-white/25 pt-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/70">Budget annuel</p>
                  <p className="font-mono text-[34px] font-extrabold leading-none tabular-nums">
                    {euros(retenue.montant_annuel_ht)}
                  </p>
                  <p className="text-[11px] text-white/70">hors TVA</p>
                </div>

                {economie != null && economie > 0 && (
                  <div className="mt-4 rounded-[12px] bg-white/15 px-3.5 py-2.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/80">
                      Économie face à l'offre suivante
                    </p>
                    <p className="font-mono text-[20px] font-extrabold leading-tight tabular-nums">
                      {euros(economie)}/an
                    </p>
                  </div>
                )}

                {validite ? (
                  <p className="mt-5 text-[13px] font-bold leading-snug">
                    Décision attendue avant le {dateFr(validite)}.
                  </p>
                ) : (
                  <p className="mt-5 rounded-[10px] border border-dashed border-white/50 px-3 py-2 text-[11px] font-semibold leading-snug print:hidden">
                    Aucune date de validité n'est saisie sur les offres : la phrase « décision
                    attendue avant le… » ne peut pas s'écrire, et c'est elle qui fait décider.
                  </p>
                )}
              </div>
            </div>
          </Diapo>

          {/* ══════════ DIAPOSITIVE 2 — COMPARAISON ══════════ */}
          <Diapo saut>
            <Chapeau>Comparaison</Chapeau>
            <h2 className="mt-1 font-display text-[24px] font-extrabold leading-tight tracking-[-0.01em] text-[#17211D]">
              {offres.length} offre{offres.length > 1 ? 's' : ''} sur la même base
            </h2>

            {/* DES CARTES CÔTE À CÔTE, PAS UN TABLEAU. Michel, 24/08/2026 : « avec seulement deux
                fournisseurs, l'aspect visuel paraît vide ». Un tableau de deux lignes laisse une
                page blanche ; deux cartes remplissent la largeur, et chacune garde ses composantes
                pour que le total reste reconstituable — sa règle. */}
            <div
              className="my-auto grid gap-4"
              style={{ gridTemplateColumns: `repeat(${Math.min(offres.length, 4)}, minmax(0, 1fr))` }}
            >
              {offres.slice(0, 4).map((o) => {
                const c = composantes(o)
                const estRetenue = o.id === retenue.id
                const ecart =
                  o.montant_annuel_ht != null && retenue.montant_annuel_ht != null
                    ? o.montant_annuel_ht - retenue.montant_annuel_ht
                    : null
                return (
                  <div
                    key={o.id}
                    className={cn(
                      'flex flex-col rounded-[16px] border-2 p-5',
                      estRetenue ? 'border-[#0D7A5F] bg-[#F1FAF6]' : 'border-[#D9DFDC] bg-white',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-[19px] font-extrabold leading-tight text-[#17211D]">
                        {o.fournisseur_nom}
                      </p>
                      {estRetenue && (
                        <span className="shrink-0 rounded-full bg-[#0D7A5F] px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white">
                          Recommandée
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] font-semibold text-[#61706A]">
                      {libelleOffre(o.duree_mois, o.type_prix)}
                    </p>

                    <div className="mt-4 space-y-1.5 border-t border-[#D9DFDC] pt-3">
                      <Composante libelle="Abonnement" valeur={euros(c.abonnement)} />
                      <Composante libelle="Énergie" valeur={euros(c.energie)} />
                      <Composante libelle="Réseau et taxes" valeur={euros(c.reseauEtTaxes)} />
                    </div>

                    <div className="mt-4 border-t-2 border-[#17211D] pt-2.5">
                      <p className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-[#61706A]">
                        Budget annuel
                      </p>
                      <p className="font-mono text-[24px] font-extrabold leading-none tabular-nums text-[#17211D]">
                        {euros(o.montant_annuel_ht)}
                      </p>
                      <p className={cn('mt-1 text-[12px] font-bold', estRetenue ? 'text-[#0D7A5F]' : 'text-[#61706A]')}>
                        {estRetenue ? 'Référence' : ecart == null ? '—' : `+ ${euros(ecart)} par an`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="mt-3 text-[10px] leading-snug text-[#61706A]">
              Tous les montants sont hors TVA, sur les mêmes hypothèses. Chaque budget annuel se
              reconstitue à partir des trois composantes qui le précèdent ; « à vérifier » signale une
              composante non saisie, et non un montant nul.
              {offres.length > 4 && ` ${offres.length - 4} autre${offres.length - 4 > 1 ? 's' : ''} offre${offres.length - 4 > 1 ? 's' : ''} chiffrée${offres.length - 4 > 1 ? 's' : ''} n'${offres.length - 4 > 1 ? 'apparaissent' : 'apparaît'} pas sur cette page.`}
            </p>
          </Diapo>

          {/* ══════════ DIAPOSITIVE 3 — CONDITIONS ESSENTIELLES ══════════ */}
          <Diapo saut>
            <Chapeau>Conditions essentielles</Chapeau>
            <h2 className="mt-1 font-display text-[24px] font-extrabold leading-tight tracking-[-0.01em] text-[#17211D]">
              {retenue.fournisseur_nom}
            </h2>

            <div className="mt-4 grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] print:grid-cols-[minmax(0,1fr)_300px]">
              <dl className="grid grid-cols-1 gap-x-8 self-start sm:grid-cols-2">
                <Ligne libelle="Durée" valeur={retenue.duree_mois != null ? `${retenue.duree_mois} mois` : 'à vérifier'} />
                <Ligne libelle="Prix" valeur={retenue.type_prix ?? 'à vérifier'} />
                <Ligne libelle="Date de début" valeur={debut ? dateFr(debut) : 'à confirmer'} />
                <Ligne libelle="Budget annuel" valeur={`${euros(retenue.montant_annuel_ht)} hors TVA`} />
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

              <div className="flex flex-col gap-3 self-start rounded-[16px] bg-[#F1FAF6] p-5">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#0D7A5F]">Méthode</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[#3F4249]">
                    Budget calculé sur une consommation annuelle de{' '}
                    {volumeTotal > 0
                      ? `${volumeTotal.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh`
                      : 'la consommation de référence indiquée'}{' '}
                    et des composantes réglementaires applicables à la date de l'analyse. Les mêmes
                    hypothèses sont appliquées à toutes les offres comparées.
                  </p>
                </div>
                <div className="border-t border-[#D9DFDC] pt-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#0D7A5F]">
                    Notre rémunération
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[#3F4249]">
                    Kiwee intervient comme courtier et est rémunéré par le fournisseur retenu, sans
                    facturation directe au client.
                  </p>
                </div>
              </div>
            </div>

            {/* LE PÉRIMÈTRE COUVERT, et ce n'est pas du remplissage : la page 3 était aux deux
                tiers vide, ce qui est exactement le reproche de Michel sur la page de comparaison
                — « l'aspect visuel paraît vide ». Ce qu'on y met répond à la question que le client
                se pose en signant : sur quoi porte l'offre ? Le tableau dit ses points de
                livraison, leur volume et l'échéance de leur contrat actuel — cette dernière
                disponible depuis l'import de ce matin. */}
            {pdl.length > 0 && (
              <div className="mt-5 border-t border-[#D9DFDC] pt-3">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#61706A]">
                  Périmètre couvert — {pdl.length} point{pdl.length > 1 ? 's' : ''} de livraison
                </p>
                <table className="mt-1.5 w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr className="border-b border-[#D9DFDC] text-left text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-[#61706A]">
                      <th className="py-1 pr-3">Site</th>
                      <th className="py-1 pr-3">Référence</th>
                      <th className="py-1 pr-3">Énergie</th>
                      <th className="py-1 pr-3 text-right">Volume annuel</th>
                      <th className="py-1 text-right">Échéance actuelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pdl.slice(0, 8).map((l) => (
                      <tr key={l.reference} className="border-b border-[#F1FAF6]">
                        <td className="py-1 pr-3 text-[#17211D]">{l.site ?? '—'}</td>
                        <td className="py-1 pr-3 font-mono text-[11px] text-[#3F4249]">{l.reference}</td>
                        <td className="py-1 pr-3 text-[#3F4249]">{l.energie}</td>
                        <td className="py-1 pr-3 text-right font-mono tabular-nums text-[#17211D]">
                          {l.volume != null ? l.volume.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' MWh' : '—'}
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums text-[#3F4249]">{l.echeance ? dateFr(l.echeance) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pdl.length > 8 && (
                  <p className="mt-1 text-[10px] text-[#61706A]">
                    et {pdl.length - 8} autre{pdl.length - 8 > 1 ? 's' : ''} point{pdl.length - 8 > 1 ? 's' : ''} de livraison.
                  </p>
                )}
              </div>
            )}

            {/* « Conditions particulières : uniquement si elles influencent la décision » — donc rien
                quand le champ est vide, et pas une ligne « — » qui occuperait la place. */}
            {retenue.description && (
              <div className="mt-4 border-t border-[#D9DFDC] pt-3">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#61706A]">
                  Conditions particulières
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#3F4249]">{retenue.description}</p>
              </div>
            )}
          </Diapo>
        </div>
      )}
    </Dialog>
  )
}

/**
 * UNE DIAPOSITIVE, et non un paragraphe de plus dans une page qui défile.
 *
 * Michel, 24/08/2026 : « je souhaite que le document soit généré en PDF avec un style PowerPoint
 * pour plus de dynamisme, plutôt que le format Word actuel. » Trois choses distinguent une
 * diapositive d'un document : le format paysage (réglé dans `@page`), une hauteur FIXE que le
 * contenu remplit au lieu de s'arrêter où il veut, et un pied de page discret.
 *
 * La hauteur de 190 mm est celle d'une page A4 paysage moins ses marges de 10 mm. À l'écran, elle
 * devient un minimum : la fenêtre défile, le papier non.
 */
function Diapo({ children, saut }: { children: React.ReactNode; saut?: boolean }) {
  return (
    <section
      className={cn(
        'flex min-h-[190mm] flex-col rounded-[18px] border border-[#D9DFDC] bg-white p-8 print:h-[183mm] print:min-h-0 print:break-inside-avoid print:overflow-hidden print:rounded-none print:border-0 print:p-0',
        saut && 'print:break-before-page',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <footer className="mt-5 flex items-center gap-2 border-t border-[#D9DFDC] pt-2.5">
        <img src={kiweePicto} alt="" className="h-4 w-auto" />
        <span className="text-[10px] font-bold text-[#17211D]">Kiwee</span>
        <span className="ml-auto text-[9.5px] text-[#61706A]">
          Compte rendu de consultation — {new Date().toLocaleDateString('fr-FR')}
        </span>
      </footer>
    </section>
  )
}

/** Le chapeau en petites capitales espacées, comme au-dessus de chacun de ses titres. */
function Chapeau({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0D7A5F]">{children}</p>
  )
}

/** Une ligne « libellé / valeur », l'un au-dessus de l'autre : plus lisible en grand qu'alignée. */
function Ligne({ libelle, valeur, precision }: { libelle: string; valeur: string; precision?: string }) {
  return (
    <div className="border-b border-[#D9DFDC] py-2">
      <dt className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-[#61706A]">{libelle}</dt>
      <dd className="mt-0.5 text-[14px] font-bold leading-tight text-[#17211D]">
        {valeur}
        {precision && <span className="block text-[10px] font-normal text-[#61706A]">{precision}</span>}
      </dd>
    </div>
  )
}

/** Une composante de budget dans une carte d'offre. */
function Composante({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11.5px] text-[#61706A]">{libelle}</span>
      <span className="font-mono text-[12.5px] font-semibold tabular-nums text-[#17211D]">{valeur}</span>
    </div>
  )
}

function Puce({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-[13px] leading-snug text-[#3F4249]">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#0D7A5F]" />
      <span>{children}</span>
    </li>
  )
}

import { useMemo } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Printer } from 'lucide-react'
import { somme } from '@/lib/calculs/prixOffre'
import { libelleOffre } from '@/lib/data/recommandations'
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
 * REPRODUIT LE RAPPORT ENÉO, sur les deux modèles que Naoëlle a fournis le 20/08/2026 —
 * AO-GN-260812-OJUJ (gaz, AGENCE NANTAISE DE GESTION) et AO-EL-260811-KCAZ (électricité, ÉTUDE
 * CARAUDREY). C'est le document de référence que Michel demandait depuis deux jours : « c'est celui
 * d'Enéo qu'il faut se baser ».
 *
 * SA STRUCTURE, dans l'ordre du modèle :
 *
 *   1. l'en-tête à quatre colonnes — Kiwee, le conseiller, le destinataire, le client ;
 *   2. le titre daté, puis trois encarts : sites, énergie, validité ;
 *   3. la note sur le statut de courtier et le mode de rémunération ;
 *   4. les fournisseurs consultés ;
 *   5. la synthèse annuelle : une colonne par offre, les budgets décomposés jusqu'au TTC, puis les
 *      analyses tarifaires ;
 *   6. le détail par point de livraison ;
 *   7. le lexique des composantes.
 *
 * LA DÉCOMPOSITION SUIT LE MODÈLE À LA LETTRE, et elle diffère selon l'énergie — c'est le point que
 * le rapport a permis de trancher, là où Michel devait « envoyer les documents » :
 *
 *   Total TTC = TVA + Total HTVA          et    Total HTVA = Abonnement + Énergie + Contributions
 *
 *     GAZ          Énergie        Molécule + CEE + CPB
 *                  Contributions  ATRT + ATRD + AGN + CTA
 *     ÉLECTRICITÉ  Énergie        prix par classe + CEE + GO
 *                  Contributions  TURPE + AE + CTA
 *
 * CE QUE CE DOCUMENT NE REPRODUIT PAS, et pourquoi — plutôt que de faire semblant :
 *
 *   · LES COURBES DE PRIX EEX. Aucune donnée de marché n'entre dans Kimatch. Un graphique inventé sur
 *     un document remis au client serait pire que son absence.
 *   · LES DESCRIPTIONS DE FOURNISSEURS (« fondé en 2005, actif au niveau national… »).
 *     `comptes_fournisseurs` n'a pas de champ pour cela ; le document liste les noms.
 *   · LA VOLATILITÉ et l'ÉVOLUTION VERSUS L'OFFRE DE RECONDUCTION. Elles supposent de distinguer
 *     l'offre ACTUELLE et l'offre de RECONDUCTION des offres proposées — c'est l'« offre de
 *     référence » dont Michel parlait le 19/08, qui n'est pas encore modélisée. L'écart entre offres
 *     comparées, lui, est calculé : les deux montants sont dans le tableau.
 *
 * LA TVA EST CALCULÉE À 20 %, le taux des deux modèles (2 687,98 sur 13 439,91 au gaz ; 388,73 sur
 * 1 943,67 en électricité). Le taux est affiché à côté du montant : un taux réduit existe dans
 * certains cas, et il vaut mieux que le lecteur voie lequel a été appliqué.
 */

const TAUX_TVA = 0.2

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
  /** Le destinataire du document, tel que le rapport l'annonce en « À l'attention de ». */
  contactClient: Contact | null | undefined
  /** Le conseiller qui suit le dossier. La recommandation n'en porte que l'identifiant, la page a
   *  la liste des profils : c'est elle qui résout le nom. */
  conseiller: { nom: string; email?: string | null; telephone?: string | null } | null
}) {
  const parId = useMemo(() => new Map(compteurs.map((c) => [c.id, c])), [compteurs])

  const colonnes = useMemo(
    () =>
      version.optimisations
        .flatMap((o) => o.offres)
        .filter((o) => o.montant_annuel_ht != null)
        .sort((a, b) => (a.montant_annuel_ht ?? 0) - (b.montant_annuel_ht ?? 0)),
    [version],
  )

  const retenue = colonnes.find((o) => o.est_offre_recommandee)
  const miseEnAvant = retenue ?? colonnes[0]

  const pdl = useMemo(
    () =>
      version.compteurs.map((lien) => {
        const c = parId.get(lien.compteur_id)
        const gaz = c?.type_energie === 'gaz'
        return {
          lienId: lien.lien_id,
          reference: c?.numero_pdl || lien.label || 'Point de livraison',
          libelle: gaz ? 'PCE' : 'PRM',
          adresse: [c?.adresse, [c?.code_postal, c?.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          site: c?.site_nom ?? null,
          gaz,
          energie: gaz ? 'Gaz naturel' : 'Électricité',
          volume: gaz ? c?.car_mwh ?? null : c?.consommation_annuelle_mwh ?? null,
          segment: c?.segment ?? null,
        }
      }),
    [version, parId],
  )

  // Le rapport annonce l'énergie du dossier en en-tête. Un périmètre mixte existe : on le dit.
  const energies = [...new Set(pdl.map((l) => l.energie))]
  const toutGaz = energies.length === 1 && energies[0] === 'Gaz naturel'
  const volumeTotal = pdl.reduce<number | null>((t, l) => somme(t, l.volume), null)

  /** Les composantes d'une offre, additionnées sur ses points de livraison. */
  function budgets(offre: OffreFournisseur) {
    const cumul = (f: (d: OffreFournisseur['details_par_compteur'][number]) => number | null | undefined) =>
      offre.details_par_compteur.reduce<number | null>((t, d) => somme(t, f(d)), null)
    const parMwh = (f: (d: OffreFournisseur['details_par_compteur'][number]) => number | null | undefined) =>
      // Une composante au MWh devient un budget en la multipliant par le volume de SON point de
      // livraison, jamais par le volume total : deux PDL n'ont pas le même tarif ni le même volume.
      offre.details_par_compteur.reduce<number | null>((t, d) => {
        const prix = f(d)
        const vol = d.consommation_annuelle_reference_mwh
          ?? parId.get(d.compteur_id)?.car_mwh
          ?? parId.get(d.compteur_id)?.consommation_annuelle_mwh
          ?? null
        return prix == null || vol == null ? t : somme(t, prix * vol)
      }, null)

    const abonnement = cumul((d) => d.prix_gaz?.abonnement_fourniture_annuel_ht ?? d.prix_electricite?.abonnement_fourniture_annuel_ht)
    const energie = cumul((d) => d.cout_fourniture_annuel_ht)
    const contributions = somme(
      cumul((d) => (d.prix_gaz ? d.cout_acheminement_annuel_ht : null)),
      cumul((d) => d.prix_electricite?.prix_turpe_annuel_ht),
      cumul((d) => d.prix_electricite?.accise_annuel_ht),
      cumul((d) => d.prix_electricite?.cta_annuel_ht),
    )
    const htva = offre.montant_annuel_ht
    return {
      // Le détail des composantes, dans l'ordre du modèle.
      molecule: parMwh((d) => d.prix_gaz?.prix_energie_mwh),
      cee: somme(parMwh((d) => d.prix_gaz?.prix_cee_mwh), parMwh((d) => d.prix_electricite?.prix_cee_mwh)),
      cpb: parMwh((d) => d.prix_gaz?.prix_cpb_mwh),
      go: parMwh((d) => d.prix_electricite?.prix_go_mwh),
      atrt: parMwh((d) => d.prix_gaz?.prix_atrt_mwh),
      atrd: parMwh((d) => d.prix_gaz?.prix_atrd_mwh),
      agn: parMwh((d) => d.prix_gaz?.prix_agn_mwh),
      ctaGaz: cumul((d) => d.prix_gaz?.cta_annuel_ht),
      turpe: cumul((d) => d.prix_electricite?.prix_turpe_annuel_ht),
      accise: cumul((d) => d.prix_electricite?.accise_annuel_ht),
      ctaElec: cumul((d) => d.prix_electricite?.cta_annuel_ht),
      abonnement,
      energie,
      contributions,
      htva,
      tva: htva == null ? null : htva * TAUX_TVA,
      ttc: htva == null ? null : htva * (1 + TAUX_TVA),
      prixMoyen: energie != null && volumeTotal != null && volumeTotal > 0
        ? somme(energie, abonnement)! / volumeTotal
        : null,
    }
  }

  // La validité annoncée en en-tête est la plus PROCHE des offres comparées : passé cette date, le
  // comparatif n'est plus opposable, même si d'autres offres tiennent plus longtemps.
  const validite = colonnes
    .map((o) => o.date_validite)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null

  const dateDuJour = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Compte rendu de consultation"
      description={`Version ${version.numero_version ?? ''} — ${colonnes.length} offre${colonnes.length > 1 ? 's' : ''} chiffrée${colonnes.length > 1 ? 's' : ''}`}
      className="max-w-6xl print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      <div className="mb-4 flex items-center gap-2 border-b border-kw-border pb-3 print:hidden">
        <p className="mr-auto text-kw-sm text-kw-meta">
          Reproduit le compte rendu Enéo. « Imprimer » ouvre la fenêtre du navigateur, où
          « Enregistrer au format PDF » produit le fichier.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={colonnes.length === 0}
          className="inline-flex items-center gap-1.5 rounded-kw-md bg-kw-green px-3.5 py-2 text-kw-sm font-bold text-white shadow-kw-green hover:brightness-95 disabled:opacity-50 disabled:shadow-none"
        >
          <Printer className="h-3.5 w-3.5" />
          Imprimer / PDF
        </button>
      </div>

      {colonnes.length === 0 ? (
        <p className="rounded-kw-lg border border-dashed border-kw-border-strong bg-kw-subtle p-4 text-kw-base text-kw-meta">
          Aucune offre de cette version n'a de budget total. Le compte rendu se remplit dès qu'un prix
          est saisi sur un point de livraison : le budget total de chaque offre en découle.
        </p>
      ) : (
        <div id="document-comparatif" className="bg-white text-kw-ink">
          {/* ── 1. L'en-tête à quatre colonnes du modèle ────────────────────── */}
          <header className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-kw-border pb-3 lg:grid-cols-4">
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <img src={kiweePicto} alt="" className="h-6 w-auto" />
                <span className="font-display text-kw-md font-extrabold leading-none tracking-[-0.02em]">
                  Kiwee
                </span>
              </div>
              <p className="text-kw-tiny leading-tight text-kw-body">
                KIWEE ENERGIE FRANCE
                <br />131 BOULEVARD PEREIRE
                <br />75017 PARIS
                <br />FRANCE
              </p>
            </div>
            <Bloc titre="Votre conseiller">
              {conseiller?.nom ?? '—'}
              {conseiller?.email && <span className="block text-kw-faint">{conseiller.email}</span>}
              {conseiller?.telephone && <span className="block text-kw-faint">{conseiller.telephone}</span>}
            </Bloc>
            <Bloc titre="À l'attention de">
              {contactClient
                ? [contactClient.prenom, contactClient.nom].filter(Boolean).join(' ')
                : '—'}
              {contactClient?.email && <span className="block text-kw-faint">{contactClient.email}</span>}
              {contactClient?.telephone && <span className="block text-kw-faint">{contactClient.telephone}</span>}
            </Bloc>
            <Bloc titre={compte?.nom ?? reco.compte_nom ?? 'Client'}>
              {pdl[0]?.adresse || '—'}
              <span className="block">France</span>
            </Bloc>
          </header>

          {/* ── 2. Le titre daté et les trois encarts ───────────────────────── */}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-kw-lg font-extrabold leading-tight">
                Compte rendu de consultation
              </h1>
              <p className="text-kw-sm text-kw-meta">au {dateDuJour}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Encart libelle="Sites" valeur={String(new Set(pdl.map((l) => l.site ?? l.reference)).size)} />
              <Encart libelle="Énergie" valeur={energies.join(' et ') || '—'} />
              <Encart
                libelle="Validité"
                valeur={validite ? new Date(validite).toLocaleDateString('fr-FR') : 'à confirmer'}
              />
            </div>
          </div>

          {/* ── 3. Le statut de courtier ────────────────────────────────────── */}
          <section className="mt-3 rounded-kw-md bg-kw-subtle px-3 py-2">
            <h2 className="text-kw-sm font-bold">À propos de notre accompagnement</h2>
            <p className="mt-0.5 text-kw-tiny leading-snug text-kw-body">
              En tant que courtier spécialisé, notre mission est de vous accompagner dans la
              comparaison des offres de fourniture d'énergie. Ce rapport applique des hypothèses
              identiques à l'ensemble des offres présentées, afin qu'elles soient comparables entre
              elles. Conformément à notre statut de courtier, notre prestation est rémunérée par le
              fournisseur retenu, via une commission incluse dans les tarifs proposés : nous ne
              facturons rien directement au client final.
            </p>
          </section>

          {/* ── 4. Les fournisseurs consultés ───────────────────────────────── */}
          <h2 className="mt-5 text-kw-base font-extrabold">Fournisseurs consultés</h2>
          <p className="mb-1.5 text-kw-tiny text-kw-meta">
            {colonnes.length} offre{colonnes.length > 1 ? 's' : ''} chiffrée
            {colonnes.length > 1 ? 's' : ''} sur cette consultation.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(colonnes.map((o) => o.fournisseur_nom).filter(Boolean))].map((nom) => (
              <span key={nom} className="rounded-kw-xs border border-kw-border bg-kw-subtle px-2 py-0.5 text-kw-sm font-semibold">
                {nom}
              </span>
            ))}
          </div>

          {/* ── 5. La synthèse annuelle ─────────────────────────────────────── */}
          <h2 className="mt-5 text-kw-base font-extrabold">
            Synthèse annuelle des {colonnes.length} offre{colonnes.length > 1 ? 's' : ''} de fourniture
          </h2>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full border-collapse text-kw-sm">
              <thead>
                <tr>
                  <th className="w-[26%] border-b-2 border-kw-ink p-1.5 text-left text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">
                    Type d'offre
                  </th>
                  {colonnes.map((o) => {
                    const vedette = o.id === miseEnAvant?.id
                    return (
                      <th
                        key={o.id}
                        className={`border-b-2 p-1.5 text-right align-bottom ${vedette ? 'border-kw-green bg-kw-green-tint' : 'border-kw-ink'}`}
                      >
                        <span className="block text-kw-tiny font-normal text-kw-meta">
                          {o.est_offre_recommandee ? 'Retenue' : 'Proposée'}
                        </span>
                        <span className="block font-display text-kw-base font-extrabold">
                          {o.fournisseur_nom || 'Fournisseur'}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                <Rubrique titre="Caractéristiques" nb={colonnes.length} />
                <Ligne titre="Engagement" colonnes={colonnes} vedette={miseEnAvant?.id}
                  texte={(o) => libelleOffre(o.duree_mois, o.type_prix)} />
                <Ligne titre={toutGaz ? 'Prix molécule' : 'Type de prix'} colonnes={colonnes} vedette={miseEnAvant?.id}
                  texte={(o) => o.type_prix || '—'} />
                {!toutGaz && (
                  <Ligne titre="Énergie verte" colonnes={colonnes} vedette={miseEnAvant?.id}
                    texte={(o) => (budgets(o).go != null && budgets(o).go! > 0 ? 'Incluse' : 'Non incluse')} />
                )}

                <Rubrique titre="Budgets en € / an (1)" nb={colonnes.length} />
                <Montant titre="Total TTC" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).ttc} fort />
                <Montant titre={`TVA (${Math.round(TAUX_TVA * 100)} %)`} colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).tva} discret />
                <Montant titre="Total HTVA" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).htva} fort />
                <Montant titre="Abonnement" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).abonnement} />
                <Montant titre="Énergie" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).energie} />
                <Montant titre="Molécule" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).molecule} sous />
                <Montant titre="CEE" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).cee} sous />
                <Montant titre="CPB" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).cpb} sous />
                <Montant titre="GO" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).go} sous />
                <Montant titre="Contributions" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).contributions} />
                <Montant titre="ATRT" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).atrt} sous />
                <Montant titre="ATRD" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).atrd} sous />
                <Montant titre="AGN" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).agn} sous />
                <Montant titre="TURPE" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).turpe} sous />
                <Montant titre="AE" colonnes={colonnes} vedette={miseEnAvant?.id} val={(o) => budgets(o).accise} sous />
                <Montant titre="CTA" colonnes={colonnes} vedette={miseEnAvant?.id}
                  val={(o) => somme(budgets(o).ctaGaz, budgets(o).ctaElec)} sous />

                <Rubrique titre="Analyses tarifaires" nb={colonnes.length} />
                <Ligne titre="Prix moyen (2)" colonnes={colonnes} vedette={miseEnAvant?.id}
                  texte={(o) => {
                    const p = budgets(o).prixMoyen
                    return p == null ? '—' : `${p.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh`
                  }} />
                {colonnes.length > 1 && (
                  <Ligne titre="Écart avec la moins chère" colonnes={colonnes} vedette={miseEnAvant?.id}
                    texte={(o) => {
                      const base = colonnes[0].montant_annuel_ht ?? 0
                      const a = o.montant_annuel_ht ?? 0
                      if (o.id === colonnes[0].id) return '—'
                      const pct = base > 0 ? ((a - base) / base) * 100 : null
                      return `+ ${Math.round(a - base).toLocaleString('fr-FR')} € / an HTVA`
                        + (pct != null ? ` (${pct.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)` : '')
                    }} />
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-kw-micro leading-snug text-kw-faint">
            (1) Budget annuel moyen établi selon le profil, la consommation annuelle des points de
            livraison et les composantes réglementaires en vigueur au moment de l'analyse. Il inclut
            l'intégralité des composantes facturées par les fournisseurs.
            <br />
            (2) Le prix moyen est un indicateur : la somme des budgets Abonnement et Énergie rapportée
            à la consommation annuelle des points de livraison.
          </p>

          {/* ── 6. Le détail par point de livraison ─────────────────────────── */}
          <h2 className="mt-6 text-kw-base font-extrabold">
            Détail des {colonnes.length} offre{colonnes.length > 1 ? 's' : ''} de fourniture par point
            de livraison
          </h2>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full border-collapse text-kw-sm">
              <thead>
                <tr>
                  <th className="border-b border-kw-border p-1.5 text-left text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">
                    Point de livraison
                  </th>
                  <th className="border-b border-kw-border p-1.5 text-right text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">
                    Conso. annuelle
                  </th>
                  {colonnes.map((o) => (
                    <th
                      key={o.id}
                      className={`border-b border-kw-border p-1.5 text-right text-kw-tiny font-bold ${o.id === miseEnAvant?.id ? 'bg-kw-green-tint text-kw-green' : 'text-kw-meta'}`}
                    >
                      {o.fournisseur_nom || 'Fournisseur'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pdl.map((l) => (
                  <tr key={l.lienId} className="border-b border-kw-border-faint">
                    <td className="p-1.5">
                      <span className="text-kw-tiny font-bold text-kw-faint">{l.libelle}</span>{' '}
                      <span className="font-mono text-kw-sm">{l.reference}</span>
                      <span className="ml-1.5 rounded-kw-xs bg-kw-muted px-1.5 py-px text-kw-micro font-bold text-kw-meta">
                        {l.energie}
                      </span>
                      {l.segment && (
                        <span className="ml-1 text-kw-micro text-kw-faint">{l.segment}</span>
                      )}
                      {(l.site || l.adresse) && (
                        <span className="block text-kw-tiny text-kw-faint">
                          {[l.site, l.adresse].filter(Boolean).join(' — ')}
                        </span>
                      )}
                    </td>
                    <td className="p-1.5 text-right font-mono tabular-nums text-kw-meta">
                      {l.volume != null
                        ? `${l.volume.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} MWh`
                        : '—'}
                    </td>
                    {colonnes.map((o) => {
                      const d = o.details_par_compteur.find((x) => x.version_recommandation_compteur_id === l.lienId)
                      return (
                        <td
                          key={o.id}
                          className={`p-1.5 text-right font-mono tabular-nums ${o.id === miseEnAvant?.id ? 'bg-kw-green-tint font-bold' : ''}`}
                        >
                          {d?.cout_total_annuel_estime_ht != null
                            ? `${Math.round(d.cout_total_annuel_estime_ht).toLocaleString('fr-FR')} €`
                            : <span className="text-kw-ghost">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 7. Le lexique ───────────────────────────────────────────────── */}
          <h2 className="mt-6 text-kw-base font-extrabold">Lexique</h2>
          <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {(toutGaz ? LEXIQUE_GAZ : LEXIQUE_ELEC).map((e) => (
              <div key={e.terme}>
                <span className="block text-kw-sm font-bold">{e.terme}</span>
                <span className="block text-kw-tiny leading-snug text-kw-body">{e.definition}</span>
              </div>
            ))}
          </div>

          <footer className="mt-6 flex items-end justify-between gap-6 border-t border-kw-ink pt-2">
            <p className="max-w-[70%] text-kw-micro leading-snug text-kw-faint">
              Montants annuels établis sur les volumes de référence indiqués. Un tiret signale une
              donnée non renseignée, et non un montant nul. Les prix restent soumis aux conditions du
              fournisseur et à la date de validité de son offre.
            </p>
            <div className="flex items-center gap-1.5 text-kw-tiny text-kw-faint">
              <img src={kiweePicto} alt="" className="h-4 w-auto" />
              <span className="font-semibold">Kiwee</span>
            </div>
          </footer>
        </div>
      )}
    </Dialog>
  )
}

/**
 * Le lexique, reformulé à partir des définitions du rapport.
 *
 * REFORMULÉ ET NON RECOPIÉ : ce sont des notions réglementaires, mais le texte du modèle appartient à
 * son éditeur. Les définitions disent la même chose dans nos mots.
 */
const LEXIQUE_GAZ = [
  { terme: 'Molécule', definition: 'Le gaz lui-même : la part de la facture proportionnelle au volume consommé. Son prix est fixé par le contrat de fourniture.' },
  { terme: 'CEE', definition: 'Certificats d’économies d’énergie. Dispositif qui oblige les fournisseurs à promouvoir l’efficacité énergétique ; le coût dépend du fournisseur.' },
  { terme: 'CPB', definition: 'Certificats de production de biogaz : ils attestent qu’une quantité d’énergie a été produite à partir de biométhane. Coût défini au contrat.' },
  { terme: 'ATRT', definition: 'Accès des tiers au réseau de transport. Finance le réseau géré par NaTran et Teréga ; tarif fixé par la CRE, identique chez tous les fournisseurs.' },
  { terme: 'ATRD', definition: 'Accès des tiers au réseau de distribution (GRDF et entreprises locales). Tarif fixé par la CRE, identique chez tous les fournisseurs.' },
  { terme: 'AGN', definition: 'Accise sur les gaz naturels, ex-TICGN. Taxe fixée par l’État, identique chez tous les fournisseurs.' },
  { terme: 'CTA', definition: 'Contribution tarifaire d’acheminement. Finance les retraites des industries électriques et gazières ; identique chez tous les fournisseurs.' },
]

const LEXIQUE_ELEC = [
  { terme: 'Classes horosaisonnières', definition: 'Le prix de l’électricité varie selon la période : heures pleines ou creuses, hiver ou été, pointe. Chaque classe a son prix et son volume.' },
  { terme: 'CEE', definition: 'Certificats d’économies d’énergie. Dispositif qui oblige les fournisseurs à promouvoir l’efficacité énergétique ; le coût dépend du fournisseur.' },
  { terme: 'GO', definition: 'Garanties d’origine : elles attestent qu’une quantité d’électricité a été produite à partir de sources renouvelables. C’est la part « énergie verte » de l’offre.' },
  { terme: 'TURPE', definition: 'Tarif d’utilisation des réseaux publics d’électricité. Finance le transport et la distribution ; fixé par la CRE, identique chez tous les fournisseurs.' },
  { terme: 'AE', definition: 'Accise sur l’électricité, ex-TICFE. Taxe fixée par l’État, identique chez tous les fournisseurs.' },
  { terme: 'CTA', definition: 'Contribution tarifaire d’acheminement. Finance les retraites des industries électriques et gazières ; identique chez tous les fournisseurs.' },
  { terme: 'Abonnement', definition: 'Part fixe de la facture, indépendante du volume consommé. En électricité, elle est comptée dans le budget énergie.' },
]

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-kw-micro font-bold uppercase tracking-[0.1em] text-kw-faint">{titre}</span>
      <p className="text-kw-tiny leading-tight text-kw-body">{children}</p>
    </div>
  )
}

function Encart({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="min-w-[92px] rounded-kw-md border border-kw-border bg-kw-subtle px-2.5 py-1.5">
      <span className="block text-kw-micro font-bold uppercase tracking-[0.1em] text-kw-faint">{libelle}</span>
      <span className="block text-kw-base font-extrabold leading-tight">{valeur}</span>
    </div>
  )
}

/** Un intitulé de rubrique, comme les bandeaux « Caractéristiques » ou « Budgets » du modèle. */
function Rubrique({ titre, nb }: { titre: string; nb: number }) {
  return (
    <tr className="bg-kw-muted">
      <td colSpan={nb + 1} className="px-1.5 py-1 text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-label">
        {titre}
      </td>
    </tr>
  )
}

/** Une ligne de texte : engagement, type de prix, prix moyen. */
function Ligne({ titre, colonnes, texte, vedette }: {
  titre: string
  colonnes: OffreFournisseur[]
  texte: (o: OffreFournisseur) => string
  vedette?: string
}) {
  return (
    <tr className="border-b border-kw-border-faint">
      <td className="p-1.5 text-kw-meta">{titre}</td>
      {colonnes.map((o) => (
        <td key={o.id} className={`p-1.5 text-right ${o.id === vedette ? 'bg-kw-green-tint' : ''}`}>
          {texte(o)}
        </td>
      ))}
    </tr>
  )
}

/**
 * Une ligne de montant.
 *
 * MASQUÉE SI AUCUNE OFFRE NE LA RENSEIGNE : sur un document client, une ligne de tirets donne
 * l'impression d'un travail inachevé — et c'est ce qui fait qu'un dossier tout électrique n'affiche
 * aucune composante gaz sans qu'on ait à le configurer.
 */
function Montant({ titre, colonnes, val, vedette, fort, sous, discret }: {
  titre: string
  colonnes: OffreFournisseur[]
  val: (o: OffreFournisseur) => number | null | undefined
  vedette?: string
  fort?: boolean
  sous?: boolean
  discret?: boolean
}) {
  const valeurs = colonnes.map(val)
  if (valeurs.every((v) => v == null)) return null
  return (
    <tr className={fort ? 'border-y border-kw-ink' : 'border-b border-kw-border-faint'}>
      <td className={`p-1.5 ${fort ? 'font-extrabold' : sous ? 'pl-5 text-kw-faint' : 'text-kw-meta'}`}>
        {titre}
      </td>
      {valeurs.map((v, i) => (
        <td
          key={colonnes[i].id}
          className={`p-1.5 text-right font-mono tabular-nums ${colonnes[i].id === vedette ? 'bg-kw-green-tint' : ''} ${
            fort ? 'text-kw-base font-extrabold' : sous || discret ? 'text-kw-tiny text-kw-body' : ''
          }`}
        >
          {v == null ? <span className="text-kw-ghost">—</span> : `${Math.round(v).toLocaleString('fr-FR')} €`}
        </td>
      ))}
    </tr>
  )
}

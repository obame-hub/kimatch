import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Printer } from 'lucide-react'
import { libelleOffre } from '@/lib/data/recommandations'
import { cn } from '@/lib/utils'
import kiweePicto from '@/assets/kiwee-picto.png'
import { CarteOffreEtude } from './CarteOffreEtude'
import { ResumeEtudeClient } from './ResumeEtudeClient'
import type {
  Compte,
  Compteur,
  Contact,
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
 * SA STRUCTURE, telle que Michel l'a cadrée le 20/08/2026 après nous avoir montré Enéo à l'écran —
 * « nous, on veut juste voir ça dans un premier temps : donc fournisseur, budget comparatif, et
 * ensuite après tu peux aller voir le détail » :
 *
 *   1. l'en-tête à quatre colonnes — Kiwee, le conseiller, le destinataire, le client ;
 *   2. le titre daté, puis trois encarts : sites, énergie, validité ;
 *   3. la note sur le statut de courtier et le mode de rémunération ;
 *   4. la synthèse : une colonne par fournisseur, les budgets décomposés jusqu'au TTC ;
 *   5. le détail par point de livraison ;
 *   6. le lexique des composantes.
 *
 * DEUX CHOSES SONT VOLONTAIREMENT ABSENTES, sur sa consigne : « sans les trucs des évolutions, on les
 * rajoutera après. Ni fournisseurs consultés. » Les lignes d'évolution supposent de toute façon une
 * offre de référence qui n'existe pas encore dans le modèle de données. La position tarifaire les
 * remplace : elle classe sans comparer à autre chose que les offres du tableau.
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

  // LE TRI. `colonnes` reste ordonné par prix — c'est lui qui définit la référence d'écart et l'ordre
  // du tableau de synthèse. Seul l'affichage des cartes suit le tri choisi, sinon changer l'ordre
  // changerait aussi ce à quoi on se compare.
  const [tri, setTri] = useState<'total' | 'fournisseur' | 'duree'>('total')

  // LES ONGLETS DE WILLIAM. Naoëlle, 20/08/2026 : « je veux que tu fonctionnes comme William, par
  // onglet, pour que ça ne fasse pas une longue modale comme ça. »
  //
  // Trois onglets là où sa maquette en a quatre : Puissances et Vote n'existent pas encore, et Michel
  // les exclut lui-même. Le compte rendu — en-tête, synthèse annuelle, détail par PDL, lexique — tient
  // dans le troisième : c'est la partie formelle, celle qu'on relit avant d'envoyer.
  //
  // À L'IMPRESSION, TOUT SORT. Les onglets servent à consulter, pas à découper le document : un
  // rapport imprimé auquel il manquerait deux sections selon l'onglet ouvert serait un piège. D'où
  // `print:block` sur chaque section.
  // DEUX ONGLETS, PLUS TROIS. Michel, 21/08/2026 : « on peut mettre juste résumé et comparatif ».
  // L'onglet « Compte rendu » disait la même chose que le comparatif, en moins bien : le détail d'une
  // offre s'obtient en cliquant sur sa carte. Naoëlle, dans le même échange : « ça sert à rien
  // d'avoir deux onglets qui font la même chose ». Ce que le compte rendu portait d'utile — la
  // synthèse annuelle, le détail par point de livraison, le lexique — rejoint le comparatif, dont il
  // fait partie.
  const [onglet, setOnglet] = useState<'resume' | 'comparatif'>('resume')

  // L'ORDRE DES PAGES DE DÉTAIL. Michel, 21/08/2026 : « ce sera présenté par ordre de, évidemment,
  // l'offre recommandée, et ensuite les autres viennent après. » Le reste garde le tri du comparatif.
  const offresDetaillees = useMemo(() => {
    const retenue = colonnes.find((o) => o.est_offre_recommandee)
    if (!retenue) return colonnes
    return [retenue, ...colonnes.filter((o) => o.id !== retenue.id)]
  }, [colonnes])
  const onglets = [
    { cle: 'resume' as const, titre: 'Résumé' },
    { cle: 'comparatif' as const, titre: 'Comparatif d’offres', compte: colonnes.length },
  ]
  const colonnesTriees = useMemo(() => {
    const l = [...colonnes]
    if (tri === 'fournisseur') return l.sort((a, b) => (a.fournisseur_nom ?? '').localeCompare(b.fournisseur_nom ?? ''))
    if (tri === 'duree') return l.sort((a, b) => (a.duree_mois ?? 0) - (b.duree_mois ?? 0))
    return l
  }, [colonnes, tri])

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


  // La validité annoncée en en-tête est la plus PROCHE des offres comparées : passé cette date, le
  // comparatif n'est plus opposable, même si d'autres offres tiennent plus longtemps.
  const validite = colonnes
    .map((o) => o.date_validite)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null

  const dateDuJour = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  // LE NOM DU DOCUMENT IMPRIMÉ. Le navigateur écrit le titre de l'onglet en tête de chaque page :
  // le rapport client sortait donc marqué « Kimatch », qui est notre CRM interne et n'a rien à faire
  // sous les yeux d'un client (signalé le 20/08/2026). On lui substitue le nom du document le temps
  // de l'impression, puis on rend son titre à l'onglet.
  //
  // L'URL en pied de page ne dépend pas de nous : c'est la case « En-têtes et pieds de page » de la
  // fenêtre d'impression, à décocher côté navigateur.
  const nomDuClient = compte?.nom ?? reco.compte_nom ?? null
  useEffect(() => {
    if (!ouvert) return
    const titreDeLOnglet = document.title
    const titreDuRapport = ['Kiwee - Compte rendu de consultation', nomDuClient]
      .filter(Boolean)
      .join(' - ')
    const avant = () => {
      document.title = titreDuRapport
    }
    const apres = () => {
      document.title = titreDeLOnglet
    }
    window.addEventListener('beforeprint', avant)
    window.addEventListener('afterprint', apres)
    return () => {
      window.removeEventListener('beforeprint', avant)
      window.removeEventListener('afterprint', apres)
      document.title = titreDeLOnglet
    }
  }, [ouvert, nomDuClient])

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Résumé de la version"
      description={`Version ${version.numero_version ?? ''} — ${colonnes.length} offre${colonnes.length > 1 ? 's' : ''} chiffrée${colonnes.length > 1 ? 's' : ''}`}
      className="max-w-6xl print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      <div className="mb-4 flex items-center gap-2 border-b border-kw-border pb-3 print:hidden">
        <p className="mr-auto text-kw-sm text-kw-meta">
          Synthèse par fournisseur, puis détail par point de livraison. Le bouton ouvre la fenêtre
          d'impression du navigateur, où « Enregistrer au format PDF » produit le fichier.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={colonnes.length === 0}
          className="inline-flex items-center gap-1.5 rounded-kw-md bg-kw-green px-3.5 py-2 text-kw-sm font-bold text-white shadow-kw-green hover:brightness-95 disabled:opacity-50 disabled:shadow-none"
        >
          <Printer className="h-3.5 w-3.5" />
          Télécharger le rapport
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

          {/* ── 2. L'identification du document, hors des onglets ───────────────
              Le titre daté, le périmètre et le statut de courtier ne dépendent pas de l'onglet
              ouvert : ils disent DE QUOI on parle. Les enfermer dans « Compte rendu » faisait
              perdre le nom du document dès qu'on regardait le résumé. */}
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

          {/* ── La barre d'onglets ── */}
          <nav className="mt-5 flex flex-wrap gap-1 rounded-kw-lg bg-kw-muted p-1 print:hidden">
            {onglets.map((o) => (
              <button
                key={o.cle}
                type="button"
                onClick={() => setOnglet(o.cle)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-kw-md px-3 py-2 text-kw-sm font-bold',
                  onglet === o.cle
                    ? 'bg-white text-kw-ink shadow-kw-panel'
                    : 'text-kw-meta hover:text-kw-ink',
                )}
              >
                {o.titre}
                {o.compte != null && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-kw-micro font-bold',
                      onglet === o.cle ? 'bg-kw-green-light text-kw-green' : 'bg-white text-kw-faint',
                    )}
                  >
                    {o.compte}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Le résumé : ce que le client lit en premier.
              Visible dans son onglet, et TOUJOURS à l'impression : un rapport imprimé
              auquel il manquerait une section selon l'onglet ouvert serait un piège. */}
          <div className={cn('print:block', onglet === 'resume' ? '' : 'hidden')}>
          {/* ── Le résumé, avant le comparatif ──
              L'ordre des onglets de William, qui est aussi celui des questions du client : combien
              j'économise, puis avec qui. Un comparatif ouvert sans résumé oblige à additionner des
              colonnes pour savoir si l'étude valait la peine. */}
          <div className="mt-6">
            <ResumeEtudeClient
              reco={reco}
              version={version}
              compteurs={compteurs}
              offres={colonnes}
              offreRetenue={retenue ?? null}
            />
          </div>

          </div>

          {/* PLUS DE « SYNTHÈSE ANNUELLE ». Naoëlle, 21/08/2026 : « ce bloc il faut l'enlever car on
              a les détails quand on clique sur le fournisseur », puis « la synthèse annuelle en
              colonne, là, il faut l'enlever ».

              Le tableau reprenait, en colonnes, ce que chaque carte d'offre dit déjà quand on
              l'ouvre : total TTC, TVA, HTVA, abonnement, énergie et ses composantes, contributions et
              les leurs. Deux présentations du même chiffre, et deux endroits à corriger quand une
              composante change. Les notes (1) et (2) partent avec lui : elles ne renvoyaient qu'à ses
              lignes.

              À l'impression le détail ne se perd pas : chaque offre a sa page, dépliée entièrement. */}

          {/* Le comparatif et le détail offre par offre.
              Visible dans son onglet, et TOUJOURS à l'impression : un rapport imprimé
              auquel il manquerait une section selon l'onglet ouvert serait un piège.

              PAGE 2 DU DOCUMENT. Naoëlle, 21/08/2026 : « première page compte rendu de consultation,
              deuxième page comparatif d'offres, ensuite chaque page a le détail de l'offre du
              fournisseur par page, et le lexique toujours en dernière page. » Le saut de page ne se
              voit qu'à l'impression — sur un écran qui défile, il n'a aucun effet. */}
          <div
            className={cn(
              'print:block print:break-before-page',
              onglet === 'comparatif' ? '' : 'hidden',
            )}
          >
          {/* ── 5. Le détail offre par offre, au modèle de l'étude client ──
              Michel, 20/08/2026 : « sur le bouton qui sera document comparatif, on pourra reprendre
              encore son même truc » — le même modèle que dans le détail de version, donc le même
              composant. Une seule présentation à apprendre, et une seule à corriger. */}
          {/* ── Le comparatif d'offres, au modèle de l'étude client de William ──
              Michel demande de « reprendre son même truc ». Trois choses de sa maquette manquaient et
              changent la lecture :

                · LA LÉGENDE des quatre couleurs, sans laquelle la barre est un dégradé muet ;
                · LE TRI, parce qu'un client ne cherche pas toujours le moins cher — il compare
                  parfois à durée égale, ou fournisseur par fournisseur ;
                · LE SÉPARATEUR entre le contrat actuel et les offres négociées : c'est lui qui dit
                  ce qui sert de référence, et donc ce que veut dire l'écart affiché à droite. */}
          <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-kw-md font-extrabold">Comparatif d'offres</h2>
            <span className="text-kw-sm text-kw-meta">
              {energies.join(' et ').toLowerCase()} · budgets annuels HT
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {[
              ['Abonnement', 'bg-kw-blue'],
              ['Énergie', 'bg-kw-green'],
              ['TURPE / réseau', 'bg-kw-gold'],
              ['Taxes', 'bg-kw-meta'],
            ].map(([libelle, couleur]) => (
              <span key={libelle} className="flex items-center gap-1.5 text-kw-tiny font-semibold text-kw-label">
                <span className={`h-[9px] w-3 shrink-0 rounded-[3px] ${couleur}`} />
                {libelle}
              </span>
            ))}
            <span className="flex-1" />
            <span className="text-kw-tiny text-kw-faint print:hidden">trier :</span>
            {([['total', 'Total'], ['fournisseur', 'Fournisseur'], ['duree', 'Durée']] as const).map(([cle, libelle]) => (
              <button
                key={cle}
                type="button"
                onClick={() => setTri(cle)}
                className={
                  tri === cle
                    ? 'rounded-kw-md bg-kw-ink px-2.5 py-0.5 text-kw-tiny font-bold text-white print:hidden'
                    : 'rounded-kw-md border border-kw-border-strong bg-white px-2.5 py-0.5 text-kw-tiny font-bold text-kw-label hover:bg-kw-subtle print:hidden'
                }
              >
                {libelle}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2.5">
            <span className="text-kw-tiny font-bold uppercase tracking-[0.09em] text-kw-green">
              Les offres négociées par Kiwee
            </span>
            <span className="h-[1.5px] flex-1 bg-gradient-to-r from-kw-green-border to-transparent" />
            <span className="text-kw-tiny text-kw-faint">
              écart calculé face à la moins chère
            </span>
          </div>

          <div className="mt-1.5 flex flex-col gap-2">
            {colonnesTriees.map((o) => (
              <CarteOffreEtude
                key={o.id}
                offre={o}
                compteurs={compteurs}
                reference={colonnes[0] ?? null}
                avecFournisseur
                avecIdentite
                avecBarre
              />
            ))}
          </div>

          </div>

          {/* Le détail par point de livraison et le lexique, la partie formelle du rapport.
              Visible dans son onglet, et TOUJOURS à l'impression : un rapport imprimé
              auquel il manquerait une section selon l'onglet ouvert serait un piège. */}
          <div className={cn('print:block', onglet === 'comparatif' ? '' : 'hidden')}>
          {/* ── 6. Le détail par point de livraison ─────────────────────────── */}
          <h2 className="mt-8 text-kw-base font-extrabold">
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

          {/* ── LE DÉTAIL, UNE OFFRE PAR PAGE — À L'IMPRESSION SEULEMENT ──
              Michel, 21/08/2026 : « chaque offre, une page. C'est-à-dire que si on en a 10, il y aura
              10 pages. » Et : « cette option de tout déplier d'un coup, c'est uniquement dans le
              document. »

              POURQUOI SEULEMENT À L'IMPRESSION. À l'écran, le détail d'une offre s'obtient en
              cliquant sur sa carte — c'est plus court et ça n'encombre rien. Un PDF, lui, ne se
              clique pas : ce que le clic révélait doit y être ouvert, sinon l'information n'existe
              plus. C'est la même règle que pour les onglets, et elle vient du même constat.

              UNE PAGE PAR OFFRE, LA PREMIÈRE COMPRISE. Elle continuait la page du comparatif ; elle
              ouvre maintenant la sienne, pour que la pagination soit celle que Naoëlle a demandée :
              compte rendu, comparatif, puis une offre par page. */}
          <div className="hidden print:block">
            {offresDetaillees.map((o) => (
              <div key={o.id} className="break-before-page">
                <h2 className="mt-8 text-kw-base font-extrabold">
                  Détail — {o.fournisseur_nom || 'Fournisseur'} · {libelleOffre(o.duree_mois, o.type_prix)}
                  {o.est_offre_recommandee && (
                    <span className="ml-2 rounded-kw-xs bg-kw-green-light px-1.5 py-px text-kw-micro font-bold uppercase tracking-[0.06em] text-kw-green">
                      Notre recommandation
                    </span>
                  )}
                </h2>
                <div className="mt-2">
                  <CarteOffreEtude
                    offre={o}
                    compteurs={compteurs}
                    reference={miseEnAvant ?? null}
                    avecFournisseur
                    avecIdentite
                    avecBarre
                    deplieToujours
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── 7. Le lexique, EN DERNIÈRE PAGE ─────────────────────────────────
              « Le lexique toujours en dernière page. » C'est une annexe : on y revient quand un
              terme arrête la lecture, on ne la lit pas au fil. Elle ouvre donc sa propre page plutôt
              que de finir celle de la dernière offre. */}
          <div className="print:break-before-page">
          <h2 className="mt-8 text-kw-base font-extrabold">Lexique</h2>
          <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {(toutGaz ? LEXIQUE_GAZ : LEXIQUE_ELEC).map((e) => (
              <div key={e.terme}>
                <span className="block text-kw-sm font-bold">{e.terme}</span>
                <span className="block text-kw-tiny leading-snug text-kw-body">{e.definition}</span>
              </div>
            ))}
          </div>
          </div>

          </div>

          <footer className="mt-10 flex items-end justify-between gap-6 border-t border-kw-ink pt-3">
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
 * Le lexique du document client, VÉRIFIÉ AUX SOURCES.
 *
 * REFORMULÉ ET NON RECOPIÉ : ce sont des notions réglementaires, mais le texte du modèle appartient à
 * son éditeur. Les définitions disent la même chose dans nos mots.
 *
 * ET VÉRIFIÉ, DEPUIS LE 21/08/2026. Michel, ce jour-là : « ne déduis rien quand tu ne connais pas un
 * terme ou un fonctionnement, fais des recherches sur internet dans le monde de l'énergie. »
 * L'avertissement portait : ces définitions sont imprimées dans un document remis au client, et j'en
 * avais écrit une FAUSSE.
 *
 * CE QUI A ÉTÉ CORRIGÉ, et sur quelle base :
 *
 * · CPB — je le décrivais comme une attestation d'origine du biométhane. C'en est le contraire : un
 *   QUOTA D'OBLIGATION. Créé par l'article 95 de la loi Climat et Résilience d'août 2021, il oblige
 *   chaque fournisseur de gaz à restituer, depuis le 1er janvier 2026, un nombre de certificats
 *   proportionnel au gaz livré à ses clients résidentiels et tertiaires — 0,0041 certificat par MWh en
 *   2026, 0,0182 en 2027. Le fournisseur peut produire le biométhane ou acheter les certificats sans
 *   le gaz. C'est facturé À PART du prix du gaz. Attester l'origine, c'est le rôle des garanties
 *   d'origine, pas du CPB. Sources : connaissancedesenergies.org, engie-solutions.com,
 *   totalenergies.fr (consultés le 21/08/2026).
 *
 * · CTA — j'omettais l'essentiel de son calcul : elle ne porte PAS sur la consommation mais sur la
 *   part fixe de l'acheminement (le TURPE en électricité, l'ATRD au gaz). C'est ce qui explique
 *   qu'elle apparaisse en euros par an et non au mégawattheure. Taux arrêtés par les ministres après
 *   avis de la CRE, au profit de la caisse des industries électriques et gazières.
 *   Sources : Wikipédia, selectra.info, connaissancedesenergies.org.
 *
 * · AGN et AE — « identique chez tous les fournisseurs » est vrai mais se lisait comme « le même
 *   montant pour tout le monde ». Le taux ne dépend pas du fournisseur, il dépend de l'USAGE et de la
 *   catégorie de client. Ex-TICGN et ex-TICFE, unifiées en accises par l'ordonnance 2021-1843 du
 *   22 décembre 2021, code des impositions sur les biens et services. Sources : opera-energie.com,
 *   dune-energie.fr, selectra.info.
 *
 * · ATRD — révisé chaque 1er juillet, ce qui compte pour un budget annuel : il change en cours
 *   d'année. NaTran est bien le nouveau nom de GRTgaz depuis janvier 2025.
 *   Sources : moncourtierenergie.com, engie.fr, natrangroupe.com.
 *
 * CE QUI N'A PAS ÉTÉ VÉRIFIÉ et reste à faire confirmer par Michel : la définition de la molécule et
 * celle des classes horosaisonnières, qui décrivent nos propres conventions de calcul plus qu'une
 * notion réglementaire.
 */
const LEXIQUE_GAZ = [
  { terme: 'Molécule', definition: 'Le gaz lui-même : la part de la facture proportionnelle au volume consommé. Son prix est fixé par le contrat de fourniture.' },
  { terme: 'CEE', definition: 'Certificats d’économies d’énergie. Dispositif qui oblige les fournisseurs à promouvoir l’efficacité énergétique ; le coût dépend du fournisseur.' },
  { terme: 'CPB', definition: 'Certificats de production de biogaz. Depuis le 1ᵉʳ janvier 2026, chaque fournisseur doit restituer un nombre de certificats proportionnel au gaz livré ; il les produit ou les achète. Facturé à part du prix du gaz, ce coût dépend du fournisseur.' },
  { terme: 'ATRT', definition: 'Accès des tiers au réseau de transport. Finance les grands réseaux de NaTran (ex-GRTgaz) et Teréga ; tarif fixé par la CRE, identique chez tous les fournisseurs.' },
  { terme: 'ATRD', definition: 'Accès des tiers au réseau de distribution (GRDF et entreprises locales). Tarif fixé par la CRE et révisé chaque 1ᵉʳ juillet, identique chez tous les fournisseurs.' },
  { terme: 'AGN', definition: 'Accise sur les gaz naturels, ex-TICGN. Taxe de l’État : son taux dépend de l’usage, jamais du fournisseur.' },
  { terme: 'CTA', definition: 'Contribution tarifaire d’acheminement. Finance les retraites des industries électriques et gazières. Calculée sur la part fixe de l’acheminement et non sur la consommation, elle est identique chez tous les fournisseurs.' },
]

const LEXIQUE_ELEC = [
  { terme: 'Classes horosaisonnières', definition: 'Le prix de l’électricité varie selon la période : heures pleines ou creuses, hiver ou été, pointe. Chaque classe a son prix et son volume.' },
  { terme: 'CEE', definition: 'Certificats d’économies d’énergie. Dispositif qui oblige les fournisseurs à promouvoir l’efficacité énergétique ; le coût dépend du fournisseur.' },
  { terme: 'GO', definition: 'Garanties d’origine : elles attestent qu’une quantité d’électricité a été produite à partir de sources renouvelables. C’est la part « énergie verte » de l’offre.' },
  { terme: 'TURPE', definition: 'Tarif d’utilisation des réseaux publics d’électricité. Finance le transport et la distribution ; fixé par la CRE, identique chez tous les fournisseurs.' },
  { terme: 'AE', definition: 'Accise sur l’électricité, ex-TICFE. Taxe de l’État : son taux dépend de l’usage, jamais du fournisseur.' },
  { terme: 'CTA', definition: 'Contribution tarifaire d’acheminement. Finance les retraites des industries électriques et gazières. Calculée sur la part fixe du TURPE et non sur la consommation, elle est identique chez tous les fournisseurs.' },
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




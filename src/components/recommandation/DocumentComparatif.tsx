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
 * page 1 « Décision », page 2 « Comparaison », page 3 « Conditions détaillées » — avec un objectif
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
 * UN APLAT PAR CATÉGORIE, SUR LES TROIS PAGES. Naoëlle, 25/08/2026 : « des blocs très très clairs
 * en fond pour séparer les catégories, car là tout est sur fond blanc et on ne sait pas où donner de
 * la tête … afin que ça ne fasse pas trop de couleur ».
 *
 * UN SEUL GRIS POUR TOUT LE DOCUMENT : `kw-sunken`, #f9f9f7. Les repères du dossier, l'en-tête du
 * tableau, la consommation de référence, les six familles de conditions et la méthode reposent sur le
 * même aplat — le lecteur apprend la convention une fois et la relit partout.
 *
 * LE VERT NE SERT QU'À DÉCIDER — l'offre recommandée et le total. C'est aussi pourquoi la ligne de
 * l'offre retenue garde son fond vert dans un tableau dont l'en-tête est gris : deux gris auraient
 * effacé la seule information que le client cherche.
 *
 * ET LES APLATS S'IMPRIMENT : `print-color-adjust: exact` est déjà posé sur `#document-comparatif`
 * dans index.css. Sans lui, les navigateurs suppriment les fonds à l'impression pour économiser
 * l'encre, et le rapport téléchargé serait resté le document tout blanc qu'on corrige ici.
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
/**
 * L'heure de la décision attendue. « Mettez toujours l'heure de 15 heures — ce sera toujours
 * 15 heures » (Michel, 25/08/2026). Constante et non paramètre : il l'a posée comme une règle, pas
 * comme un réglage.
 */
const HEURE_DECISION = '15 h'

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

import { ConditionsFournisseurRetenu } from '@/components/recommandation/ConditionsFournisseurRetenu'

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

  // ══ DEUX OFFRES, DEUX RÔLES, ET LE RAPPORT LES CONFONDAIT ══
  //
  // Michel, 27/08/2026, après avoir généré le rapport : « l'offre de référence de base, c'est celle
  // de Gaz Européen 1 mois, celle que tu as marquée offre de référence. Mais là il dit que l'offre de
  // référence, c'est celle de 36 mois. »
  //
  // Il avait raison, et le défaut était net : le tableau écrivait « Référence » sur l'offre RETENUE,
  // et mesurait tous les écarts contre elle. Or ce sont deux faits distincts :
  //
  //   · L'OFFRE RETENUE est ce que Kiwee recommande. Elle se signale par sa couleur — « celle que je
  //     dois recommander, c'est bien celle qui doit être un peu colorée par rapport aux autres ».
  //   · L'OFFRE DE RÉFÉRENCE est la base de comparaison, désignée à la main sur la fiche. Elle porte
  //     la mention « Référence » et c'est contre elle que se mesurent les écarts.
  //
  // Le plus souvent la référence est l'offre EN COURS — ce que le client paie aujourd'hui — donc les
  // deux tombent sur des lignes différentes. Les confondre faisait comparer la recommandation à
  // elle-même, et annonçait un écart de zéro sur la seule ligne qui compte.
  //
  // REPLI SUR LA MOINS CHÈRE tant qu'aucune référence n'est désignée : sans lui, tous les rapports
  // déjà produits perdraient leur colonne d'écart.
  const reference = useMemo(
    () => offres.find((o) => o.est_offre_reference) ?? offres[0] ?? null,
    [offres],
  )

  // ══ « ÉCONOMIE » OU « AUGMENTATION », SELON LE SIGNE ══
  //
  // Michel, même appel : « au lieu de mettre "économie par rapport à l'offre suivante", il va me
  // mettre "augmentation par rapport à l'offre de référence" ». Sa raison, et elle est commerciale
  // avant d'être technique : « on est légèrement plus cher que l'offre de référence en vrai, mais
  // c'est aussi important, parce que le client, ça fait des mois qu'on lui dit de signer et le prix
  // n'arrête pas d'augmenter — il faut qu'il le voie. »
  //
  // Le mot suit donc le chiffre. Le rapport n'affichait le bloc QUE si l'écart était favorable
  // (`economie > 0`) : une hausse disparaissait purement de la page, et le client ne voyait pas ce
  // que son attente lui a coûté. Un rapport qui ne montre que les bonnes nouvelles n'est pas un
  // comparatif, c'est une plaquette.
  const ecartSurReference =
    retenue && reference && retenue.id !== reference.id
      && retenue.montant_annuel_ht != null && reference.montant_annuel_ht != null
      ? reference.montant_annuel_ht - retenue.montant_annuel_ht
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

  // ══ LA DATE DE DÉBUT EST LE LENDEMAIN DE L'ÉCHÉANCE DU COMPTEUR ══
  //
  // Naoëlle, 27/08/2026 : « la date de début devrait être le champ échéance + 1 jour qu'il y a dans
  // le compteur lié ». C'est la règle physique : le contrat en place court JUSQU'À son échéance
  // incluse, donc la nouvelle fourniture commence le jour suivant. Un compteur dont l'échéance tombe
  // le 31/12/2026 démarre le 01/01/2027 — pas le 31/12.
  //
  // ELLE PASSE DEVANT `date_souhaitee`, ET C'EST UN CHANGEMENT ASSUMÉ. Ce champ était prioritaire
  // jusqu'ici ; il porte la date de livraison demandée à la cotation, reprise de Salesforce. Le
  // problème constaté le 27/08 : sur un dossier créé le jour même, il valait « aujourd'hui » — une
  // valeur de saisie par défaut, pas un souhait du client. Le comparatif annonçait donc au client une
  // fourniture démarrant le jour de l'envoi.
  //
  // L'échéance, elle, ne se saisit pas au hasard : elle vient du contrat en cours. Elle est donc la
  // source la plus fiable des deux, et `date_souhaitee` devient le repli — utile quand aucun compteur
  // ne porte d'échéance, ce qui arrive sur un périmètre incomplet.
  //
  // LA MÊME CONVENTION QU'AILLEURS DANS L'APP : ContratWizard et la création de contrat depuis la
  // liste préremplissent déjà « échéance + 1 jour ». Le comparatif était le seul endroit à afficher
  // l'échéance brute, donc à se tromper d'un jour.
  const echeances = pdl.map((l) => l.echeance).filter((d): d is string => !!d).sort()

  // Le calcul se fait à midi pour ne pas glisser d'un jour au passage à l'heure d'été : minuit + un
  // décalage de fuseau retombe la veille, ce qui produirait exactement l'erreur qu'on corrige.
  const lendemain = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const debutSouhaite = version.date_souhaitee ?? null
  const premiereEcheance = echeances[0] ?? null
  const debutEcheance = premiereEcheance ? lendemain(premiereEcheance) : null
  const debut = debutEcheance ?? debutSouhaite ?? null
  // Plusieurs compteurs aux échéances différentes : la plus proche fait foi, et la ligne le dit.
  const debutsDifferents = Boolean(debutEcheance) && new Set(echeances).size > 1

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

  const detailRetenue = retenue?.details_par_compteur[0] ?? null

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Compte rendu de consultation"
      description={`Version ${version.numero_version ?? ''} — ${offres.length} offre${offres.length > 1 ? 's' : ''} chiffrée${offres.length > 1 ? 's' : ''} · trois pages`}
      className="max-w-5xl print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      <div className="mb-4 flex items-center gap-2 border-b border-km-line pb-3 print:hidden">
        <p className="mr-auto text-km-body text-km-muted">
          Trois pages : la décision, la comparaison, les conditions. Le bouton ouvre la fenêtre
          d'impression du navigateur, où « Enregistrer au format PDF » produit le fichier.
          {' '}
          <strong className="font-semibold text-kw-text">
            Décochez « En-têtes et pieds de page »
          </strong>{' '}
          dans cette fenêtre : c'est ce que Michel demande le 25/08 — sinon le navigateur ajoute
          lui-même la date et l'adresse du CRM autour de chaque page, et l'adresse n'a rien à faire
          dans un document client.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={offres.length === 0}
          className="inline-flex items-center gap-1.5 rounded-km bg-km-green px-3.5 py-2 text-km-body font-bold text-white shadow-kw-green hover:brightness-95 disabled:opacity-50 disabled:shadow-none"
        >
          <Printer className="h-3.5 w-3.5" />
          Télécharger le rapport
        </button>
      </div>

      {offres.length === 0 || !retenue ? (
        <p className="rounded-km-md border border-dashed border-km-line bg-km-soft p-4 text-km-body text-km-muted">
          Aucune offre de cette version n'a de budget annuel. Le compte rendu se remplit dès qu'un prix
          est saisi sur un point de livraison : le budget de chaque offre en découle.
        </p>
      ) : (
        <div id="document-comparatif" className="bg-white text-km-text">

          {/* ══════════ PAGE 1 — DÉCISION ══════════

              LES TROIS SECTIONS SONT LES TROIS DIAPOSITIVES. À l'écran elles se suivent dans un
              document, comme avant ; à l'impression chacune occupe une feuille paysage entière, avec
              les marges à l'intérieur — c'est ce qui fait la différence de sensation entre un
              document et une présentation. Aucun bloc n'est déplacé, aucun n'est redessiné : c'est
              exactement ce que Michel a reproché à la version du 24/08.

              `min-h` et non `h` : si une consultation compte cinq ou six offres, le tableau doit
              pouvoir déborder sur une feuille de plus. Une hauteur fixe couperait des lignes en
              silence, et un comparatif tronqué est pire qu'un comparatif sur deux pages. */}
          <section className={'print:flex print:min-h-[210mm] print:flex-col print:px-[20mm] print:py-[14mm]'}>
            {/* L'expéditeur et le destinataire, une fois et sur cette page seulement. « Informations
                administratives répétées » est sur la liste des choses à supprimer : elles ne sont
                donc plus reprises en pied de page ni en tête des suivantes. */}
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-km-line pb-3">
              <div className="flex items-center gap-2">
                <img src={kiweePicto} alt="" className="h-6 w-auto" />
                <span className="font-display text-km-body font-extrabold leading-none tracking-[-0.02em]">Kiwee</span>
              </div>
              <div className="text-right text-km-label leading-snug text-km-muted">
                {conseiller?.nom && <span className="block font-bold">{conseiller.nom}</span>}
                {conseiller?.email && <span className="block text-km-faint">{conseiller.email}</span>}
                {conseiller?.telephone && <span className="block text-km-faint">{conseiller.telephone}</span>}
              </div>
            </header>

            <h1 className="mt-5 font-display text-km-name font-extrabold uppercase leading-tight tracking-[-0.01em] print:mt-8 print:text-[24pt] print:border-b-2 print:border-km-green print:pb-2">
              Compte rendu de consultation — {energies.join(' et ')}
            </h1>

            {/* LES REPÈRES DU DOSSIER, sur leur aplat : client, site, volume, dates. Six
                informations de même nature, donc un bloc et non six lignes flottantes. */}
            <dl className="mt-3 grid grid-cols-1 gap-x-8 rounded-km-md bg-km-soft px-4 py-3 sm:grid-cols-2">
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
                /* D'OÙ VIENT LA DATE, TOUJOURS DIT. Un client qui lit « 01/01/2027 » doit pouvoir
                   vérifier : c'est le lendemain de la fin de son contrat actuel. Sans cette mention,
                   la date paraît décidée par nous. */
                precision={
                  debutEcheance
                    ? 'lendemain de l’échéance du contrat actuel'
                    : debutSouhaite
                      ? 'date souhaitée'
                      : undefined
                }
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
            <div className="mt-6 rounded-km-md border-2 border-km-green bg-kw-green-tint p-4">
              <p className="text-km-label font-extrabold uppercase tracking-[0.09em] text-km-green">
                Offre recommandée
              </p>
              <p className="mt-1 font-display text-km-name font-extrabold leading-tight">
                {retenue.fournisseur_nom} — {libelleOffre(retenue.duree_mois, retenue.type_prix)}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-10 gap-y-2">
                <div>
                  <p className="text-km-label font-bold uppercase tracking-[0.07em] text-km-muted">Budget annuel</p>
                  <p className="text-km-name font-extrabold tabular-nums">
                    {euros(retenue.montant_annuel_ht)} <span className="text-km-body font-bold">HTVA</span>
                  </p>
                </div>
                {/* Le bloc sort dans les DEUX SENS, et le mot change avec le signe. Une hausse
                    n'est pas une donnée à cacher : c'est ce que l'attente a coûté au client. */}
                {ecartSurReference != null && ecartSurReference !== 0 && (
                  <div>
                    <p className="text-km-label font-bold uppercase tracking-[0.07em] text-km-muted">
                      {ecartSurReference > 0 ? 'Économie' : 'Augmentation'} par rapport à l’offre de référence
                    </p>
                    <p
                      className={cn(
                        'text-km-name font-extrabold tabular-nums',
                        ecartSurReference > 0 ? 'text-km-green' : 'text-km-red',
                      )}
                    >
                      {euros(Math.abs(ecartSurReference))}/an
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* « POURQUOI CETTE OFFRE ? » EST RETIRÉE, « pour le moment » (Michel, 25/08/2026 à
                14 h 52). C'était le seul élément de cette page à changer. Le bloc de décision remonte
                donc à sa place — « on remonte légèrement décision attendue avant telle date ».

                ET IL PORTE TOUJOURS UNE HEURE : « mettez toujours l'heure de 15 heures. Ce sera
                toujours 15 heures. » Une échéance sans heure se lit « fin de journée », ce qui n'est
                pas ce qu'il veut dire — et c'est le genre de flou qui coûte une affaire. */}
            {validite ? (
              /* CETTE LIGNE N'EST PAS UNE CATÉGORIE, C'EST UNE ÉCHÉANCE — elle prend donc le gris
                 d'un cran plus dense (#f0efec) et une bordure, pour ne pas se confondre avec les
                 blocs d'information qui l'entourent. */
              <p className="mt-4 rounded-km border border-km-line bg-km-soft px-4 py-2.5 text-km-body font-bold">
                Décision attendue avant le {dateFr(validite)} à {HEURE_DECISION}.
              </p>
            ) : (
              /* SANS DATE DE VALIDITÉ, PAS DE PHRASE — mais le commercial doit le savoir. Écrire
                 « décision attendue avant le à confirmer » dans un document client serait pire que
                 de ne rien écrire ; taire le manque au commercial le serait aussi. D'où un
                 avertissement qui ne s'imprime pas. */
              <p className="mt-5 rounded-km border border-dashed border-kw-amber bg-km-amber-soft px-3 py-2 text-km-body font-semibold text-km-amber print:hidden">
                Aucune date de validité n'est saisie sur les offres : la phrase « décision attendue
                avant le… » ne peut pas s'écrire, et c'est elle qui fait décider. À renseigner sur
                l'offre avant d'envoyer le document.
              </p>
            )}
          </section>

          {/* ══════════ PAGE 2 — COMPARAISON ══════════ */}
          <section className={'mt-10 print:mt-0 print:break-before-page print:flex print:min-h-[210mm] print:flex-col print:px-[20mm] print:py-[14mm]'}>
            <h2 className="font-display text-km-body font-extrabold print:text-[22pt] print:leading-tight print:border-b-2 print:border-km-green print:pb-2">
              Comparaison des offres
            </h2>

            {/* UN TABLEAU, PAS DES JAUGES. « Codes couleur multiples et jauges peu explicites » est
                sur la liste à supprimer : les barres de composantes et leur légende disparaissent au
                profit de colonnes qu'on peut additionner. */}
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-km-body">
                <thead>
                  <tr className="border-b-2 border-kw-ink bg-km-soft text-left">
                    <th className="px-2 py-1.5 font-bold">Fournisseur</th>
                    <th className="px-2 py-1.5 font-bold">Durée</th>
                    <th className="px-2 py-1.5 font-bold">Type de prix</th>
                    <th className="px-2 py-1.5 text-right font-bold">Abonnement</th>
                    <th className="px-2 py-1.5 text-right font-bold">Énergie</th>
                    <th className="px-2 py-1.5 text-right font-bold">Réseau et taxes</th>
                    <th className="px-2 py-1.5 text-right font-bold">Budget annuel</th>
                    <th className="px-2 py-1.5 text-right font-bold">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {offres.map((o) => {
                    const c = composantes(o)
                    const estRetenue = o.id === retenue.id
                    const estReference = reference != null && o.id === reference.id
                    // L'écart se mesure contre la RÉFÉRENCE, jamais contre la retenue : sinon la
                    // ligne recommandée affiche zéro et le client ne sait pas par rapport à quoi.
                    const ecart =
                      !estReference && o.montant_annuel_ht != null && reference?.montant_annuel_ht != null
                        ? o.montant_annuel_ht - reference.montant_annuel_ht
                        : null
                    return (
                      <tr
                        key={o.id}
                        className={cn('border-b border-km-line', estRetenue && 'bg-kw-green-tint font-bold')}
                      >
                        <td className="px-2 py-1.5 pr-3">{o.fournisseur_nom}</td>
                        <td className="px-2 py-1.5 pr-3">{o.duree_mois != null ? `${o.duree_mois} mois` : '—'}</td>
                        <td className="px-2 py-1.5 pr-3">{o.type_prix ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{euros(c.abonnement)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{euros(c.energie)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{euros(c.reseauEtTaxes)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{euros(o.montant_annuel_ht)}</td>
                        {/* LE SIGNE EST ÉCRIT. La colonne mettait « + » devant tous les écarts,
                            parce qu'ils étaient tous mesurés contre la moins chère et donc tous
                            positifs. Contre une référence choisie, une offre peut être moins chère :
                            un « + » devant une baisse serait un contresens. */}
                        <td
                          className={cn(
                            'px-2 py-1.5 text-right tabular-nums',
                            estReference && 'font-bold',
                            ecart != null && ecart > 0 && 'text-km-red',
                            ecart != null && ecart < 0 && 'text-km-green',
                          )}
                        >
                          {estReference
                            ? 'Référence'
                            : ecart == null
                              ? '—'
                              : `${ecart > 0 ? '+' : '−'}${euros(Math.abs(ecart))}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* LA CONSOMMATION DE RÉFÉRENCE APPARTIENT À CETTE PAGE. Michel, 25/08/2026 : « on le
                mettrait sur la partie comparaison des offres, parce que c'est sur les offres qu'on
                compare la consommation de référence ». Elle quitte donc les conditions détaillées :
                c'est le volume commun sur lequel tous ces budgets sont calculés, donc la clé de
                lecture du tableau qui précède. */}
            {volumeTotal > 0 && (
              <p className="mt-3 rounded-km-md bg-km-soft px-4 py-2.5 text-km-body font-bold">
                Consommation de référence :{' '}
                <span className="font-mono">
                  {volumeTotal.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh/an
                </span>
              </p>
            )}

            <p className="mt-2 text-km-label leading-snug text-km-muted">
              Tous les montants sont présentés sur une même base, hors TVA, et calculés sur cette même
              consommation. Chaque budget annuel doit pouvoir être reconstitué à partir des colonnes
              qui le précèdent ; « à vérifier » signale une composante non saisie, et non un montant
              nul.
            </p>
          </section>

          {/* ══════════ PAGE 3 — CONDITIONS ESSENTIELLES ══════════ */}
          {/* CETTE PAGE REND 8 MM DE MARGE VERTICALE — 12 en haut, 8 en bas au lieu de 14 et 14.
              C'est la dernière feuille : rien ne la suit, donc une marge basse plus courte ne se
              remarque pas, alors qu'une quatrième page portant trois lignes se remarque beaucoup. */}
          <section className={'mt-10 print:mt-0 print:break-before-page print:flex print:min-h-[210mm] print:flex-col print:px-[20mm] print:pb-[6mm] print:pt-[12mm]'}>
            <h2 className="font-display text-km-body font-extrabold print:text-[22pt] print:leading-tight print:border-b-2 print:border-km-green print:pb-2">
              Conditions détaillées — {retenue.fournisseur_nom}
            </h2>

            {/* ══════════ LE DÉTAIL DU FOURNISSEUR RETENU, TEL QU'IL L'A ENVOYÉ ══════════
                Michel, 25/08/2026 : « je veux le même affichage sur condition essentielle, qui
                reprend exactement le détail que le fournisseur a envoyé, mais uniquement pour le
                fournisseur retenu ». La référence est l'offre de Gaz Européen qu'il a transmise :
                le prix du MWh décomposé par nature de rémunération, puis le budget annuel poste par
                poste jusqu'au total TTC.

                LE REPLI EXISTE ET IL EST HONNÊTE : sans détail gaz saisi sur le PDL retenu, on
                revient aux quatre lignes essentielles plutôt que d'afficher un tableau vide qui
                aurait l'air cassé. */}
            {detailRetenue?.prix_gaz ? (
              <ConditionsFournisseurRetenu
                debut={debut}
                prixGaz={detailRetenue.prix_gaz}
                consommation={detailRetenue.consommation_annuelle_reference_mwh ?? volumeTotal ?? null}
              />
            ) : (
              <dl className="mt-2 grid grid-cols-1 gap-x-8 rounded-km-md bg-km-soft px-4 py-3 sm:grid-cols-2">
                <Ligne libelle="Durée" valeur={retenue.duree_mois != null ? `${retenue.duree_mois} mois` : 'à vérifier'} />
                <Ligne libelle="Prix" valeur={retenue.type_prix ?? 'à vérifier'} />
                <Ligne libelle="Date de début" valeur={debut ? dateFr(debut) : 'à confirmer'} />
                <Ligne libelle="Budget annuel" valeur={`${euros(retenue.montant_annuel_ht)} HTVA`} />
              </dl>
            )}

            {/* « Conditions particulières : uniquement si elles influencent la décision » — donc rien
                du tout quand le champ est vide, et pas une ligne « — » qui occuperait la place. */}
            {retenue.description && (
              <div className="mt-3 rounded-km-md bg-km-soft px-4 py-3">
                <p className="text-km-body font-extrabold uppercase tracking-[0.09em] text-km-green">
                  Conditions particulières
                </p>
                <p className="mt-1 text-km-body leading-relaxed">{retenue.description}</p>
              </div>
            )}

            {/* LA MÉTHODE EST UNE CATÉGORIE À PART ENTIÈRE : c'est ce qui rend les chiffres
                opposables. Même aplat que les autres, et son titre prend le vert des familles. */}
            <div className="mt-5 rounded-km-md bg-km-soft px-4 py-3 print:mt-2 print:py-1.5">
              <h3 className="text-km-body font-extrabold uppercase tracking-[0.09em] text-km-green">Méthode</h3>
              <p className="mt-1 text-km-label leading-relaxed text-km-muted">
              Budget calculé à partir d'une consommation annuelle de{' '}
              {volumeTotal > 0
                ? `${volumeTotal.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh`
                : 'la consommation de référence indiquée'}{' '}
              et des composantes réglementaires applicables à la date de l'analyse. Les mêmes
                hypothèses sont appliquées à toutes les offres comparées.
              </p>
            </div>
          </section>
        </div>
      )}
    </Dialog>
  )
}

/** Une ligne « libellé : valeur », avec sa précision facultative sous la valeur. */
function Ligne({ libelle, valeur, precision }: { libelle: string; valeur: string; precision?: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-km-line py-1 last:border-b-0">
      <dt className="shrink-0 text-km-body text-km-muted">{libelle}</dt>
      <dd className="ml-auto text-right text-km-body font-bold">
        {valeur}
        {precision && <span className="block text-km-label font-normal text-km-faint">{precision}</span>}
      </dd>
    </div>
  )
}

import { useState } from 'react'
import { Euro } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { TableauKanban } from '@/components/dashboard/TableauKanban'
import { useKanbanServeur } from '@/lib/useKanbanServeur'
import { useTriKanban, SelecteurTri } from '@/lib/triKanban'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useMonProfil } from '@/lib/data/roles'
import { cn } from '@/lib/utils'

/**
 * PRICING — page 7 du dossier UX du 26/08/2026.
 *
 * Sa règle : « Gérer les offres fournisseurs par statut : à demander, en attente fournisseur, offres
 * reçues et validées. » Et pendant l'appel du 26/08, la même idée dans ses mots : « une page dédiée,
 * pour savoir si on a bien envoyé l'offre, si on ne l'a pas envoyée, où on en est ».
 *
 * ══ RIEN N'A ÉTÉ CRÉÉ EN BASE, ET C'EST LE POINT ══
 *
 * Avant d'écrire une table, j'ai regardé : `suivis_consultations_fournisseurs` porte 5 409 événements
 * horodatés sur 3 487 consultations, avec huit statuts déjà définis. C'est exactement le suivi que sa
 * page décrit, et il tourne depuis la reprise Salesforce. La vue `v_pricing_consultations` en rend
 * l'état courant ; créer un second mécanisme aurait produit deux vérités sur le même fait.
 *
 * ══ CE QUE LA PAGE MONTRE, ET CE QU'ELLE NE PEUT PAS MONTRER ══
 *
 * ══ SEULES LES RECOMMANDATIONS EN COURS ══
 *
 * Naoëlle, 27/08/2026 : « filtre juste les recos en cours, le pricing n'a besoin de voir que ça — là
 * il y a tout et c'est pas ce qu'on veut. »
 *
 * Mesuré avant de filtrer : sur les 3 469 consultations affichées, 3 217 appartenaient à une
 * recommandation déjà tranchée (1 548 acceptées, 763 refusées, 906 abandonnées). 93 % de l'écran
 * portait donc sur des dossiers où personne n'a plus rien à demander à un fournisseur — et ces lignes
 * noyaient les 153 demandes réellement en attente, qui sont le seul vrai sujet de cette page.
 *
 * « En cours » n'est pas redéfini ici : la vue reprend les trois étapes closes que l'application
 * connaît déjà (acceptée, refusée, abandonnée — Michel, 26/08/2026).
 *
 * ══ ET SEULEMENT LA VERSION COURANTE ══
 *
 * Michel a trouvé qu'il restait « encore trop d'éléments », et Naoëlle a mis le doigt sur ce qui
 * manquait (27/08) : « tu as filtré seulement sur les recommandations, il faut aussi qu'on filtre sur
 * les versions actives, sinon c'est pas logique ».
 *
 * Le défaut était dans la vue depuis le début : la jointure ne regardait pas `version_actuelle`. Une
 * recommandation reprise trois fois affichait les consultations de ses TROIS versions — on demandait
 * donc au pricing de relancer un fournisseur sur une offre qui n'existe plus. 321 recommandations
 * portent plus d'une version.
 *
 * La page passe de 306 à 191 lignes : 20 à demander, 111 en attente, 60 offres reçues.
 *
 * ══ ET SEULEMENT LES VERSIONS AU STATUT VIVANT ══
 *
 * J'avais laissé les versions au statut « expirée » en suspens : 96 consultations avaient une
 * recommandation à l'étape CONSULTATION et une version dite EXPIREE, ce qui est une contradiction,
 * et 1 171 des 1 242 versions expirées venaient de la reprise Salesforce. Je ne voulais pas faire
 * disparaître 135 lignes sur la foi d'un statut dont j'ignorais le sens d'origine.
 *
 * Michel a tranché le 27/08 : on les retire, et il faut rendre les statuts de version modifiables à
 * la main « car il y a eu trop de bugs à l'import Salesforce ». Sa réponse règle les deux
 * questions — le statut est bien terminal, et les cas faux se corrigeront à la main.
 *
 * La page passe donc de 191 à 55 lignes : 18 à demander, 34 en attente, 3 offres reçues.
 * (J'avais annoncé 57 : le bon chiffre est 55, mon estimation ne retirait pas ACCEPTEE ni REFUSEE.)
 *
 * ══ LA DATE DE COTATION SOUHAITÉE SUR LES TUILES ══
 *
 * « Afficher dans les tuiles la date de cotation souhaitée, comme ça c'est visible sans cliquer
 * dessus, et trier avec des dates relatives — en retard, aujourd'hui, dans 3 jours — sachant que les
 * en retard et les dates proches sont les premiers visibles. »
 *
 * Les 55 consultations conservées portent toutes cette date, donc aucune tuile ne reste muette. Sur
 * la colonne « à demander » aujourd'hui : 9 en retard, 5 pour aujourd'hui, 4 à venir.
 *
 * DEUX ENDROITS, DEUX RÔLES (Naoëlle, 27/08). Le RELATIF va ENTRE les tuiles, en intertitre —
 * « En retard d'1 jour », puis toutes les tuiles concernées dessous. L'ABSOLU va SUR la tuile, juste
 * sous « Demande envoyée ». Une pastille répétée sur huit tuiles consécutives écrit huit fois la
 * même chose et vole la place du fournisseur ; un intertitre l'écrit une fois et dit en plus COMBIEN
 * de dossiers partagent l'urgence.
 *
 * LE REGROUPEMENT NE SORT QUE SUR « À DEMANDER ». C'est la colonne désignée, et c'est aussi la seule
 * où le mot « retard » est exact : sur « offres reçues », l'offre est là, et un « en retard de
 * 28 jours » annoncerait un retard qui n'existe plus. LE TRI, lui, s'applique partout — classer les
 * cartes par date souhaitée reste juste dans toutes les colonnes, et c'est ce tri serveur qui rend le
 * regroupement possible : les cartes arrivent déjà dans l'ordre.
 *
 * ══ « VALIDÉES » A ÉTÉ RETIRÉE ══
 *
 * « Enlève la colonne validée, elle ne sert à rien ici » (Naoëlle, même message) — et c'est juste :
 * une offre retenue est une décision de Kiwee, pas une étape du traitement d'une demande fournisseur.
 * Elle n'avait rien à faire dans un tableau qui suit « où en est ma demande ».
 *
 * Ses 2 lignes n'ont pas disparu pour autant : la branche correspondante a été retirée de la vue, et
 * elles ont rejoint la colonne de leur suivi réel (« Demande acceptée » → en attente fournisseur).
 * Retirer la colonne sans toucher à la vue les aurait fait s'évaporer sans trace.
 *
 * MAIS LE MONTANT MANQUE PRESQUE PARTOUT, et ce n'est pas le champ qui est vide — CE SONT LES OFFRES
 * QUI N'EXISTENT PAS. Mesuré le 27/08/2026 : `offres_fournisseurs` compte 55 lignes pour 3 526
 * consultations, dont 6 portent un montant. Sur les 120 consultations en cours marquées « offre
 * reçue », 120 n'ont AUCUNE ligne d'offre.
 *
 * DEUX CAUSES DISTINCTES, et il faut les séparer :
 *
 *  1. La reprise Salesforce n'a importé aucune offre par fournisseur — les 55 lignes ont toutes été
 *     créées en août 2026, dans Kimatch. Salesforce ne portait le montant qu'au niveau de l'affaire
 *     (`recommandations.budget_nouvelle_offre`, renseigné sur 289 dossiers, TOUS clos) : le chiffre
 *     final d'une affaire gagnée, jamais « l'offre du fournisseur X ». Il n'y a donc rien à afficher
 *     pour les dossiers repris, et rien ne le fera apparaître.
 *
 *  2. Sur les dossiers vivants, changer le suivi en « offre reçue » est UN CLIC dans une liste
 *     déroulante, tandis que saisir l'offre est un formulaire à part (« Ajouter une offre de … »).
 *     Le premier geste est fait, le second non. Le statut avance donc sans le prix.
 *
 * La carte affiche le montant quand il existe et se tait sinon, au lieu d'un zéro qui ferait croire à
 * une offre gratuite. Rendre la saisie obligatoire au passage en « offre reçue » relève d'une décision
 * de Michel, pas d'un correctif d'affichage.
 *
 * « DEMANDE REFUSÉE » SORT DU TABLEAU. Un fournisseur qui refuse de coter n'est plus dans le
 * pipeline ; l'y laisser gonflerait « en attente » de 57 dossiers morts. La case « inclure les
 * refusées » les ramène quand on cherche pourquoi une consultation n'a rien donné.
 */

interface LignePricing {
  consultation_id: string
  recommandation_id: string
  recommandation_nom: string | null
  compte_nom: string | null
  fournisseur_nom: string | null
  type_energie: string | null
  statut_libelle: string | null
  date_evenement: string | null
  nb_offres: number
  montant_annuel_ht: number | null
  prix_moyen_mwh: number | null
  colonne: string
  recommandation_etape: string | null
  reco_en_cours: boolean
  version_id: string | null
  numero_version: number | null
  version_courante: boolean
  version_statut: string | null
  version_vivante: boolean
  date_cotation_souhaitee: string | null
  jours_avant_cotation: number | null
}

/**
 * LES COLONNES PORTENT LES LIBELLÉS EXACTS DES STATUTS, et non un titre plus parlant.
 *
 * Naoëlle, 28/08/2026 : « peux-tu utiliser les termes de nos réels statuts pour ne pas s'embrouiller ».
 * Les colonnes s'appelaient « À demander », « En attente fournisseur », « Offres reçues » alors que
 * les statuts s'appellent « Aucun traitement », « Demande envoyée », « Demande acceptée ». Deux
 * vocabulaires pour la même chose obligeaient à traduire de tête à chaque lecture — et c'est
 * exactement ce que Michel a demandé de supprimer en simplifiant les statuts.
 *
 * ON PERD UN PEU EN CLARTÉ D'INTENTION : « Aucun traitement » dit moins que « À demander » sur ce
 * qu'il faut faire. C'est le prix assumé d'un seul vocabulaire, et la colonne « Aucun traitement »
 * porte de toute façon les intertitres de retard, qui disent l'urgence mieux qu'un titre.
 *
 * Les trois étapes du traitement d'une demande fournisseur. « Demande refusée » n'apparaît que sur
 * demande.
 *
 * Son dossier UX en annonçait quatre, « validées » comprise ; elle a été retirée le 27/08/2026 sur
 * demande de Naoëlle. Les trois qui restent ont ceci en commun qu'elles décrivent TOUTES un état de
 * la demande — pas envoyée, partie, revenue — là où « validée » décrivait une décision interne prise
 * après coup.
 */
const COLONNES = [
  { code: 'A_DEMANDER', libelle: 'Aucun traitement' },
  { code: 'EN_ATTENTE', libelle: 'Demande envoyée' },
  { code: 'RECUE', libelle: 'Demande acceptée' },
] as const

const euros = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'

/**
 * LE GROUPE D'ÉCHÉANCE D'UNE CONSULTATION, écrit ENTRE les tuiles.
 *
 * Naoëlle, 27/08/2026 : « je veux pas que les instructions en retard etc. soient sur les tuiles, je
 * veux que ce soit indiqué entre les tuiles — c'est écrit "en retard de 1 jour" et il y a toutes les
 * tuiles en retard de 1 jour en dessous ». La date exacte, elle, va sur la tuile.
 *
 * UN GROUPE PAR JOUR, ET NON PAR TRANCHE. Regrouper « en retard de 1 à 7 jours » aurait donné des
 * paquets plus courts, mais aurait effacé l'ordre à l'intérieur : entre un retard de 6 jours et un
 * retard d'un jour, ce n'est pas le même appel. La clé est donc le nombre de jours lui-même, ce qui
 * garantit aussi que l'intertitre ne mente jamais sur son contenu.
 *
 * LE NOMBRE DE JOURS EST CALCULÉ EN BASE, pas ici : `jours_avant_cotation` vaut
 * `date_souhaitee - current_date`. C'est la même valeur qui sert au tri serveur, et c'est
 * volontaire — un décompte calculé deux fois, une fois en SQL pour ordonner et une fois en
 * JavaScript pour afficher, finit par se contredire un jour de changement d'heure ou sur un
 * navigateur réglé sur un autre fuseau. Un intertitre « aujourd'hui » posé au-dessus d'une carte de
 * demain n'est pas un détail d'affichage : c'est le tri qui devient faux aux yeux du lecteur.
 *
 * LE TON MONTE PAR PALIERS PARCE QUE L'ACTION CHANGE : passé la date, la demande n'est plus à
 * envoyer mais à rattraper ; le jour même, elle est à envoyer maintenant ; à trois jours, elle est
 * à planifier. Au-delà d'une semaine, la date n'est plus qu'un repère, d'où le ton neutre.
 */
function groupeEcheance(
  jours: number | null,
): { cle: string; texte: string; ton: 'retard' | 'jour' | 'proche' | 'loin' } | undefined {
  // Sans date, aucun groupe : un intertitre « sans date » créerait une section pour une absence de
  // saisie. Les 55 consultations affichées portent toutes la leur — la clause est là pour demain.
  if (jours == null) return undefined
  const cle = String(jours)
  if (jours < 0) {
    const n = Math.abs(jours)
    return { cle, texte: n === 1 ? 'En retard d’1 jour' : `En retard de ${n} jours`, ton: 'retard' }
  }
  if (jours === 0) return { cle, texte: 'Aujourd’hui', ton: 'jour' }
  if (jours === 1) return { cle, texte: 'Demain', ton: 'proche' }
  if (jours <= 7) return { cle, texte: `Dans ${jours} jours`, ton: 'proche' }
  return { cle, texte: `Dans ${jours} jours`, ton: 'loin' }
}

/** La date de cotation souhaitée, telle qu'elle s'écrit sur la tuile. */
const dateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-FR')

export default function Pricing({ sansEntete }: { sansEntete?: boolean }) {
  const [recherche, setRecherche] = useState('')
  const [avecRefusees, setAvecRefusees] = useState(false)
  const { data: monProfil } = useMonProfil()
  const { perimetre, setPerimetre } = usePerimetre('pricing')

  const colonnes = avecRefusees
    ? [...COLONNES, { code: 'REFUSEE', libelle: 'Demande refusée' } as const]
    : [...COLONNES]

  /* « ECHEANCE » EN PREMIER, ET CROISSANTE : c'est la demande de Michel du 27/08 — les retards
     d'abord. Les trois autres axes repondent aux autres questions qu'on se pose ici : combien ca
     pese, chez qui ca traine, pour quel client. */
  const { tri, ascendant, setTri, options: optionsTri } = useTriKanban('pricing', [
    { cle: 'date_cotation_souhaitee', libelle: 'échéance' },
    { cle: 'montant_annuel_ht', libelle: 'montant', ascendant: false },
    { cle: 'fournisseur_nom', libelle: 'fournisseur' },
    { cle: 'compte_nom', libelle: 'compte' },
  ])

  const tableau = useKanbanServeur<LignePricing>({
    vue: 'v_pricing_consultations',
    colonneStatut: 'colonne',
    colonnes: colonnes.map((c) => ({ code: c.code, libelle: c.libelle })),
    colonnesRecherche: ['fournisseur_nom', 'compte_nom', 'recommandation_nom'],
    recherche,
    // LES DEUX FILTRES DE LA PAGE, appliqués à toutes les colonnes ET aux sommes : le bandeau
    // chiffré doit additionner la même population que le tableau, sinon l'un démentira l'autre.
    // LE FILTRE DESCEND EN BASE avec les autres. Ce tableau est pagine ET somme par la base : dix
    // cartes par colonne, un montant total calcule sur l'ensemble. Filtrer a l'arrivee n'aurait
    // touche que les dix cartes visibles, et le bandeau chiffre aurait continue de compter tout le
    // monde — les deux se seraient dementis a l'ecran.
    filtres: {
      reco_en_cours: true,
      version_courante: true,
      version_vivante: true,
      compte_proprietaire_id: perimetre === 'moi' && monProfil?.id ? monProfil.id : null,
    },
    // LES RETARDS EN PREMIER (Michel, 27/08/2026) — c'est le tri par défaut, et il reste le
    // premier de la liste. Le tri part en base : on ne demande que dix cartes par colonne, donc
    // trier à l'arrivée remettrait dans l'ordre un échantillon pris au hasard et la plus en retard
    // resterait invisible parce qu'onzième.
    ordre: { colonne: tri, ascendant },
    // Le montant se somme par colonne : c'est ce qui attend chez chaque fournisseur.
    colonneSomme: 'montant_annuel_ht',
    actif: true,
  })

  const lignes = tableau.data ?? []
  const nbTotal = lignes.reduce((n, c) => n + c.total, 0)
  const montantTotal = lignes.reduce((t, c) => t + (c.somme ?? 0), 0)
  const montantConnu = lignes.some((c) => (c.somme ?? 0) > 0)

  return (
    <div>
      {!sansEntete && <Topbar title="Pricing" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          icone={<Euro className="h-[19px] w-[19px]" strokeWidth={2.1} />}
          teinte="from-kiwi-600 to-kiwi-400"
          title="Pricing"
          badge={montantConnu ? euros(montantTotal) : undefined}
          badgeLibelle="Montant chiffré"
          description="Suivez les offres fournisseurs à chaque étape de leur traitement. Seule la version en cours des dossiers ouverts apparaît."
        />

        <ListToolbar
          query={recherche}
          onQueryChange={setRecherche}
          placeholder="Rechercher un fournisseur, un compte…"
          count={nbTotal}
        >
          {/* MÊME GESTE QUE « INCLURE LES DOSSIERS CLOS » AILLEURS : la règle reste la règle, la case
              est l'exception. Un refus se consulte quand on cherche pourquoi une consultation n'a rien
              donné — pas tous les jours. */}
          <BasculePerimetre
            valeur={perimetre}
            onChange={setPerimetre}
            libelleMien="Mes consultations"
            libelleTous="Toutes les consultations"
          />
          <SelecteurTri valeur={tri} onChange={setTri} options={optionsTri} />
          <button
            type="button"
            onClick={() => setAvecRefusees((v) => !v)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-kw-md border px-2.5 py-1.5 text-kw-sm font-bold transition-colors',
              avecRefusees
                ? 'border-ink-800 bg-ink-800 text-white'
                : 'border-kw-border-strong bg-white text-kw-meta hover:bg-kw-subtle',
            )}
          >
            Inclure les demandes refusées
          </button>
        </ListToolbar>

        <TableauKanban
          colonnes={lignes.map((c) => ({
            code: c.code,
            libelle: c.libelle,
            total: c.somme && c.somme > 0 ? euros(c.somme) : null,
          }))}
          cartes={Object.fromEntries(
            lignes.map((c) => [
              c.code,
              c.lignes.map((l) => {
                const chiffres: { libelle: string; valeur: string }[] = []
                /* LA DATE DE COTATION SOUHAITÉE EN TÊTE : les chiffres se rendent juste sous le
                   motif (« Demande envoyée — 29/06/2026 »), qui est exactement l'endroit demandé.
                   Elle passe devant le budget parce qu'elle décide de QUAND agir, là où le budget ne
                   décide de rien sur cette page. */
                if (l.date_cotation_souhaitee) {
                  chiffres.push({
                    libelle: 'Cotation souhaitée',
                    valeur: dateCourte(l.date_cotation_souhaitee),
                  })
                }
                if (l.montant_annuel_ht != null) {
                  chiffres.push({ libelle: 'Budget annuel', valeur: euros(l.montant_annuel_ht) })
                }
                if (l.prix_moyen_mwh != null) {
                  chiffres.push({
                    libelle: 'Prix moyen',
                    valeur:
                      l.prix_moyen_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €/MWh',
                  })
                }
                return {
                  id: l.consultation_id,
                  /* LE REGROUPEMENT NE SORT QUE SUR « À DEMANDER » — c'est la colonne désignée, et
                     c'est la seule où « en retard » est vrai. Sur « offres reçues », l'offre est
                     arrivée : un intertitre « en retard de 28 jours » y annoncerait un retard qui
                     n'existe plus. Une fausse alerte coûte plus cher qu'une information absente,
                     parce qu'elle apprend à ignorer les vraies. */
                  groupe: c.code === 'A_DEMANDER' ? groupeEcheance(l.jours_avant_cotation) : undefined,
                  /* LE FOURNISSEUR EN TITRE, LE CLIENT EN SOUS-TITRE. Sur cette page on travaille
                     fournisseur par fournisseur — « qui ne m'a pas répondu » — là où les autres
                     kanbans partent du client. */
                  titre: l.fournisseur_nom || 'Fournisseur inconnu',
                  sousTitre: l.compte_nom ?? undefined,
                  nature: l.type_energie === 'GAZ' ? 'Gaz' : l.type_energie ? 'Électricité' : undefined,
                  /* LE MOTIF DIT OÙ ON EN EST, avec la date du dernier événement : sur 2 060 demandes
                     en attente, ce qui compte est depuis QUAND. */
                  motif:
                    l.statut_libelle && l.date_evenement
                      ? `${l.statut_libelle} — ${new Date(l.date_evenement).toLocaleDateString('fr-FR')}`
                      /* LE MEME MOT QUE LA COLONNE. La colonne s'intitule « Aucun traitement »
                         — le libelle du statut de reference — et ses cartes annoncaient « Demande
                         non envoyee ». Deux noms pour un seul etat, sur le meme ecran, a trois
                         centimetres l'un de l'autre. */
                      : (l.statut_libelle ?? 'Aucun traitement'),
                  chiffres: chiffres.length > 0 ? chiffres : undefined,
                  mention: l.recommandation_nom ?? undefined,
                  to: `/recommandations/${l.recommandation_id}`,
                }
              }),
            ]),
          )}
          totaux={Object.fromEntries(lignes.map((c) => [c.code, c.total]))}
          /* PAS DE GESTIONNAIRE DE CLIC ICI : chaque tuile porte deja son adresse (`to`, plus
              haut), et un gestionnaire qui se contente de naviguer la ramenerait a l etat de
              bouton — sans clic du milieu ni Ctrl+clic. Celui d avant faisait exactement ce que
              `to` fait : retrouver la consultation pour en tirer l identifiant de recommandation. */
          siVide={
            tableau.isLoading
              ? 'Chargement…'
              : 'Aucune consultation fournisseur ne correspond.'
          }
        />

        {/* CE QUE LA PAGE NE PEUT PAS DIRE, dit à l'écran : le suivi avance d'un clic, la saisie de
            l'offre est un formulaire séparé que personne ne remplit. Voir l'en-tête. */}
        <p className="mt-3 max-w-[95ch] text-kw-xs leading-relaxed text-kw-faint">
          Seules les consultations encore vivantes apparaissent : la recommandation est ouverte, la
          version est celle sur laquelle on travaille, et son statut n’est pas terminal. Les cartes
          sont classées par date de cotation souhaitée, les retards en premier. Le budget, lui,
          n’apparaît que sur les consultations dont l’offre a été saisie — une offre reçue mais non
          chiffrée reste dans sa colonne, sans montant.
        </p>
      </div>
    </div>
  )
}

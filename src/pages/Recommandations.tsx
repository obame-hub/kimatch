import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Check } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMonProfil } from '@/lib/data/roles'
import { RESULTAT_VERSION_LIBELLE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useKanbanServeur } from '@/lib/useKanbanServeur'
import { useTriKanban, SelecteurTri } from '@/lib/triKanban'
import { TableauKanban } from '@/components/dashboard/TableauKanban'
import { CreateRecommandationDialog } from '@/components/opportunite/CreationRecommandationWizard'

/** Le formulaire de création vit désormais dans son propre fichier, réécrit le 15/08/2026 en
 *  parcours à quatre étapes calqué sur l'OpportuniteWizard de Tools. Il reste réexporté ici :
 *  CompteDetail l'importe depuis cette page depuis l'origine. */
export { CreateRecommandationDialog } from '@/components/opportunite/CreationRecommandationWizard'

/** Une carte de la liste, telle que `v_recommandations_liste` la renvoie. */
interface LigneReco {
  id: string
  nom: string
  compte_id: string
  compte_nom: string | null
  etape: string
  conseiller: string
  priorite: number
  nb_versions: number
  /** Le statut de la DERNIÈRE version, et son résultat si elle est clôturée. */
  statut_version: string | null
  resultat_version: string | null
  numero_version: number | null
  /** La colonne du tableau, calculée par la vue — voir la migration 20260828130000. */
  colonne_travail: string
  sites: { id: string; nom: string }[]
  /** Ajoutées à la vue le 26/08/2026 pour le bandeau de la page 6. */
  marge_nette: number | null
  montant: number | null
}

/**
 * LES COLONNES DU TABLEAU SONT L'ÉTAT DU TRAVAIL, PAS L'ÉTAPE DU DOSSIER.
 *
 * Michel, 28/08/2026 : « à la place de recommandation, il faut montrer version ». Et sa raison :
 * « consultation, offres reçues, présentées, en réalité ça ne nous apporte rien, puisque ces
 * informations je vais les voir sur la version ».
 *
 * Les cinq colonnes ci-dessous sont donc les cinq états réels d'un dossier en cours, et non les
 * paliers qu'il a franchis :
 *
 *   Brouillon        aucune version — rien n'a encore été étudié          199 dossiers
 *   En construction  on travaille dessus                                   19
 *   Disponible       le comparatif est prêt                                 6
 *   En décision      c'est chez le client                                  21
 *   À réactiver      la dernière version est morte, le dossier non         86
 *
 * LE MOT « RECOMMANDATIONS » RESTE DANS LE MENU, à sa demande : « on peut laisser le terme
 * recommandation pour ne pas les embrouiller ». Ce sont bien des dossiers qu'on liste — une ligne
 * par dossier — mais rangés selon l'état de leur dernière version.
 *
 * « À RÉACTIVER » SERA LA COLONNE LA PLUS CHARGÉE, et ce n'est pas une anomalie : 1 264 versions sont
 * expirées en base. C'est l'état réel du portefeuille, et le voir est précisément l'intérêt.
 */
const COLONNES_TRAVAIL = [
  { code: 'BROUILLON', libelle: 'Brouillon' },
  { code: 'EN_CONSTRUCTION', libelle: 'En construction' },
  { code: 'DISPONIBLE', libelle: 'Disponible' },
  { code: 'EN_DECISION', libelle: 'En décision' },
  { code: 'A_REACTIVER', libelle: 'À réactiver' },
] as const

/**
 * SEULS LES OBJETS ACTIFS SONT AFFICHÉS. Michel, 25/08/2026 à 14 h 29 : « pour les recommandations,
 * n'afficher que les recommandations actives (non clôturées) » — et « pareil pour les opportunités
 * et les signaux ».
 *
 * Les colonnes terminales disparaissent donc du tableau. Ce que ça retire est massif et c'est le
 * but : 1 574 recommandations closes sur 1 707, qui noyaient les 133 vivantes.
 *
 * CE QUI RESTE ATTEIGNABLE : un dossier clos se lit toujours depuis la fiche de son compte, depuis
 * la recherche ⌘K, et par son lien direct. Il quitte le plan de travail, il ne disparaît pas.
 */
export default function Recommandations() {
  /**
   * CHAQUE CONSEILLER NE VOIT QUE LES RECOMMANDATIONS DE SES COMPTES. Michel, 25/08/2026, « là en
   * urgence » : « Matthieu veut regarder ses recommandations, mais il a les recommandations de tout
   * le monde ». Accordé par Naoëlle dans le même appel.
   *
   * LE FILTRE EST ICI PARCE QUE CETTE PAGE NE LIT PAS `fetchRecommandations`. J'avais d'abord filtré
   * cette fonction, qui sert les fiches et le tableau de bord — mais /recommandations, l'écran DONT
   * IL PARLE, lit la vue `v_recommandations_liste` par `useListeServeur`. Le filtre était donc partout
   * sauf à l'endroit du reproche. La colonne `compte_proprietaire_id` vient de la migration
   * 20260825120000, écrite pour ça.
   *
   * LES ADMINISTRATEURS VOIENT TOUT — sa phrase en posant la question, « à part toi, moi ». Tant que
   * le rôle n'est pas connu, on ne filtre pas : afficher trop brièvement est moins trompeur que de
   * montrer une liste vide qu'on prendrait pour « je n'ai rien à traiter ».
   */
  const { data: monProfil } = useMonProfil()

  /**
   * LE PERIMETRE EST DESORMAIS UN CHOIX, plus une consequence du role.
   *
   * Avant : `!estAdmin && monProfil?.id ? monProfil.id : null`. Un conseiller ne voyait QUE ses
   * dossiers sans aucun moyen d'en sortir — or « des fois des commerciaux partent en vacances et
   * les autres s'occupent de leurs dossiers » (Naoelle, 28/08/2026) —, et un administrateur voyait
   * TOUJOURS tout, sans moyen de se concentrer sur les siens.
   *
   * Maintenant : « Mes dossiers » par defaut pour tout le monde, administrateurs compris, et la
   * bascule « Tous » a cote. Le filtre part en base (useKanbanServeur), donc les colonnes et la
   * somme de marge suivent — sans quoi le bandeau annoncerait une marge que le tableau ne montre
   * pas.
   */
  const { perimetre, setPerimetre } = usePerimetre('recommandations')
  const filtreProprietaire = perimetre === 'moi' && monProfil?.id ? monProfil.id : null
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  /**
   * LA RECHERCHE SURVIT À LA LISTE. `useListeServeur` ne servait plus qu'à porter la saisie et le
   * total : le garder aurait lancé une requête paginée dont personne n'affiche le résultat. Un état
   * local suffit, et le total se lit sur la somme des colonnes — qui sont, elles, comptées en base.
   */
  const [recherche, setRecherche] = useState('')
  const [avecClos, setAvecClos] = useState(false)

  /**
   * LE TABLEAU EST SERVI PAR LA BASE, une requête par colonne.
   *
   * La liste de cette page est paginée côté serveur : construire le tableau à partir de la tranche
   * chargée ferait compter les cent lignes reçues au lieu des 648 réelles, et laisserait des colonnes
   * vides simplement parce que leur page n'a pas été demandée. Voir useKanbanServeur.
   *
   * Les huit étapes, terminales comprises : sur la page d'un objet, le tableau montre tout le
   * pipeline. La recherche et le filtre de propriétaire de la liste s'y appliquent — sans quoi les
   * deux vues montreraient deux populations différentes sous le même bandeau.
   */
  /* LES QUATRE AXES QUI ONT UN SENS SUR UN DOSSIER. « Marge » d'abord parce que c'est ce que
     Michel regarde, et decroissante : une marge se lit du plus gros au plus petit. */
  const { tri, ascendant, setTri, options: optionsTri } = useTriKanban('recommandations', [
    { cle: 'marge_nette', libelle: 'marge', ascendant: false },
    { cle: 'date_ouverture', libelle: 'date d’ouverture', ascendant: false },
    { cle: 'compte_nom', libelle: 'compte' },
    { cle: 'nom', libelle: 'nom du dossier' },
  ])

  const tableau = useKanbanServeur<LigneReco>({
    vue: 'v_recommandations_liste',
    /* `colonne_travail` réunit en un champ l'état de la dernière version et, à défaut, celui du
       dossier. Le calcul est fait par la vue : le refaire ici risquerait de le faire autrement. */
    colonneStatut: 'colonne_travail',
    /* Les cinq états du travail, puis les dossiers clôturés — et seulement si on demande à les voir.
       Décoché, la page ne montre que ce qui reste à faire : 331 dossiers contre 1 382 clos. */
    colonnes: [
      ...COLONNES_TRAVAIL.map((c) => ({ code: c.code, libelle: c.libelle })),
      ...(avecClos ? [{ code: 'CLOTUREE', libelle: 'Clôturée' }] : []),
    ],
    colonnesRecherche: ['nom', 'compte_nom', 'conseiller'],
    recherche,
    filtres: { compte_proprietaire_id: filtreProprietaire },
    /**
     * LA MARGE SE SOMME EN BASE, colonne par colonne. Michel, PDF du 25/08/2026, page 6 : un bandeau
     * « Marge totale des recommandations » découpé en à envoyer, à présenter, décision attendue,
     * acceptées. La somme suit les mêmes filtres que les colonnes — recherche et propriétaire
     * comprises — sans quoi le bandeau démentirait le tableau juste en dessous.
     */
    colonneSomme: 'marge_nette',
    /* LE TRI PART EN BASE. Seules dix cartes par colonne sont chargees : trier a l'arrivee
       reordonnerait un echantillon, et la plus grosse marge resterait invisible parce qu'onzieme. */
    ordre: { colonne: tri, ascendant },
    // Le tableau est la seule vue : il est toujours actif.
    actif: true,
  })

  /**
   * LE TOTAL EST LA SOMME DES COLONNES AFFICHÉES, et pas celle de toutes les recommandations.
   *
   * C'est voulu : quand « inclure les dossiers clos » est décoché, le bandeau doit annoncer la marge
   * du travail EN COURS. Un total qui inclurait les 1 573 dossiers clos écraserait les 199 355 € des
   * colonnes ouvertes et ne voudrait plus rien dire — on lirait l'historique de Kiwee, pas son
   * pipeline.
   */
  const colonnes = tableau.data ?? []
  const margeTotale = colonnes.reduce((t, c) => t + (c.somme ?? 0), 0)
  const nbDossiers = colonnes.reduce((n, c) => n + c.total, 0)
  const margeConnue = colonnes.some((c) => c.somme != null)

  const euros = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'

  return (
    <div>
      <Topbar title="Recommandations" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Recommandations"
          /* LA MARGE TOTALE COLLÉE AU TITRE, comme sur sa maquette. C'est la somme des COLONNES
             AFFICHÉES : « inclure les dossiers clos » décoché, elle annonce la marge du travail en
             cours. Un total incluant les 1 573 dossiers clos écraserait les 199 355 € du pipeline et
             on lirait l'historique de Kiwee au lieu de son plan de charge. */
          badge={margeConnue ? euros(margeTotale) : undefined}
          badgeLibelle="Marge totale"
          description="Le véritable produit de KiWee — jamais figée, elle évolue par versions successives."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle recommandation</Button>}
        />

        <ListToolbar query={recherche} onQueryChange={setRecherche} placeholder="Rechercher une recommandation, un compte…" count={nbDossiers}>
          <BasculePerimetre
            valeur={perimetre}
            onChange={setPerimetre}
            libelleMien="Mes dossiers"
            libelleTous="Tous les dossiers"
          />
          {/* LE TRI EST REVENU LE 28/08/2026 : « un système de tri et de filtre sur toutes les vues
              kanban ». Il avait été retiré trois jours plus tôt, avec le filtre par étape et la vue
              de liste. Ce qui gênait alors, c'était de trier des COLONNES — les étapes SONT les
              colonnes, elles ne se trient pas de l'extérieur. Trier les CARTES à l'intérieur d'une
              colonne est une autre affaire, et c'est celle-là qu'on demande. */}
          <SelecteurTri valeur={tri} onChange={setTri} options={optionsTri} />
        {/* INCLURE LES DOSSIERS CLOS. Demandé par Naoëlle le 25/08/2026, après que j'aie signalé la
            conséquence de la règle de Michel : un dossier clos ne se trouvait plus par la recherche
            de cette page, et c'est le genre de chose qu'on découvre au mauvais moment.
            Décoché par défaut — sa règle reste la règle, la case est l'exception. */}
        <button
          type="button"
          onClick={() => setAvecClos((v) => !v)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-kw-md border px-2.5 py-1.5 text-kw-sm font-bold transition-colors',
            avecClos
              ? 'border-ink-800 bg-ink-800 text-white'
              : 'border-kw-border-strong bg-white text-kw-meta hover:bg-kw-subtle',
          )}
        >
          <span className={cn(
            'flex h-3.5 w-3.5 items-center justify-center rounded-[3px]',
            avecClos ? 'bg-white/25' : 'border border-kw-border-strong',
          )}>
            {avecClos && <Check className="h-2.5 w-2.5" />}
          </span>
          Inclure les dossiers clos
        </button>
        </ListToolbar>

        <TableauKanban
            /* LA MARGE PAR STATUT, EN PASTILLE DE COLONNE — règle n° 6 du dossier UX du 26/08 :
               « afficher la marge par statut près du titre de chaque colonne et la marge totale près
               du titre de page ». Le bandeau récapitulatif livré le matin même disparaît, et sa
               version est meilleure : le chiffre est là où on lit la colonne, au lieu d'un tableau
               au-dessus qu'il faut mettre en correspondance de tête. */
            colonnes={colonnes.map((c) => ({
              code: c.code,
              libelle: c.libelle,
              total: c.somme == null ? null : euros(c.somme),
            }))}
            cartes={Object.fromEntries(
              colonnes.map((c) => [
                c.code,
                c.lignes.map((r) => ({
                  id: r.id,
                  titre: r.nom,
                  sousTitre: r.compte_nom ?? undefined,
                  /* LA MENTION PORTE LA MARGE, comme sur ses cartes. Le nombre de versions reprend
                     la place quand la marge n'est pas connue — c'est le cas de tout dossier né dans
                     Kimatch, dont aucun écran ne remplit encore les chiffres d'affaire. */
                  /* L'ÉTIQUETTE PORTE LA VERSION, ET SON RÉSULTAT QUAND ELLE EST CLOSE.
                     C'est ce qui distingue deux cartes de la même colonne : dans « À réactiver »,
                     une version expirée et une version refusée ne demandent pas le même appel.
                     Le numéro de version situe le dossier d'un coup d'œil — troisième tentative
                     n'est pas la première. */
                  nature: (() => {
                    const num = r.numero_version != null ? `V${r.numero_version}` : null
                    const fin = r.resultat_version
                      ? RESULTAT_VERSION_LIBELLE[r.resultat_version] ?? r.resultat_version
                      : null
                    if (!num) return 'Aucune version'
                    return [num, fin].filter(Boolean).join(' · ')
                  })(),
                  mention:
                    r.marge_nette != null
                      ? euros(r.marge_nette)
                      : r.nb_versions > 1
                        ? `${r.nb_versions} versions`
                        : undefined,
                  to: `/recommandations/${r.id}`,
                })),
              ]),
            )}
            /* LE TOTAL VIENT DE LA BASE, pas du nombre de cartes reçues : dix par colonne sont
               demandées, et une colonne peut en compter six cents. */
            totaux={Object.fromEntries(colonnes.map((c) => [c.code, c.total]))}
            siVide={tableau.isLoading ? 'Chargement…' : 'Aucune recommandation ne correspond.'}
          />
      </div>
      {showCreate && (
        <CreateRecommandationDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(recoId) => navigate(`/recommandations/${recoId}`)}
        />
      )}
    </div>
  )
}

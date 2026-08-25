import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useIsAdmin, useMonProfil } from '@/lib/data/roles'
import { FALLBACK_ETAPES_RECOMMANDATION } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useKanbanServeur } from '@/lib/useKanbanServeur'
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
  sites: { id: string; nom: string }[]
}

/** Les trois issues terminales de la diapositive 13. */
const ETAPES_CLOSES = ['ACCEPTEE', 'REFUSEE', 'ABANDONNEE']

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
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
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
  const estAdmin = useIsAdmin()
  const { data: monProfil } = useMonProfil()
  const filtreProprietaire = !estAdmin && monProfil?.id ? monProfil.id : null
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  /**
   * LA RECHERCHE SURVIT À LA LISTE. `useListeServeur` ne servait plus qu'à porter la saisie et le
   * total : le garder aurait lancé une requête paginée dont personne n'affiche le résultat. Un état
   * local suffit, et le total se lit sur la somme des colonnes — qui sont, elles, comptées en base.
   */
  const [recherche, setRecherche] = useState('')

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
  const tableau = useKanbanServeur<LigneReco>({
    vue: 'v_recommandations_liste',
    colonneStatut: 'etape',
    colonnes: etapes.filter((e) => !ETAPES_CLOSES.includes(e.code)).map((e) => ({ code: e.code, libelle: e.libelle })),
    colonnesRecherche: ['nom', 'compte_nom', 'conseiller'],
    recherche,
    filtres: { compte_proprietaire_id: filtreProprietaire },
    // Le tableau est la seule vue : il est toujours actif.
    actif: true,
  })

  return (
    <div>
      <Topbar title="Recommandations" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Recommandations"
          description="Le véritable produit de KiWee — jamais figée, elle évolue par versions successives."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle recommandation</Button>}
        />

        <ListToolbar query={recherche} onQueryChange={setRecherche} placeholder="Rechercher une recommandation, un compte…" count={(tableau.data ?? []).reduce((n, c) => n + c.total, 0)}>
          {/* PLUS DE BASCULEMENT, PLUS DE FILTRE PAR ÉTAPE, PLUS DE TRI. Naoëlle, 25/08/2026 :
              « garde juste la vue kanban pour partout, enlève la vue de liste ». Le filtre par étape
              et le tri appartenaient à la liste : les étapes SONT les colonnes du tableau, et une
              colonne ne se trie pas de l'extérieur. La recherche, elle, reste — elle traverse toutes
              les colonnes. */}
        </ListToolbar>

        <TableauKanban
            colonnes={(tableau.data ?? []).map((c) => ({ code: c.code, libelle: c.libelle }))}
            cartes={Object.fromEntries(
              (tableau.data ?? []).map((c) => [
                c.code,
                c.lignes.map((r) => ({
                  id: r.id,
                  titre: r.nom,
                  sousTitre: r.compte_nom ?? undefined,
                  mention: r.nb_versions > 1 ? `${r.nb_versions} versions` : undefined,
                  to: `/recommandations/${r.id}`,
                })),
              ]),
            )}
            /* LE TOTAL VIENT DE LA BASE, pas du nombre de cartes reçues : dix par colonne sont
               demandées, et une colonne peut en compter six cents. */
            totaux={Object.fromEntries((tableau.data ?? []).map((c) => [c.code, c.total]))}
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

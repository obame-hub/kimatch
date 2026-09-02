/**
 * Liste des comptes — servie par la base depuis le 16/08/2026.
 *
 * AVANT. La page chargeait les 2762 comptes pour en afficher vingt, puis filtrait et triait en
 * mémoire. Même motif que la liste des sites avant le 15/08, à une différence près : ici il n'y a
 * aucun agrégat métier à calculer, seulement des jointures à aplatir. Une VUE suffit donc, sans
 * fonction SQL — voir la migration 20260816120000 pour le raisonnement complet.
 *
 * APRÈS. `useListeServeur` interroge `v_comptes_liste` : PostgREST pagine, trie et filtre comme
 * sur une table, et le total remonte par `count: 'exact'` sans requête supplémentaire.
 *
 * LA COLONNE « SITES » ÉTAIT FAUSSE. Elle affichait `comptes.nb_sites`, une valeur figée à
 * l'import : elle ne correspondait plus au nombre réel de sites sur 2642 des 2762 comptes.
 * La vue la recalcule.
 */
import { useNavigate } from 'react-router-dom'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { MenuChoix } from '@/components/ui/menu-choix'
import { SortableTh } from '@/components/ui/sortable-th'
import { Tableau, TableauTete, TableauCorps, NomDeLigne } from '@/components/ui/tableau'
import { useListeServeur } from '@/lib/useListeServeur'
import { useState } from 'react'
import type { TypeCompte } from '@/types/domain'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useMonProfil } from '@/lib/data/roles'
import { useDecompteClientsProspects } from '@/lib/data/comptes'
import { cn } from '@/lib/utils'

const typeMeta: Record<TypeCompte, { label: string; tone: 'kiwi' | 'blue' | 'amber' | 'neutral' }> = {
  client: { label: 'Consommateur', tone: 'kiwi' },
  fournisseur: { label: 'Fournisseur', tone: 'blue' },
  partenaire: { label: 'Partenaire', tone: 'amber' },
  kiwee: { label: 'KiWee', tone: 'neutral' },
}

interface LigneCompte {
  id: string
  nom: string
  ville: string | null
  segment: string | null
  type_compte: TypeCompte
  nb_sites: number
  /**
   * Règle de Michel du 02/09/2026 : Client dès qu'un compteur du compte est sous contrat en cours.
   *
   * OPTIONNELLE À DESSEIN. Le déploiement Vercel part au push, alors que les migrations sont
   * appliquées à la main : il y a forcément un moment où cet écran est en ligne et la colonne
   * absente de `v_comptes_liste`. `undefined` se distingue alors de `false`, et la colonne affiche
   * un tiret plutôt que « Prospect » — c'est-à-dire plutôt qu'exactement le mensonge qu'on corrige.
   */
  est_client?: boolean
}

/** Les trois vues de la synthèse. La valeur est celle passée en filtre à PostgREST. */
type FiltreStatut = '' | 'true' | 'false'

/**
 * ENCAPSULABLE DANS LA PAGE PATRIMOINE. `sansEntete` masque la barre du haut quand cette liste est
 * affichée comme onglet de /patrimoine (diapositive 8 de Michel : « la page Patrimoine rassemble ces
 * objets et permet de naviguer du compte jusqu'au compteur et au contrat »). L'en-tête de page, lui,
 * reste : il porte le bouton de création et la phrase qui dit ce qu'est l'objet.
 */
export default function Comptes({ sansEntete }: { sansEntete?: boolean }) {
  const navigate = useNavigate()
  const [typeFilter, setTypeFilter] = useState('')
  const [statutFilter, setStatutFilter] = useState<FiltreStatut>('')

  /**

   * « LES MIENS » PAR DEFAUT, « TOUS » D'UN CLIC. Ce n'est pas une restriction : la base

   * laisse tout passer, et c'est la decision du 14/08 qu'on ne defait pas. Seul l'affichage

   * par defaut change, parce qu'on travaille d'abord son propre portefeuille — et il se

   * defait d'un clic quand on reprend celui d'un collegue absent.

   *

   * Le filtre part en base : le total du pied de liste suit, sans quoi il annoncerait un

   * nombre que la liste ne montre pas.

   */

  const { data: monProfil } = useMonProfil()

  const { perimetre, setPerimetre } = usePerimetre('comptes')

  const filtreProprietaire = perimetre === 'moi' && monProfil?.id ? monProfil.id : null


  const liste = useListeServeur<LigneCompte>({
    vue: 'v_comptes_liste',
    colonnesRecherche: ['nom', 'segment', 'ville'],
    triParDefaut: 'nom',
    // Le filtre par type descend en base plutôt que de porter sur les lignes déjà chargées :
    // sans cela, filtrer « Fournisseur » n'aurait montré que ceux présents dans la tranche.
    filtres: {
      proprietaire_id: filtreProprietaire,
      type_compte: typeFilter || null,
      // 'true' / 'false' partent tels quels : PostgREST lit `est_client=eq.true` sur un booléen.
      est_client: statutFilter || null,
    },
  })

  /* ══ LA SYNTHÈSE CLIENT / PROSPECT ══════════════════════════════════════════════════════════

     Naoëlle, 02/09/2026 : « mets une option pour voir la synthèse des comptes client et prospect,
     comme ça j'arrive à voir la différence de chiffres. »

     Elle est ici plutôt que sur un écran à part parce que le chiffre seul ne suffit jamais : voir
     « 392 » pose aussitôt la question « lesquels », et un clic doit y répondre. Les trois pastilles
     sont donc à la fois la synthèse et le filtre. */
  const decompte = useDecompteClientsProspects({
    proprietaireId: filtreProprietaire,
    typeCompte: typeFilter || null,
  })
  const total = (decompte.data?.clients ?? 0) + (decompte.data?.prospects ?? 0)
  const vues: { cle: FiltreStatut; libelle: string; nombre: number | null }[] = [
    { cle: '', libelle: 'Tous', nombre: decompte.data ? total : null },
    { cle: 'true', libelle: 'Clients', nombre: decompte.data?.clients ?? null },
    { cle: 'false', libelle: 'Prospects', nombre: decompte.data?.prospects ?? null },
  ]

  return (
    <div>
      {!sansEntete && <Topbar title="Comptes" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          titreMasque={sansEntete}
          title="Comptes"
          description="Le compte représente la relation (client, fournisseur, partenaire) — la valeur se crée sur les sites qui lui sont rattachés."
          actions={(
            <Button onClick={() => navigate('/comptes/nouveau')}>
              <Plus className="h-4 w-4" /> Nouveau compte
            </Button>
          )}
        />

        <ListToolbar query={liste.query} onQueryChange={liste.setQuery} placeholder="Rechercher un compte, une ville…" count={liste.total}>
          <BasculePerimetre valeur={perimetre} onChange={setPerimetre} libelleMien="Mes comptes" libelleTous="Tous les comptes" />
          {/* Le sélecteur que Naoëlle a photographié ouvert : liste blanche à coins droits et
              ligne bleue du système. `MenuChoix` reprend la main sur les trois. */}
          <MenuChoix
            valeur={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Filtrer par type de compte"
            choix={[
              { valeur: '', libelle: 'Tous les types' },
              ...(Object.keys(typeMeta) as TypeCompte[]).map((t) => ({
                valeur: t,
                libelle: typeMeta[t].label,
              })),
            ]}
          />
        </ListToolbar>

        {/* LES CHIFFRES SONT CEUX DU PÉRIMÈTRE, PAS CEUX DE LA RECHERCHE — et le mot « au total »
            le dit. Une synthèse qui se recalcule à chaque frappe n'est plus une synthèse : la
            question posée ici est « combien en ai-je », pas « combien parmi ceux dont le nom
            contient Dup ». La recherche continue de filtrer le tableau, en dessous. */}
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <span className="mr-0.5 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
            Statut commercial
          </span>
          {vues.map((v) => (
            <button
              key={v.cle}
              type="button"
              onClick={() => setStatutFilter(v.cle)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-km border px-2.5 py-1 text-km-label font-bold transition-colors',
                statutFilter === v.cle
                  ? 'border-km-green/30 bg-km-green-soft text-km-green'
                  : 'border-km-line bg-white text-km-muted hover:text-km-text',
              )}
            >
              {v.libelle}
              <span className="tabular-nums font-[580]">
                {v.nombre === null ? '—' : v.nombre.toLocaleString('fr-FR')}
              </span>
            </button>
          ))}
          <span className="text-km-label text-km-faint">
            au total · Client = au moins un compteur sous contrat en cours
          </span>
        </div>

        {/* LE TABLEAU PASSE SUR LE COMPOSANT PARTAGE. Cinq ecrans ecrivaient le leur a la main
            avec les memes classes recopiees — et elles avaient deja diverge : 640 px de largeur
            minimale ici, 720 sur Versions, 820 sur Compteurs. Une decision de design ne se
            propageait donc pas, et personne ne relit cinq ecrans pour verifier une bordure. */}
        <Card className="p-2.5">
          <Tableau minWidth={640}>
            <TableauTete>
              <tr>
                <SortableTh label="Nom" sortKey="nom" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
                <th className="px-5 py-3 font-medium">Type</th>
                <SortableTh label="Segment" sortKey="segment" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
                <SortableTh label="Ville" sortKey="ville" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
                <SortableTh label="Sites" sortKey="nb_sites" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
                <SortableTh label="Statut" sortKey="est_client" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
              </tr>
            </TableauTete>
            <TableauCorps>
              {liste.isLoading && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-km-muted">Chargement…</td>
                </tr>
              )}
              {liste.erreur && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-km-red">{liste.erreur}</td>
                </tr>
              )}
              {!liste.isLoading && !liste.erreur && liste.lignes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-km-muted">
                    {liste.query.trim() || typeFilter || statutFilter
                      ? 'Aucun compte ne correspond à la recherche.'
                      : "Aucun compte pour l'instant — clique sur « Nouveau compte » pour en créer un."}
                  </td>
                </tr>
              )}
              {liste.lignes.map((compte) => (
                <tr
                  key={compte.id}
                  onClick={() => navigate(`/comptes/${compte.id}`)}
                  className="cursor-pointer"
                >
                  {/* LE NOM PORTE SA PRECISION EN DESSOUS, motif de sa maquette : « Groupe Solstice /
                      6 sites · 18 compteurs » se lit d'un bloc, la ou deux colonnes obligent l'oeil a
                      faire l'aller-retour pour rapprocher deux informations qui vont ensemble. */}
                  <td>
                    <NomDeLigne precision={compte.ville || undefined}>{compte.nom}</NomDeLigne>
                  </td>
                  <td>
                    <Badge tone={typeMeta[compte.type_compte]?.tone ?? 'neutral'}>
                      {typeMeta[compte.type_compte]?.label ?? compte.type_compte}
                    </Badge>
                  </td>
                  <td className="text-km-muted">{compte.segment}</td>
                  <td className="text-km-muted">{compte.ville}</td>
                  <td className="tabular-nums text-km-muted">{compte.nb_sites}</td>
                  <td>
                    {/* La question ne se pose que pour un consommateur : personne ne « démarche »
                        un fournisseur d'énergie, et lui coller « Prospect » serait un contresens. */}
                    {compte.type_compte === 'client' && typeof compte.est_client === 'boolean' ? (
                      <Badge tone={compte.est_client ? 'kiwi' : 'neutral'}>
                        {compte.est_client ? 'Client' : 'Prospect'}
                      </Badge>
                    ) : (
                      <span className="text-km-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </TableauCorps>
          </Tableau>
          <PiedDeListe
            affiches={liste.lignes.length}
            total={liste.total}
            reste={liste.reste}
            onAfficherPlus={liste.afficherPlus}
            tailleTrancheSuivante={liste.tailleTrancheSuivante}
            libelle="comptes"
          />
        </Card>
      </div>
    </div>
  )
}

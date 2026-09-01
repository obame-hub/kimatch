import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileWarning, CalendarX, UserX, CalendarOff } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader, Indicateurs } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Tableau, TableauTete, TableauCorps, NomDeLigne } from '@/components/ui/tableau'
import { SortableTh } from '@/components/ui/sortable-th'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { MenuChoix } from '@/components/ui/menu-choix'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useMonProfil } from '@/lib/data/roles'
import { useListeServeur } from '@/lib/useListeServeur'
import { cn } from '@/lib/utils'

/**
 * ══ QUALITÉ DES DONNÉES ══
 *
 * Michel, 24/08/2026 : « Les échéances dépassées, données manquantes ou compteurs sans contrat
 * doivent plutôt générer une alerte portefeuille et ne pas prendre la place des 20 signaux
 * commerciaux ». Naoëlle, 01/09/2026, sur la forme : « un écran Qualité des données, avec les
 * problèmes regroupés par compte ».
 *
 * ══ POURQUOI CET ÉCRAN EXISTE SÉPARÉMENT DES SIGNAUX ══
 *
 * Un signal dit « ce client arrive à échéance, appelle-le ». Une donnée manquante dit « on ne sait
 * pas quand ce client arrive à échéance ». Ce ne sont pas deux urgences du même ordre : la première
 * se traite au téléphone avec un argumentaire, la seconde en réclamant une facture. Mélangées, les
 * 6 784 secondes noyaient les vingt premières — c'est exactement ce que Michel refusait.
 *
 * ══ POURQUOI PAR COMPTE, ET NON PAR COMPTEUR ══
 *
 * La liste plate fait 6 784 lignes, et personne ne traite 6 784 lignes. Surtout, ce n'est pas ainsi
 * que le travail se fait : on appelle un syndic UNE fois et on récupère les vingt échéances qui
 * manquent. CABINET MICHAU porte à lui seul 307 compteurs en défaut — c'est un coup de téléphone,
 * pas trois cents.
 *
 * ══ LE TRI PAR DÉFAUT EST LE VOLUME D'ÉNERGIE, PAS LE NOMBRE DE LIGNES ══
 *
 * Entre un compte à dix compteurs incomplets pesant 4 000 MWh et un autre à dix compteurs pesant
 * 40 MWh, le premier se traite d'abord : la donnée qui manque y coûte cent fois plus cher. Trier par
 * nombre enverrait les commerciaux sur les gros volumes de LIGNES au lieu des gros volumes tout
 * court — et les deux classements ne se ressemblent pas : CASTIN-GILLES-VILLARET pèse 18 849 MWh
 * pour 249 compteurs, quand CABINET MICHAU en pèse 7 712 pour 307.
 */

/** Ce que la vue rend, une ligne par compte concerné. */
interface LigneQualite {
  compte_id: string
  compte_nom: string
  conseiller: string
  type_compte: string | null
  nb_compteurs: number
  sans_contrat: number
  echeance_depassee: number
  sans_echeance: number
  sans_responsable: number
  /** Les compteurs DISTINCTS portant au moins un défaut — pas la somme des quatre colonnes. */
  compteurs_en_defaut: number
  mwh_en_defaut: number
  compte_sans_siret: boolean
  compte_sans_proprietaire: boolean
}

/**
 * LES QUATRE DÉFAUTS, DANS L'ORDRE DE CE QU'ILS COÛTENT.
 *
 * « Sans contrat » d'abord : ne pas savoir chez qui un compteur est fourni empêche tout — on ne peut
 * ni dater l'échéance, ni argumenter, ni chiffrer. « Sans échéance » ferme la marche : c'est le moins
 * fréquent (592) et le plus facile à obtenir, une facture suffit.
 */
const DEFAUTS = [
  { cle: 'sans_contrat', libelle: 'Sans contrat', icone: FileWarning,
    aide: 'On ignore chez quel fournisseur ce compteur est aujourd’hui.' },
  { cle: 'echeance_depassee', libelle: 'Échéance dépassée', icone: CalendarX,
    aide: 'La date est passée : plus personne ne sait quand relancer.' },
  { cle: 'sans_responsable', libelle: 'Sans responsable', icone: UserX,
    aide: 'Aucun contact n’est désigné pour ce compteur — on ne sait pas qui appeler.' },
  { cle: 'sans_echeance', libelle: 'Sans échéance', icone: CalendarOff,
    aide: 'Aucune date, ni déclarée par le client ni prouvée par un contrat.' },
] as const

type CleDefaut = (typeof DEFAUTS)[number]['cle']

export default function QualiteDonnees() {
  const navigate = useNavigate()
  const { data: monProfil } = useMonProfil()
  const { perimetre, setPerimetre } = usePerimetre('qualite-donnees')

  /* MÊME RÈGLE QUE PARTOUT : « Mes comptes » par défaut, la bascule à côté. Un commercial corrige
     son portefeuille, pas celui des autres — mais il doit pouvoir regarder l'ensemble, ne serait-ce
     que pour couvrir un collègue en vacances. */
  const filtreProprietaire = perimetre === 'moi' ? monProfil?.id ?? null : null

  /* LE FILTRE PORTE SUR UN DÉFAUT PRÉCIS. « Montre-moi les comptes à qui il manque un responsable »
     est une campagne d'appels ; « montre-moi tous les comptes imparfaits » n'en est pas une.
     Il se traduit en un tri, pas en une restriction : `.gt(colonne, 0)` n'existe pas dans
     `useListeServeur`, qui ne fait que des égalités. Trier sur la colonne du défaut met les comptes
     concernés en tête et laisse les zéros au fond — même service rendu, sans dénaturer le crochet
     partagé pour un seul écran. */
  const [defaut, setDefaut] = useState<CleDefaut | ''>('')

  const liste = useListeServeur<LigneQualite>({
    vue: 'v_qualite_donnees_compte',
    colonnesRecherche: ['compte_nom', 'conseiller'],
    triParDefaut: 'mwh_en_defaut',
    sensParDefaut: 'desc',
    filtres: { compte_proprietaire_id: filtreProprietaire },
  })

  /* LES QUATRE MESURES SONT CELLES DE LA PAGE COURANTE, et le disent. Les recompter sur toute la
     base demanderait une seconde requête agrégée ; les afficher sans le dire ferait croire que le
     bandeau et le tableau parlent de la même chose alors que le tableau est paginé. */
  const cumul = (cle: CleDefaut) => liste.lignes.reduce((n, l) => n + (l[cle] ?? 0), 0)
  const mesures = DEFAUTS.map((d) => ({
    libelle: d.libelle,
    valeur: cumul(d.cle).toLocaleString('fr-FR'),
    precision: 'compteurs',
  }))

  const nombre = (n: number) => (n === 0 ? '—' : n.toLocaleString('fr-FR'))

  return (
    <div>
      <Topbar title="Qualité des données" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Qualité des données"
          badge={liste.total.toLocaleString('fr-FR')}
          badgeLibelle="Comptes à reprendre"
          description="Ce qui manque pour travailler un portefeuille, regroupé par compte — un appel au syndic récupère vingt échéances, pas une."
        />

        <Indicateurs mesures={mesures} />

        <ListToolbar
          query={liste.query}
          onQueryChange={liste.setQuery}
          placeholder="Rechercher un compte, un conseiller…"
          count={liste.total}
        >
          <BasculePerimetre
            valeur={perimetre}
            onChange={setPerimetre}
            libelleMien="Mes comptes"
            libelleTous="Tous les comptes"
          />
          <MenuChoix
            valeur={defaut}
            onChange={(v) => {
              setDefaut(v as CleDefaut | '')
              /* Choisir un défaut trie dessus : les comptes concernés remontent, les autres
                 descendent. Revenir à « tous » rend la main au volume d'énergie. */
              if (v) liste.trierPar(v)
              else liste.trierPar('mwh_en_defaut')
            }}
            ariaLabel="Se concentrer sur un défaut"
            choix={[
              { valeur: '', libelle: 'Tous les défauts' },
              ...DEFAUTS.map((d) => ({ valeur: d.cle, libelle: d.libelle, detail: d.aide })),
            ]}
          />
        </ListToolbar>

        <Card className="p-2.5">
          <Tableau minWidth={900}>
            <TableauTete>
              <tr>
                <SortableTh label="Compte" sortKey="compte_nom" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
                <SortableTh label="À reprendre" sortKey="compteurs_en_defaut" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
                {DEFAUTS.map((d) => (
                  <SortableTh
                    key={d.cle}
                    label={d.libelle}
                    sortKey={d.cle}
                    activeKey={liste.tri}
                    dir={liste.sens}
                    onSort={liste.trierPar}
                  />
                ))}
                <SortableTh label="MWh concernés" sortKey="mwh_en_defaut" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
              </tr>
            </TableauTete>
            <TableauCorps>
              {liste.isLoading && (
                <tr><td colSpan={7} className="py-6 text-center text-km-muted">Chargement…</td></tr>
              )}
              {liste.erreur && (
                <tr><td colSpan={7} className="py-6 text-center text-km-red">{liste.erreur}</td></tr>
              )}
              {!liste.isLoading && !liste.erreur && liste.lignes.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-km-muted">
                    {liste.query.trim()
                      ? 'Aucun compte ne correspond à la recherche.'
                      : 'Aucune donnée manquante sur ce périmètre — il n’y a rien à corriger ici.'}
                  </td>
                </tr>
              )}
              {liste.lignes.map((l) => (
                <tr
                  key={l.compte_id}
                  onClick={() => navigate(`/comptes/${l.compte_id}`)}
                  className="cursor-pointer"
                >
                  <td>
                    {/* LA PRÉCISION PORTE LE CONSEILLER ET LES MANQUES DE LA FICHE ELLE-MÊME —
                        SIRET absent, aucun propriétaire. Ce sont des défauts du COMPTE, pas de ses
                        compteurs : leur donner une colonne chiffrée les mélangerait à un décompte
                        de compteurs et fausserait la lecture de la ligne. */}
                    <NomDeLigne
                      precision={
                        [
                          l.conseiller || 'sans conseiller',
                          l.compte_sans_siret ? 'SIRET absent' : null,
                          l.compte_sans_proprietaire ? 'sans propriétaire' : null,
                        ].filter(Boolean).join(' · ')
                      }
                    >
                      {l.compte_nom}
                    </NomDeLigne>
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    <span className="font-bold text-km-text">{nombre(l.compteurs_en_defaut)}</span>
                    <span className="ml-1 text-km-tiny text-km-faint">/ {l.nb_compteurs}</span>
                  </td>
                  {DEFAUTS.map((d) => (
                    <td key={d.cle} className="px-5 py-3 tabular-nums">
                      <span
                        className={cn(
                          l[d.cle] === 0 ? 'text-km-faint' : 'font-semibold text-km-text',
                          /* Le défaut sur lequel on s'est concentré se colore : sur sept colonnes
                             de chiffres, l'œil perd sinon celle qu'il vient de demander. */
                          defaut === d.cle && l[d.cle] > 0 && 'text-km-amber',
                        )}
                      >
                        {nombre(l[d.cle])}
                      </span>
                    </td>
                  ))}
                  <td className="px-5 py-3 tabular-nums text-km-muted">
                    {l.mwh_en_defaut > 0
                      ? Math.round(l.mwh_en_defaut).toLocaleString('fr-FR')
                      : '—'}
                  </td>
                </tr>
              ))}
            </TableauCorps>
          </Tableau>
        </Card>

        <PiedDeListe
          affiches={liste.lignes.length}
          total={liste.total}
          reste={liste.reste}
          onAfficherPlus={liste.afficherPlus}
          tailleTrancheSuivante={liste.tailleTrancheSuivante}
          libelle="comptes"
        />
      </div>
    </div>
  )
}

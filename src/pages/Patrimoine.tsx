/**
 * LA PAGE PATRIMOINE — diapositive 8 de Michel.
 *
 *   « DONNÉES DE RÉFÉRENCE · Le patrimoine énergétique est le socle.
 *     COMPTE — l'entreprise ou l'organisation cliente, porte la vision consolidée et les responsables.
 *     Contacts — les personnes et leurs rôles · Sites — les lieux de consommation
 *     Compteurs — les points PDL / PCE · Mandats — l'autorisation d'agir
 *     Contrats — les engagements et échéances · Documents — les pièces justificatives
 *     La page Patrimoine rassemble ces objets et permet de naviguer du compte jusqu'au compteur
 *     et au contrat. »
 *
 * POURQUOI RASSEMBLER. Le rail de gauche portait Comptes, Sites et Contacts comme trois entrées
 * indépendantes, et les mandats, contrats et documents n'y étaient plus depuis le ménage du
 * 23/08/2026 — on n'y accédait que par une fiche. Sept objets qui décrivent une même chose, éclatés
 * en sept endroits : la question « qu'est-ce qu'on sait de ce client » n'avait pas de page.
 *
 * CE N'EST PAS UNE RÉÉCRITURE. Chaque onglet monte la liste qui existait déjà, à laquelle on a
 * ajouté `sansEntete` pour qu'elle n'affiche pas une deuxième barre de titre. Elles gardent leur
 * en-tête de page, donc leur bouton de création et la phrase qui dit ce qu'est l'objet. Une seule
 * liste a dû être écrite : celle des compteurs, qui n'existait pas.
 *
 * L'ONGLET VIT DANS L'URL. `/patrimoine?objet=compteurs` est copiable et survit à un rafraîchissement.
 * Sans cela, revenir d'une fiche compteur ramènerait sur l'onglet des comptes — et le va-et-vient
 * entre une liste et ses fiches est exactement ce que fait un commercial toute la journée.
 *
 * LE MONTAGE EST PARESSEUX. Seul l'onglet visible est monté : monter les sept ferait sept
 * chargements complets du CRM à l'ouverture de la page.
 */
import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Users, MapPin, Gauge, FileCheck2, Files, TrendingUp } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { cn } from '@/lib/utils'

const PerformanceComptes = lazy(() => import('@/pages/PerformanceComptes'))
const Comptes = lazy(() => import('@/pages/Comptes'))
const Contacts = lazy(() => import('@/pages/Contacts'))
const Sites = lazy(() => import('@/pages/Sites'))
const Compteurs = lazy(() => import('@/pages/Compteurs'))
const Mandats = lazy(() => import('@/pages/Mandats'))
const Documents = lazy(() => import('@/pages/Documents'))

/** L'ordre est celui de sa diapositive : du compte jusqu'au compteur, puis ce qui l'engage. */
const OBJETS = [
  /* SA PAGE 2 EN PREMIER ONGLET. Le PDF du 25/08/2026 l'appelle « Patrimoine des comptes » et en
     fait la vue d'entrée du patrimoine : on regarde d'abord l'état de la donnée, ensuite les objets
     un par un. Les sept onglets existants ne bougent pas — celui-ci s'ajoute devant. */
  { cle: 'synthese', libelle: 'Synthèse', icone: TrendingUp, sens: 'Le volume du portefeuille et les données à corriger', Page: PerformanceComptes },
  { cle: 'comptes', libelle: 'Comptes', icone: Building2, sens: 'L’entreprise ou l’organisation cliente', Page: Comptes },
  { cle: 'contacts', libelle: 'Contacts', icone: Users, sens: 'Les personnes et leurs rôles', Page: Contacts },
  { cle: 'sites', libelle: 'Sites', icone: MapPin, sens: 'Les lieux de consommation', Page: Sites },
  { cle: 'compteurs', libelle: 'Compteurs', icone: Gauge, sens: 'Les points PDL / PCE', Page: Compteurs },
  { cle: 'mandats', libelle: 'Mandats', icone: FileCheck2, sens: 'L’autorisation d’agir', Page: Mandats },
  /* CONTRATS EST RETIRÉ DES ONGLETS — dossier UX du 26/08 : « hors périmètre : aucune page Contrats
     ne doit être réintroduite », confirmé par Naoëlle (« il veut dire retirer contrats du menu »).

     MASQUER N'EST PAS SUPPRIMER, et ici la nuance est vitale. Les 1 600 contrats restent en base et
     continuent de travailler : ce sont EUX qui prouvent les échéances — la nature « prouvée » de
     `v_compteurs_liste` se calcule sur `contrats.date_fin`, et 1 036 compteurs en dépendent. Retirer
     la donnée aurait fait basculer ces 1 036 échéances de « prouvée » à « estimée » du jour au
     lendemain.

     La page reste donc atteignable par la recherche ⌘K et par son lien direct, comme Requêtes et
     Rémunérations depuis le 25/08. Seul l'onglet disparaît. */
  { cle: 'documents', libelle: 'Documents', icone: Files, sens: 'Les pièces justificatives', Page: Documents },
] as const

type CleObjet = (typeof OBJETS)[number]['cle']

export default function Patrimoine() {
  const [params, setParams] = useSearchParams()
  const demande = params.get('objet')
  const actif: CleObjet = OBJETS.some((o) => o.cle === demande) ? (demande as CleObjet) : 'synthese'
  const objet = OBJETS.find((o) => o.cle === actif)!
  const Page = objet.Page

  return (
    <div>
      <Topbar title="Patrimoine" />

      {/* La barre d'onglets défile horizontalement plutôt que de se replier : sept objets ne tiennent
          pas sur un téléphone, et un menu déroulant cacherait la structure que Michel veut montrer. */}
      <div className="border-b border-km-line bg-white">
        <div className="flex gap-1 overflow-x-auto px-4 sm:px-6">
          {OBJETS.map((o) => {
            const Icone = o.icone
            const courant = o.cle === actif
            return (
              <button
                key={o.cle}
                type="button"
                title={o.sens}
                // `replace` : sept onglets visités ne doivent pas exiger sept retours en arrière
                // pour sortir de la page.
                onClick={() => setParams({ objet: o.cle }, { replace: true })}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-km-body font-semibold transition-colors',
                  courant
                    ? 'border-km-green text-km-text'
                    : 'border-transparent text-km-muted hover:border-km-line hover:text-km-text',
                )}
                aria-current={courant ? 'page' : undefined}
              >
                <Icone className="h-4 w-4" strokeWidth={2.1} />
                {o.libelle}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <Suspense fallback={<p className="text-km-body text-km-muted">Chargement…</p>}>
          {/* `key` force le remontage au changement d'onglet : sans elle, React réutiliserait
              l'état de la liste précédente — recherche saisie, tri, tranche affichée. */}
          <Page key={actif} sansEntete />
        </Suspense>
      </div>
    </div>
  )
}

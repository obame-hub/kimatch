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
import { Building2, Users, Gauge, FileCheck2, FileSignature, Files, TrendingUp, MessageSquare } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { cn } from '@/lib/utils'

const Comptes = lazy(() => import('@/pages/Comptes'))
const Contacts = lazy(() => import('@/pages/Contacts'))
const Compteurs = lazy(() => import('@/pages/Compteurs'))
const Mandats = lazy(() => import('@/pages/Mandats'))
const Contrats = lazy(() => import('@/pages/Contrats'))
const QualitePortefeuille = lazy(() => import('@/pages/QualitePortefeuille'))
const Documents = lazy(() => import('@/pages/Documents'))
const Activite = lazy(() => import('@/pages/Activite'))

/** L'ordre est celui de sa diapositive : du compte jusqu'au compteur, puis ce qui l'engage. */
const OBJETS = [
  /* ══ L'ONGLET SYNTHÈSE DEVIENT « QUALITÉ DU PORTEFEUILLE » ══
     Cadrage validé de Naoëlle, 02/09/2026 : « on va effacer le contenu de l'onglet Synthèse dans
     Patrimoine et on va mettre ça à la place ».

     CE QUI PART : `PerformanceComptes`, la page 2 du PDF du 25/08. Elle affichait quatre blocs de
     comptage — échéances vides ou dépassées, compteurs sans responsable — sans aucun moyen d'aller
     voir les lignes derrière. Le constat était juste, il ne menait à rien : on lisait « 3 883
     échéances dépassées » et on refermait l'onglet.

     CE QUI ARRIVE fait le même constat, puis le rend actionnable : trois filtres qui se combinent,
     deux histogrammes qui suivent, et un tableau où chaque score s'ouvre sur ses anomalies. Le
     libellé de l'onglet reste « Synthèse » : c'est le mot du rail, et changer le nom d'un onglet
     déplace le repère de ceux qui l'utilisent tous les jours. La page, elle, porte son titre. */
  { cle: 'synthese', libelle: 'Synthèse', icone: TrendingUp, sens: 'La qualité des données du portefeuille, et les corrections à faire', Page: QualitePortefeuille },
  { cle: 'comptes', libelle: 'Comptes', icone: Building2, sens: 'L’entreprise ou l’organisation cliente', Page: Comptes },
  { cle: 'contacts', libelle: 'Contacts', icone: Users, sens: 'Les personnes et leurs rôles', Page: Contacts },
  /* ══ SITES SORT DES ONGLETS, LE 09/09/2026 ═══════════════════════════════════════════════════

     Reunion du matin. William : « l'objet site, dans l'utilisation et dans l'architecture de
     Kimatch, m'embete plus qu'il ne me sert […] je ne vois pas la valeur ajoutee. » Michel : « bah
     dans ce cas, ca degage. »

     LE CAS QUI A DECLENCHE LA DECISION est celui de Matthieu, rapporte par William : il creait des
     recommandations VIDES parce qu'il selectionnait des sites en croyant selectionner des
     compteurs. Le site etait un dossier, il l'a pris pour un point de livraison.

     C'EST LE MENU QUI PORTAIT LA CONFUSION. Entre « Contacts » et « Compteurs », un onglet « Sites »
     annonce un objet de meme rang — alors que ce n'etait qu'un regroupement d'adresse. Le retirer
     du menu suffit a ce que personne n'y arrive plus par navigation, et c'est l'essentiel du
     benefice.

     LA FICHE RESTE ATTEIGNABLE PAR LIEN, volontairement : 28 liens vers une fiche site subsistent
     dans l'application — depuis un compteur, un contrat, une recommandation. Les couper d'un coup
     donnerait 28 liens morts. Ils seront rediriges vers le compteur dans un second temps, et la
     table ne partira qu'apres.

     CE QUI REMPLACE LE SITE : le compteur porte desormais son libelle de site, son adresse et son
     groupe (migration 20260909100000). L'onglet Compteurs, juste en dessous, montre donc la meme
     information au bon niveau. */
  { cle: 'compteurs', libelle: 'Compteurs', icone: Gauge, sens: 'Les points PDL / PCE', Page: Compteurs },
  { cle: 'mandats', libelle: 'Mandats', icone: FileCheck2, sens: 'L’autorisation d’agir', Page: Mandats },
  /* ══ CONTRATS REVIENT DANS LES ONGLETS, LE 03/09/2026 ═════════════════════════════════════════

     Naoëlle : « ajoute les contrats ici dans les onglets de Patrimoine ».

     C'EST UN RETOUR EN ARRIÈRE ASSUMÉ, et il vaut la peine d'être écrit : le dossier UX du 26/08
     disait « hors périmètre : aucune page Contrats ne doit être réintroduite », et elle l'avait
     confirmé à l'époque (« il veut dire retirer contrats du menu »). Elle revient dessus une
     semaine plus tard — c'est sa décision, et une note qui garderait la trace de l'ancienne sans
     dire qu'elle est caduque ferait hésiter le prochain à y toucher.

     Ce que la semaine a changé : le contrat porte désormais son propre numéro (CT-00001), un filtre
     d'énergie et une frise de statut. Ce n'est plus la liste brute qu'on avait retirée.

     SA PLACE EST APRÈS LE MANDAT, et cet ordre est l'argument. Les onglets suivent la chaîne du
     travail — le compte, ses contacts, ses sites, ses compteurs, ce qui autorise à agir, puis ce
     qui engage. Un contrat vient après le mandat qu'il a fallu faire signer pour l'obtenir. */
  { cle: 'contrats', libelle: 'Contrats', icone: FileSignature, sens: 'Ce qui engage le client', Page: Contrats },
  { cle: 'documents', libelle: 'Documents', icone: Files, sens: 'Les pièces justificatives', Page: Documents },
  /* ══ ACTIVITÉ, LE 07/09/2026 ══

     Naoëlle : « où est Appels non rattachés, je ne vois pas l'écran ? Il faudrait le mettre dans un
     onglet dans Patrimoine qui recense un peu toutes les activités, tout ce qui concerne les mails
     et appels, et mettre ça dedans. »

     L'écran existait et fonctionnait, mais je l'avais inscrit dans `pagesRecherchables` et non dans
     le menu : il n'était donc accessible qu'en le cherchant, c'est-à-dire en sachant déjà qu'il
     existe. Une fonctionnalité qu'on ne trouve pas n'existe pas.

     SA PLACE EST À LA FIN, et pour la même raison que les autres onglets suivent la chaîne du
     travail : l'activité n'est pas un objet du patrimoine, c'est ce qui s'y est passé. On la
     consulte après avoir regardé de quoi on parle. */
  { cle: 'activite', libelle: 'Activité', icone: MessageSquare, sens: 'Les mails et les appels, consignés ou à rattacher', Page: Activite },
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

import { lazy, Suspense } from 'react'
/* Tous les écrans passent par `chargerPage` : après une mise en ligne, un onglet resté ouvert
   demande un morceau qui n'existe plus et reste blanc. Voir `src/lib/chargerPage.ts`. */
import { chargerPage } from '@/lib/chargerPage'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { SandboxBanner } from '@/components/layout/SandboxBanner'
import { VoletEmailProvider } from '@/lib/voletEmail'
import { VoletEmail } from '@/components/email/VoletEmail'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { FrontiereErreur } from '@/components/FrontiereErreur'
import Login from '@/pages/Login'
import PageIntrouvable from '@/pages/PageIntrouvable'

/**
 * LES TRENTE-SIX AUTRES ECRANS SE CHARGENT QUAND ON Y VA.
 *
 * Avant, les 37 pages etaient importees d'un bloc : le navigateur telechargeait 2,18 Mo — toute
 * l'application, Recharts et Leaflet compris — pour afficher l'ecran de connexion. Vite le
 * signalait a chaque compilation, et signalait aussi que trois pages etaient importees a la fois
 * statiquement ici et dynamiquement depuis Patrimoine, ce qui annulait le decoupage prevu la-bas.
 *
 * `lazy` demande a Vite un fichier par ecran, telecharge au premier passage puis garde en cache.
 * Login fait exception : c'est le premier ecran, le differer ajouterait une attente exactement la
 * ou l'utilisateur n'a encore rien vu.
 */
const Dashboard = lazy(() => chargerPage(() => import('@/pages/Dashboard')))
const RedirectionSite = lazy(() => chargerPage(() => import('@/pages/RedirectionSite')))
const Opportunites = lazy(() => chargerPage(() => import('@/pages/Opportunites')))
const OpportuniteDetail = lazy(() => chargerPage(() => import('@/pages/OpportuniteDetail')))
const Prospection = lazy(() => chargerPage(() => import('@/pages/Prospection')))
const PisteDetail = lazy(() => chargerPage(() => import('@/pages/PisteDetail')))
const Requetes = lazy(() => chargerPage(() => import('@/pages/Requetes')))
const RequeteDetail = lazy(() => chargerPage(() => import('@/pages/RequeteDetail')))
const SuivisContrats = lazy(() => chargerPage(() => import('@/pages/SuivisContrats')))
const SuiviContratDetail = lazy(() => chargerPage(() => import('@/pages/SuiviContratDetail')))
const Remunerations = lazy(() => chargerPage(() => import('@/pages/Remunerations')))
const Recommandations = lazy(() => chargerPage(() => import('@/pages/Recommandations')))
const RecommandationDetail = lazy(() => chargerPage(() => import('@/pages/RecommandationDetail')))
const Comptes = lazy(() => chargerPage(() => import('@/pages/Comptes')))
const Patrimoine = lazy(() => chargerPage(() => import('@/pages/Patrimoine')))
const Compteurs = lazy(() => chargerPage(() => import('@/pages/Compteurs')))
const CompteCreate = lazy(() => chargerPage(() => import('@/pages/CompteCreate')))
const CompteDetail = lazy(() => chargerPage(() => import('@/pages/CompteDetail')))
const CompteurDetail = lazy(() => chargerPage(() => import('@/pages/CompteurDetail')))
const Mandats = lazy(() => chargerPage(() => import('@/pages/Mandats')))
const MandatDetail = lazy(() => chargerPage(() => import('@/pages/MandatDetail')))
const Versions = lazy(() => chargerPage(() => import('@/pages/Versions')))
const Documents = lazy(() => chargerPage(() => import('@/pages/Documents')))
const DocumentDetail = lazy(() => chargerPage(() => import('@/pages/DocumentDetail')))
const Interactions = lazy(() => chargerPage(() => import('@/pages/Interactions')))
const InteractionDetail = lazy(() => chargerPage(() => import('@/pages/InteractionDetail')))
const Contrats = lazy(() => chargerPage(() => import('@/pages/Contrats')))
const ContratDetail = lazy(() => chargerPage(() => import('@/pages/ContratDetail')))
const Contacts = lazy(() => chargerPage(() => import('@/pages/Contacts')))
const ContactDetail = lazy(() => chargerPage(() => import('@/pages/ContactDetail')))
const Taches = lazy(() => chargerPage(() => import('@/pages/Taches')))
const ActionDetail = lazy(() => chargerPage(() => import('@/pages/ActionDetail')))
const Parametres = lazy(() => chargerPage(() => import('@/pages/Parametres')))
const Administration = lazy(() => chargerPage(() => import('@/pages/Administration')))
const FileAppels = lazy(() => chargerPage(() => import('@/pages/FileAppels')))
const MonProfil = lazy(() => chargerPage(() => import('@/pages/MonProfil')))
const Support = lazy(() => chargerPage(() => import('@/pages/Support')))
const Nouveautes = lazy(() => chargerPage(() => import('@/pages/Nouveautes')))
const Pricing = lazy(() => chargerPage(() => import('@/pages/Pricing')))

function App() {
  return (
    /* ══ LE BANDEAU ENTRE DANS LA COLONNE, ET L'APPLICATION RETROUVE 28 PX ══
       William, 07/09/2026 : « les boutons sont encore coupés en bas, je ne veux pas avoir à
       scroller ». Ils l'étaient sur toutes les pages, pas seulement là.

       LA CAUSE : `AppLayout` occupe `h-screen`, soit 100 % de la hauteur de fenêtre — mais le
       bandeau était rendu AU-DESSUS, hors de lui. Total : 100 % + 28 px, et les 28 derniers pixels
       de chaque écran passaient sous la ligne de flottaison. Le bandeau DocuSign avait déjà été
       placé à l'intérieur pour cette raison exacte, et son commentaire l'explique dans `AppLayout` ;
       celui-ci était resté dehors.

       La colonne ci-dessous fait ce que ce commentaire décrit : elle englobe le bandeau, et ce qui
       suit se partage ce qui reste. Le décalage ne se voyait qu'en local et sur la sandbox — en
       production le bandeau ne s'affiche pas — mais il faussait toutes les validations visuelles. */
    <VoletEmailProvider>
      <div className="flex h-screen flex-col">
      <SandboxBanner />
      {/* LE VOLET D'ÉCRITURE DE MAIL, MONTÉ UNE SEULE FOIS, hors des routes.
          C'est ce qui fait qu'un brouillon réduit survit à la navigation : monté dans une route, il
          disparaîtrait au premier changement d'écran — c'est-à-dire exactement quand on va chercher
          l'information pour laquelle on l'avait réduit. */}
      <VoletEmail />
      {/* ══ LA FRONTIÈRE D'ERREUR, AUTOUR DE TOUT CE QUI S'AFFICHE ══════════════════════════════

          Audit du 13/09/2026, constat ERR-01. Avant elle, une exception de rendu dans n'importe
          lequel des 299 fichiers démontait l'arbre React entier : écran blanc définitif, sans
          message, sans bouton. C'était la première cause des pages blanches.

          ELLE EST DEHORS, LE `Suspense` EST DEDANS, et cet ordre compte. Un écran différé qui
          n'arrive pas lève son erreur pendant que `Suspense` attend : si la frontière était à
          l'intérieur, elle serait démontée en même temps que ce qu'elle protège et ne verrait
          rien. Dehors, elle rattrape aussi bien l'échec de rendu que l'échec de chargement.

          ELLE NE REMPLACE PAS `chargerPage`, elle le complète : `chargerPage` recharge une fois
          quand un morceau manque après une mise en ligne, ce qui est le bon remède dans ce cas
          précis. La frontière prend la suite quand ce remède ne suffit pas — et jusqu'ici, il n'y
          avait rien derrière. */}
      <FrontiereErreur perimetre="Cet écran">
      {/* La frontiere d'attente des ecrans differes. Volontairement VIDE plutot qu'un
          « Chargement… » : le fichier d'un ecran pese quelques dizaines de kilo-octets et
          arrive en une fraction de seconde. Un texte qui apparait et disparait aussitot se
          remarque plus que le silence, et donne l'impression que l'application rame. */}
      <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          {/* ══ PLUS AUCUNE PAGE DE SITE, NI LISTE NI FICHE ═══════════════════════════════════

              Le 09/09 j'avais gardé la fiche, atteignable par les 26 liens « Site : … » — les
              couper d'un coup aurait fait 26 liens morts. Le 10/09 William constate le résultat :
              « les sites, ils existent toujours, j'ai vu Guillaume il était sur un site ce matin,
              vraiment la page site à l'ancienne avec la map et tout. » Michel, depuis la liste des
              compteurs : « ils apparaissent mais ils sont introuvables. »

              Le raisonnement tenait pour le code, pas pour l'équipe : on ne peut pas annoncer un
              objet supprimé et le laisser s'ouvrir. L'adresse `/sites/:id` REDIRIGE donc, ce qui
              garde les 26 liens vivants sans garder l'écran. Voir `RedirectionSite`. */}
          <Route path="/sites/:id" element={<RedirectionSite />} />
          <Route path="/prospection" element={<Prospection />} />
          <Route path="/pistes/:id" element={<PisteDetail />} />
          <Route path="/opportunites" element={<Opportunites />} />
          <Route path="/opportunites/:id" element={<OpportuniteDetail />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/requetes" element={<Requetes />} />
          <Route path="/requetes/:id" element={<RequeteDetail />} />
          <Route path="/suivis-contrats" element={<SuivisContrats />} />
          <Route path="/suivis-contrats/:id" element={<SuiviContratDetail />} />
          <Route path="/remunerations" element={<Remunerations />} />
          {/* Les deux routes des signaux sont retirées depuis le 02/09/2026 — décision et chemin de
              retour dans `cycleNavItems` (src/lib/navItems.tsx). Les pages `Signaux.tsx` et
              `SignalDetail.tsx` restent dans le dépôt : il suffira de rebrancher ces deux lignes. */}
          <Route path="/recommandations" element={<Recommandations />} />
          <Route path="/recommandations/:id" element={<RecommandationDetail />} />
          <Route path="/patrimoine" element={<Patrimoine />} />
          <Route path="/compteurs" element={<Compteurs />} />
          <Route path="/comptes" element={<Comptes />} />
          <Route path="/comptes/nouveau" element={<CompteCreate />} />
          <Route path="/comptes/:id" element={<CompteDetail />} />
          <Route path="/compteurs/:id" element={<CompteurDetail />} />
          <Route path="/mandats" element={<Mandats />} />
          <Route path="/mandats/:id" element={<MandatDetail />} />
          <Route path="/versions" element={<Versions />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/:id" element={<DocumentDetail />} />
          <Route path="/interactions" element={<Interactions />} />
          {/* La file des appels non rattaches : une boite de reception, pas un
              historique. Rangee sous Interactions, dont elle est l'antichambre. */}
          <Route path="/appels-non-rattaches" element={<FileAppels />} />
          <Route path="/interactions/:id" element={<InteractionDetail />} />
          <Route path="/contrats" element={<Contrats />} />
          <Route path="/contrats/:id" element={<ContratDetail />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/taches" element={<Taches />} />
          <Route path="/taches/:id" element={<ActionDetail />} />
          <Route path="/parametres" element={<Parametres />} />
          <Route path="/administration" element={<Administration />} />
          <Route path="/profil" element={<MonProfil />} />
          <Route path="/support" element={<Support />} />
          <Route path="/nouveautes" element={<Nouveautes />} />
          {/* ══ TOUTE ADRESSE INCONNUE ABOUTIT QUELQUE PART ══════════════════════════════════

              Audit du 13/09/2026, constat RTG-01. Il n'y avait aucune route de repli : une adresse
              hors de cette liste traversait `ProtectedRoute`, montait `AppLayout`, et laissait
              l'`Outlet` VIDE. On voyait la barre latérale, l'en-tête, et un grand rectangle blanc
              — rien ne disait que l'adresse n'existait pas.

              Le cas se produit pour de vrai : les deux routes des signaux ont été retirées le
              02/09, celles des sites le 09/09, et un favori vers une ancienne adresse suffit.

              ELLE EST DANS `AppLayout`, pas dehors : on garde le menu, donc on peut repartir. */}
          <Route path="*" element={<PageIntrouvable />} />
        </Route>
      </Route>
      </Routes>
      </Suspense>
      </FrontiereErreur>
      </div>
    </VoletEmailProvider>
  )
}

export default App

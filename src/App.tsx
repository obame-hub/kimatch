import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { SandboxBanner } from '@/components/layout/SandboxBanner'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Login from '@/pages/Login'

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
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Sites = lazy(() => import('@/pages/Sites'))
const SiteDetail = lazy(() => import('@/pages/SiteDetail'))
const Signaux = lazy(() => import('@/pages/Signaux'))
const Opportunites = lazy(() => import('@/pages/Opportunites'))
const OpportuniteDetail = lazy(() => import('@/pages/OpportuniteDetail'))
const Prospection = lazy(() => import('@/pages/Prospection'))
const Requetes = lazy(() => import('@/pages/Requetes'))
const SuivisContrats = lazy(() => import('@/pages/SuivisContrats'))
const SuiviContratDetail = lazy(() => import('@/pages/SuiviContratDetail'))
const Remunerations = lazy(() => import('@/pages/Remunerations'))
const SignalDetail = lazy(() => import('@/pages/SignalDetail'))
const Recommandations = lazy(() => import('@/pages/Recommandations'))
const RecommandationDetail = lazy(() => import('@/pages/RecommandationDetail'))
const Comptes = lazy(() => import('@/pages/Comptes'))
const Patrimoine = lazy(() => import('@/pages/Patrimoine'))
const Compteurs = lazy(() => import('@/pages/Compteurs'))
const CompteCreate = lazy(() => import('@/pages/CompteCreate'))
const CompteDetail = lazy(() => import('@/pages/CompteDetail'))
const CompteurDetail = lazy(() => import('@/pages/CompteurDetail'))
const Mandats = lazy(() => import('@/pages/Mandats'))
const MandatDetail = lazy(() => import('@/pages/MandatDetail'))
const Versions = lazy(() => import('@/pages/Versions'))
const Documents = lazy(() => import('@/pages/Documents'))
const DocumentDetail = lazy(() => import('@/pages/DocumentDetail'))
const Interactions = lazy(() => import('@/pages/Interactions'))
const InteractionDetail = lazy(() => import('@/pages/InteractionDetail'))
const Contrats = lazy(() => import('@/pages/Contrats'))
const ContratDetail = lazy(() => import('@/pages/ContratDetail'))
const Contacts = lazy(() => import('@/pages/Contacts'))
const ContactDetail = lazy(() => import('@/pages/ContactDetail'))
const Taches = lazy(() => import('@/pages/Taches'))
const ActionDetail = lazy(() => import('@/pages/ActionDetail'))
const Parametres = lazy(() => import('@/pages/Parametres'))
const Administration = lazy(() => import('@/pages/Administration'))
const MonProfil = lazy(() => import('@/pages/MonProfil'))
const Support = lazy(() => import('@/pages/Support'))
const Pricing = lazy(() => import('@/pages/Pricing'))

function App() {
  return (
    <>
      <SandboxBanner />
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
          <Route path="/sites" element={<Sites />} />
          <Route path="/sites/:id" element={<SiteDetail />} />
          <Route path="/prospection" element={<Prospection />} />
          <Route path="/opportunites" element={<Opportunites />} />
          <Route path="/opportunites/:id" element={<OpportuniteDetail />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/requetes" element={<Requetes />} />
          <Route path="/suivis-contrats" element={<SuivisContrats />} />
          <Route path="/suivis-contrats/:id" element={<SuiviContratDetail />} />
          <Route path="/remunerations" element={<Remunerations />} />
          <Route path="/signaux" element={<Signaux />} />
          <Route path="/signaux/:id" element={<SignalDetail />} />
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
        </Route>
      </Route>
      </Routes>
      </Suspense>
    </>
  )
}

export default App

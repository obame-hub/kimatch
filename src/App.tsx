import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { SandboxBanner } from '@/components/layout/SandboxBanner'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Sites from '@/pages/Sites'
import SiteDetail from '@/pages/SiteDetail'
import Signaux from '@/pages/Signaux'
import Opportunites from '@/pages/Opportunites'
import OpportuniteDetail from '@/pages/OpportuniteDetail'
import SignalDetail from '@/pages/SignalDetail'
import Recommandations from '@/pages/Recommandations'
import RecommandationDetail from '@/pages/RecommandationDetail'
import Comptes from '@/pages/Comptes'
import CompteCreate from '@/pages/CompteCreate'
import CompteDetail from '@/pages/CompteDetail'
import CompteurDetail from '@/pages/CompteurDetail'
import Mandats from '@/pages/Mandats'
import MandatDetail from '@/pages/MandatDetail'
import Versions from '@/pages/Versions'
import Documents from '@/pages/Documents'
import DocumentDetail from '@/pages/DocumentDetail'
import Interactions from '@/pages/Interactions'
import InteractionDetail from '@/pages/InteractionDetail'
import Contrats from '@/pages/Contrats'
import ContratDetail from '@/pages/ContratDetail'
import Contacts from '@/pages/Contacts'
import ContactDetail from '@/pages/ContactDetail'
import Taches from '@/pages/Taches'
import ActionDetail from '@/pages/ActionDetail'
import Parametres from '@/pages/Parametres'
import Administration from '@/pages/Administration'
import MonProfil from '@/pages/MonProfil'
import Support from '@/pages/Support'

function App() {
  return (
    <>
      <SandboxBanner />
      <Routes>
        <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/sites/:id" element={<SiteDetail />} />
          <Route path="/opportunites" element={<Opportunites />} />
          <Route path="/opportunites/:id" element={<OpportuniteDetail />} />
          <Route path="/signaux" element={<Signaux />} />
          <Route path="/signaux/:id" element={<SignalDetail />} />
          <Route path="/recommandations" element={<Recommandations />} />
          <Route path="/recommandations/:id" element={<RecommandationDetail />} />
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
    </>
  )
}

export default App

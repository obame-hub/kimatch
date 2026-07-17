import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Sites from '@/pages/Sites'
import SiteDetail from '@/pages/SiteDetail'
import Signaux from '@/pages/Signaux'
import Recommandations from '@/pages/Recommandations'
import RecommandationDetail from '@/pages/RecommandationDetail'
import Comptes from '@/pages/Comptes'
import CompteDetail from '@/pages/CompteDetail'
import Compteurs from '@/pages/Compteurs'
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

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/sites/:id" element={<SiteDetail />} />
          <Route path="/signaux" element={<Signaux />} />
          <Route path="/recommandations" element={<Recommandations />} />
          <Route path="/recommandations/:id" element={<RecommandationDetail />} />
          <Route path="/comptes" element={<Comptes />} />
          <Route path="/comptes/:id" element={<CompteDetail />} />
          <Route path="/compteurs" element={<Compteurs />} />
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
        </Route>
      </Route>
    </Routes>
  )
}

export default App

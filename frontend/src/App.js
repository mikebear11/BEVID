import { useEffect } from "react";
import "@/design-system/tokens.css";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Products from "@/pages/Products";
import Orders from "@/pages/Orders";
import Tours from "@/pages/Tours";
import Reports from "@/pages/Reports";
import Agents from "@/pages/Agents";
import VisitReport from "@/pages/VisitReport";
import Planning from "@/pages/Planning";
import MonthlyReview from "@/pages/MonthlyReview";
import Pipeline from "@/pages/Pipeline";
import Deals from "@/pages/Deals";
import Connectors from "@/pages/Connectors";
import SettingsPage from "@/pages/Settings";
import SmartGoals from "@/pages/SmartGoals";
import Tournee from "@/pages/Tournee";
import Etablissement360 from "@/pages/Etablissement360";
import PublicSignature from "@/pages/PublicSignature";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import ChangePassword from "@/pages/ChangePassword";
import AdminUsers from "@/pages/AdminUsers";
import Paiements from "@/pages/Paiements";
import Confidentialite from "@/pages/Confidentialite";
import Couts from "@/pages/Couts";
import MobileOrder from "@/pages/MobileOrder";
import Stock from "@/pages/Stock";
import Containers from "@/pages/Containers";
import ContainerDetail from "@/pages/ContainerDetail";
import ScanContainer from "@/pages/ScanContainer";
import DRM from "@/pages/DRM";
import QRLabels from "@/pages/QRLabels";
import Rapprochement from "@/pages/Rapprochement";
import SourcesDonnees from "@/pages/SourcesDonnees";
import Prospection from "@/pages/Prospection";
import Radar from "@/pages/Radar";
import Veille from "@/pages/Veille";
import Bouclier from "@/pages/Bouclier";
import AdminPermissions from "@/pages/AdminPermissions";
import DesignSystem from "@/pages/DesignSystem";
import Enrichissement from "@/pages/Enrichissement";
import EstablishmentNew from "@/pages/EstablishmentNew";
import { PermProvider } from "@/contexts/PermContext";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-stone-500">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App font-body">
      <ThemeProvider>
        <I18nProvider>
        <AuthProvider>
          <PermProvider>
            <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
              <Route path="/sign/:token" element={<PublicSignature />} />
              <Route path="/change-password" element={<Protected><ChangePassword /></Protected>} />
              <Route path="/admin/users" element={<Protected><AdminUsers /></Protected>} />
              <Route path="/admin/couts" element={<Protected><Couts /></Protected>} />
              <Route path="/paiements" element={<Protected><Paiements /></Protected>} />
              <Route path="/confidentialite" element={<Protected><Confidentialite /></Protected>} />
              <Route path="/" element={<Protected><Dashboard /></Protected>} />
              <Route path="/clients" element={<Protected><Clients /></Protected>} />
              <Route path="/clients/:id" element={<Protected><ClientDetail /></Protected>} />
              <Route path="/products" element={<Protected><Products /></Protected>} />
              <Route path="/orders" element={<Protected><Orders /></Protected>} />
              <Route path="/tours" element={<Protected><Tours /></Protected>} />
              <Route path="/reports" element={<Protected><Reports /></Protected>} />
              <Route path="/agents" element={<Protected><Agents /></Protected>} />
              <Route path="/visit" element={<Protected><VisitReport /></Protected>} />
              <Route path="/planning" element={<Protected><Planning /></Protected>} />
              <Route path="/monthly-review" element={<Protected><MonthlyReview /></Protected>} />
              <Route path="/pipeline" element={<Protected><Pipeline /></Protected>} />
              <Route path="/deals" element={<Protected><Deals /></Protected>} />
              <Route path="/connectors" element={<Protected><Connectors /></Protected>} />
              <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
              <Route path="/smart-goals" element={<Protected><SmartGoals /></Protected>} />
              <Route path="/tournee" element={<Protected><Tournee /></Protected>} />
              <Route path="/etab/:id" element={<Protected><Etablissement360 /></Protected>} />
              <Route path="/etab/new" element={<Protected><EstablishmentNew /></Protected>} />
              <Route path="/etab/:id/enrichissement" element={<Protected><Enrichissement /></Protected>} />
              <Route path="/etab/:id/commande" element={<Protected><MobileOrder /></Protected>} />
              <Route path="/stock" element={<Protected><Stock /></Protected>} />
              <Route path="/containers" element={<Protected><Containers /></Protected>} />
              <Route path="/containers/:id" element={<Protected><ContainerDetail /></Protected>} />
              <Route path="/scan" element={<Protected><ScanContainer /></Protected>} />
              <Route path="/containers/labels" element={<Protected><QRLabels /></Protected>} />
              <Route path="/drm" element={<Protected><DRM /></Protected>} />
              <Route path="/rapprochement" element={<Protected><Rapprochement /></Protected>} />
              <Route path="/sources-donnees" element={<Protected><SourcesDonnees /></Protected>} />
              <Route path="/prospection" element={<Protected><Prospection /></Protected>} />
              <Route path="/radar" element={<Protected><Radar /></Protected>} />
              <Route path="/veille" element={<Protected><Veille /></Protected>} />
              <Route path="/bouclier" element={<Protected><Bouclier /></Protected>} />
              <Route path="/admin/permissions" element={<Protected><AdminPermissions /></Protected>} />
              <Route path="/design-system" element={<Protected><DesignSystem /></Protected>} />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" />
          </PermProvider>
        </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </div>
  );
}

export default App;

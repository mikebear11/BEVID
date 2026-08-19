import React, { Suspense, lazy } from "react";
import "@/design-system/tokens.css";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { Toaster } from "@/components/ui/sonner";
import { PermProvider } from "@/contexts/PermContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import UpdateBanner from "@/components/UpdateBanner";
import PostHogConsent from "@/components/PostHogConsent";
import Layout from "@/components/Layout";

// Publiques : chargées immédiatement (petites, indispensables au démarrage)
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Pricing from "@/pages/Pricing";

// Toutes les autres pages : chargées à la demande via React.lazy pour réduire
// significativement la taille du bundle initial.
const Register = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const PublicSignature = lazy(() => import("@/pages/PublicSignature"));
const ChangePassword = lazy(() => import("@/pages/ChangePassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const Products = lazy(() => import("@/pages/Products"));
const Orders = lazy(() => import("@/pages/Orders"));
const Tours = lazy(() => import("@/pages/Tours"));
const Reports = lazy(() => import("@/pages/Reports"));
const Agents = lazy(() => import("@/pages/Agents"));
const VisitReport = lazy(() => import("@/pages/VisitReport"));
const Planning = lazy(() => import("@/pages/Planning"));
const MonthlyReview = lazy(() => import("@/pages/MonthlyReview"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Deals = lazy(() => import("@/pages/Deals"));
const Connectors = lazy(() => import("@/pages/Connectors"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const SmartGoals = lazy(() => import("@/pages/SmartGoals"));
const Tournee = lazy(() => import("@/pages/Tournee"));
const Etablissement360 = lazy(() => import("@/pages/Etablissement360"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const Paiements = lazy(() => import("@/pages/Paiements"));
const Confidentialite = lazy(() => import("@/pages/Confidentialite"));
const Couts = lazy(() => import("@/pages/Couts"));
const MobileOrder = lazy(() => import("@/pages/MobileOrder"));
const Stock = lazy(() => import("@/pages/Stock"));
const Containers = lazy(() => import("@/pages/Containers"));
const ContainerDetail = lazy(() => import("@/pages/ContainerDetail"));
const ScanContainer = lazy(() => import("@/pages/ScanContainer"));
const DRM = lazy(() => import("@/pages/DRM"));
const QRLabels = lazy(() => import("@/pages/QRLabels"));
const Rapprochement = lazy(() => import("@/pages/Rapprochement"));
const SourcesDonnees = lazy(() => import("@/pages/SourcesDonnees"));
const Prospection = lazy(() => import("@/pages/Prospection"));
const Radar = lazy(() => import("@/pages/Radar"));
const Veille = lazy(() => import("@/pages/Veille"));
const Bouclier = lazy(() => import("@/pages/Bouclier"));
const AdminPermissions = lazy(() => import("@/pages/AdminPermissions"));
const DesignSystem = lazy(() => import("@/pages/DesignSystem"));
const Profile = lazy(() => import("@/pages/Profile"));
const OrgSettings = lazy(() => import("@/pages/OrgSettings"));
const Billing = lazy(() => import("@/pages/Billing"));
const Team = lazy(() => import("@/pages/Team"));
const Activate = lazy(() => import("@/pages/Activate"));
const Enrichissement = lazy(() => import("@/pages/Enrichissement"));
const EstablishmentNew = lazy(() => import("@/pages/EstablishmentNew"));

function LazyFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center text-stone-500" role="status" aria-live="polite">
      Chargement…
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LazyFallback />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App font-body">
      <ErrorBoundary>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <PermProvider>
                <ConfirmProvider>
                  <BrowserRouter>
                    <Suspense fallback={<LazyFallback />}>
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password/:token" element={<ResetPassword />} />
                        <Route path="/sign/:token" element={<PublicSignature />} />
                        <Route path="/pricing" element={<Pricing />} />
                        <Route path="/tarifs" element={<Pricing />} />
                        <Route path="/plans" element={<Pricing />} />
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
                        <Route path="/profile" element={<Protected><Profile /></Protected>} />
                        <Route path="/org/settings" element={<Protected><OrgSettings /></Protected>} />
                        <Route path="/billing" element={<Protected><Billing /></Protected>} />
                        <Route path="/team" element={<Protected><Team /></Protected>} />
                        <Route path="/activate/:token" element={<Activate />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </BrowserRouter>
                  <Toaster position="top-right" />
                  <UpdateBanner />
                  <PostHogConsent />
                </ConfirmProvider>
              </PermProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </div>
  );
}

export default App;

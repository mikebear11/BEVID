import React, { Suspense, lazy } from "react";
// Polices auto-hébergées via @fontsource — plus aucune requête vers fonts.googleapis.com
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/800.css";
import "@fontsource/outfit/300.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
// Leaflet CSS depuis le paquet npm — plus aucune requête vers unpkg.com
import "leaflet/dist/leaflet.css";
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
import PwaInstallBanner from "@/components/PwaInstallBanner";
import OfflineReadyBanner from "@/components/OfflineReadyBanner";
import Layout from "@/components/Layout";

// Publiques : chargées immédiatement (petites, indispensables au démarrage)
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Pricing from "@/pages/Pricing";
import PublicDRMCalculator from "@/pages/PublicDRMCalculator";

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
const VisitReport = lazy(() => import("@/pages/VisitReport"));
const Deals = lazy(() => import("@/pages/Deals"));
const Connectors = lazy(() => import("@/pages/Connectors"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const Tournee = lazy(() => import("@/pages/Tournee"));
const Livreur = lazy(() => import("@/pages/Livreur"));
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
const Prospection = lazy(() => import("@/pages/Prospection"));
const AdminPermissions = lazy(() => import("@/pages/AdminPermissions"));
const DesignSystem = lazy(() => import("@/pages/DesignSystem"));
const Profile = lazy(() => import("@/pages/Profile"));
const OrgSettings = lazy(() => import("@/pages/OrgSettings"));
const Billing = lazy(() => import("@/pages/Billing"));
const Team = lazy(() => import("@/pages/Team"));
const Activate = lazy(() => import("@/pages/Activate"));
const Enrichissement = lazy(() => import("@/pages/Enrichissement"));
const EstablishmentNew = lazy(() => import("@/pages/EstablishmentNew"));
const Documents = lazy(() => import("@/pages/Documents"));
const LegalPack = lazy(() => import("@/pages/LegalPack"));
const Companies = lazy(() => import("@/pages/Companies"));
const CompanyDetail = lazy(() => import("@/pages/CompanyDetail"));
const ImportIntelligent = lazy(() => import("@/pages/ImportIntelligent"));
const Portefeuilles = lazy(() => import("@/pages/Portefeuilles"));
const Approvals = lazy(() => import("@/pages/Approvals"));
const PwaDiagnostics = lazy(() => import("@/pages/PwaDiagnostics"));
const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("@/pages/PaymentCancel"));
const PublicPay = lazy(() => import("@/pages/PublicPay"));
const LegalMentions = lazy(() => import("@/pages/LegalMentions"));
const LegalCGV = lazy(() => import("@/pages/LegalCGV"));
const LegalCGU = lazy(() => import("@/pages/LegalCGU"));
const LegalCookies = lazy(() => import("@/pages/LegalCookies"));
const LegalPrivacy = lazy(() => import("@/pages/LegalPrivacy"));

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
                        <Route path="/calculateur-drm" element={<PublicDRMCalculator />} />
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
                        <Route path="/visit" element={<Protected><VisitReport /></Protected>} />
                        <Route path="/deals" element={<Protected><Deals /></Protected>} />
                        <Route path="/connectors" element={<Protected><Connectors /></Protected>} />
                        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
                        <Route path="/tournee" element={<Protected><Tournee /></Protected>} />
                        <Route path="/livreur" element={<Protected><Livreur /></Protected>} />
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
                        <Route path="/prospection" element={<Protected><Prospection /></Protected>} />
                        <Route path="/admin/permissions" element={<Protected><AdminPermissions /></Protected>} />
                        <Route path="/design-system" element={<Protected><DesignSystem /></Protected>} />
                        <Route path="/profile" element={<Protected><Profile /></Protected>} />
                        <Route path="/org/settings" element={<Protected><OrgSettings /></Protected>} />
                        <Route path="/billing" element={<Protected><Billing /></Protected>} />
                        <Route path="/team" element={<Protected><Team /></Protected>} />
                        <Route path="/documents" element={<Protected><Documents /></Protected>} />
                        <Route path="/pack-legal" element={<Protected><LegalPack /></Protected>} />
                        <Route path="/companies" element={<Protected><Companies /></Protected>} />
                        <Route path="/companies/:id" element={<Protected><CompanyDetail /></Protected>} />
                        <Route path="/import" element={<Protected><ImportIntelligent /></Protected>} />
                        <Route path="/portefeuilles" element={<Protected><Portefeuilles /></Protected>} />
                        <Route path="/approvals" element={<Protected><Approvals /></Protected>} />
                        <Route path="/pwa-status" element={<Protected><PwaDiagnostics /></Protected>} />
                        <Route path="/payment/success" element={<PaymentSuccess />} />
                        <Route path="/payment/cancel" element={<PaymentCancel />} />
                        <Route path="/pay/:token" element={<PublicPay />} />
                        <Route path="/activate/:token" element={<Activate />} />
                        <Route path="/legal/mentions-legales" element={<LegalMentions />} />
                        <Route path="/legal/cgv" element={<LegalCGV />} />
                        <Route path="/legal/cgu" element={<LegalCGU />} />
                        <Route path="/legal/cookies" element={<LegalCookies />} />
                        <Route path="/legal/politique-confidentialite" element={<LegalPrivacy />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </BrowserRouter>
                  <Toaster position="top-right" />
                  <UpdateBanner />
                  <PostHogConsent />
                  <PwaInstallBanner />
                  <OfflineReadyBanner />
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

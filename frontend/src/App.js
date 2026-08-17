import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { I18nProvider } from "@/contexts/I18nContext";
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

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-stone-500">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App font-body">
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<Protected><Dashboard /></Protected>} />
              <Route path="/clients" element={<Protected><Clients /></Protected>} />
              <Route path="/clients/:id" element={<Protected><ClientDetail /></Protected>} />
              <Route path="/products" element={<Protected><Products /></Protected>} />
              <Route path="/orders" element={<Protected><Orders /></Protected>} />
              <Route path="/tours" element={<Protected><Tours /></Protected>} />
              <Route path="/reports" element={<Protected><Reports /></Protected>} />
              <Route path="/agents" element={<Protected><Agents /></Protected>} />
              <Route path="/visit" element={<Protected><VisitReport /></Protected>} />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" />
        </AuthProvider>
      </I18nProvider>
    </div>
  );
}

export default App;

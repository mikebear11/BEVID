import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Home, LogIn } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";

export default function NotFound() {
  const { user } = useAuth();
  const target = user ? "/" : "/login";
  const label = user ? "Retour au tableau de bord" : "Retour à la connexion";
  const Icon = user ? Home : LogIn;
  return (
    <div style={{ minHeight: "100vh", background: "var(--ds-bg-app)", color: "var(--ds-text-primary)", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--ds-space-6)" }}
         data-testid="not-found-page">
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--ds-space-6)", color: "var(--ds-accent)" }}>
          <BevidLogo size={40} />
        </div>
        <p className="overline" style={{ color: "var(--ds-text-muted)" }}>Erreur 404</p>
        <h1 className="font-display" style={{ fontSize: "var(--ds-font-size-3xl)", margin: "8px 0 12px", color: "var(--ds-text-primary)" }}>
          Page introuvable.
        </h1>
        <p style={{ color: "var(--ds-text-secondary)", marginBottom: "var(--ds-space-6)" }}>
          Cette adresse ne correspond à aucune page connue. Elle a peut-être été supprimée ou l'URL saisie est incorrecte.
        </p>
        <Link to={target}
              data-testid="not-found-cta"
              className="ds-focus"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", background: "var(--ds-accent)", color: "var(--ds-accent-fg)", borderRadius: "var(--ds-radius-md)", fontFamily: "var(--ds-font-sans)", fontWeight: 600, textDecoration: "none", minHeight: 48 }}>
          <Icon size={18} /> {label}
        </Link>
      </div>
    </div>
  );
}

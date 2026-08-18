/**
 * ErrorBoundary React global.
 *
 * Capture les erreurs de rendu non-attrapées, affiche un écran de secours
 * humain, envoie un rapport tronqué et anonymisé à /api/errors (ou Sentry si
 * SENTRY_DSN est configuré côté serveur). Pas de dépendance externe requise.
 */
import React from "react";

const API_ROOT = (process.env.REACT_APP_BACKEND_URL || "") + "/api";

function scrubClient(text = "") {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/eyJ[A-Za-z0-9_\-\.]+/g, "[token]")
    .replace(/Bearer\s+\S+/g, "Bearer [token]")
    .slice(0, 4000);
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, message: String(err?.message || err) };
  }
  componentDidCatch(err, info) {
    try {
      fetch(`${API_ROOT}/errors`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: scrubClient(err?.message || String(err)),
          stack: scrubClient((err?.stack || "") + "\n" + (info?.componentStack || "")),
          url: window.location.pathname,
          user_agent: (navigator.userAgent || "").slice(0, 200),
        }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* silence */ }
  }
  handleReload = () => { window.location.reload(); };
  handleHome = () => { window.location.href = "/"; };
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        data-testid="error-boundary"
        style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, background: "var(--ds-bg-app, #f7f6f3)",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <p style={{
            fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "var(--ds-text-muted, #8a8880)",
          }}>Erreur inattendue</p>
          <h1 style={{ fontSize: 32, margin: "8px 0 12px", color: "var(--ds-text-primary, #121210)" }}>
            L'application a rencontré un problème
          </h1>
          <p style={{ color: "var(--ds-text-secondary, #56544d)", marginBottom: 24, fontSize: 14 }}>
            Aucune donnée saisie hors-ligne n'est perdue. Rechargez la page pour reprendre.
            L'équipe technique reçoit automatiquement un rapport anonymisé.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={this.handleReload}
              data-testid="error-reload-btn"
              style={{
                background: "var(--ds-accent, #4A154B)", color: "#fff",
                border: "none", borderRadius: 10, padding: "10px 18px",
                minHeight: 44, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >Recharger l'application</button>
            <button
              onClick={this.handleHome}
              data-testid="error-home-btn"
              style={{
                background: "transparent", color: "var(--ds-text-primary, #121210)",
                border: "1px solid var(--ds-border, #e3e1da)", borderRadius: 10,
                padding: "10px 18px", minHeight: 44, fontSize: 14, cursor: "pointer",
              }}
            >Retour à l'accueil</button>
          </div>
        </div>
      </div>
    );
  }
}

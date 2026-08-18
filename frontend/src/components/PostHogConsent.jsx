/**
 * Bandeau de consentement PostHog (RGPD).
 *
 * Règles :
 *  - Opt-in strict : aucun tracking tant que consent !== "granted".
 *  - Choix révocable depuis /confidentialite.
 *  - Sur les pages authentifiées, l'enregistrement de session est TOUJOURS
 *    désactivé, même après consentement (voir posthog.init).
 *  - Bouton "Accepter" et bouton "Refuser" ont la même prominence.
 */
import React, { useEffect, useState } from "react";

const KEY = "bevid_analytics_consent";
const POSTHOG_TOKEN = "phc_DbsPb39SRc8z3EiQ6Dhj6ikv4H4rTKcht9d4sZSesceP";
const POSTHOG_HOST = "https://ap.emergent.sh";

function initPostHog(pathIsAuthenticated) {
  if (typeof window === "undefined" || !window.posthog || !window.posthog.init) return;
  if (window.__posthogInitialised) return;
  window.__posthogInitialised = true;
  try {
    window.posthog.init(POSTHOG_TOKEN, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      // Écrans authentifiés → données personnelles → jamais de replay
      disable_session_recording: true,
      // Ne capture pas automatiquement les clics : on émet nos propres events
      autocapture: false,
      capture_pageview: !pathIsAuthenticated,
      loaded: (ph) => {
        try {
          ph.stopSessionRecording && ph.stopSessionRecording();
          ph.opt_in_capturing && ph.opt_in_capturing();
        } catch { /* silence */ }
      },
    });
  } catch { /* silence */ }
}

export function analyticsConsentStatus() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function revokeAnalytics() {
  try {
    localStorage.setItem(KEY, "denied");
    if (window.posthog) {
      window.posthog.opt_out_capturing && window.posthog.opt_out_capturing();
      window.posthog.reset && window.posthog.reset();
    }
    // Purge cookies PostHog
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0].trim();
      if (name.startsWith("ph_") || name.startsWith("posthog")) {
        document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
    });
  } catch { /* silence */ }
}

export function grantAnalytics() {
  try {
    localStorage.setItem(KEY, "granted");
    const authed = !["/login", "/register", "/forgot-password"].includes(window.location.pathname)
      && !window.location.pathname.startsWith("/reset-password")
      && !window.location.pathname.startsWith("/sign/");
    initPostHog(authed);
  } catch { /* silence */ }
}

export default function PostHogConsent() {
  const [status, setStatus] = useState(() => analyticsConsentStatus());

  useEffect(() => {
    if (status === "granted") {
      const authed = !["/login", "/register", "/forgot-password"].includes(window.location.pathname);
      initPostHog(authed);
    }
  }, [status]);

  if (status === "granted" || status === "denied") return null;

  const decide = (choice) => {
    if (choice === "granted") grantAnalytics();
    else revokeAnalytics();
    setStatus(choice);
  };

  return (
    <div
      role="region"
      aria-label="Consentement statistiques"
      data-testid="posthog-consent-banner"
      style={{
        position: "fixed", left: 16, right: 16, bottom: 16,
        // z-index > onboarding tour Radix Dialog (z-50) pour être atteignable au 1er login
        zIndex: 200, maxWidth: 640, margin: "0 auto",
        background: "var(--ds-bg-elevated, #fff)",
        color: "var(--ds-text-primary, #121210)",
        border: "1px solid var(--ds-border, #e3e1da)", borderRadius: 12,
        boxShadow: "0 20px 40px rgba(0,0,0,.15)",
        padding: 16, fontSize: 14,
      }}
    >
      <p style={{ margin: 0, marginBottom: 10, fontWeight: 600 }}>Statistiques d'usage anonymisées ?</p>
      <p style={{ margin: 0, marginBottom: 14, color: "var(--ds-text-secondary, #56544d)" }}>
        Nous ne partageons pas vos données clients. Aucun enregistrement de session n'est fait
        sur les pages authentifiées, même après acceptation. Modifiable depuis <a
        href="/confidentialite" style={{ color: "var(--ds-accent, #4A154B)", textDecoration: "underline" }}>Confidentialité</a>.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => decide("granted")}
          data-testid="consent-accept"
          style={{
            flex: 1, minHeight: 44, minWidth: 120,
            background: "var(--ds-accent, #4A154B)", color: "#fff",
            border: "none", borderRadius: 8, padding: "10px 14px",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >Accepter</button>
        <button
          onClick={() => decide("denied")}
          data-testid="consent-deny"
          style={{
            flex: 1, minHeight: 44, minWidth: 120,
            background: "var(--ds-bg-surface-alt, #f0eee8)", color: "var(--ds-text-primary, #121210)",
            border: "1px solid var(--ds-border, #e3e1da)", borderRadius: 8, padding: "10px 14px",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >Refuser</button>
      </div>
    </div>
  );
}

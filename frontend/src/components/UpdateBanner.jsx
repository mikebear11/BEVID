import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Bandeau non-intrusif « Nouvelle version disponible ».
 * S'affiche uniquement quand un Service Worker est en état `installed && waiting`
 * pendant qu'un autre SW contrôle encore la page. Clique = SKIP_WAITING + reload
 * sur `controllerchange`. L'utilisateur peut choisir de terminer sa saisie avant.
 */
export default function UpdateBanner() {
  const [waiting, setWaiting] = useState(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const trackRegistration = (reg) => {
      if (!reg) return;
      // Déjà en attente au démarrage
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaiting(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller && !cancelled) {
            setWaiting(installing);
          }
        });
      });
    };

    navigator.serviceWorker.getRegistration().then(trackRegistration).catch(() => {});
    // Recharge la page une fois que le nouveau SW prend le contrôle
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  const reload = () => {
    try { waiting.postMessage({ type: "SKIP_WAITING" }); } catch {}
  };

  return (
    <div
      role="status"
      data-testid="sw-update-banner"
      style={{
        position: "fixed", left: "50%", bottom: 88, transform: "translateX(-50%)",
        zIndex: 60, display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px", borderRadius: 12,
        background: "var(--ds-surface-elevated, #fff)",
        color: "var(--ds-text-primary, #111)",
        border: "1px solid var(--ds-border, rgba(0,0,0,.1))",
        boxShadow: "0 10px 30px rgba(0,0,0,.15)",
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      <RefreshCw size={16} aria-hidden="true" />
      <span style={{ fontSize: 14 }}>Nouvelle version disponible.</span>
      <button
        onClick={reload}
        data-testid="sw-update-reload"
        style={{
          background: "var(--ds-accent, #4A154B)", color: "#fff",
          border: "none", borderRadius: 8, padding: "6px 12px",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
          minHeight: 36,
        }}
      >
        Recharger
      </button>
    </div>
  );
}

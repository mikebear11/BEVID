import React from "react";
import { WifiOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/** Bandeau visible tant que l'app tourne en mode hors-ligne. */
export default function OfflineBanner() {
  const { offlineMode, snapshotAt } = useAuth();
  if (!offlineMode) return null;
  const fmt = snapshotAt
    ? new Date(snapshotAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "dernier chargement";
  return (
    <div
      data-testid="offline-banner"
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 16px",
        background: "var(--ds-state-warning-soft-bg)",
        color: "var(--ds-state-warning-soft-fg)",
        borderBottom: "1px solid var(--ds-state-warning)",
        fontSize: "var(--ds-font-size-sm)",
      }}
    >
      <WifiOff size={16} style={{ color: "var(--ds-state-warning)" }} aria-hidden="true" />
      <span>
        <strong>Mode hors-ligne</strong> — données du {fmt}. Vos saisies sont conservées et partiront au retour du réseau.
      </span>
    </div>
  );
}

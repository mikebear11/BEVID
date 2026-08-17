import React, { useEffect, useState } from "react";
import { Wifi, WifiOff, CloudCheck } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

/**
 * Indicateur permanent d'état de connexion / synchro.
 * Prêt à recevoir la file de synchro Dexie/Workbox (badge nb pending).
 * Se lit dans <Layout>.
 */
export default function SyncIndicator() {
  const { t } = useI18n();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Interface future avec le sync queue Dexie (window.__SYNC__.pending)
    const iv = setInterval(() => {
      try {
        const n = window.__SYNC_PENDING__ || 0;
        setPending(n);
      } catch (e) {}
    }, 1500);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(iv);
    };
  }, []);

  const state = !online ? "offline" : pending > 0 ? "syncing" : "synced";
  const color = state === "offline" ? "bg-red-100 text-red-700" : state === "syncing" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
  const Icon = state === "offline" ? WifiOff : state === "syncing" ? Wifi : CloudCheck;
  const label = state === "offline" ? t("offline") : state === "syncing" ? `${t("syncing")} (${pending})` : t("synced");

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`} data-testid="sync-indicator" aria-label={label}>
      <Icon size={12} strokeWidth={2} />
      <span>{label}</span>
    </div>
  );
}

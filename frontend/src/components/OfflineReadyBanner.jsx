import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { WifiOff, X } from "lucide-react";
import {
  enableFullOfflineMode,
  shouldPromptOfflineReady,
  dismissOfflineReady,
} from "@/lib/pwa";

/**
 * Bandeau discret « Activer le mode hors-ligne complet ».
 *
 * Cible : iOS Safari, où `navigator.storage.persist()` échoue silencieusement
 * tant que la permission notification n'est pas accordée. Résultat sans ce flux :
 * la base IndexedDB reste purgeable après quelques jours d'inactivité et la
 * promesse hors-ligne est cassée à sa racine.
 *
 * Comportement :
 * - Apparait une fois, refusable définitivement (`bevid_offline_ready_dismissed`).
 * - Ne s'affiche PAS si le storage est déjà persistant, si l'utilisateur a
 *   déjà refusé, ou si on n'est pas sur iOS.
 * - Le clic déclenche la chaîne notif → push → persist dans un seul geste.
 */
export default function OfflineReadyBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    shouldPromptOfflineReady()
      .then((should) => { if (!cancelled && should) setVisible(true); })
      .catch(() => { /* silencieux */ });
    return () => { cancelled = true; };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const r = await enableFullOfflineMode();
      if (r.ready) {
        toast.success("Mode hors-ligne activé", {
          description: "Vos données sont désormais conservées même après plusieurs jours sans réseau.",
        });
        setVisible(false);
      } else if (r.reasons.notification === "denied") {
        toast.error("Notifications refusées — le mode hors-ligne complet n'est pas activable sur cet appareil.", {
          description: "Vous pouvez réessayer depuis Réglages → Notifications de votre iPhone.",
        });
        dismissOfflineReady();
        setVisible(false);
      } else {
        toast.warning("Activation partielle", {
          description: "Notif accordée mais le stockage n'a pas été rendu persistant. Réessayez après avoir installé l'app.",
        });
      }
    } catch (e) {
      toast.error("Impossible d'activer le mode hors-ligne", { description: e?.message || "" });
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => { dismissOfflineReady(); setVisible(false); };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Activer le mode hors-ligne complet"
      data-testid="offline-ready-banner"
      className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-40 card-crm p-4 shadow-lg border-l-4 border-[#B076B4]"
    >
      <div className="flex items-start gap-3">
        <WifiOff size={20} className="text-[#4A154B] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Activer le mode hors-ligne complet</p>
          <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
            Sur iPhone, vos données restent conservées <b>même après plusieurs jours sans réseau</b>
            &nbsp;si vous autorisez les notifications discrètes. Aucun spam, une seule question.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={enable}
              disabled={busy}
              className="btn-primary text-sm min-h-[44px] px-4 disabled:opacity-60"
              data-testid="offline-ready-enable-btn"
            >
              {busy ? "Activation…" : "Activer maintenant"}
            </button>
            <button
              onClick={dismiss}
              disabled={busy}
              className="btn-ghost text-sm min-h-[44px] px-3"
              data-testid="offline-ready-dismiss-btn"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Fermer"
          className="text-stone-400 hover:text-stone-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
          data-testid="offline-ready-close-btn"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

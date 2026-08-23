import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, X, Info } from "lucide-react";
import {
  installAvailable, installDismissed, dismissInstall, triggerInstall,
  isStandalone, isIOS,
} from "@/lib/pwa";

/**
 * Bandeau d'invitation à l'installation — s'affiche une seule fois,
 * refusable définitivement (sauf reset localStorage).
 * - Android/Chrome/Edge : bouton Installer natif via beforeinstallprompt
 * - iOS Safari : instructions manuelles (Partager → Sur l'écran d'accueil)
 */
export default function PwaInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || installDismissed()) return;
    const check = () => {
      if (installAvailable()) {
        setVisible(true);
        setIos(isIOS());
      }
    };
    check();
    window.addEventListener("bevid:install-available", check);
    // iOS n'émet pas d'event, on force le check
    if (isIOS() && !isStandalone()) { setVisible(true); setIos(true); }
    return () => window.removeEventListener("bevid:install-available", check);
  }, []);

  const install = async () => {
    const r = await triggerInstall();
    if (r.ok) {
      toast.success("Application installée");
      setVisible(false);
    } else if (r.reason === "no_prompt") {
      toast.info("Installation manuelle nécessaire — voir instructions");
    }
  };

  const dismiss = () => { dismissInstall(); setVisible(false); };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Invitation à l'installation"
      data-testid="pwa-install-banner"
      className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-40 card-crm p-4 shadow-lg border-l-4 border-[#4A154B]"
    >
      <div className="flex items-start gap-3">
        <Download size={20} className="text-[#4A154B] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Installer BEVID sur votre appareil</p>
          {ios ? (
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
              Sur iPhone : bouton <b>Partager</b> ↑, puis <b>« Sur l'écran d'accueil »</b>.
              Vos données seront conservées même sans réseau.
            </p>
          ) : (
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
              Gagnez du temps : accès en 1 geste, démarrage hors-ligne, notifications discrètes.
            </p>
          )}
          <div className="flex gap-2 mt-3">
            {!ios && (
              <button onClick={install}
                className="btn-primary text-sm min-h-[36px] px-3" data-testid="pwa-install-btn">
                Installer
              </button>
            )}
            <button onClick={dismiss}
              className="btn-ghost text-sm min-h-[36px] px-3" data-testid="pwa-install-dismiss">
              Plus tard
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Fermer" className="text-stone-400 hover:text-stone-600 min-h-[32px] min-w-[32px] flex items-center justify-center">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

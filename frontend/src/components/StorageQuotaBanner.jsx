import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldOff, ChevronRight } from "lucide-react";
import { pwaDiagnostics } from "@/lib/pwa";

/**
 * Bandeau discret et permanent affiché quand le stockage persistant n'est pas
 * accordé. Objectif : un manager peut voir en un coup d'œil quels commerciaux
 * sont en mode dégradé (leurs données peuvent être effacées après quelques
 * jours d'inactivité sur iOS).
 *
 * Non intrusif : ne bloque rien, un simple lien vers /pwa-status.
 * Auto-caché si l'app est déjà installée ET persistante.
 */
export default function StorageQuotaBanner() {
  const [diag, setDiag] = useState(null);

  useEffect(() => {
    let mounted = true;
    pwaDiagnostics().then(d => { if (mounted) setDiag(d); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  if (!diag) return null;
  // Si tout va bien, on n'affiche rien
  if (diag.persistent_storage) return null;

  const reason = !diag.installed
    ? "Application non installée — utilisée dans un onglet Safari, purge possible après 7 jours d'inactivité."
    : diag.notification_permission !== "granted"
    ? "Notifications non accordées — iOS refuse le stockage persistant sans elles."
    : "Stockage persistant non accordé — vos données hors-ligne peuvent être effacées après quelques jours d'inactivité.";

  return (
    <Link
      to="/pwa-status"
      role="status"
      aria-live="polite"
      data-testid="storage-quota-banner"
      className="block border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-3 hover:opacity-90 transition-opacity"
    >
      <div className="flex items-start gap-3">
        <ShieldOff size={18} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Mode hors-ligne dégradé</p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">{reason}</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
            Ouvrir le diagnostic <ChevronRight size={11} aria-hidden="true" />
          </p>
        </div>
      </div>
    </Link>
  );
}

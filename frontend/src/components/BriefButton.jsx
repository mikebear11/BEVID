import React, { useState } from "react";
import { api } from "@/lib/api";
import { getOfflineBrief } from "@/lib/db";
import { FileText, X, Loader2, CloudOff } from "lucide-react";

/**
 * Bouton "Préparer" + popover 5 lignes — Lot 7 étape 3.
 * En ligne : lit /api/establishments/{eid}/brief. Hors-ligne : lit depuis IndexedDB
 * (tour_briefs, embarqué au bootstrap).
 */
export default function BriefButton({ establishmentId, testId = "brief-btn" }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  const openPanel = async () => {
    setOpen(true);
    if (brief) return;
    setLoading(true);
    setOffline(false);
    try {
      const { data } = await api.get(`/establishments/${establishmentId}/brief`);
      setBrief(data);
    } catch {
      // Fallback offline via IndexedDB
      const cached = await getOfflineBrief(establishmentId);
      if (cached) {
        setBrief(cached);
        setOffline(true);
      } else {
        setBrief({ lines: [{ text: "Brief indisponible — reconnectez-vous pour le récupérer.", source: null }] });
        setOffline(true);
      }
    } finally { setLoading(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        data-testid={testId}
        className="text-xs px-2 py-1 rounded-full border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-1"
        aria-label="Préparer la visite"
      >
        <FileText size={12} /> Préparer
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setOpen(false)}
          data-testid="brief-modal"
        >
          <div
            className="bg-white dark:bg-stone-900 rounded-t-2xl md:rounded-2xl border border-stone-200 dark:border-stone-700 p-5 max-w-md w-full space-y-3"
            onClick={ev => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl flex items-center gap-2">
                <FileText size={16} className="text-[#4A154B] dark:text-[#B076B4]" />
                {brief?.establishment_name || "Préparation"}
                {offline && <CloudOff size={12} className="text-amber-500" aria-label="mode hors-ligne" />}
              </h3>
              <button onClick={() => setOpen(false)} aria-label="Fermer" className="text-stone-400 hover:text-stone-600">
                <X size={16} />
              </button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm py-4 justify-center">
                <Loader2 size={14} className="animate-spin" /> Chargement…
              </div>
            ) : (
              <ol className="space-y-2 list-decimal list-inside" data-testid="brief-lines">
                {(brief?.lines || []).map((l, i) => (
                  <li key={i} className="text-sm text-stone-700 dark:text-stone-200">
                    {l.text}
                    {l.source && (
                      <span className="text-[10px] text-stone-400 ml-2">
                        {l.source.date && `· ${l.source.date}`}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}

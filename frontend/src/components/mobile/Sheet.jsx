import React, { useEffect } from "react";
import { X } from "lucide-react";

/** Feuille d'actions bas d'écran, pouce-accessible. */
export function Sheet({ open, onClose, title, children, testId = "sheet" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-black/50" data-testid={`${testId}-backdrop`} />
      <div className="relative bg-white dark:bg-stone-900 rounded-t-2xl p-4 pb-safe max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="min-w-[48px] min-h-[48px] flex items-center justify-center text-stone-600" data-testid={`${testId}-close`}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

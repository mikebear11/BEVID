import React, { createContext, useContext, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * ConfirmDialog — remplace window.confirm par un dialogue charté cohérent mobile+desktop.
 * Usage :
 *   const { confirm } = useConfirm();
 *   const ok = await confirm({ title, message, confirmLabel, tone: "danger" });
 *   if (!ok) return;
 */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmLabel, cancelLabel, tone, resolve }

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setState({
        title: opts?.title || "Confirmer",
        message: opts?.message || "",
        confirmLabel: opts?.confirmLabel || "Confirmer",
        cancelLabel: opts?.cancelLabel || "Annuler",
        tone: opts?.tone || "primary", // "primary" | "danger"
        resolve,
      });
    });
  }, []);

  const close = (ok) => {
    if (state) { state.resolve(ok); setState(null); }
  };

  const isDanger = state?.tone === "danger";

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          role="dialog" aria-modal="true" aria-labelledby="confirm-title"
          data-testid="confirm-dialog"
          onKeyDown={(e) => { if (e.key === "Escape") close(false); if (e.key === "Enter") close(true); }}
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", padding: 16 }}
        >
          <div style={{ background: "var(--ds-bg-elevated)", color: "var(--ds-text-primary)", border: "1px solid var(--ds-border-strong)", borderRadius: "var(--ds-radius-lg)", maxWidth: 440, width: "100%", padding: "var(--ds-space-6)", fontFamily: "var(--ds-font-sans)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              {isDanger && <AlertTriangle size={22} style={{ color: "var(--ds-state-danger)", flexShrink: 0, marginTop: 2 }} aria-hidden="true" />}
              <div style={{ flex: 1 }}>
                <h2 id="confirm-title" style={{ margin: 0, fontSize: "var(--ds-font-size-lg)", fontWeight: 700 }}>{state.title}</h2>
                {state.message && <p style={{ marginTop: 6, fontSize: "var(--ds-font-size-sm)", color: "var(--ds-text-secondary)" }}>{state.message}</p>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column-reverse", gap: 8, marginTop: 16 }} className="sm:flex-row sm:justify-end">
              <button
                onClick={() => close(false)}
                data-testid="confirm-cancel"
                autoFocus
                className="ds-focus"
                style={{ padding: "10px 16px", minHeight: 44, borderRadius: "var(--ds-radius-md)", border: "1px solid var(--ds-border-strong)", background: "transparent", color: "var(--ds-text-primary)", fontWeight: 500, cursor: "pointer" }}
              >{state.cancelLabel}</button>
              <button
                onClick={() => close(true)}
                data-testid="confirm-ok"
                className="ds-focus"
                style={{ padding: "10px 16px", minHeight: 44, borderRadius: "var(--ds-radius-md)", border: "none", background: isDanger ? "var(--ds-state-danger)" : "var(--ds-accent)", color: isDanger ? "#fff" : "var(--ds-accent-fg)", fontWeight: 600, cursor: "pointer" }}
              >{state.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm() must be used inside <ConfirmProvider>");
  return ctx;
}

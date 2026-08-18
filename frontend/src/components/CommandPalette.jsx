import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft } from "lucide-react";

/**
 * Palette de commandes globale (Cmd/Ctrl + K).
 * Reçoit une liste [{ to, key, label, section }] déjà filtrée par permissions.
 * Filtrage substring insensible à la casse sur label + section.
 */
export default function CommandPalette({ items }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (isCmdK) { e.preventDefault(); setOpen((o) => !o); setQ(""); setCursor(0); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    if (!q) return items.slice(0, 20);
    const qq = q.toLowerCase();
    return items.filter((i) =>
      i.label.toLowerCase().includes(qq) || i.section.toLowerCase().includes(qq)
    ).slice(0, 20);
  }, [q, items]);

  useEffect(() => { if (cursor >= filtered.length) setCursor(0); }, [cursor, filtered.length]);

  const go = (to) => { setOpen(false); setQ(""); nav(to); };

  const onListKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && filtered[cursor]) { e.preventDefault(); go(filtered[cursor].to); }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Palette de commandes"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,.5)", display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        padding: "8vh 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onListKey}
        data-testid="command-palette"
        style={{
          background: "var(--ds-bg-elevated, #fff)",
          color: "var(--ds-text-primary, #121210)",
          width: "100%", maxWidth: 640, borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,.35)",
          border: "1px solid var(--ds-border, #e3e1da)",
          overflow: "hidden",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px",
          borderBottom: "1px solid var(--ds-border, #e3e1da)",
        }}>
          <Search size={18} aria-hidden="true" style={{ color: "var(--ds-text-muted, #8a8880)" }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            data-testid="command-input"
            placeholder="Aller à une page… (Cmd/Ctrl+K)"
            aria-label="Rechercher une page"
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 16, color: "inherit",
            }}
          />
          <kbd style={{
            fontSize: 11, color: "var(--ds-text-muted, #8a8880)",
            border: "1px solid var(--ds-border, #e3e1da)", padding: "2px 6px",
            borderRadius: 4, fontFamily: "monospace",
          }}>Échap</kbd>
        </div>
        <ul
          role="listbox"
          style={{ listStyle: "none", padding: 6, margin: 0, maxHeight: "50vh", overflowY: "auto" }}
        >
          {filtered.length === 0 && (
            <li style={{ padding: 20, textAlign: "center", color: "var(--ds-text-muted, #8a8880)", fontSize: 14 }}>
              Aucun résultat pour « {q} »
            </li>
          )}
          {filtered.map((item, i) => {
            const active = i === cursor;
            return (
              <li
                key={item.to}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(item.to)}
                data-testid={`palette-item-${item.key}`}
                style={{
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12, fontSize: 14,
                  background: active ? "var(--ds-accent-veil, #eaf1fb)" : "transparent",
                }}
              >
                <span style={{
                  fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em",
                  color: "var(--ds-text-muted, #8a8880)", minWidth: 110,
                }}>{item.section}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {active && <CornerDownLeft size={14} style={{ color: "var(--ds-text-muted, #8a8880)" }} aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

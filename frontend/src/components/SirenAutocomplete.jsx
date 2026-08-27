import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Search, Building2 } from "lucide-react";

/**
 * Autocomplétion SIREN via Recherche-Entreprises (Couche A, gratuit, rate-limité serveur).
 * L'utilisateur tape un nom, choisit un résultat → on retourne le record complet.
 * L'appelant peut ensuite auto-remplir un formulaire et créer l'établissement.
 */
export default function SirenAutocomplete({ onSelect, autoFocus = false, testId = "siren-autocomplete" }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get(`/enrichissement/autocomplete?q=${encodeURIComponent(q)}`);
        setResults(r.data.results || []);
        setOpen(true);
        setHighlight(-1);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const pick = (item) => {
    setQ(item.denomination || "");
    setOpen(false);
    onSelect && onSelect(item);
  };

  const onKey = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && highlight >= 0) { e.preventDefault(); pick(results[highlight]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 14, color: "var(--ds-text-muted)", pointerEvents: "none" }} />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.length >= 3 && setOpen(true)}
          onKeyDown={onKey}
          placeholder="Nom, dénomination ou SIREN (3 caractères min.)"
          data-testid={`${testId}-input`}
          autoComplete="off"
          className="ds-focus"
          style={{
            width: "100%", padding: "10px 12px 10px 36px",
            fontFamily: "var(--ds-font-sans)", fontSize: "var(--ds-font-size-sm)",
            border: "1px solid var(--ds-border-strong)",
            borderRadius: "var(--ds-radius-md)",
            background: "var(--ds-bg-surface)",
            color: "var(--ds-text-primary)",
            minHeight: 44,
          }}
        />
      </div>
      {open && (results.length > 0 || loading) && (
        <ul
          role="listbox"
          data-testid={`${testId}-results`}
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            background: "var(--ds-bg-elevated)",
            border: "1px solid var(--ds-border-strong)",
            borderRadius: "var(--ds-radius-md)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
            maxHeight: 320, overflowY: "auto",
            zIndex: 50, listStyle: "none", padding: 4, margin: 0,
          }}
        >
          {loading && <li style={{ padding: "8px 10px", fontSize: "var(--ds-font-size-sm)", color: "var(--ds-text-muted)" }}>Recherche…</li>}
          {!loading && results.map((r, i) => (
            <li
              key={r.siren}
              role="option"
              aria-selected={highlight === i}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(r)}
              data-testid={`${testId}-item-${r.siren}`}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", cursor: "pointer",
                background: highlight === i ? "var(--ds-accent-veil)" : "transparent",
                borderRadius: "var(--ds-radius-sm)",
              }}
            >
              <Building2 size={16} style={{ color: "var(--ds-accent)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--ds-font-size-sm)", fontWeight: 600, color: "var(--ds-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.denomination || "—"}
                </div>
                <div style={{ fontSize: "var(--ds-font-size-xs)", color: "var(--ds-text-muted)" }}>
                  SIREN {r.siren} · {r.commune || "—"} · NAF {r.naf || "—"}
                </div>
              </div>
              {r.etat === "A" && (
                <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ds-state-success)" }}>Actif</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

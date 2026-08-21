import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2, Sparkles, Check, X, RotateCw } from "lucide-react";
import { toast } from "sonner";

// Libellés d'affichage FR — clés ASCII côté DB pour éviter les surprises Mongo.
export const OBJECTION_CATEGORIES = [
  { key: "prix",                label: "Prix" },
  { key: "marge",               label: "Marge" },
  { key: "place_en_cave",       label: "Place en cave" },
  { key: "contrat_concurrent",  label: "Contrat concurrent" },
  { key: "rotation_lente",      label: "Rotation lente" },
  { key: "tresorerie",          label: "Trésorerie" },
  { key: "qualite_percue",      label: "Qualité perçue" },
  { key: "ddm_fraicheur",       label: "DDM & fraîcheur" },
  { key: "logistique_livraison",label: "Logistique & livraison" },
  { key: "autre",               label: "Autre" },
];

const catLabel = (k) => OBJECTION_CATEGORIES.find(c => c.key === k)?.label || k;

/**
 * Panneau d'extraction d'objections depuis le compte rendu dicté.
 * Fluent avec la règle : jamais d'écriture automatique. L'IA propose, le commercial valide.
 */
export default function ObjectionExtractPanel({ open, visitId, onClose, onConfirmed }) {
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState(null);  // null = pas encore appelé, [] = rien détecté
  const [selected, setSelected] = useState({});      // idx → bool
  const [editedLabels, setEditedLabels] = useState({}); // idx → string
  const [editedCats, setEditedCats] = useState({});  // idx → string
  const [reason, setReason] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const runExtract = async () => {
    if (!visitId) return;
    setLoading(true);
    setReason(null);
    try {
      const { data } = await api.post(`/visits/${visitId}/extract-objections`);
      setProposals(data.proposals || []);
      setReason(data.reason || null);
      // Coche par défaut les propositions à forte confiance (>= 0.7)
      const init = {};
      (data.proposals || []).forEach((p, i) => { init[i] = (p.confidence ?? 0) >= 0.7; });
      setSelected(init);
      setEditedLabels({});
      setEditedCats({});
    } catch (e) {
      const msg = e?.response?.data?.detail || "Extraction indisponible";
      toast.error(msg);
      setProposals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && visitId && proposals === null && !loading) {
      runExtract();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visitId]);

  useEffect(() => {
    if (!open) {
      // Reset à la fermeture pour une prochaine ouverture propre
      setProposals(null); setSelected({}); setEditedLabels({}); setEditedCats({}); setReason(null);
    }
  }, [open]);

  const toggle = (i) => setSelected(s => ({ ...s, [i]: !s[i] }));

  const confirmSelection = async () => {
    if (!proposals || proposals.length === 0) { onClose?.(); return; }
    const items = proposals
      .map((p, i) => ({
        label: (editedLabels[i] ?? p.label).trim(),
        category: editedCats[i] ?? p.category,
        _picked: !!selected[i],
      }))
      .filter(x => x._picked && x.label.length > 0)
      .map(({ _picked, ...rest }) => rest);
    if (items.length === 0) { onClose?.(); return; }
    setConfirming(true);
    try {
      const { data } = await api.post(`/visits/${visitId}/confirm-objections`, { items });
      toast.success(`${data.count} objection${data.count > 1 ? "s" : ""} enregistrée${data.count > 1 ? "s" : ""}`);
      onConfirmed?.(data.confirmed || []);
      onClose?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Enregistrement impossible";
      toast.error(msg);
    } finally {
      setConfirming(false);
    }
  };

  if (!open) return null;

  const pickedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={() => !confirming && onClose?.()}
      data-testid="objections-extract-modal"
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-t-2xl md:rounded-2xl border border-stone-200 dark:border-stone-700 p-5 max-w-lg w-full space-y-3 max-h-[85vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[#4A154B] dark:text-[#B076B4]" />
          <h3 className="font-display text-2xl">Objections détectées</h3>
        </div>
        <p className="text-xs text-stone-500">
          Chaque proposition est acceptable, modifiable ou rejetable. Rien n'est enregistré tant que vous n'avez pas confirmé.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300 py-6 justify-center">
            <Loader2 size={16} className="animate-spin" /> Analyse du compte rendu…
          </div>
        )}

        {!loading && proposals && proposals.length === 0 && (
          <div className="text-sm text-stone-500 py-4 text-center" data-testid="objections-none">
            {reason === "empty_transcript"
              ? "Compte rendu vide — rien à extraire."
              : reason === "invalid_json"
                ? "L'IA n'a pas renvoyé un format exploitable. Vous pouvez relancer."
                : "Aucune objection identifiée dans ce compte rendu."}
          </div>
        )}

        {!loading && proposals && proposals.length > 0 && (
          <div className="space-y-2">
            {proposals.map((p, i) => (
              <div
                key={i}
                data-testid={`objection-proposal-${i}`}
                className={`border rounded-lg p-3 space-y-2 ${selected[i] ? "border-[#4A154B] bg-[#4A154B]/5 dark:bg-[#B076B4]/10" : "border-stone-200 dark:border-stone-700"}`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={!!selected[i]}
                    onChange={() => toggle(i)}
                    className="mt-1 shrink-0"
                    data-testid={`objection-check-${i}`}
                    aria-label={`Sélectionner l'objection ${i + 1}`}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <textarea
                      rows={2}
                      value={editedLabels[i] ?? p.label}
                      onChange={(e) => setEditedLabels(m => ({ ...m, [i]: e.target.value }))}
                      className="input-crm text-sm w-full"
                      data-testid={`objection-label-${i}`}
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={editedCats[i] ?? p.category}
                        onChange={(e) => setEditedCats(m => ({ ...m, [i]: e.target.value }))}
                        className="text-xs border border-stone-300 dark:border-stone-600 rounded px-2 py-1 bg-white dark:bg-stone-800 dark:text-stone-200"
                        data-testid={`objection-category-${i}`}
                      >
                        {OBJECTION_CATEGORIES.map(c => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </select>
                      {p.confidence != null && (
                        <span className="text-[10px] text-stone-400 tabular-nums" aria-label={`confiance ${Math.round(p.confidence * 100)}%`}>
                          confiance {Math.round(p.confidence * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-200 dark:border-stone-700">
          <button
            type="button"
            onClick={runExtract}
            disabled={loading || confirming}
            className="text-xs text-[#4A154B] dark:text-[#B076B4] font-medium flex items-center gap-1 disabled:opacity-50"
            data-testid="objections-rerun"
          >
            <RotateCw size={12} /> Relancer l'extraction
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className="btn-ghost text-sm"
              data-testid="objections-skip"
            >
              <X size={14} className="inline mr-1" /> Passer
            </button>
            <button
              type="button"
              onClick={confirmSelection}
              disabled={confirming || loading || pickedCount === 0}
              className="btn-primary text-sm"
              data-testid="objections-confirm"
            >
              {confirming ? <Loader2 size={14} className="inline mr-1 animate-spin" /> : <Check size={14} className="inline mr-1" />}
              Confirmer{pickedCount > 0 ? ` (${pickedCount})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2, Sparkles, Check, X, RotateCw } from "lucide-react";
import { toast } from "sonner";

/**
 * Panneau d'extraction d'engagements — mêmes règles que ObjectionExtractPanel :
 * l'IA propose, le commercial valide ligne par ligne. Rien de persisté sans confirmation.
 */
export default function EngagementExtractPanel({ open, visitId, onClose, onConfirmed }) {
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState(null);
  const [selected, setSelected] = useState({});
  const [editedLabels, setEditedLabels] = useState({});
  const [editedDates, setEditedDates] = useState({});
  const [editedOwners, setEditedOwners] = useState({});
  const [reason, setReason] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const runExtract = async () => {
    if (!visitId) return;
    setLoading(true);
    setReason(null);
    try {
      const { data } = await api.post(`/visits/${visitId}/extract-engagements`);
      setProposals(data.proposals || []);
      setReason(data.reason || null);
      const init = {};
      (data.proposals || []).forEach((_, i) => { init[i] = true; });
      setSelected(init);
      setEditedLabels({}); setEditedDates({}); setEditedOwners({});
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Extraction indisponible");
      setProposals([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (open && visitId && proposals === null && !loading) runExtract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visitId]);

  useEffect(() => {
    if (!open) {
      setProposals(null); setSelected({}); setEditedLabels({}); setEditedDates({}); setEditedOwners({}); setReason(null);
    }
  }, [open]);

  const toggle = (i) => setSelected(s => ({ ...s, [i]: !s[i] }));

  const confirmSelection = async () => {
    if (!proposals || proposals.length === 0) { onClose?.(); return; }
    const items = proposals
      .map((p, i) => ({
        label: (editedLabels[i] ?? p.label).trim(),
        owner: editedOwners[i] ?? p.owner,
        due_date: editedDates[i] ?? p.due_date,
        _picked: !!selected[i],
      }))
      .filter(x => x._picked && x.label.length > 0)
      .map(({ _picked, ...rest }) => rest);
    if (items.length === 0) { onClose?.(); return; }
    setConfirming(true);
    try {
      const { data } = await api.post(`/visits/${visitId}/confirm-engagements`, { items });
      toast.success(`${data.count} engagement${data.count > 1 ? "s" : ""} enregistré${data.count > 1 ? "s" : ""}`);
      onConfirmed?.(data.confirmed || []);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enregistrement impossible");
    } finally { setConfirming(false); }
  };

  if (!open) return null;
  const pickedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={() => !confirming && onClose?.()}
      data-testid="engagements-extract-modal"
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-t-2xl md:rounded-2xl border border-stone-200 dark:border-stone-700 p-5 max-w-lg w-full space-y-3 max-h-[85vh] overflow-y-auto"
        onClick={ev => ev.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[#4A154B] dark:text-[#B076B4]" />
          <h3 className="font-display text-2xl">Engagements détectés</h3>
        </div>
        <p className="text-xs text-stone-500">Les promesses de la visite, à valider avant enregistrement.</p>

        {loading && (
          <div className="space-y-2 py-2" data-testid="engagements-skeleton">
            <div className="text-xs text-stone-500 flex items-center gap-2 justify-center">
              <Loader2 size={14} className="animate-spin" />
              Analyse en cours (5-8s)…
            </div>
            {[0, 1].map(i => (
              <div key={i} className="border border-stone-200 dark:border-stone-700 rounded-lg p-3 space-y-2 animate-pulse">
                <div className="h-3 rounded bg-stone-200 dark:bg-stone-700 w-3/4" />
                <div className="flex gap-2">
                  <div className="h-4 w-24 rounded bg-stone-200 dark:bg-stone-700" />
                  <div className="h-4 w-20 rounded bg-stone-100 dark:bg-stone-800" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && proposals && proposals.length === 0 && (
          <div className="text-sm text-stone-500 py-4 text-center" data-testid="engagements-none">
            {reason === "empty_transcript" ? "Rien à extraire (compte rendu vide)."
              : reason === "invalid_json" ? "L'IA n'a pas renvoyé un format exploitable."
              : "Aucun engagement identifié."}
          </div>
        )}
        {!loading && proposals && proposals.length > 0 && (
          <div className="space-y-2">
            {proposals.map((p, i) => (
              <div key={i}
                data-testid={`engagement-proposal-${i}`}
                className={`border rounded-lg p-3 space-y-2 ${selected[i] ? "border-[#4A154B] bg-[#4A154B]/5 dark:bg-[#B076B4]/10" : "border-stone-200 dark:border-stone-700"}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={!!selected[i]} onChange={() => toggle(i)}
                    className="mt-1 shrink-0" data-testid={`engagement-check-${i}`} />
                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      type="text"
                      value={editedLabels[i] ?? p.label}
                      onChange={e => setEditedLabels(m => ({ ...m, [i]: e.target.value }))}
                      className="input-crm text-sm w-full"
                      data-testid={`engagement-label-${i}`}
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={editedOwners[i] ?? p.owner}
                        onChange={e => setEditedOwners(m => ({ ...m, [i]: e.target.value }))}
                        className="text-xs border border-stone-300 dark:border-stone-600 rounded px-2 py-1 bg-white dark:bg-stone-800 dark:text-stone-200"
                      >
                        <option value="agent">À faire par moi</option>
                        <option value="client">Attendu du client</option>
                      </select>
                      <input
                        type="date"
                        value={editedDates[i] ?? (p.due_date || "")}
                        onChange={e => setEditedDates(m => ({ ...m, [i]: e.target.value || null }))}
                        className="text-xs border border-stone-300 dark:border-stone-600 rounded px-2 py-1 bg-white dark:bg-stone-800 dark:text-stone-200"
                        data-testid={`engagement-date-${i}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-200 dark:border-stone-700">
          <button type="button" onClick={runExtract} disabled={loading || confirming}
            className="text-xs text-[#4A154B] dark:text-[#B076B4] font-medium flex items-center gap-1 disabled:opacity-50"
            data-testid="engagements-rerun">
            <RotateCw size={12} /> Relancer
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={confirming}
              className="btn-ghost text-sm" data-testid="engagements-skip">
              <X size={14} className="inline mr-1" /> Passer
            </button>
            <button type="button" onClick={confirmSelection}
              disabled={confirming || loading || pickedCount === 0}
              className="btn-primary text-sm" data-testid="engagements-confirm">
              {confirming ? <Loader2 size={14} className="inline mr-1 animate-spin" /> : <Check size={14} className="inline mr-1" />}
              Confirmer{pickedCount > 0 ? ` (${pickedCount})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { api, postOffline } from "@/lib/api";
import { Check, X, ChevronDown, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * VoiceOrderReview — écran de validation d'une commande dictée.
 *
 * Contrat produit (Lot 6) :
 *  - Aucune commande n'est enregistrée sans clic explicite sur « Valider ».
 *  - Chaque ligne montre le fragment de phrase qui l'a produite (traçabilité).
 *  - Max 2 alternatives par ligne en cas d'ambiguïté, changement d'un tap.
 *  - Quantité / prix / date modifiables sur place — jamais de « recommencer ».
 *  - Fallback silencieux : si l'interprétation échoue, appelle onFallback(transcript)
 *    pour retomber sur l'ancien flux texte libre. Jamais d'écran vide.
 */
export default function VoiceOrderReview({ open, onClose, transcript, clientId, onCreated, onFallback }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [interp, setInterp] = useState(null);  // { lines, delivery_date, notes, ... }
  const [submitting, setSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState(null);  // chrono dictée → validation

  useEffect(() => {
    if (!open) return;
    if (!transcript?.trim() || !clientId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStartedAt(Date.now());
    (async () => {
      try {
        const { data } = await api.post("/voice/interpret-order", { transcript, client_id: clientId });
        if (cancelled) return;
        if (data.fallback) {
          // Retombe proprement sur le compte rendu texte — pas d'écran d'erreur.
          onFallback?.(transcript, data.reason);
          onClose?.();
          return;
        }
        setInterp(data);
      } catch (e) {
        if (cancelled) return;
        // Hors-ligne ou 500 → même comportement : fallback silencieux.
        onFallback?.(transcript, "network");
        onClose?.();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, transcript, clientId, onFallback, onClose]);

  const updateLine = (i, patch) => {
    setInterp(s => ({
      ...s,
      lines: s.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l),
    }));
  };

  const swapWithAlternative = (i, altIdx) => {
    setInterp(s => {
      const line = s.lines[i];
      const alt = line.alternatives?.[altIdx];
      if (!alt) return s;
      const remainingAlts = line.alternatives.filter((_, j) => j !== altIdx);
      const swapped = {
        ...line,
        product_id: alt.product_id,
        product_name: alt.product_name,
        confidence: "high",
        alternatives: [
          { product_id: line.product_id, product_name: line.product_name },
          ...remainingAlts,
        ].slice(0, 2),
      };
      return { ...s, lines: s.lines.map((l, idx) => idx === i ? swapped : l) };
    });
  };

  const removeLine = (i) => {
    setInterp(s => ({ ...s, lines: s.lines.filter((_, idx) => idx !== i) }));
  };

  const total = (interp?.lines || []).reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);

  const validate = async () => {
    if (!interp?.lines?.length) return;
    setSubmitting(true);
    try {
      const payload = {
        client_id: interp.client_id,
        client_name: interp.client_name,
        lines: interp.lines.map(l => ({
          product_id: l.product_id,
          product_name: l.product_name,
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0,
        })),
        delivery_date: interp.delivery_date || null,
        notes: interp.notes || "",
        total: Math.round(total * 100) / 100,
        client_uuid: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`,
      };
      const res = await postOffline("/orders", payload);
      const elapsedSec = Math.round((Date.now() - (startedAt || Date.now())) / 1000);
      if (res.offline) {
        toast.success("Commande enregistrée hors-ligne — sera synchronisée", { icon: "📶" });
      } else {
        toast.success(`Commande créée en ${elapsedSec}s`);
      }
      onCreated?.(res.data || res);
      onClose?.();
    } catch (e) {
      toast.error("Impossible d'enregistrer — réessayez ou repassez au texte libre");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="voice-order-review-overlay"
    >
      <div
        className="w-full md:max-w-2xl m-0 md:m-4 rounded-t-2xl md:rounded-2xl bg-white border border-stone-200 p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        data-testid="voice-order-review"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[#4A154B]" />
            <h3 className="font-display text-lg">Commande dictée</h3>
          </div>
          <button onClick={onClose} data-testid="voice-order-close" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div className="py-8 flex items-center justify-center gap-2 text-stone-600" data-testid="voice-order-loading">
            <Loader2 size={16} className="animate-spin" />
            Interprétation en cours…
          </div>
        )}

        {!loading && interp && (
          <>
            <div className="mb-3 text-xs text-stone-500 italic border-l-2 border-stone-200 pl-3" data-testid="voice-order-transcript">
              « {interp.transcript} »
            </div>

            <div className="space-y-3 mb-4">
              {interp.lines.length === 0 ? (
                <div className="text-sm text-stone-500 flex items-center gap-2 py-4">
                  <AlertCircle size={14} /> Aucune ligne interprétée. Ajoutez ou repassez au texte.
                </div>
              ) : interp.lines.map((line, i) => (
                <div
                  key={i}
                  className={`border rounded-lg p-3 ${line.confidence === "low" ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}
                  data-testid={`voice-order-line-${i}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-stone-900">{line.product_name}</span>
                        {line.confidence === "low" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wide">
                            À confirmer
                          </span>
                        )}
                      </div>
                      {line.source_phrase && (
                        <div className="text-[11px] text-stone-500 mt-0.5 italic">« {line.source_phrase} »</div>
                      )}
                    </div>
                    <button
                      onClick={() => removeLine(i)}
                      className="text-stone-400 hover:text-red-600 shrink-0"
                      data-testid={`voice-order-line-remove-${i}`}
                      aria-label="Retirer la ligne"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 items-end">
                    <label className="text-[11px] text-stone-500 col-span-1">
                      Quantité
                      <input
                        type="number" min="1"
                        value={line.quantity}
                        onChange={e => updateLine(i, { quantity: e.target.value })}
                        className="input-crm text-sm mt-0.5"
                        data-testid={`voice-order-qty-${i}`}
                      />
                    </label>
                    <label className="text-[11px] text-stone-500 col-span-1">
                      Format
                      <div className="input-crm text-sm mt-0.5 text-stone-700 truncate">{line.unit}</div>
                    </label>
                    <label className="text-[11px] text-stone-500 col-span-1">
                      Prix HT
                      <input
                        type="number" step="0.01"
                        value={line.unit_price}
                        onChange={e => updateLine(i, { unit_price: e.target.value })}
                        className="input-crm text-sm mt-0.5"
                        data-testid={`voice-order-price-${i}`}
                      />
                    </label>
                  </div>

                  {line.alternatives?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {line.alternatives.map((alt, ai) => (
                        <button
                          key={ai}
                          onClick={() => swapWithAlternative(i, ai)}
                          className="text-xs px-2 py-1 rounded-full border border-stone-300 bg-white hover:border-[#4A154B] hover:text-[#4A154B]"
                          data-testid={`voice-order-alt-${i}-${ai}`}
                        >
                          ↔ {alt.product_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="text-[11px] text-stone-500">
                Livraison
                <input
                  type="date"
                  value={interp.delivery_date || ""}
                  onChange={e => setInterp(s => ({ ...s, delivery_date: e.target.value || null }))}
                  className="input-crm text-sm mt-0.5"
                  data-testid="voice-order-delivery-date"
                />
              </label>
              <div className="text-right">
                <div className="text-[11px] text-stone-500">Total HT</div>
                <div className="text-2xl font-display text-[#4A154B]" data-testid="voice-order-total">
                  {total.toFixed(2)} €
                </div>
              </div>
            </div>

            {interp.notes && (
              <div className="mb-4 text-xs text-stone-600 bg-stone-50 p-2 rounded">
                <span className="font-medium">Notes : </span>{interp.notes}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { onFallback?.(interp.transcript, "user_canceled"); onClose?.(); }}
                className="btn-ghost text-sm flex-1"
                data-testid="voice-order-fallback"
              >
                Revenir au texte
              </button>
              <button
                onClick={validate}
                disabled={submitting || interp.lines.length === 0}
                className="btn-primary text-sm flex-1 flex items-center justify-center gap-2"
                data-testid="voice-order-validate"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Valider la commande
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

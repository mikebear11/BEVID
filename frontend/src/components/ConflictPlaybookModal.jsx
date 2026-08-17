import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { X, Loader2, RotateCcw, MessageSquare, Mail, CheckCircle2, RefreshCw } from "lucide-react";

/**
 * Playbook "Rembourser + prévenir client" en 1 clic.
 * Ouvert depuis le SyncFeed du dashboard manager.
 */
export default function ConflictPlaybookModal({ conflictId, onClose, onResolved }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [refund, setRefund] = useState(true);
  const [restock, setRestock] = useState(true);
  const [channel, setChannel] = useState("email");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get(`/conflicts/${conflictId}/playbook-preview`)
      .then(r => {
        setPreview(r.data);
        setMessage(r.data.default_message || "");
        // Auto-choix du canal en fonction des coordonnées client
        if (!r.data.client?.email && r.data.client?.phone) setChannel("whatsapp");
        else if (r.data.client?.email) setChannel("email");
        else setChannel("none");
        // Refund uniquement si possible
        if (!r.data.can_refund) setRefund(false);
      })
      .catch(() => toast.error("Impossible de charger le playbook"))
      .finally(() => setLoading(false));
  }, [conflictId]);

  const run = async () => {
    setRunning(true);
    try {
      const { data } = await api.post(`/conflicts/${conflictId}/playbook`, {
        refund, restock, channel, message,
      });
      const parts = [];
      if (data.result.refund?.ok) parts.push("remboursé");
      if (data.result.refund?.ok === false) parts.push("refund échoué");
      if (data.result.restock?.ok) parts.push("stock rétabli");
      if (data.result.notification?.ok && !data.result.notification?.skipped) parts.push(`${channel} envoyé`);
      if (data.result.notification?.ok === false) parts.push(`notif échouée: ${data.result.notification?.reason || ""}`);
      toast.success("Playbook exécuté : " + parts.join(" · "));
      onResolved?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur playbook");
    } finally { setRunning(false); }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="playbook-modal-loading">
        <div className="bg-white rounded-2xl p-6"><Loader2 className="animate-spin text-stone-500" /></div>
      </div>
    );
  }
  if (!preview) return null;

  const { conflict, order, client, can_refund, already_refunded } = preview;
  const reasonType = conflict?.extra?.reason_type || "conflit";
  const isCredit = reasonType === "credit_red";
  const isStock = reasonType === "stock";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="playbook-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-stone-100 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-red-700 mb-1">Playbook conflit</p>
            <h2 className="font-display text-2xl">Rembourser + prévenir client</h2>
            <p className="text-xs text-stone-500 mt-1">
              {isCredit && "Compte client passé rouge entre-temps"}
              {isStock && "Stock insuffisant au moment du resync"}
              {!isCredit && !isStock && (conflict.reason || "Conflit à traiter")}
            </p>
          </div>
          <button onClick={onClose} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-stone-400 hover:text-stone-800" data-testid="playbook-close"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Récap commande + client */}
          {order && (
            <div className="bg-stone-50 rounded-xl p-3 text-sm">
              <p><b>Commande #{order.id.slice(0, 8).toUpperCase()}</b> — {(order.total || 0).toFixed(2)} €</p>
              <p className="text-xs text-stone-600 mt-1">
                {client?.name || "—"}{client?.contact_name ? ` · ${client.contact_name}` : ""}
              </p>
              <p className="text-xs text-stone-500 mt-1">
                Paiement : {already_refunded ? "déjà remboursé" : (order.payment_status || "à régler")}
                {order.has_signature && " · signé ✓"}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2" data-testid="playbook-actions">
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${!can_refund && !already_refunded ? "opacity-50 cursor-not-allowed" : ""} ${refund ? "bg-red-50 border-red-200" : "bg-white border-stone-200"}`}>
              <input type="checkbox" checked={refund} disabled={!can_refund || already_refunded} onChange={e => setRefund(e.target.checked)} className="mt-1" data-testid="playbook-refund-check" />
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-2"><RefreshCw size={14} /> Rembourser via Stripe</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {already_refunded ? "Commande déjà remboursée." :
                    can_refund ? "Rembourse intégralement le paiement client (Stripe Refund)." :
                    "Non applicable : la commande n'a pas de paiement Stripe capturé."}
                </p>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${restock ? "bg-emerald-50 border-emerald-200" : "bg-white border-stone-200"}`}>
              <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} className="mt-1" data-testid="playbook-restock-check" />
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-2"><RotateCcw size={14} /> Rétablir le stock</p>
                <p className="text-xs text-stone-500 mt-0.5">Réintègre les quantités déjà décrémentées ({(order?.lines || []).length || (order && "lignes") || 0} ligne(s)).</p>
              </div>
            </label>
          </div>

          {/* Canal */}
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500 mb-2">Prévenir le client</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setChannel("email")} disabled={!client?.email}
                className={`p-3 rounded-xl border text-xs flex flex-col items-center gap-1 min-h-[64px] ${channel === "email" ? "bg-[#4A154B] text-white border-[#4A154B]" : "bg-white border-stone-200"} disabled:opacity-40 disabled:cursor-not-allowed`}
                data-testid="playbook-channel-email">
                <Mail size={16} /> Email
                {!client?.email && <span className="text-[9px]">manquant</span>}
              </button>
              <button onClick={() => setChannel("whatsapp")} disabled={!client?.phone}
                className={`p-3 rounded-xl border text-xs flex flex-col items-center gap-1 min-h-[64px] ${channel === "whatsapp" ? "bg-[#4A154B] text-white border-[#4A154B]" : "bg-white border-stone-200"} disabled:opacity-40 disabled:cursor-not-allowed`}
                data-testid="playbook-channel-whatsapp">
                <MessageSquare size={16} /> WhatsApp
                {!client?.phone && <span className="text-[9px]">manquant</span>}
              </button>
              <button onClick={() => setChannel("none")}
                className={`p-3 rounded-xl border text-xs flex flex-col items-center gap-1 min-h-[64px] ${channel === "none" ? "bg-stone-700 text-white border-stone-700" : "bg-white border-stone-200"}`}
                data-testid="playbook-channel-none">
                <X size={16} /> Aucun
              </button>
            </div>
          </div>

          {channel !== "none" && (
            <div>
              <label className="text-xs text-stone-600">Message (modifiable)</label>
              <textarea rows={6} value={message} onChange={e => setMessage(e.target.value)}
                className="input-crm mt-1 text-sm font-mono" data-testid="playbook-message" />
            </div>
          )}
        </div>

        <div className="p-5 border-t border-stone-100 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="btn-ghost min-h-[44px] px-4" data-testid="playbook-cancel">Annuler</button>
          <button onClick={run} disabled={running || (!refund && !restock && channel === "none")}
            className="btn-primary min-h-[44px] px-6 flex items-center gap-2 disabled:opacity-40" data-testid="playbook-run">
            {running ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Exécuter
          </button>
        </div>
      </div>
    </div>
  );
}

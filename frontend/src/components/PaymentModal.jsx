import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import { X, Copy, ExternalLink, Loader2, CheckCircle2, Smartphone, MessageCircle, Zap } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export default function PaymentModal({ orderId, onClose, onPaid }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);

  useEffect(() => {
    api.post(`/orders/${orderId}/payment-link`)
      .then(r => setSession(r.data))
      .catch(e => setError(e.response?.data?.detail || "Erreur"));
    api.get(`/orders/${orderId}/receipt-text`).then(r => setOrder(r.data)).catch(() => {});
  }, [orderId]);

  useEffect(() => {
    if (!session || status === "paid") return;
    const iv = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/status/${session.session_id}`);
        setStatus(data.payment_status);
        if (data.payment_status === "paid") { clearInterval(iv); toast.success(t("toast.paiement_recu")); onPaid && onPaid(); }
      } catch { /* best-effort : ignoré volontairement */ }
    }, 2500);
    return () => clearInterval(iv);
  }, [session, status, onPaid]);

  const copyLink = async () => {
    if (!session) return;
    await navigator.clipboard.writeText(session.checkout_url);
    toast.success(t("toast.lien_copie"));
  };

  const tapToPay = () => {
    if (!session) return;
    // Express mode: open Stripe Checkout directly on the sales agent's phone.
    // On iOS Safari, Stripe Checkout surfaces Apple Pay (NFC) as the first option.
    window.open(session.checkout_url, "_blank", "noopener");
  };

  const shareWhatsApp = () => {
    if (!order) return;
    const link = session ? `\n\n💳 Payer : ${session.checkout_url}` : "";
    const msg = encodeURIComponent(order.text + link);
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6" onClick={e => e.stopPropagation()} data-testid="payment-modal">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Smartphone size={18} className="text-[#4A154B]" /><h3 className="font-display text-2xl">Encaisser</h3></div>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        {error && <p className="text-sm text-[#8C2A2A]">{error}</p>}
        {!session && !error && <div className="flex items-center gap-2 text-stone-500 py-8 justify-center"><Loader2 size={16} className="animate-spin" /> Génération du lien Stripe…</div>}

        {session && status !== "paid" && (
          <>
            <p className="text-xs text-stone-500 mb-3 text-center">Deux options : QR pour le client, ou <strong>Tap-to-Pay</strong> sur ton propre téléphone.</p>
            <button onClick={tapToPay} className="w-full mb-3 py-3 rounded-lg bg-black text-white flex items-center justify-center gap-2 font-medium" data-testid="tap-to-pay-btn">
              <Zap size={16} /> Tap-to-Pay Express (Apple Pay / Google Pay)
            </button>
            <div className="relative flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-stone-200" />
              <span className="text-xs uppercase tracking-widest text-stone-400">ou faire scanner le QR</span>
              <div className="flex-1 h-px bg-stone-200" />
            </div>
            <div className="bg-white p-4 rounded-lg border-2 border-stone-200 flex items-center justify-center mb-3">
              <QRCodeSVG value={session.checkout_url} size={200} fgColor="#4A154B" level="M" />
            </div>
            <div className="flex justify-between items-center mb-3">
              <span className="overline">Montant</span>
              <span className="font-display text-3xl text-[#2D5A4C]">{session.amount.toLocaleString('fr-FR')} €</span>
            </div>
            <div className="flex gap-2">
              <button onClick={copyLink} className="btn-ghost flex-1 flex items-center justify-center gap-1 text-sm" data-testid="copy-pay-link"><Copy size={13} /> Copier lien</button>
              <a href={session.checkout_url} target="_blank" rel="noreferrer" className="btn-ghost flex-1 flex items-center justify-center gap-1 text-sm" data-testid="open-pay-link"><ExternalLink size={13} /> Ouvrir</a>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-stone-500 justify-center"><Loader2 size={12} className="animate-spin" /> En attente du paiement…</div>
          </>
        )}

        {status === "paid" && (
          <div className="text-center py-6" data-testid="payment-success">
            <CheckCircle2 size={56} className="text-[#2D5A4C] mx-auto" />
            <h4 className="font-display text-2xl mt-3">Paiement reçu</h4>
            <p className="text-stone-500 text-sm mt-1">La commande est marquée comme payée.</p>
            <button onClick={shareWhatsApp} className="mt-4 w-full py-3 rounded-lg bg-[#25D366] text-white flex items-center justify-center gap-2 font-medium" data-testid="wa-receipt-btn">
              <MessageCircle size={16} /> Envoyer le reçu par WhatsApp
            </button>
            <button onClick={onClose} className="btn-ghost w-full mt-2">Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}

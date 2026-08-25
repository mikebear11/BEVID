import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CreditCard, Loader2, Shield, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { usePageMeta } from "@/lib/pageMeta";
import { toast } from "sonner";

function eur(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

/**
 * Page publique de paiement d'une facture — pas d'auth requise, résolution
 * via le token. Le client (CHR) ouvre le lien reçu par WhatsApp/email et paie
 * en 2 clics par CB.
 */
export default function PublicPay() {
  usePageMeta({ title: "Régler ma facture · BEVID" });
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/payments/pay-link/resolve/${token}`)
      .then(r => setInfo(r.data))
      .catch(e => setError(e?.response?.status === 410 ? "Ce lien a expiré." : "Lien invalide ou introuvable."));
  }, [token]);

  const pay = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/payments/pay-link/checkout", {
        token, origin_url: window.location.origin,
      });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Impossible de démarrer le paiement");
      setBusy(false);
    }
  };

  if (error) return (
    <div className="max-w-md mx-auto mt-16 p-6 text-center card-crm" data-testid="pay-error">
      <p className="text-red-700 font-medium">{error}</p>
      <p className="text-xs text-stone-500 mt-2">Contactez votre fournisseur pour un nouveau lien.</p>
    </div>
  );

  if (!info) return (
    <div className="max-w-md mx-auto mt-16 p-6 text-center">
      <Loader2 size={32} className="mx-auto animate-spin text-stone-400" />
    </div>
  );

  const d = info.document || {};
  const cents = Math.round((d.total_ttc || 0) * 100);

  return (
    <div className="max-w-md mx-auto mt-8 p-6 card-crm" data-testid="pay-page">
      <div className="text-center mb-6">
        <Building2 size={22} className="mx-auto text-[#4A154B] mb-2" aria-hidden="true" />
        <p className="text-xs text-stone-500 uppercase tracking-wide">De la part de</p>
        <p className="font-display text-xl">{info.issuer?.name || "BEVID"}</p>
      </div>

      <div className="border-t border-b border-stone-200 dark:border-stone-700 py-4 my-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-stone-500">Facture</span>
          <span className="font-medium">{d.number || d.id?.slice(0, 8)}</span>
        </div>
        {d.issue_date && (
          <div className="flex justify-between">
            <span className="text-stone-500">Date</span>
            <span>{new Date(d.issue_date).toLocaleDateString("fr-FR")}</span>
          </div>
        )}
        {d.client_name && (
          <div className="flex justify-between">
            <span className="text-stone-500">Établissement</span>
            <span className="font-medium">{d.client_name}</span>
          </div>
        )}
      </div>

      <div className="text-center my-6">
        <p className="text-xs text-stone-500 uppercase tracking-wide">Montant à régler</p>
        <p className="font-display text-5xl text-[#4A154B]" data-testid="pay-amount">{eur(cents)}</p>
      </div>

      {d.status === "paye" ? (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-center text-sm text-emerald-800 dark:text-emerald-200">
          Cette facture est déjà réglée. Merci !
        </div>
      ) : (
        <button onClick={pay} disabled={busy}
          className="btn-primary w-full min-h-[52px] flex items-center justify-center gap-2 text-base"
          data-testid="pay-cb-btn">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} aria-hidden="true" />}
          Régler par carte bancaire
        </button>
      )}

      <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-stone-500">
        <Shield size={11} aria-hidden="true" /> Paiement sécurisé — Stripe · CB Mastercard Visa
      </div>
      <p className="text-[10px] text-stone-400 text-center mt-2">
        Aucun compte à créer. Aucune donnée bancaire stockée par BEVID.
      </p>
    </div>
  );
}

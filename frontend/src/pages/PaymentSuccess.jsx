import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { usePageMeta } from "@/lib/pageMeta";

/**
 * Page de retour Stripe Checkout — poll /payments/status/{session_id} jusqu'à
 * paid (max 20 tentatives, 2s d'intervalle). Publique : accessible sans auth
 * pour couvrir aussi le cas invoice_pay_link (client final qui règle une facture).
 */
export default function PaymentSuccess() {
  usePageMeta({ title: "Paiement · BEVID" });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState({ payment_status: "pending", kind: null });
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!sessionId || done) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        if (cancelled) return;
        setStatus(data);
        if (data.payment_status === "paid" || data.payment_status === "failed" ||
            data.payment_status === "expired" || tries >= 20) {
          setDone(true);
        } else {
          setTimeout(() => setTries(t => t + 1), 2000);
        }
      } catch (e) {
        if (!cancelled) setDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, tries, done]);

  if (!sessionId) {
    return <div className="max-w-md mx-auto mt-16 p-6 text-center">
      <p className="text-stone-500">Session invalide.</p>
      <Link to="/" className="text-[#4A154B] hover:underline mt-4 inline-block">Retour à l'accueil</Link>
    </div>;
  }

  const paid = status.payment_status === "paid";
  const failed = ["failed", "expired"].includes(status.payment_status);

  return (
    <div className="max-w-md mx-auto mt-16 p-6 text-center card-crm" data-testid="payment-success-page">
      {!done && (
        <>
          <Loader2 size={48} className="mx-auto text-stone-400 animate-spin mb-4" aria-hidden="true" />
          <h1 className="font-display text-2xl">Confirmation du paiement…</h1>
          <p className="text-sm text-stone-500 mt-2">Tentative {tries + 1}/20</p>
        </>
      )}
      {done && paid && (
        <>
          <CheckCircle2 size={48} className="mx-auto text-emerald-600 mb-4" aria-hidden="true" />
          <h1 className="font-display text-3xl">Paiement confirmé</h1>
          <p className="text-sm text-stone-600 mt-2">
            {status.kind === "saas"
              ? "Votre abonnement BEVID est actif. Merci !"
              : "Votre règlement a bien été enregistré."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button onClick={() => navigate(status.kind === "saas" ? "/billing" : "/")}
              className="btn-primary min-h-[44px]" data-testid="payment-continue">
              Continuer
            </button>
          </div>
        </>
      )}
      {done && failed && (
        <>
          <XCircle size={48} className="mx-auto text-red-600 mb-4" aria-hidden="true" />
          <h1 className="font-display text-2xl">Paiement non validé</h1>
          <p className="text-sm text-stone-600 mt-2">
            La transaction n'a pas abouti. Vous pouvez réessayer depuis votre facture.
          </p>
          <button onClick={() => navigate(-1)} className="btn-ghost mt-4 min-h-[44px] inline-flex items-center gap-1" data-testid="payment-back">
            <ArrowLeft size={14} /> Retour
          </button>
        </>
      )}
      {done && !paid && !failed && (
        <>
          <Loader2 size={40} className="mx-auto text-amber-500 mb-4" aria-hidden="true" />
          <h1 className="font-display text-2xl">Traitement en cours</h1>
          <p className="text-sm text-stone-600 mt-2">
            Le paiement met plus de temps que prévu à être confirmé. Vous recevrez un email
            dès qu'il sera validé. Vous pouvez fermer cette page.
          </p>
        </>
      )}
    </div>
  );
}

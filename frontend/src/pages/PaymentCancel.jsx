import React from "react";
import { Link } from "react-router-dom";
import { XCircle, ArrowLeft } from "lucide-react";
import { usePageMeta } from "@/lib/pageMeta";

export default function PaymentCancel() {
  usePageMeta({ title: "Paiement annulé · BEVID" });
  return (
    <div className="max-w-md mx-auto mt-16 p-6 text-center card-crm" data-testid="payment-cancel-page">
      <XCircle size={48} className="mx-auto text-stone-400 mb-4" aria-hidden="true" />
      <h1 className="font-display text-2xl">Paiement annulé</h1>
      <p className="text-sm text-stone-600 mt-2">
        Vous avez interrompu la procédure. Aucun montant n'a été prélevé.
      </p>
      <Link to="/" className="btn-ghost mt-4 inline-flex items-center gap-1 min-h-[44px]">
        <ArrowLeft size={14} /> Retour à l'accueil
      </Link>
    </div>
  );
}

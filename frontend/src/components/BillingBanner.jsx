import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { AlertTriangle, Lock } from "lucide-react";

/**
 * BillingBanner — affiche un bandeau applicatif selon l'état de facturation.
 * - trial J-3 / J-1 / J0 : rappel amical avec compte à rebours
 * - past_due : bandeau attention (paiement en échec)
 * - read_only : bandeau lecture seule permanent avec CTA vers /billing
 * - suspended : bandeau bloquant
 *
 * L'état est rechargé toutes les 60 secondes pour capter les transitions
 * (webhook Stripe → past_due, essai expiré → read_only).
 */
export default function BillingBanner() {
  const [b, setB] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data } = await api.get("/billing/current");
        if (alive) setB(data);
      } catch { /* pas connecté, on n'affiche rien */ }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  if (!b) return null;

  const eff = b.effective_status;
  const trialEnds = b.trial_ends_at ? new Date(b.trial_ends_at) : null;
  const daysLeft = trialEnds ? Math.ceil((trialEnds - new Date()) / (1000 * 60 * 60 * 24)) : null;

  // Trial : afficher un bandeau à J-3, J-1, J0
  if (eff === "trial" && daysLeft !== null && daysLeft <= 3) {
    const label = daysLeft <= 0
      ? "Votre essai gratuit se termine aujourd'hui."
      : daysLeft === 1
        ? "Il vous reste 1 jour d'essai gratuit."
        : `Il vous reste ${daysLeft} jours d'essai gratuit.`;
    return (
      <div
        role="status"
        data-testid="banner-trial"
        className="w-full bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 flex items-center gap-3"
      >
        <AlertTriangle size={16} className="flex-shrink-0" aria-hidden />
        <span className="text-sm flex-1">
          <strong>{label}</strong> Choisissez un forfait pour continuer sans interruption.
        </span>
        <Link to="/billing" className="text-sm font-medium underline whitespace-nowrap" data-testid="banner-trial-cta">
          Choisir un forfait
        </Link>
      </div>
    );
  }

  if (eff === "past_due") {
    return (
      <div
        role="alert"
        data-testid="banner-past-due"
        className="w-full bg-orange-50 border-b border-orange-300 text-orange-900 px-4 py-2 flex items-center gap-3"
      >
        <AlertTriangle size={16} className="flex-shrink-0" aria-hidden />
        <span className="text-sm flex-1">
          <strong>Paiement en échec.</strong> Mettez à jour votre moyen de paiement pour éviter la mise en lecture seule.
        </span>
        <Link to="/billing" className="text-sm font-medium underline whitespace-nowrap" data-testid="banner-past-due-cta">
          Régulariser
        </Link>
      </div>
    );
  }

  if (eff === "read_only") {
    return (
      <div
        role="alert"
        data-testid="banner-read-only"
        className="w-full bg-rose-50 border-b border-rose-300 text-rose-900 px-4 py-2 flex items-center gap-3"
      >
        <Lock size={16} className="flex-shrink-0" aria-hidden />
        <span className="text-sm flex-1">
          <strong>Lecture seule.</strong> Vos données sont conservées, mais toute modification est bloquée jusqu'à la souscription d'un forfait.
        </span>
        <Link to="/pricing" className="text-xs font-medium underline whitespace-nowrap opacity-80 hidden md:inline" data-testid="banner-read-only-pricing">
          Voir les tarifs
        </Link>
        <Link to="/billing" className="text-sm font-medium underline whitespace-nowrap" data-testid="banner-read-only-cta">
          S'abonner
        </Link>
      </div>
    );
  }

  if (eff === "suspended") {
    return (
      <div
        role="alert"
        data-testid="banner-suspended"
        className="w-full bg-stone-900 border-b border-stone-950 text-white px-4 py-2 flex items-center gap-3"
      >
        <Lock size={16} className="flex-shrink-0" aria-hidden />
        <span className="text-sm flex-1">
          <strong>Compte suspendu.</strong> L'accès en modification est fermé. Contactez le support ou régularisez depuis /billing.
        </span>
        <Link to="/pricing" className="text-xs font-medium underline whitespace-nowrap opacity-80 hidden md:inline" data-testid="banner-suspended-pricing">
          Voir les tarifs
        </Link>
        <Link to="/billing" className="text-sm font-medium underline whitespace-nowrap" data-testid="banner-suspended-cta">
          Régulariser
        </Link>
      </div>
    );
  }

  return null;
}

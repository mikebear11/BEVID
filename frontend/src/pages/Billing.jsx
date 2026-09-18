import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CreditCard, Check, AlertTriangle, ShieldCheck, ExternalLink, Lock } from "lucide-react";
import { t as tt } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { usePageMeta } from "@/lib/pageMeta";

/**
 * /billing — Forfait courant, sièges, grille des 3 forfaits.
 * Paiement réel via Stripe Checkout (owner only) ; portail Stripe pour CB / factures.
 * Mode simulation uniquement si STRIPE_SECRET_KEY absent côté serveur.
 */
function eur(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const STATUS_LABEL = {
  trial: { label: "Essai en cours", color: "var(--ds-state-info-soft-bg)" },
  active: { label: "Actif", color: "var(--ds-state-success-soft-bg)" },
  past_due: { label: "Paiement en échec", color: "var(--ds-state-warning-soft-bg)" },
  read_only: { label: "Lecture seule (à régulariser)", color: "var(--ds-state-warning-soft-bg)" },
  suspended: { label: "Suspendu", color: "var(--ds-state-danger-soft-bg)" },
};

const PLAN_NAME = { terrain: "Terrain", pro: "Pro", entreprise: "Entreprise" };

export default function Billing() {
  usePageMeta({ title: "Facturation · BEVID" });
  const { confirm } = useConfirm();
  const [current, setCurrent] = useState(null);
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState("monthly");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/billing/current"), api.get("/billing/plans")])
      .then(([a, b]) => { setCurrent(a.data); setPlans(b.data.plans); })
      .catch(() => toast.error(tt("toast.erreur_chargement")));
  }, []);

  if (!current) return <div className="text-stone-500">{tt("loading")}</div>;

  const isOwner = !!current.is_owner;
  const status = STATUS_LABEL[current.effective_status] || STATUS_LABEL.trial;
  const blocked = ["read_only", "suspended", "past_due"].includes(current.effective_status);

  const changePlan = async (plan_id) => {
    if (current.billing_exempt) {
      toast.info("Compte fondateur — accès gratuit, aucun changement de forfait nécessaire");
      return;
    }
    const ok = await confirm({
      title: `Passer au forfait ${PLAN_NAME[plan_id] || plan_id} ?`,
      message: billing === "annual"
        ? "Facturation annuelle (2 mois offerts). Vous serez redirigé vers le paiement sécurisé Stripe."
        : "Facturation mensuelle par siège. Vous serez redirigé vers le paiement sécurisé Stripe.",
      confirmLabel: "Continuer vers le paiement",
    });
    if (!ok) return;
    setLoading(true);
    try {
      if (current.stripe_configured) {
        const lookup_key = `bevid_${plan_id}_${billing === "annual" ? "yearly" : "monthly"}`;
        const { data } = await api.post("/payments/checkout", { lookup_key, origin_url: window.location.origin });
        window.location.href = data.checkout_url;
        return;
      }
      const { data } = await api.post("/billing/upgrade", { plan_id, billing_mode: billing });
      toast.success(data.mode === "simulation" ? "Simulation : abonnement changé" : "Abonnement changé");
      const r = await api.get("/billing/current"); setCurrent(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || tt("toast.erreur"));
    } finally { setLoading(false); }
  };

  const openPortal = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/billing/portal", { origin_url: window.location.origin });
      window.location.href = data.portal_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || tt("toast.erreur"));
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="billing-page">
      <div>
        <p className="overline flex items-center gap-1"><CreditCard size={12} aria-hidden="true" /> Abonnement</p>
        <h1 className="font-display text-4xl">Facturation</h1>
        {current.billing_exempt && (
          <div role="status" data-testid="billing-founder-banner"
            className="mt-3 p-3 rounded-lg text-sm flex items-center gap-2"
            style={{ background: "var(--ds-state-success-soft-bg)", color: "var(--ds-state-success-soft-fg)", border: "1px solid var(--ds-state-success)" }}>
            <ShieldCheck size={14} aria-hidden="true" /> <b>Compte fondateur</b> — accès gratuit illimité pour toute l'équipe. Aucune facturation.
          </div>
        )}
        {!current.stripe_configured && !current.billing_exempt && (
          <div role="status" data-testid="billing-simulation-banner"
            className="mt-3 p-3 rounded-lg text-sm flex items-center gap-2"
            style={{ background: "var(--ds-state-warning-soft-bg)", color: "var(--ds-state-warning-soft-fg)", border: "1px solid var(--ds-state-warning)" }}>
            <AlertTriangle size={14} aria-hidden="true" /> Mode simulation : Stripe non configuré, aucune facture réelle n'est émise.
          </div>
        )}
        {blocked && !current.billing_exempt && (
          <div role="alert" data-testid="billing-blocked-banner"
            className="mt-3 p-3 rounded-lg text-sm flex items-center gap-2"
            style={{ background: "var(--ds-state-danger-soft-bg)", color: "var(--ds-state-danger-soft-fg)", border: "1px solid var(--ds-state-danger)" }}>
            <Lock size={14} aria-hidden="true" /> Les modifications sont bloquées. Les exports CSV / PDF restent disponibles. Choisissez un forfait ci-dessous pour reprendre.
          </div>
        )}
      </div>

      <section className="card-crm p-6 space-y-3" data-testid="billing-current-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="overline">Forfait actuel</p>
            <h2 className="font-display text-2xl">{current.plan_details.name}</h2>
          </div>
          <span data-testid="billing-status-chip"
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{ background: status.color }}>{status.label}</span>
        </div>
        {current.trial_ends_at && current.effective_status === "trial" && (
          <p className="text-sm text-stone-600">
            Essai gratuit jusqu'au <strong>{new Date(current.trial_ends_at).toLocaleDateString("fr-FR")}</strong> — sans carte bancaire.
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div><p className="text-xs text-stone-500">Sièges utilisés</p><p className="text-2xl font-display" data-testid="seats-used">{current.seats_used}</p></div>
          <div><p className="text-xs text-stone-500">Sièges payés</p><p className="text-2xl font-display" data-testid="seats-paid">{current.seats_paid}</p></div>
          <div><p className="text-xs text-stone-500">Prix / mois</p><p className="text-2xl font-display" data-testid="price-month">{eur(current.total_month_cents)}</p></div>
          <div><p className="text-xs text-stone-500">Prix / an (−2 mois)</p><p className="text-2xl font-display" data-testid="price-year">{eur(current.total_year_cents)}</p></div>
        </div>
        {current.first_seat_free && (
          <p className="text-xs text-stone-500">Premier siège (créateur de l'entreprise) inclus, non facturé.</p>
        )}
        {current.stripe_configured && current.portal_available && isOwner && (
          <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center gap-3" data-testid="billing-portal-block">
            <p className="text-sm text-stone-600 flex-1">Moyen de paiement, factures et résiliation sont gérés depuis votre espace Stripe sécurisé.</p>
            <button type="button" onClick={openPortal} disabled={loading} data-testid="billing-portal-btn"
              className="btn-ghost min-h-[44px] inline-flex items-center gap-2">
              <ExternalLink size={14} aria-hidden="true" /> Gérer mon abonnement
            </button>
          </div>
        )}
      </section>

      <section className="card-crm p-6" data-testid="billing-plans">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-xl">Changer de forfait</h2>
          <div className="flex gap-1 text-sm w-full sm:w-auto">
            {[{ v: "monthly", l: "Mensuel" }, { v: "annual", l: "Annuel (−2 mois)" }].map(({ v, l }) => (
              <button key={v} type="button" onClick={() => setBilling(v)}
                data-testid={`billing-mode-${v}`}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded min-h-[44px] ${billing === v ? "bg-[#4A154B] text-white" : "bg-stone-100"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(p => {
            const active = p.id === current.plan && current.effective_status === "active";
            const displayCents = billing === "annual"
              ? Math.round((p.price_per_seat_month_cents * 10) / 12)
              : p.price_per_seat_month_cents;
            const suffix = billing === "annual" ? " / siège / mois (facturé annuellement)" : " / siège / mois";
            return (
              <div key={p.id} data-testid={`plan-card-${p.id}`}
                className={`card-crm p-5 ${active ? "ring-2 ring-[#4A154B]" : ""}`}>
                <p className="overline">{p.name}</p>
                <p className="font-display text-3xl mt-1" data-testid={`plan-price-${p.id}`}>
                  {eur(displayCents)}
                  <span className="text-sm text-stone-500 font-body">{suffix}</span>
                </p>
                {billing === "annual" && (
                  <p className="text-xs text-emerald-700 mt-1" data-testid={`plan-annual-hint-${p.id}`}>
                    Économie de {eur(p.price_per_seat_month_cents * 2)} sur l'année
                  </p>
                )}
                <p className="text-sm text-stone-600 mt-2">{p.description}</p>
                <ul className="mt-4 space-y-1 text-xs">
                  {p.features.slice(0, 6).map(f => (
                    <li key={f} className="flex items-center gap-1"><Check size={12} aria-hidden="true" /> {f.replace("page:", "")}</li>
                  ))}
                </ul>
                <button
                  disabled={loading || active || !isOwner}
                  onClick={() => changePlan(p.id)}
                  data-testid={`plan-select-${p.id}`}
                  className="btn-primary w-full mt-4 min-h-[44px]">
                  {active ? "Forfait actuel" : `Choisir ${p.name}`}
                </button>
              </div>
            );
          })}
        </div>
        {current.stripe_configured && (
          <p className="mt-4 text-xs text-stone-500 flex items-center gap-1" data-testid="billing-stripe-note">
            <ShieldCheck size={12} aria-hidden="true" /> Paiement sécurisé par Stripe. Carte de test : 4242 4242 4242 4242 (mode test).
          </p>
        )}
        {!isOwner && (
          <p className="mt-4 text-xs text-stone-500" data-testid="billing-not-owner">Seul le propriétaire de l'entreprise peut modifier l'abonnement.</p>
        )}
      </section>
    </div>
  );
}

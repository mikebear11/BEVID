import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { CreditCard, Check, AlertTriangle } from "lucide-react";
import { t as tt } from "@/lib/i18n";

/**
 * /billing — Owner only. Affiche forfait courant, sièges, prochaine échéance,
 * grille comparative des 3 forfaits, actions upgrade/downgrade.
 * En mode simulation si STRIPE_SECRET_KEY absent côté serveur.
 */
function eur(cents) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const STATUS_LABEL = {
  trial: { label: "Essai en cours", color: "var(--ds-state-info-soft-bg)" },
  active: { label: "Actif", color: "var(--ds-state-success-soft-bg)" },
  read_only: { label: "Lecture seule (à régulariser)", color: "var(--ds-state-warning-soft-bg)" },
  suspended: { label: "Suspendu", color: "var(--ds-state-danger-soft-bg)" },
};

export default function Billing() {
  const { user } = useAuth();
  const [current, setCurrent] = useState(null);
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState("monthly");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/billing/current"), api.get("/billing/plans")])
      .then(([a, b]) => { setCurrent(a.data); setPlans(b.data.plans); });
  }, []);

  if (!current) return <div className="text-stone-500">{tt("loading")}</div>;

  const isOwner = user?.role === "manager"; // affinage côté serveur (403)
  const status = STATUS_LABEL[current.effective_status] || STATUS_LABEL.trial;

  const changePlan = async (plan_id) => {
    if (!window.confirm(`Changer pour le forfait ${plan_id} en facturation ${billing} ?`)) return;
    setLoading(true);
    try {
      const { data } = await api.post("/billing/upgrade", { plan_id, billing_mode: billing });
      toast.success(data.mode === "simulation" ? "Simulation : abonnement changé" : "Abonnement changé");
      const r = await api.get("/billing/current"); setCurrent(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || tt("toast.error_generic"));
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="billing-page">
      <div>
        <p className="overline flex items-center gap-1"><CreditCard size={12} /> Abonnement</p>
        <h1 className="font-display text-4xl">Facturation</h1>
        {!current.stripe_configured && (
          <div role="status" data-testid="billing-simulation-banner"
            className="mt-3 p-3 rounded-lg text-sm flex items-center gap-2"
            style={{ background: "var(--ds-state-warning-soft-bg)", color: "var(--ds-state-warning-soft-fg)", border: "1px solid var(--ds-state-warning)" }}>
            <AlertTriangle size={14} /> Mode simulation : Stripe non configuré, aucune facture réelle n'est émise.
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
      </section>

      <section className="card-crm p-6" data-testid="billing-plans">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl">Changer de forfait</h3>
          <div className="flex gap-1 text-sm">
            {[{ v: "monthly", l: "Mensuel" }, { v: "annual", l: "Annuel (−2 mois)" }].map(({ v, l }) => (
              <button key={v} type="button" onClick={() => setBilling(v)}
                data-testid={`billing-mode-${v}`}
                className={`px-3 py-1.5 rounded ${billing === v ? "bg-[#4A154B] text-white" : "bg-stone-100"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(p => {
            const active = p.id === current.plan;
            return (
              <div key={p.id} data-testid={`plan-card-${p.id}`}
                className={`card-crm p-5 ${active ? "ring-2 ring-[#4A154B]" : ""}`}>
                <p className="overline">{p.name}</p>
                <p className="font-display text-3xl mt-1">{eur(p.price_per_seat_month_cents)}<span className="text-sm text-stone-500 font-body"> / siège / mois</span></p>
                <p className="text-sm text-stone-600 mt-2">{p.description}</p>
                <ul className="mt-4 space-y-1 text-xs">
                  {p.features.slice(0, 6).map(f => (
                    <li key={f} className="flex items-center gap-1"><Check size={12} /> {f.replace("page:", "")}</li>
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
        {!isOwner && (
          <p className="mt-4 text-xs text-stone-500">Seul le propriétaire de l'entreprise peut modifier l'abonnement.</p>
        )}
      </section>
    </div>
  );
}

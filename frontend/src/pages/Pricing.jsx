import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import BevidLogo from "@/components/BevidLogo";
import LegalFooter from "@/components/LegalFooter";
import { Check, ArrowRight, Wifi, Mic, CornerDownRight } from "lucide-react";
import { dict } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";

/**
 * /pricing (alias /tarifs, /plans) — page publique.
 *
 * Affichage cumulatif (Option A) : chaque carte n'affiche que le **delta**
 * par rapport au forfait immédiatement inférieur. Terrain expose ses 6
 * fonctionnalités, Pro affiche « Tout le forfait Terrain, plus : » suivi
 * de ses 5 ajouts, Entreprise idem sur Pro.
 *
 * Toute troncature est signalée par `+ N autres fonctionnalités` — jamais
 * de coupe silencieuse. Toute clé sans libellé i18n est masquée.
 */
function trans(key) {
  return (dict.fr && dict.fr[key]) || (dict.en && dict.en[key]) || null;
}
function labelForFeature(featKey) { return trans(`feature.${featKey}`); }

const TRANSVERSE = [
  { key: "feature.transverse.offline", icon: Wifi },
  { key: "feature.transverse.voice",   icon: Mic  },
];

const PLAN_ORDER = ["terrain", "pro", "entreprise"];

export default function Pricing() {
  usePageMeta({
    title: "Tarifs · BEVID — Le CRM des brasseurs",
    canonical: "/pricing",
    description: "Le CRM des brasseurs : votre DRM, vos fûts, vos tournées — même sans réseau. 3 formules, essai 7 jours sans carte. Vos données restent les vôtres, export en un clic.",
  });
  const [plans, setPlans] = useState(null);
  const [mode, setMode] = useState("annual");
  const [trialDays, setTrialDays] = useState(7);

  useEffect(() => {
    api.get("/billing/plans").then(({ data }) => {
      setPlans(data.plans);
      setTrialDays(data.trial_days || 7);
    }).catch(() => setPlans([]));
  }, []);

  const priceFor = (p) => {
    const cents = p.price_per_seat_month_cents;
    // Annuel = 2 mois offerts (10 mois payés) — on affiche l'équivalent mensuel
    // pour rester comparable au tarif mensuel : 10 mois × prix ÷ 12 mois.
    if (mode === "annual") return Math.round((cents * 10) / 12) / 100;
    return cents / 100;
  };
  const suffix = mode === "annual" ? "€ HT / siège / mois (facturé annuellement)" : "€ HT / siège / mois";

  // Delta = features de ce plan absentes du plan inférieur.
  const cumulativeItems = (plan, allPlans) => {
    const idx = PLAN_ORDER.indexOf(plan.id);
    const lower = idx > 0 ? allPlans.find(x => x.id === PLAN_ORDER[idx - 1]) : null;
    const lowerFeats = new Set(lower ? lower.features : []);
    return (plan.features || [])
      .filter(f => !lowerFeats.has(f))
      .map(f => ({ raw: f, label: labelForFeature(f) }))
      .filter(x => x.label)
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  };

  return (
    <div className="min-h-screen bg-stone-50" data-testid="pricing-page">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 min-h-[44px]">
            <BevidLogo size={32} />
            <span className="font-display text-2xl">BEVID</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/login" className="text-stone-600 hover:text-stone-900 inline-flex items-center min-h-[44px] px-2" data-testid="pricing-login-link">Se connecter</Link>
            <Link to="/register" className="btn-primary min-h-[44px] px-4 rounded-lg inline-flex items-center" data-testid="pricing-signup-link">
              Créer un compte
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-12 md:py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="overline">Tarifs</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl mt-2 mb-4">
            Un forfait par siège, sans surprise.
          </h1>
          <p className="text-base text-stone-600">
            Le premier siège est gratuit sur tous les forfaits. Essai de {trialDays} jours,
            sans carte bancaire, sans engagement.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-10" role="tablist" aria-label="Mode de facturation">
          <button onClick={() => setMode("monthly")} role="tab" aria-selected={mode === "monthly"} data-testid="pricing-mode-monthly"
            className={`min-h-[44px] px-4 rounded-full text-sm transition-colors ${mode === "monthly" ? "bg-stone-900 text-white" : "bg-white text-stone-700 border"}`}>
            Mensuel
          </button>
          <button onClick={() => setMode("annual")} role="tab" aria-selected={mode === "annual"} data-testid="pricing-mode-annual"
            className={`min-h-[44px] px-4 rounded-full text-sm transition-colors ${mode === "annual" ? "bg-stone-900 text-white" : "bg-white text-stone-700 border"}`}>
            Annuel <span className="text-xs opacity-70">− 2 mois offerts</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch" data-testid="pricing-cards">
          {(plans || []).map((p) => {
            const idx = PLAN_ORDER.indexOf(p.id);
            const lower = idx > 0 ? plans.find(x => x.id === PLAN_ORDER[idx - 1]) : null;
            const items = cumulativeItems(p, plans);
            const shown = items;
            const truncated = items.length - shown.length; // 0 aujourd'hui, prêt pour l'avenir
            const inheritLabel = lower ? `Tout le forfait ${lower.name}, plus :` : null;
            return (
              <article key={p.id}
                className={`card-crm p-6 flex flex-col ${p.id === "pro" ? "ring-2 ring-[#4A154B]" : ""}`}
                data-testid={`pricing-card-${p.id}`}>
                {p.id === "pro" && (
                  <div className="text-xs uppercase tracking-wide font-medium text-[#4A154B] mb-2" data-testid="pricing-badge-recommended">
                    Recommandé
                  </div>
                )}
                <h2 className="font-display text-2xl mb-1">{p.name}</h2>
                <p className="text-sm text-stone-600 mb-4">{p.description || ""}</p>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl" data-testid={`pricing-amount-${p.id}`}>
                      {priceFor(p).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{suffix}</p>
                  <p className="text-xs text-stone-500 mt-1">1er siège offert · dégressif dès 10 sièges</p>
                </div>

                <ul className="space-y-2 mb-6 flex-1" aria-label={`Fonctionnalités du forfait ${p.name}`}>
                  {TRANSVERSE.map(({ key, icon: Icon }) => {
                    const lbl = trans(key);
                    if (!lbl) return null;
                    return (
                      <li key={key} className="flex items-start gap-2 text-sm" data-testid={`pricing-transverse-${key}-${p.id}`}>
                        <Icon size={16} className="text-[#4A154B] mt-0.5 flex-shrink-0" aria-hidden />
                        <span className="text-stone-700 font-medium">{lbl}</span>
                      </li>
                    );
                  })}
                  {inheritLabel && (
                    <li className="flex items-start gap-2 text-sm pt-1" data-testid={`pricing-inherits-${p.id}`}>
                      <CornerDownRight size={16} className="text-stone-500 mt-0.5 flex-shrink-0" aria-hidden />
                      <span className="text-stone-700 font-semibold">{inheritLabel}</span>
                    </li>
                  )}
                  {shown.map(({ raw, label }) => (
                    <li key={raw} className="flex items-start gap-2 text-sm" data-testid={`pricing-item-${raw}-${p.id}`}>
                      <Check size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" aria-hidden />
                      <span className="text-stone-700">{label}</span>
                    </li>
                  ))}
                  {truncated > 0 && (
                    <li className="text-xs text-stone-500 italic pt-1" data-testid={`pricing-more-${p.id}`}>
                      + {truncated} autre{truncated > 1 ? "s" : ""} fonctionnalité{truncated > 1 ? "s" : ""}
                    </li>
                  )}
                </ul>

                <Link to="/register"
                  className="btn-primary text-center min-h-[48px] rounded-lg flex items-center justify-center gap-2"
                  data-testid={`pricing-cta-${p.id}`}>
                  <span className="truncate">Essayer {trialDays} jours gratuitement</span>
                  <ArrowRight size={16} className="flex-shrink-0" />
                </Link>
                <p className="text-xs text-center text-stone-500 mt-2">Sans carte bancaire</p>
              </article>
            );
          })}
          {plans === null && <p className="text-stone-500 col-span-3 text-center">Chargement…</p>}
        </div>

        <div className="mt-16 max-w-3xl mx-auto text-center">
          <h2 className="font-display text-2xl mb-2">Questions fréquentes</h2>
          <dl className="text-left mt-6 space-y-4">
            <div>
              <dt className="font-medium">Que se passe-t-il après l'essai gratuit ?</dt>
              <dd className="text-sm text-stone-600 mt-1">
                Sans souscription à J+7, vous restez en <strong>lecture seule</strong> pendant 15 jours
                — vos données sont conservées et exportables.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Comment fonctionne la facturation par siège ?</dt>
              <dd className="text-sm text-stone-600 mt-1">
                Chaque compte utilisateur actif = 1 siège. Le premier est offert.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Puis-je changer de forfait à tout moment ?</dt>
              <dd className="text-sm text-stone-600 mt-1">
                Oui. Montée en gamme immédiate, descente au prochain cycle.
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <LegalFooter />
    </div>
  );
}

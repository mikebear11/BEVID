import React, { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Guided onboarding — 3 étapes clés pour un commercial au premier login.
 * Trigger : localStorage 'bevid_onboarded' absent + user connecté.
 * S'appuie sur les data-testid existants pour surligner les cibles.
 */
const STEPS = [
  {
    target: '[data-testid="sync-indicator"]',
    title: "L'indicateur de synchro",
    body: "Vert = tout est envoyé. Rouge = vous êtes hors-ligne mais l'app continue de fonctionner. Le badge affiche le nombre d'éléments en attente qui partiront dès que la connexion revient.",
  },
  {
    target: '[data-testid="nav-scan"], [data-testid="nav-mobile-scan"]',
    title: "Scanner un fût",
    body: "Depuis 'Scanner', pointez la caméra sur le QR d'un fût ou d'un carton — la fiche s'ouvre en 1 seconde avec position et historique.",
  },
  {
    target: '[data-testid="nav-visit"], [data-testid="nav-mobile-visit"]',
    title: "Une visite en 30 secondes",
    body: "Dictée vocale, chips ambiance/intérêt, prochaine action obligatoire. En zone blanche, la visite s'enregistre localement et remonte automatiquement.",
  },
];

export default function OnboardingTour() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem("bevid_onboarded") === "1") return;
    setActive(true);
  }, [user]);

  useEffect(() => {
    if (!active) return;
    const s = STEPS[step];
    const el = document.querySelector(s.target);
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      // Cible absente du DOM (page pas encore rendue, permission absente, taille écran…)
      // → on saute l'étape plutôt que de pointer dans le vide
      setPos(null);
      const skip = setTimeout(() => {
        if (step < STEPS.length - 1) setStep(step + 1);
        else { localStorage.setItem("bevid_onboarded", "1"); setActive(false); }
      }, 250);
      return () => clearTimeout(skip);
    }
  }, [step, active]);

  if (!active) return null;

  const finish = () => {
    localStorage.setItem("bevid_onboarded", "1");
    setActive(false);
  };
  const next = () => step < STEPS.length - 1 ? setStep(step + 1) : finish();

  const s = STEPS[step];
  return (
    <div className="fixed inset-0 z-[9999]" data-testid="onboarding-overlay">
      {/* Backdrop avec hole spotlight */}
      <div className="absolute inset-0 bg-black/60 transition-opacity" onClick={finish} />
      {pos && (
        <div
          className="absolute pointer-events-none rounded-lg ring-4 ring-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] transition-all duration-300"
          style={{ top: pos.top - 6, left: pos.left - 6, width: pos.width + 12, height: pos.height + 12 }}
        />
      )}
      {/* Tooltip */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-md bg-white rounded-2xl p-6 shadow-xl border border-stone-200" data-testid={`onboarding-step-${step}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="overline text-[#4A154B]">Étape {step + 1} / {STEPS.length}</p>
            <h3 className="font-display text-2xl mt-1">{s.title}</h3>
          </div>
          <button onClick={finish} className="text-stone-400 hover:text-stone-900 min-w-[36px] min-h-[36px] flex items-center justify-center" data-testid="onboarding-skip"><X size={16} /></button>
        </div>
        <p className="text-sm text-stone-700 mt-3 leading-relaxed">{s.body}</p>
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={`w-2 h-2 rounded-full ${i === step ? "bg-[#4A154B]" : "bg-stone-300"}`} />
            ))}
          </div>
          <button onClick={next} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="onboarding-next">
            {step < STEPS.length - 1 ? "Suivant" : "Terminer"} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

import React from "react";

/**
 * Composant Tabs minimaliste utilisé pour intégrer les modules fusionnés
 * (Pipeline dans Deals, Monthly/Smart/Marché dans Reports, Bouclier dans
 * Paiements, etc.).
 * Contrôlé par un state parent — l'URL peut suivre via `?tab=xxx`.
 */
export default function Tabs({ tabs, active, onChange, testid }) {
  return (
    <div className="border-b border-stone-200 flex gap-1 overflow-x-auto" data-testid={testid || "tabs"}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 min-h-[44px] text-sm border-b-2 transition-colors whitespace-nowrap ${
            active === t.key
              ? "border-[#4A154B] text-[#4A154B] font-medium"
              : "border-transparent text-stone-600 hover:text-stone-900"
          }`}
          data-testid={`tab-${t.key}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

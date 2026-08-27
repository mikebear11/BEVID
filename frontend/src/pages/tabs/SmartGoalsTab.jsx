import React from "react";
import { Sparkles } from "lucide-react";

/**
 * Onglet Objectifs SMART dans /reports.
 * Reconstruit dans le lot parité terrain.
 */
export default function SmartGoalsTab() {
  return (
    <div className="card-crm p-8 text-center" data-testid="smart-tab">
      <Sparkles size={28} className="mx-auto text-stone-300 mb-3" aria-hidden="true" />
      <h3 className="font-display text-xl mb-2">Objectifs SMART</h3>
      <p className="text-sm text-stone-500 max-w-md mx-auto">
        Les objectifs personnalisés par commercial (CA, visites, taux de détention) sont en cours
        de refonte pour rendre quelque chose au commercial chaque jour, pas seulement au manager.
      </p>
    </div>
  );
}

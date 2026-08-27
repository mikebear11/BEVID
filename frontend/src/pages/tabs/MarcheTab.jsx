import React from "react";
import { Radio, AlertOctagon } from "lucide-react";

/**
 * Onglet Marché dans /reports — fusionne l'ancien Radar CHR et l'ancienne Veille concurrentielle.
 * Le contenu détaillé est reconstruit dans un batch dédié.
 */
export default function MarcheTab() {
  return (
    <div className="space-y-4" data-testid="marche-tab">
      <div className="card-crm p-6">
        <div className="flex items-center gap-2 mb-2"><Radio size={16} className="text-[#4A154B]" aria-hidden="true" /><h3 className="font-display text-lg">Marché & concurrence</h3></div>
        <p className="text-sm text-stone-500">
          Radar CHR (nouveaux points de vente sur ton département) et veille concurrentielle
          (mouvements de tarifs, référencements) fusionnés en un seul onglet. Reconstruction
          en cours pour éviter le double emploi.
        </p>
      </div>
      <div className="card-crm p-4 flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border-amber-200">
        <AlertOctagon size={16} className="text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
        <p>Les alertes marché seront reliées aux automatisations (Section 6) pour créer une tâche automatique quand un concurrent référence un client à toi.</p>
      </div>
    </div>
  );
}

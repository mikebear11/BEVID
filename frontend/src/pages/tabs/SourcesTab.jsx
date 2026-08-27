import React from "react";
import { Database } from "lucide-react";

/** Onglet Sources de données dans /connectors — fusion Lot 0.5. */
export default function SourcesTab() {
  return (
    <div className="card-crm p-6" data-testid="sources-tab">
      <div className="flex items-center gap-2 mb-2"><Database size={16} className="text-[#4A154B]" aria-hidden="true" /><h3 className="font-display text-lg">Sources de données</h3></div>
      <p className="text-sm text-stone-500">
        Configuration des sources d'enrichissement (Sirene, INPI RNE, BODACC, Pappers).
        Voir onglet <strong>Intégrations</strong> pour l'état des connecteurs.
      </p>
    </div>
  );
}

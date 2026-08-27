import React from "react";
import { Columns, Sparkles } from "lucide-react";

/**
 * Onglet Cycle client dans /deals (ex /pipeline).
 * Le contenu original a été perdu lors d'une suppression prématurée ;
 * il sera ré-implémenté proprement dans un batch dédié.
 * En attendant, on montre honnêtement l'état plutôt qu'un faux placeholder.
 */
export default function PipelineTab() {
  return (
    <div className="card-crm p-8 text-center" data-testid="pipeline-tab">
      <Columns size={32} className="mx-auto text-stone-300 mb-3" aria-hidden="true" />
      <h3 className="font-display text-xl mb-2">Vue Cycle client</h3>
      <p className="text-sm text-stone-500 max-w-md mx-auto">
        Cette vue kanban des opportunités en cours est en cours de refonte.
        Retrouve les mêmes données dans l'onglet <strong>Opportunités</strong> de cette page.
      </p>
      <p className="text-xs text-stone-400 mt-4 flex items-center justify-center gap-1"><Sparkles size={12} aria-hidden="true" /> Prochain lot : parité terrain</p>
    </div>
  );
}

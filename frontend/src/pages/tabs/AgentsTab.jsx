import React from "react";
import { Link } from "react-router-dom";
import { Users, ArrowRight } from "lucide-react";

export default function AgentsTab() {
  return (
    <div className="card-crm p-6" data-testid="agents-tab">
      <div className="flex items-center gap-2 mb-2"><Users size={16} className="text-[#4A154B]" aria-hidden="true" /><h3 className="font-display text-lg">Vue commerciaux</h3></div>
      <p className="text-sm text-stone-500 mb-4">
        La vue par commercial est fusionnée avec l'équipe. Utilise <strong>Portefeuilles</strong> pour la répartition
        des clients et <strong>Rapports</strong> pour la performance.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Link to="/portefeuilles" className="btn-ghost min-h-[40px] px-3 flex items-center gap-2 text-sm">Portefeuilles <ArrowRight size={14} /></Link>
        <Link to="/reports" className="btn-ghost min-h-[40px] px-3 flex items-center gap-2 text-sm">Rapports <ArrowRight size={14} /></Link>
      </div>
    </div>
  );
}

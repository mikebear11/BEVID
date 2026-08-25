import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Coins, Clock, ArrowRight } from "lucide-react";

/**
 * DepositCapitalWidget — met en avant sur le dashboard manager le capital
 * immobilisé chez les clients sous forme de fûts consignés non retournés.
 *
 * Ce chiffre vend le produit en démonstration : une petite brasserie perd
 * plusieurs milliers d'euros/an en fûts jamais revenus, sans le savoir.
 *
 * Source : /deposits/outstanding — statut container ∈ (chez_client, sorti)
 *          avec deposit_amount > 0, regroupé par current_location.
 * L'ancienneté est calculée depuis `last_moved_at`.
 */
const eur = (n) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function DepositCapitalWidget() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/deposits/outstanding")
      .then(r => setItems(r.data || []))
      .catch(() => setError(true));
  }, []);

  if (error) return null;
  if (!items) return null;

  // Total + tranche > 90 jours
  const now = Date.now();
  let total = 0, over90 = 0;
  for (const grp of items) {
    total += Number(grp.total_deposit) || 0;
    for (const c of (grp.containers || [])) {
      const since = c.since ? new Date(c.since).getTime() : now;
      const days = (now - since) / 86400000;
      if (days > 90) over90 += (grp.total_deposit || 0) / Math.max(grp.containers.length, 1);
    }
  }

  // Ne pas polluer les nouveaux comptes : si 0€ immobilisés, on masque
  if (total <= 0) return null;

  return (
    <Link to="/containers?status=chez_client" data-testid="deposit-capital-widget"
      className="block card-crm p-6 md:p-8 border-l-4 border-l-[#C78B3A] hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="overline flex items-center gap-1"><Coins size={12} aria-hidden="true" /> Capital immobilisé</p>
          <p className="font-display text-4xl md:text-6xl mt-2 text-[#4A154B] leading-none" data-testid="deposit-capital-total">
            {eur(total)}
          </p>
          <p className="text-sm md:text-base text-stone-600 mt-2">
            immobilisés chez vos clients{" "}
            {over90 > 0 && (
              <span className="text-[#C78B3A]" data-testid="deposit-capital-over90">
                <br className="md:hidden" />
                — dont <strong>{eur(over90)}</strong> au-delà de 90 jours
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="w-14 h-14 rounded-full bg-[#4A154B]/10 flex items-center justify-center">
            <Clock size={24} className="text-[#4A154B]" aria-hidden="true" />
          </div>
          <span className="text-xs text-[#4A154B] flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            Voir la liste <ArrowRight size={12} aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

import React from "react";
import { useNavigate } from "react-router-dom";

const eur = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} €`;
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Onglet Ventes (M5) : CA 12 mois lisible au soleil, produits achetés, opportunités, fréquence. */
export function SalesTab({ sales, etabId }) {
  const nav = useNavigate();
  const max = Math.max(1, ...sales.monthly.map((m) => m.ca));
  return (
    <div className="space-y-3" data-testid="metab-sales">
      <div className="rounded-xl border border-stone-200 bg-white p-3">
        <p className="overline mb-2">CA par mois · 12 mois</p>
        <div className="flex items-end gap-1 h-28" role="img" aria-label={`CA mensuel : ${sales.monthly.map((m) => `${m.month} ${eur(m.ca)}`).join(", ")}`}>
          {sales.monthly.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-t bg-[#2D5A4C]" style={{ height: `${Math.max(3, (m.ca / max) * 100)}%` }} />
              <span className="text-xs text-stone-700 mt-1">{MONTHS[parseInt(m.month.slice(5), 10) - 1]}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-stone-700 mt-2" data-testid="sales-frequency">
          {sales.freq_days ? <>Commande tous les <strong>{sales.freq_days} j</strong> · prochaine probable le <strong>{new Date(sales.next_order_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</strong></> : "Pas encore assez de commandes pour estimer la fréquence."}
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3" data-testid="sales-bought">
        <p className="overline mb-2">Produits achetés</p>
        {sales.bought.length === 0 && <p className="text-base text-stone-600">Aucun produit acheté.</p>}
        {sales.bought.map((b) => (
          <div key={b.product_id} className="flex items-center justify-between min-h-[44px] border-b border-stone-100 last:border-0 gap-2">
            <p className="text-base truncate">{b.name}</p>
            <p className="text-sm text-stone-700 shrink-0 text-right">{new Date(b.last_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · {b.last_price.toFixed(2)} €</p>
          </div>
        ))}
      </div>

      {sales.opportunities.length > 0 && (
        <div className="rounded-xl border-2 border-[#C78B3A] bg-[#FDF6EC] p-3" data-testid="sales-opportunities">
          <p className="overline mb-2 text-[#7A4B10]">À proposer</p>
          {sales.opportunities.slice(0, 6).map((o) => (
            <div key={o.product_id} className="flex items-center justify-between min-h-[44px] gap-2">
              <p className="text-base truncate">{o.name} <span className="text-sm text-stone-600">· {o.reason}</span></p>
              <span className="text-sm text-stone-700 shrink-0">{o.price ? `${o.price.toFixed(2)} €` : ""}</span>
            </div>
          ))}
          <button type="button" onClick={() => nav(`/etab/${etabId}/commande`)} className="btn-primary w-full min-h-[48px] mt-2 text-base" data-testid="sales-order-cta">Proposer dans une commande</button>
        </div>
      )}
    </div>
  );
}

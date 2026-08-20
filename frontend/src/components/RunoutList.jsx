import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Clock } from "lucide-react";

/**
 * RunoutList — prédictions de rupture par produit pour un client donné.
 *
 * Contrat Lot 6.2 (non négociable) :
 *  - S'affiche discrètement (pas d'alerte, pas de badge rouge, pas de notification).
 *  - Le raisonnement figure TOUJOURS dans la même ligne que la prédiction.
 *  - Aucune ligne si l'historique est insuffisant — le composant est vide et silencieux.
 *  - Hors-ligne : le composant peut recevoir des prédictions pré-calculées via `preloaded`.
 */
export default function RunoutList({ clientId, preloaded, max = 5 }) {
  const [data, setData] = useState(preloaded || null);
  const [loading, setLoading] = useState(!preloaded);

  useEffect(() => {
    if (preloaded) { setData(preloaded); return; }
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/clients/${clientId}/predicted-runouts`);
        if (!cancelled) setData(data);
      } catch {
        if (!cancelled) setData({ predictions: [], excluded: {} });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, preloaded]);

  if (loading) return null;
  const preds = data?.predictions || [];
  if (preds.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid="runout-list">
      {preds.slice(0, max).map(p => (
        <div
          key={p.product_id}
          className="text-[13px] text-stone-700 flex items-start gap-2 leading-snug"
          data-testid={`runout-${p.product_id}`}
        >
          <Clock size={14} className="text-stone-400 shrink-0 mt-0.5" />
          <span>{p.explanation}</span>
        </div>
      ))}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertOctagon, CreditCard } from "lucide-react";
import PaymentModal from "@/components/PaymentModal";
import PuceEtat from "@/components/system/PuceEtat";

export default function OverdueBanner() {
  const [data, setData] = useState(null);
  const [payId, setPayId] = useState(null);

  const load = () => api.get("/alerts/overdue-payments?days=30").then(r => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!data || data.count === 0) return null;

  return (
    <>
      <div className="card-crm p-5 border-l-4" style={{ borderLeftColor: "var(--ds-state-danger)", background: "var(--ds-state-danger-soft-bg)" }} data-testid="overdue-banner">
        <div className="flex items-start gap-3">
          <AlertOctagon size={22} style={{ color: "var(--ds-state-danger)" }} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">Impayés détectés</p>
              <PuceEtat etat="bloque" variante="pleine" libelle={String(data.count)} />
              <span className="text-xs text-stone-600 dark:text-stone-400">· <strong>{data.total.toLocaleString('fr-FR')} €</strong> en retard</span>
            </div>
            <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
              {data.items.slice(0, 5).map(o => (
                <div key={o.id} className="flex items-center gap-2 text-sm" data-testid={`overdue-${o.id}`}>
                  <span className="flex-1 truncate">{o.client_name} · #{o.id.slice(0,8)}</span>
                  <span className="text-xs" style={{ color: "var(--ds-state-danger)" }}>{o.days_late}j</span>
                  <span className="font-medium">{o.total.toLocaleString('fr-FR')}€</span>
                  <button onClick={() => setPayId(o.id)} className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ background: "var(--ds-state-success)", color: "#fff" }} data-testid={`quick-pay-${o.id}`}><CreditCard size={11} /> Encaisser</button>
                </div>
              ))}
              {data.items.length > 5 && <p className="text-xs text-stone-500">+ {data.items.length - 5} autres…</p>}
            </div>
          </div>
        </div>
      </div>
      {payId && <PaymentModal orderId={payId} onClose={() => setPayId(null)} onPaid={load} />}
    </>
  );
}

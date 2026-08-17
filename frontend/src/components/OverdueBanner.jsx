import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertOctagon, CreditCard } from "lucide-react";
import PaymentModal from "@/components/PaymentModal";

export default function OverdueBanner() {
  const [data, setData] = useState(null);
  const [payId, setPayId] = useState(null);

  const load = () => api.get("/alerts/overdue-payments?days=30").then(r => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!data || data.count === 0) return null;

  return (
    <>
      <div className="card-crm p-5 border-l-4 border-l-[#8C2A2A] bg-[#8C2A2A]/5" data-testid="overdue-banner">
        <div className="flex items-start gap-3">
          <AlertOctagon size={22} className="text-[#8C2A2A] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">Impayés détectés</p>
              <span className="badge badge-inactif" style={{ background: "#8C2A2A20", color: "#8C2A2A" }}>{data.count}</span>
              <span className="text-xs text-stone-600">· <strong>{data.total.toLocaleString('fr-FR')} €</strong> en retard</span>
            </div>
            <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
              {data.items.slice(0, 5).map(o => (
                <div key={o.id} className="flex items-center gap-2 text-sm" data-testid={`overdue-${o.id}`}>
                  <span className="flex-1 truncate">{o.client_name} · #{o.id.slice(0,8)}</span>
                  <span className="text-xs text-[#8C2A2A]">{o.days_late}j</span>
                  <span className="font-medium">{o.total.toLocaleString('fr-FR')}€</span>
                  <button onClick={() => setPayId(o.id)} className="text-xs px-2 py-1 bg-[#2D5A4C] text-white rounded flex items-center gap-1" data-testid={`quick-pay-${o.id}`}><CreditCard size={11} /> Encaisser</button>
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

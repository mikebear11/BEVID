import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Cake, Gift, MessageSquare, Phone } from "lucide-react";

export default function AnniversariesWidget() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/anniversaries?days=45").then(r => setData(r.data)).catch(() => {}); }, []);

  if (!data || data.count === 0) return null;

  const waLink = (item) => {
    const phone = (item.phone || "").replace(/\s/g, "");
    const msg = encodeURIComponent(`Bonjour ${item.client_name}, aujourd'hui c'est ${item.years} an${item.years>1?'s':''} qu'on travaille ensemble ! Merci pour votre confiance 🍾`);
    if (phone) return `https://wa.me/${phone.startsWith('+')?phone.slice(1):'33'+phone.replace(/^0/,'')}?text=${msg}`;
    return `https://wa.me/?text=${msg}`;
  };

  return (
    <div className="card-crm p-6" data-testid="anniversaries-widget">
      <div className="flex items-center gap-2 mb-4">
        <Cake size={18} className="text-[#C78B3A]" />
        <h3 className="font-display text-xl">Anniversaires · 45j</h3>
        <span className="badge badge-vip ml-auto">{data.count}</span>
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {data.items.slice(0, 8).map((it, i) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded-lg border-l-2 border-[#C78B3A] bg-stone-50" data-testid={`anniv-${i}`}>
            <Gift size={14} className="text-[#C78B3A]" />
            <div className="flex-1 min-w-0">
              <Link to={`/clients/${it.client_id}`} className="text-sm font-medium hover:text-[#4A154B] truncate block">{it.client_name}</Link>
              <div className="text-xs text-stone-500">{it.label} · {new Date(it.date).toLocaleDateString('fr-FR', {day:'numeric', month:'long'})}</div>
            </div>
            <div className="flex gap-1">
              {it.phone && <a href={`tel:${it.phone.replace(/\s/g,'')}`} className="p-1.5 rounded-full bg-[#4A154B] text-white" title="Appeler"><Phone size={12} /></a>}
              <a href={waLink(it)} target="_blank" rel="noreferrer" className="p-1.5 rounded-full bg-[#25D366] text-white" title="WhatsApp"><MessageSquare size={12} /></a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

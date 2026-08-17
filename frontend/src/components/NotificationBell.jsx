import React, { useEffect, useState, useRef } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const notifiedRef = useRef(new Set());

  const load = async () => {
    try {
      const [f, bp] = await Promise.all([
        api.get("/alerts/follow-ups"),
        api.get("/alerts/bad-payers").catch(() => ({ data: [] })),
      ]);
      const urgent = f.data.items.filter(a => a.priority === "high");
      const badPayerItems = (bp.data || []).map(x => ({
        client_id: x.client_id,
        client_name: x.client_name,
        reason: `Mauvais payeur — score ${x.score}`,
        priority: "high",
        kind: "bad_payer",
      }));
      const all = [...badPayerItems, ...urgent];
      setAlerts(all);
      if ("Notification" in window && Notification.permission === "granted") {
        all.forEach(a => {
          const key = `${a.kind || "follow"}-${a.client_id}`;
          if (!notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            new Notification("BEVID · Alerte", { body: `${a.client_name} — ${a.reason}`, icon: "/manifest.json" });
          }
        });
      }
    } catch {}
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} data-testid="notif-bell" className="relative p-2 rounded-full hover:bg-stone-100">
        <Bell size={18} />
        {alerts.length > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#8C2A2A] text-white text-[10px] font-bold rounded-full flex items-center justify-center">{alerts.length}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 bg-white rounded-xl border border-stone-200 shadow-lg p-3" data-testid="notif-panel">
          <p className="overline mb-2">Relances urgentes</p>
          {alerts.length === 0 && <p className="text-sm text-stone-500 py-4 text-center">Aucune alerte urgente</p>}
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {alerts.map(a => (
              <Link key={a.client_id} to={`/clients/${a.client_id}`} onClick={() => setOpen(false)} className="block p-2 rounded-lg hover:bg-stone-50 border-l-2 border-[#8C2A2A]">
                <div className="text-sm font-medium">{a.client_name}</div>
                <div className="text-xs text-stone-500">{a.reason}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

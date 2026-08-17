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
      const { data } = await api.get("/alerts/follow-ups");
      const urgent = data.items.filter(a => a.priority === "high");
      setAlerts(urgent);
      // Browser notif for new urgent items
      if ("Notification" in window && Notification.permission === "granted") {
        urgent.forEach(a => {
          if (!notifiedRef.current.has(a.client_id)) {
            notifiedRef.current.add(a.client_id);
            new Notification("Relance urgente · Cellier", { body: `${a.client_name} — ${a.reason}`, icon: "/manifest.json" });
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

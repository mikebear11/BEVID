import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Sunrise, ChevronRight, X } from "lucide-react";

const PRIO_COLOR = { high: "#8C2A2A", medium: "#C78B3A", low: "#5C5C5C" };

export default function MorningChecklist() {
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem("cellier_checklist_dismissed");
    if (last === today) { setDismissed(true); return; }
    api.get("/onboarding/morning").then(r => setData(r.data)).catch(() => {});
  }, []);

  const dismiss = () => {
    localStorage.setItem("cellier_checklist_dismissed", new Date().toISOString().slice(0, 10));
    setDismissed(true);
  };

  if (dismissed || !data || data.tasks.length === 0) return null;

  return (
    <div className="card-crm p-6 border-l-4 border-l-[#C78B3A] relative" data-testid="morning-checklist">
      <button
        onClick={dismiss}
        aria-label="Masquer la check-list du matin"
        className="absolute top-2 right-2 text-stone-400 hover:text-stone-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
        data-testid="dismiss-checklist"
      >
        <X size={16} aria-hidden="true" />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <Sunrise size={20} className="text-[#C78B3A]" />
        <div>
          <p className="overline">Ta journée</p>
          <h2 className="font-display text-xl">Priorités du jour</h2>
        </div>
      </div>
      <div className="space-y-2 mt-4">
        {data.tasks.map((t, i) => (
          <Link key={i} to={t.action_path} className="flex items-center gap-3 p-3 rounded-lg bg-stone-50 hover:bg-white hover:border hover:border-[#4A154B] transition border border-transparent" data-testid={`task-${i}`}>
            <span className="text-2xl">{t.icon}</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{t.title}</div>
              <span className="text-xs uppercase tracking-widest font-medium" style={{ color: PRIO_COLOR[t.priority] }}>{t.priority}</span>
            </div>
            <ChevronRight size={16} className="text-stone-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}

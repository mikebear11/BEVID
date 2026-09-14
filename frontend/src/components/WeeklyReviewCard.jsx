import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CalendarCheck2, Loader2, Save } from "lucide-react";

/**
 * Revue hebdo composée — affichée en haut de /tournee le lundi.
 * Compose auto depuis les KPIs de la semaine passée. L'utilisateur remplit
 * uniquement 2 champs libres : "notes" (bloc-notes) et "focus_next" (semaine à venir).
 */
export default function WeeklyReviewCard() {
  const [rev, setRev] = useState(null);
  const [notes, setNotes] = useState("");
  const [focusNext, setFocusNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Uniquement le lundi (jour 1 en France : Monday=1). Approximation locale.
  const isMonday = new Date().getDay() === 1;

  useEffect(() => {
    if (!isMonday) return;
    let mounted = true;
    api.get("/weekly-review/me").then(r => {
      if (!mounted) return;
      setRev(r.data);
      setNotes(r.data?.notes || "");
      setFocusNext(r.data?.focus_next || "");
    }).catch(() => {});
    return () => { mounted = false; };
  }, [isMonday]);

  const save = async () => {
    if (!rev) return;
    setSaving(true);
    try {
      const { data } = await api.patch(`/weekly-review/${rev.id}`, { notes, focus_next: focusNext });
      setRev(data);
      toast.success("Revue enregistrée");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enregistrement impossible");
    } finally { setSaving(false); }
  };

  if (!isMonday || !rev) return null;
  const k = rev.auto?.kpis || {};

  return (
    <section className="card-crm p-4 border-l-4 border-[#B076B4]" data-testid="weekly-review-card">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <CalendarCheck2 size={16} className="text-[#4A154B]" aria-hidden="true" />
          <h2 className="font-display text-lg">Revue de la semaine passée</h2>
          <span className="text-xs text-stone-500">· {rev.auto?.range?.start} → {rev.auto?.range?.end}</span>
        </div>
        <button onClick={() => setCollapsed(v => !v)} className="text-xs text-stone-500 hover:underline min-h-[44px] min-w-[44px] px-2" data-testid="weekly-toggle">
          {collapsed ? "Ouvrir" : "Réduire"}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: "Visites", value: k.visits || 0 },
              { label: "Commandes", value: k.orders || 0 },
              { label: "Mentions", value: k.mentions || 0 },
              { label: "Engagements", value: k.engagements_open || 0 },
            ].map(m => (
              <div key={m.label} className="bg-stone-50 dark:bg-stone-800 rounded-lg p-2 text-center" data-testid={`weekly-kpi-${m.label.toLowerCase()}`}>
                <div className="text-2xl font-display">{m.value}</div>
                <div className="text-xs text-stone-500 uppercase tracking-wide">{m.label}</div>
              </div>
            ))}
          </div>
          <label className="block text-xs text-stone-500 mb-2">
            Bloc-notes
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Ce qui a marqué ma semaine…"
              className="input-crm text-sm w-full mt-1" data-testid="weekly-notes" />
          </label>
          <label className="block text-xs text-stone-500 mb-2">
            Focus semaine prochaine
            <textarea value={focusNext} onChange={e => setFocusNext(e.target.value)} rows={2}
              placeholder="Mon objectif d'attention pour la semaine à venir…"
              className="input-crm text-sm w-full mt-1" data-testid="weekly-focus" />
          </label>
          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="btn-primary text-sm min-h-[44px] px-4 flex items-center gap-1" data-testid="weekly-save">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Enregistrer
            </button>
          </div>
        </>
      )}
    </section>
  );
}

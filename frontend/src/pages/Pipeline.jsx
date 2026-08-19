import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { t } from "@/lib/i18n";

const COLS = [
  { key: "prospect", label: "Prospects", color: "#C78B3A" },
  { key: "actif", label: "Actifs", color: "#2D5A4C" },
  { key: "vip", label: "VIP", color: "#4A154B" },
  { key: "inactif", label: "Inactifs", color: "#8A8A8A" },
];

export default function Pipeline() {
  const [clients, setClients] = useState([]);
  const [dragId, setDragId] = useState(null);

  const load = async () => { const { data } = await api.get("/clients"); setClients(data); };
  useEffect(() => { load(); }, []);

  const onDrop = async (status) => {
    if (!dragId) return;
    const client = clients.find(c => c.id === dragId);
    if (!client || client.status === status) { setDragId(null); return; }
    // optimistic
    setClients(cs => cs.map(c => c.id === dragId ? { ...c, status } : c));
    setDragId(null);
    try {
      await api.put(`/clients/${dragId}/status`, { status });
      toast.success(t("toast.v1_v2", { v1: client.name, v2: status }));
    } catch { toast.error(t("toast.erreur")); load(); }
  };

  return (
    <div className="space-y-6" data-testid="pipeline-page">
      <div><p className="overline">Pipeline commercial</p><h1 className="font-display text-4xl">Kanban Prospects</h1><p className="text-sm text-stone-500 mt-1">Glissez-déposez pour changer le statut</p></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {COLS.map(col => {
          const items = clients.filter(c => c.status === col.key);
          return (
            <div key={col.key}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(col.key)}
              className="bg-white/60 rounded-xl border border-stone-200 p-3 min-h-[400px]"
              data-testid={`col-${col.key}`}>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-200" style={{ borderColor: col.color + "40" }}>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: col.color }} /><span className="overline">{col.label}</span></div>
                <span className="text-xs text-stone-500">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(c => (
                  <div key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`bg-white border border-stone-200 rounded-lg p-3 cursor-move hover:border-[#4A154B] transition-colors ${dragId === c.id ? 'opacity-50' : ''}`}
                    data-testid={`card-${c.id}`}>
                    <Link to={`/clients/${c.id}`} className="block">
                      <div className="font-medium text-sm text-stone-800">{c.name}</div>
                      <div className="text-xs text-stone-500 mt-1 capitalize">{c.type} · {c.city || "—"}</div>
                    </Link>
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-stone-400 text-center py-6">Déposer ici</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

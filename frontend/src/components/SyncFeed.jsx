import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CloudDownload, AlertTriangle, ShoppingCart, ClipboardCheck, X, Wrench } from "lucide-react";
import { toast } from "sonner";
import ConflictPlaybookModal from "./ConflictPlaybookModal";
import { t } from "@/lib/i18n";

/**
 * Feed en-tête du dashboard : visites & commandes qui viennent d'arriver
 * depuis un mobile terrain (marquées par client_uuid). Fenêtre par défaut : 60 min.
 * Rafraîchi toutes les 30s.
 */
export default function SyncFeed() {
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playbookId, setPlaybookId] = useState(null);

  const load = async () => {
    try { const { data } = await api.get("/dashboard/sync-feed?minutes=60"); setFeed(data); }
    catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []);

  const dismiss = async (cid) => {
    await api.post(`/conflicts/${cid}/dismiss`);
    toast.success(t("toast.conflit_ecarte"));
    load();
  };

  if (loading || !feed) return null;
  const nothing = feed.visits.length === 0 && feed.orders.length === 0 && feed.conflicts.length === 0;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5" data-testid="sync-feed">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2"><CloudDownload size={16} className="text-emerald-600" /> Sync feed <span className="text-xs text-stone-500 font-normal">(60 min)</span></h3>
        <span className="text-[10px] uppercase tracking-widest text-stone-500">{feed.visits.length + feed.orders.length} arrivée(s)</span>
      </div>

      {/* Conflits en tête */}
      {feed.conflicts.length > 0 && (
        <div className="space-y-2 mb-3">
          {feed.conflicts.filter(c => !c.resolved_at).map(c => (
            <div key={c.id} className="p-2.5 rounded-lg bg-red-50 border border-red-200" data-testid={`conflict-${c.id}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-red-900">Conflit resync — {c.kind}</p>
                  <p className="text-xs text-red-800">{c.reason}</p>
                  {c.extra?.client_name && <p className="text-[10px] text-red-700 mt-0.5">Client : {c.extra.client_name}</p>}
                </div>
                <button onClick={() => dismiss(c.id)} className="text-red-700 hover:text-red-900 min-w-[36px] min-h-[36px] flex items-center justify-center" title="Écarter" data-testid={`dismiss-conflict-${c.id}`}><X size={14} /></button>
              </div>
              {c.kind === "order" && (
                <div className="mt-2 ml-6">
                  <button
                    onClick={() => setPlaybookId(c.id)}
                    className="bg-red-700 hover:bg-red-800 text-white text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 min-h-[36px]"
                    data-testid={`playbook-open-${c.id}`}>
                    <Wrench size={12} /> Rembourser + prévenir client
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {nothing ? (
        <p className="text-xs text-stone-500">Aucune mutation reçue du terrain sur la dernière heure.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {feed.orders.map(o => (
            <div key={o.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-stone-50" data-testid={`sync-order-${o.id}`}>
              <ShoppingCart size={14} className="text-[#4A154B]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate"><span className="font-medium">{o.client_name}</span> · {o.total?.toFixed(2)} €{o.has_signature && <span className="ml-1 text-emerald-600 text-[10px]">signé ✓</span>}</p>
                <p className="text-[10px] text-stone-500">{o.created_at?.slice(11, 16)}</p>
              </div>
            </div>
          ))}
          {feed.visits.map(v => (
            <div key={v.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-stone-50" data-testid={`sync-visit-${v.id}`}>
              <ClipboardCheck size={14} className="text-[#5C8A6A]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate"><span className="font-medium">{v.client_name}</span> · {v.mood} → {v.next_action}</p>
                <p className="text-[10px] text-stone-500">{v.created_at?.slice(11, 16)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {playbookId && (
        <ConflictPlaybookModal
          conflictId={playbookId}
          onClose={() => setPlaybookId(null)}
          onResolved={load}
        />
      )}
    </div>
  );
}

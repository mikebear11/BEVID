import React, { useEffect, useRef, useState } from "react";
import { History, Loader2, Check, ExternalLink, BellOff } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * Cloche d'historique des notifications push — distincte de NotificationBell
 * (qui affiche les alertes follow-ups/bad-payers). Ici on liste ce qui est
 * VRAIMENT parti (ou différé) en push, pour ne rien manquer quand le téléphone
 * a été silencié.
 *
 * Cloisonnement org côté backend (/api/notifications/history).
 */
function relTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const dt = Math.floor((Date.now() - t) / 1000);
  if (dt < 60) return "à l'instant";
  if (dt < 3600) return `il y a ${Math.floor(dt / 60)} min`;
  if (dt < 86400) return `il y a ${Math.floor(dt / 3600)} h`;
  if (dt < 7 * 86400) return `il y a ${Math.floor(dt / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

const KIND_LABEL = {
  mention: "Mention",
  approval_reminder: "Rappel validation",
  digest_morning: "Résumé du matin",
  digest_afternoon: "Résumé de l'après-midi",
  test: "Test",
  test_from_manager: "Test manager",
};

export default function PushHistoryBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const iv = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications/history?limit=30");
      setItems(data.items || []);
      setUnread(data.unread_count || 0);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    iv.current = setInterval(load, 60000);
    return () => clearInterval(iv.current);
  }, []);

  const markAll = async () => {
    try {
      const { data } = await api.post("/notifications/mark-all-read");
      if (data.marked > 0) toast.success(`${data.marked} notification(s) marquée(s) comme lues`);
      load();
    } catch { /* noop */ }
  };

  const markOne = async (id) => {
    try { await api.post(`/notifications/${id}/mark-read`); load(); } catch {}
  };

  return (
    <div className="relative" data-testid="push-history-bell">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={unread > 0 ? `Historique notifications, ${unread} non lus` : "Historique notifications"}
        aria-expanded={open ? "true" : "false"}
        className="relative min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500 hover:text-[#4A154B] dark:text-stone-400"
        data-testid="push-history-btn"
      >
        <History size={18} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 bg-[#4A154B] text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-medium" data-testid="push-history-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Historique notifications"
            className="absolute right-0 top-full mt-2 z-50 w-80 md:w-96 max-h-[70vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg"
            data-testid="push-history-panel"
          >
            <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base">Historique notifications</h2>
                <p className="text-[11px] text-stone-500 mt-0.5">Ce qui vous a été envoyé (30 derniers)</p>
              </div>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-[#4A154B] hover:underline min-h-[32px]" data-testid="push-history-mark-all">
                  Tout marquer lu
                </button>
              )}
            </div>
            {loading && <div className="p-6 text-center"><Loader2 size={16} className="mx-auto animate-spin text-stone-400" aria-hidden="true" /></div>}
            {!loading && items.length === 0 && (
              <div className="p-6 text-center">
                <BellOff size={22} className="mx-auto text-stone-300 mb-2" aria-hidden="true" />
                <p className="text-sm text-stone-500">Aucune notification.</p>
                <p className="text-[11px] text-stone-400 mt-1">Les mentions et rappels apparaîtront ici.</p>
              </div>
            )}
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {items.map(n => {
                const isDeferred = n.status === "deferred";
                const isFailed = n.status === "failed";
                const isRead = !!n.read_at;
                const url = (n.payload || {}).url || "/";
                return (
                  <li key={n.id} data-testid={`push-item-${n.id}`}
                    className={`${isRead ? "opacity-60" : ""}`}>
                    <Link
                      to={url}
                      onClick={() => { markOne(n.id); setOpen(false); }}
                      className="block px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[#4A154B] dark:text-[#B076B4]">
                          {KIND_LABEL[n.kind] || n.kind}
                        </span>
                        <span className="text-[10px] text-stone-400">{relTime(n.created_at)}</span>
                      </div>
                      <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5 line-clamp-2">
                        {(n.payload || {}).body || (n.payload || {}).preview || (n.payload || {}).title || "(vide)"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {isDeferred && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Différée · plage silence</span>}
                        {isFailed && <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full">Envoi échoué</span>}
                        {n.push_result?.simulated && <span className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded-full">Simulée</span>}
                        {isRead && <Check size={10} className="text-stone-400" aria-label="Lue" />}
                        <ExternalLink size={10} className="text-stone-400 ml-auto" aria-hidden="true" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

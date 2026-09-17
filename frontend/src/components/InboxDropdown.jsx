import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Inbox, AtSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

/**
 * Boîte de réception dans la barre du haut. Compteur non-lus + liste des
 * mentions pending. Se rafraîchit toutes les 30 s tant qu'ouvert.
 * Cloisonnement org géré côté backend (/api/inbox).
 */
export default function InboxDropdown() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inbox");
      setItems(data.pending_mentions || []);
      setUnread(data.unread_count || 0);
    } catch { /* silencieux — pas de toast intrusif dans la barre du haut */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, []);

  const markRead = async (msgId) => {
    try { await api.post(`/messages/${msgId}/mark-read`); load(); } catch { toast.error(t("toast.erreur")); }
  };

  return (
    <div className="relative" data-testid="inbox-dropdown">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={unread > 0 ? `Boîte de réception, ${unread} non lus` : "Boîte de réception"}
        aria-expanded={open ? "true" : "false"}
        className="relative min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500 hover:text-[#4A154B] dark:text-stone-400"
        data-testid="inbox-btn"
      >
        <Inbox size={18} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 bg-red-600 text-white text-xs rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-medium" data-testid="inbox-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Boîte de réception"
            className="absolute right-0 top-full mt-2 z-50 w-80 md:w-96 max-h-[70vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg"
            data-testid="inbox-panel"
          >
            <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700">
              <h2 className="font-display text-base">Boîte de réception</h2>
              <p className="text-xs text-stone-500 mt-0.5">Mentions et engagements datés</p>
            </div>
            {loading && <div className="p-6 text-center"><Loader2 size={16} className="mx-auto animate-spin text-stone-400" aria-hidden="true" /></div>}
            {!loading && items.length === 0 && (
              <div className="p-6 text-center">
                <AtSign size={22} className="mx-auto text-stone-300 mb-2" aria-hidden="true" />
                <p className="text-sm text-stone-500">Aucune mention en attente.</p>
              </div>
            )}
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {items.map(a => (
                <li key={a.id} data-testid={`inbox-item-${a.id}`}>
                  <Link
                    to={a.object_type === "establishment" ? `/clients/${a.object_id}` : "/"}
                    onClick={() => { markRead(a.message_id); setOpen(false); }}
                    className="block px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#4A154B] dark:text-[#B076B4]">@ {a.author_name}</span>
                      {a.due_date && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">⏱ {a.due_date}</span>}
                    </div>
                    <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5 line-clamp-2">{a.preview || "(message)"}</p>
                    {a.object_type === "establishment" && (
                      <p className="text-xs text-stone-500 mt-1">
                        Fiche : {a.preview_object_name || a.object_id?.slice(0, 8)}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

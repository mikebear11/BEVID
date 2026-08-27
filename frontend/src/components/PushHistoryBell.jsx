import React, { useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, Check, ExternalLink, BellOff, Moon, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * Cloche d'historique des notifications push — filtres par catégorie + DND.
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

// Filtres → mapping backend `kind` (liste CSV)
const FILTERS = [
  { key: "all",       label: "Tous",     kinds: null },
  { key: "mentions",  label: "Mentions", kinds: "mention" },
  { key: "reminders", label: "Rappels",  kinds: "approval_reminder" },
  { key: "digests",   label: "Résumés",  kinds: "digest_morning,digest_afternoon" },
  { key: "tests",     label: "Tests",    kinds: "test,test_from_manager" },
];

/** Calcule l'ISO UTC de « demain 8h Paris » depuis maintenant. */
function tomorrow8amParisISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

/** Calcule l'ISO UTC du « prochain lundi 8h Paris ». Si on est déjà lundi avant 8h, cible ce lundi. */
function nextMonday8amISO() {
  const d = new Date();
  const day = d.getDay(); // 0=dim, 1=lun, ..., 6=sam
  let daysToAdd;
  if (day === 1 && d.getHours() < 8) daysToAdd = 0;
  else daysToAdd = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysToAdd);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

// Presets DND — ordre d'affichage
const DND_PRESETS = [
  { key: "1h",     label: "1 h",             build: () => ({ hours: 1 }) },
  { key: "4h",     label: "4 h",             build: () => ({ hours: 4 }) },
  { key: "tmr",    label: "Demain 8 h",      build: () => ({ until: tomorrow8amParisISO() }) },
  { key: "mon",    label: "Lundi 8 h",       build: () => ({ until: nextMonday8amISO() }) },
];

export default function PushHistoryBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [dndUntil, setDndUntil] = useState(null);
  const [dndBusy, setDndBusy] = useState(false);
  const iv = useRef(null);

  const load = async (currentFilter = filter) => {
    setLoading(true);
    try {
      const f = FILTERS.find(x => x.key === currentFilter);
      const params = new URLSearchParams({ limit: "30" });
      if (f?.kinds) params.set("kind", f.kinds);
      const { data } = await api.get(`/notifications/history?${params.toString()}`);
      setItems(data.items || []);
      setUnread(data.unread_count || 0);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  };

  // Charge aussi les prefs pour connaître un éventuel DND en cours
  const loadDnd = async () => {
    try {
      const { data } = await api.get("/notifications/preferences");
      setDndUntil(data.dnd_until || null);
    } catch { setDndUntil(null); }
  };

  useEffect(() => {
    load(); loadDnd();
    iv.current = setInterval(() => { load(); loadDnd(); }, 60000);
    return () => clearInterval(iv.current);
  }, []); // eslint-disable-line

  useEffect(() => { load(filter); }, [filter]); // eslint-disable-line

  const markAll = async () => {
    try {
      const { data } = await api.post("/notifications/mark-all-read");
      if (data.marked > 0) toast.success(`${data.marked} notification(s) marquée(s) comme lues`);
      load(filter);
    } catch { /* noop */ }
  };

  const markOne = async (id) => {
    try { await api.post(`/notifications/${id}/mark-read`); load(filter); } catch {}
  };

  const enableDnd = async (preset) => {
    setDndBusy(true);
    try {
      const body = preset ? preset.build() : { until: tomorrow8amParisISO() };
      const { data } = await api.post("/notifications/dnd", body);
      setDndUntil(data.dnd_until);
      toast.success(`Ne pas déranger · ${preset?.label || "Demain 8 h"}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Impossible d'activer");
    } finally { setDndBusy(false); }
  };

  const clearDnd = async () => {
    setDndBusy(true);
    try {
      await api.delete("/notifications/dnd");
      setDndUntil(null);
      toast.success("« Ne pas déranger » désactivé");
    } catch { toast.error("Désactivation impossible"); }
    finally { setDndBusy(false); }
  };

  const dndActive = useMemo(() => {
    if (!dndUntil) return false;
    try { return new Date(dndUntil).getTime() > Date.now(); } catch { return false; }
  }, [dndUntil]);

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
        {dndActive && (
          <Moon size={9} className="absolute bottom-1 right-1 text-indigo-500" aria-label="Ne pas déranger actif" />
        )}
        {unread > 0 && !dndActive && (
          <span className="absolute top-1 right-1 bg-[#4A154B] text-white text-xs rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-medium" data-testid="push-history-badge">
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
            className="absolute right-0 top-full mt-2 z-50 w-80 md:w-96 max-h-[80vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg"
            data-testid="push-history-panel"
          >
            <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base">Historique notifications</h2>
                <p className="text-xs text-stone-500 mt-0.5">Ce qui vous a été envoyé (30 derniers)</p>
              </div>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-[#4A154B] hover:underline min-h-[32px]" data-testid="push-history-mark-all">
                  Tout marquer lu
                </button>
              )}
            </div>

            {/* DND banner */}
            {dndActive ? (
              <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-800 flex items-center gap-2" data-testid="dnd-active-banner">
                <Moon size={13} className="text-indigo-600 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200">Ne pas déranger actif</p>
                  <p className="text-xs text-indigo-700 dark:text-indigo-300">jusqu'au {new Date(dndUntil).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p>
                </div>
                <button onClick={clearDnd} disabled={dndBusy}
                  className="text-indigo-600 hover:text-indigo-900 min-h-[32px] min-w-[32px] flex items-center justify-center"
                  aria-label="Désactiver DND" data-testid="dnd-clear-btn">
                  {dndBusy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} aria-hidden="true" />}
                </button>
              </div>
            ) : (
              <div className="px-4 py-2 border-b border-stone-200 dark:border-stone-700" data-testid="dnd-presets-row">
                <div className="flex items-center gap-2 mb-1.5">
                  <Moon size={12} className="text-stone-500" aria-hidden="true" />
                  <span className="text-xs text-stone-500 font-medium">Ne pas déranger</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {DND_PRESETS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => enableDnd(p)}
                      disabled={dndBusy}
                      className="min-h-[28px] px-2.5 text-xs rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 hover:text-indigo-900 dark:hover:text-indigo-300 transition-colors"
                      data-testid={`dnd-preset-${p.key}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filter chips */}
            <div className="px-4 py-2 border-b border-stone-200 dark:border-stone-700 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtres de catégorie">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  role="tab"
                  aria-selected={filter === f.key}
                  className={`shrink-0 min-h-[28px] px-2.5 text-xs rounded-full transition-colors ${
                    filter === f.key
                      ? "bg-[#4A154B] text-white"
                      : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200"
                  }`}
                  data-testid={`push-filter-${f.key}`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loading && <div className="p-6 text-center"><Loader2 size={16} className="mx-auto animate-spin text-stone-400" aria-hidden="true" /></div>}
            {!loading && items.length === 0 && (
              <div className="p-6 text-center">
                <BellOff size={22} className="mx-auto text-stone-300 mb-2" aria-hidden="true" />
                <p className="text-sm text-stone-500">
                  {filter === "all" ? "Aucune notification." : "Aucune notification dans cette catégorie."}
                </p>
                <p className="text-xs text-stone-400 mt-1">Les mentions et rappels apparaîtront ici.</p>
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
                        <span className="text-xs text-stone-400">{relTime(n.created_at)}</span>
                      </div>
                      <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5 line-clamp-2">
                        {(n.payload || {}).body || (n.payload || {}).preview || (n.payload || {}).title || "(vide)"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {isDeferred && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Différée · plage silence</span>}
                        {isFailed && <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full">Envoi échoué</span>}
                        {n.push_result?.simulated && <span className="text-xs bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded-full">Simulée</span>}
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

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { usePageMeta } from "@/lib/pageMeta";
import {
  Users, ChevronRight, ArrowRightLeft, RefreshCcw, Loader2,
  AlertTriangle, TrendingDown, Sparkles,
} from "lucide-react";

/**
 * Vue Portefeuilles commerciaux — Manager & Gérant uniquement.
 * - Heatmap de charge (rouge=surchargé, ambre=au-dessus, vert=OK, bleu=capacité)
 * - Suggestions de rééquilibrage en 1 clic
 * - Réattribution en masse manuelle (multi-sélection + dropdown cible)
 */
function loadColor(score, wl) {
  if (!wl || wl.median === 0) return { bg: "bg-stone-50 dark:bg-stone-800", ring: "border-stone-200 dark:border-stone-700", label: "" };
  if (score > wl.overload_threshold) return { bg: "bg-red-50 dark:bg-red-950/40", ring: "border-red-300 dark:border-red-800", label: "surchargé" };
  if (score > wl.median) return { bg: "bg-amber-50 dark:bg-amber-950/40", ring: "border-amber-300 dark:border-amber-800", label: "au-dessus" };
  if (score < wl.underload_threshold) return { bg: "bg-sky-50 dark:bg-sky-950/40", ring: "border-sky-300 dark:border-sky-800", label: "capacité disponible" };
  return { bg: "bg-emerald-50 dark:bg-emerald-950/40", ring: "border-emerald-200 dark:border-emerald-800", label: "équilibré" };
}

export default function Portefeuilles() {
  usePageMeta({ title: "Portefeuilles · BEVID" });
  const { user } = useAuth();
  const isMgr = user?.role === "manager" || user?.role === "gerant" || user?.role === "owner";

  const [data, setData] = useState(null);
  const [unassigned, setUnassigned] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [applyingSug, setApplyingSug] = useState(null);

  const load = async () => {
    try {
      const [p, u] = await Promise.all([
        api.get("/portfolios"),
        api.get("/portfolios/unassigned"),
      ]);
      setData(p.data);
      setUnassigned(u.data.clients || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Chargement impossible");
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const openDetail = async (uid) => {
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/portfolios/user/${uid}`);
      setDetail(data);
    } catch { toast.error("Détail indisponible"); }
    finally { setLoadingDetail(false); }
  };

  const reassign = async () => {
    if (!target) { toast.error("Choisissez un commercial cible"); return; }
    if (selected.size === 0) { toast.error("Sélectionnez au moins un client"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/portfolios/reassign", {
        client_ids: Array.from(selected),
        to_user_id: target,
      });
      toast.success(`${data.reassigned} client(s) réattribué(s) à ${data.to?.name || "—"}`);
      setSelected(new Set());
      setTarget("");
      load();
      if (detail) openDetail(detail.user.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Réattribution impossible");
    } finally { setBusy(false); }
  };

  const applySuggestion = async (s, idx) => {
    setApplyingSug(idx);
    try {
      const { data } = await api.post("/portfolios/apply-suggestion", {
        from_user_id: s.from_user_id, to_user_id: s.to_user_id, move_count: s.move_count,
      });
      toast.success(`${data.reassigned} client(s) déplacé(s) vers ${data.to?.name || "—"}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Application impossible");
    } finally { setApplyingSug(null); }
  };

  const maxScore = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...(data.portfolios || []).map(p => p.workload_score || 0));
  }, [data]);

  if (!isMgr) {
    return <div className="text-stone-500 text-sm p-4" data-testid="portefeuilles-forbidden">
      Réservé aux managers, gérants et owners.
    </div>;
  }
  if (!data) return <div className="text-stone-500 text-sm p-4" data-testid="portefeuilles-loading">Chargement…</div>;

  const commercials = (data.portfolios || []).filter(p => p.user.role === "commercial");
  const managers = (data.portfolios || []).filter(p => p.user.role !== "commercial");
  const wl = data.workload || {};

  return (
    <div className="space-y-6" data-testid="portefeuilles-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="overline">Vue équipe</p>
          <h1 className="font-display text-4xl">Portefeuilles</h1>
        </div>
        <button onClick={load} className="btn-ghost text-sm flex items-center gap-2 min-h-[36px]" data-testid="portfolios-refresh" aria-label="Rafraîchir">
          <RefreshCcw size={14} /> Rafraîchir
        </button>
      </div>

      {/* Bandeau charge d'équipe */}
      {commercials.length >= 2 && wl.median > 0 && (
        <section className="card-crm p-4" data-testid="workload-summary">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={16} className="text-[#4A154B]" aria-hidden="true" />
            <h2 className="font-display text-lg">Charge d'équipe</h2>
            <span className="text-xs text-stone-500">
              · médiane {wl.median} client{wl.median > 1 ? "s" : ""} · seuil surcharge {Math.round(wl.overload_threshold)}
            </span>
          </div>
          {(wl.suggestions || []).length === 0 ? (
            <p className="text-sm text-stone-500">Portefeuilles équilibrés. Aucune suggestion.</p>
          ) : (
            <ul className="space-y-2" data-testid="workload-suggestions">
              {(wl.suggestions || []).map((s, i) => (
                <li key={`${s.from_user_name}-${s.to_user_name}`} className="flex items-center justify-between gap-3 p-3 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 rounded-lg" data-testid={`suggestion-${i}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Sparkles size={14} className="text-amber-700 dark:text-amber-400" aria-hidden="true" />
                      <span className="text-sm font-medium">
                        Déplacer {s.move_count} client{s.move_count > 1 ? "s" : ""} de <b>{s.from_user_name}</b> vers <b>{s.to_user_name}</b>
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">{s.reason}</p>
                  </div>
                  <button
                    onClick={() => applySuggestion(s, i)}
                    disabled={applyingSug === i}
                    className="btn-primary text-sm min-h-[36px] px-3 flex items-center gap-1 shrink-0"
                    data-testid={`apply-suggestion-${i}`}
                  >
                    {applyingSug === i ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                    Appliquer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Heatmap commerciaux */}
      <section className="card-crm p-4" data-testid="portfolios-list">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-[#4A154B]" aria-hidden="true" />
          <h2 className="font-display text-lg">Commerciaux ({commercials.length})</h2>
          <div className="ml-auto flex items-center gap-3 text-xs text-stone-500" aria-label="Légende heatmap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-300" aria-hidden="true" />Capacité</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300" aria-hidden="true" />Équilibré</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300" aria-hidden="true" />Au-dessus</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" aria-hidden="true" />Surchargé</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {commercials.map(p => {
            const c = loadColor(p.workload_score || 0, wl);
            const width = maxScore ? Math.max(4, Math.round((p.workload_score / maxScore) * 100)) : 0;
            const isOverloaded = wl.overloaded_ids?.includes(p.user.id);
            return (
              <button
                key={p.user.id}
                onClick={() => openDetail(p.user.id)}
                className={`border ${c.ring} ${c.bg} rounded-lg p-3 text-left hover:opacity-90 min-h-[76px] transition-colors`}
                data-testid={`portfolio-user-${p.user.id}`}
                aria-label={`Portefeuille de ${p.user.name}, ${p.clients_count} clients, ${c.label}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate flex items-center gap-1">
                      {isOverloaded && <AlertTriangle size={12} className="text-red-600 shrink-0" aria-hidden="true" />}
                      {p.user.display_name || p.user.name || p.user.email}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {p.clients_count} client{p.clients_count > 1 ? "s" : ""} · {p.orders_last_30d} commande{p.orders_last_30d > 1 ? "s" : ""} 30j
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-stone-400 shrink-0" aria-hidden="true" />
                </div>
                {/* Barre de charge */}
                <div className="mt-2 h-1.5 bg-white/60 dark:bg-black/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      c.label === "surchargé" ? "bg-red-500" :
                      c.label === "au-dessus" ? "bg-amber-500" :
                      c.label === "capacité disponible" ? "bg-sky-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${width}%` }}
                    aria-hidden="true"
                    data-testid={`workload-bar-${p.user.id}`}
                  />
                </div>
                {c.label && <p className="text-xs text-stone-500 mt-1 capitalize">{c.label}</p>}
              </button>
            );
          })}
          {commercials.length === 0 && <p className="text-sm text-stone-500">Aucun commercial actif.</p>}
        </div>
        {managers.length > 0 && (
          <>
            <div className="mt-4 mb-2 text-xs text-stone-500 uppercase tracking-wide">Managers &amp; gérants</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {managers.map(p => (
                <div key={p.user.id} className="border border-stone-200 dark:border-stone-700 rounded-lg p-3 text-sm">
                  <p className="font-medium">{p.user.display_name || p.user.name}</p>
                  <p className="text-xs text-stone-500">{p.clients_count} client(s)</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* File non attribués */}
      <section className="card-crm p-4" data-testid="unassigned-list">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg">Clients non attribués ({unassigned.length})</h2>
          {selected.size > 0 && (
            <div className="flex items-center gap-2" data-testid="reassign-bar">
              <select
                value={target}
                onChange={e => setTarget(e.target.value)}
                className="input-crm text-sm min-h-[36px]"
                data-testid="reassign-target"
              >
                <option value="">— Cible —</option>
                {(data.portfolios || []).map(p => (
                  <option key={p.user.id} value={p.user.id}>
                    {p.user.display_name || p.user.name}
                  </option>
                ))}
              </select>
              <button
                onClick={reassign}
                disabled={busy || !target}
                className="btn-primary text-sm min-h-[36px] px-3 flex items-center gap-1"
                data-testid="reassign-submit"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                Attribuer ({selected.size})
              </button>
            </div>
          )}
        </div>
        {unassigned.length === 0 ? (
          <p className="text-sm text-stone-500">Aucun client en attente d'attribution.</p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {unassigned.map(c => (
              <li key={c.id} className="py-2 flex items-center gap-3" data-testid={`unassigned-${c.id}`}>
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="min-w-[20px] min-h-[20px]"
                  aria-label={`Sélectionner ${c.name}`}
                  data-testid={`unassigned-check-${c.id}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-stone-500">{c.city || "—"} · {c.type || "—"}</p>
                </div>
                <Link to={`/etab/${c.id}`} className="text-xs text-[#4A154B] hover:underline shrink-0" data-testid={`unassigned-open-${c.id}`}>
                  Ouvrir
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Détail */}
      {detail && (
        <section className="card-crm p-4" data-testid="portfolio-detail">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg">
              Portefeuille de {detail.user.display_name || detail.user.name}
              <span className="ml-2 text-xs text-stone-500">({detail.clients.length})</span>
            </h2>
            <button onClick={() => setDetail(null)} className="text-xs text-stone-500 hover:underline min-h-[32px]" data-testid="close-detail">Fermer</button>
          </div>
          {loadingDetail ? <p className="text-sm text-stone-500">Chargement…</p> : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800 max-h-96 overflow-y-auto">
              {detail.clients.map(c => (
                <li key={c.id} className="py-2 flex items-center gap-3" data-testid={`detail-client-${c.id}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="min-w-[20px] min-h-[20px]"
                    aria-label={`Sélectionner ${c.name}`}
                    data-testid={`detail-check-${c.id}`}
                  />
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: c.credit_status === "rouge" ? "#8C2A2A"
                        : c.credit_status === "orange" ? "#C78B3A" : "#2D5A4C",
                    }}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-stone-500">{c.city || "—"}</p>
                  </div>
                  <Link to={`/etab/${c.id}`} className="text-xs text-[#4A154B] hover:underline shrink-0">Ouvrir</Link>
                </li>
              ))}
              {detail.clients.length === 0 && <li className="text-sm text-stone-500 py-2">Aucun client attribué.</li>}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

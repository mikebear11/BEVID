import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { usePageMeta } from "@/lib/pageMeta";
import { Users, ChevronRight, ArrowRightLeft, RefreshCcw, Loader2 } from "lucide-react";

/**
 * Vue Portefeuilles commerciaux — Manager & Gérant uniquement.
 * - Liste par commercial (nb clients, commandes 30j)
 * - File "clients non attribués" avec assignation rapide
 * - Réattribution en masse (multi-sélection + dropdown cible)
 */
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

  if (!isMgr) {
    return <div className="text-stone-500 text-sm p-4" data-testid="portefeuilles-forbidden">
      Réservé aux managers, gérants et owners.
    </div>;
  }
  if (!data) return <div className="text-stone-500 text-sm p-4" data-testid="portefeuilles-loading">Chargement…</div>;

  const commercials = (data.portfolios || []).filter(p => p.user.role === "commercial");
  const managers = (data.portfolios || []).filter(p => p.user.role !== "commercial");

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

      <section className="card-crm p-4" data-testid="portfolios-list">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-[#4A154B]" aria-hidden="true" />
          <h2 className="font-display text-lg">Commerciaux ({commercials.length})</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {commercials.map(p => (
            <button
              key={p.user.id}
              onClick={() => openDetail(p.user.id)}
              className="border border-stone-200 dark:border-stone-700 rounded-lg p-3 text-left hover:border-[#4A154B] min-h-[64px] flex items-center justify-between gap-2"
              data-testid={`portfolio-user-${p.user.id}`}
            >
              <div>
                <p className="font-medium text-sm">{p.user.display_name || p.user.name || p.user.email}</p>
                <p className="text-xs text-stone-500">
                  {p.clients_count} client{p.clients_count > 1 ? "s" : ""} · {p.orders_last_30d} commande{p.orders_last_30d > 1 ? "s" : ""} 30j
                </p>
              </div>
              <ChevronRight size={16} className="text-stone-400" aria-hidden="true" />
            </button>
          ))}
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

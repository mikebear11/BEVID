import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Shield, RefreshCw, Building2, TrendingUp, AlertCircle, Check, X, Clock } from "lucide-react";
import { usePageMeta } from "@/lib/pageMeta";

/**
 * Écran /admin/orgs — réservé au rôle produit `super_admin`.
 * Contenu : liste des organisations clientes (métadonnées uniquement) +
 * indicateurs produit + actions ciblées (exempter, prolonger essai).
 *
 * IMPORTANT : cet écran n'accède PAS aux données métier des orgs.
 * Le scoped_db du backend filtre par org_id. Les endpoints /api/admin/*
 * ne renvoient que des métadonnées.
 */
export default function AdminOrgs() {
  usePageMeta({ title: "Admin — Organisations · BEVID" });
  const { user } = useAuth();
  const [orgs, setOrgs] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState({});

  const load = async () => {
    const [{ data: o }, { data: k }] = await Promise.all([
      api.get("/admin/orgs"),
      api.get("/admin/kpis"),
    ]);
    setOrgs(o.orgs || []);
    setKpis(k);
  };
  useEffect(() => { load(); }, []);

  // Garde d'accès — si non-super_admin, renvoie ailleurs.
  if (user && !user.super_admin_role) {
    return <Navigate to="/" replace />;
  }

  const toggleExempt = async (org) => {
    const action = org.billing_exempt ? "retirer l'exemption" : "accorder l'exemption";
    if (!window.confirm(`Confirmer : ${action} pour "${org.name}" ?`)) return;
    setBusy(b => ({ ...b, [org.id]: true }));
    try {
      if (org.billing_exempt) {
        await api.delete(`/billing/exempt/${org.id}`);
        toast.success("Exemption retirée");
      } else {
        await api.post(`/billing/exempt/${org.id}`, { reason: "product_owner_grant" });
        toast.success("Exemption accordée");
      }
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Action refusée");
    } finally {
      setBusy(b => ({ ...b, [org.id]: false }));
    }
  };

  const extendTrial = async (org) => {
    const days = window.prompt(`Prolonger l'essai de "${org.name}" de combien de jours ?`, "14");
    if (!days) return;
    const n = parseInt(days, 10);
    if (!n || n < 1 || n > 365) { toast.error("Nombre de jours invalide (1-365)"); return; }
    setBusy(b => ({ ...b, [org.id]: true }));
    try {
      await api.post(`/admin/orgs/${org.id}/extend-trial`, { days: n });
      toast.success(`Essai prolongé de ${n} jours`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossible de prolonger l'essai");
    } finally {
      setBusy(b => ({ ...b, [org.id]: false }));
    }
  };

  if (!orgs || !kpis) return <div className="p-6 text-stone-500">Chargement…</div>;

  const filtered = filter === "all" ? orgs
    : filter === "trial" ? orgs.filter(o => o.effective_status === "trial")
    : filter === "active" ? orgs.filter(o => o.effective_status === "active" && !o.billing_exempt)
    : filter === "exempt" ? orgs.filter(o => o.billing_exempt)
    : filter === "suspended" ? orgs.filter(o => ["suspended", "read_only", "past_due"].includes(o.effective_status))
    : orgs;

  const statusColor = (s) => ({
    active: "bg-emerald-100 text-emerald-800",
    trial: "bg-blue-100 text-blue-800",
    read_only: "bg-orange-100 text-orange-800",
    past_due: "bg-orange-100 text-orange-800",
    suspended: "bg-red-100 text-red-800",
  }[s] || "bg-stone-100 text-stone-700");

  return (
    <div className="space-y-6" data-testid="admin-orgs-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="overline flex items-center gap-2"><Shield size={14} aria-hidden="true"/> Administration produit</p>
          <h1 className="font-display text-4xl">Organisations clientes</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-2 max-w-2xl">
            Métadonnées uniquement — aucun accès aux clients, commandes ou contrats des organisations.
            Le scope <code>org_id</code> reste actif côté backend même pour ce compte.
          </p>
        </div>
        <button
          onClick={load}
          className="btn-ghost inline-flex items-center gap-2 min-h-[44px]"
          data-testid="admin-refresh-btn"
        >
          <RefreshCw size={14} aria-hidden="true"/> Recharger
        </button>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="admin-kpis">
        <KpiCard icon={<Building2 size={18}/>} label="Organisations" value={kpis.total_orgs} testid="kpi-total"/>
        <KpiCard icon={<Check size={18}/>} label="Actives (payantes)" value={kpis.active} testid="kpi-active"/>
        <KpiCard icon={<Clock size={18}/>} label="En essai" value={kpis.trial} testid="kpi-trial"/>
        <KpiCard icon={<Shield size={18}/>} label="Exemptées" value={kpis.exempt} testid="kpi-exempt"/>
      </section>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer">
        {["all", "trial", "active", "exempt", "suspended"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            role="tab"
            aria-selected={filter === f}
            data-testid={`filter-${f}`}
            className={`min-h-[44px] px-4 rounded-lg text-sm ${filter === f ? "bg-[#4A154B] text-white" : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"}`}
          >
            {f === "all" ? "Toutes" : f === "trial" ? "En essai" : f === "active" ? "Actives" : f === "exempt" ? "Exemptées" : "Suspendues"} ({
              f === "all" ? orgs.length
              : f === "trial" ? orgs.filter(o => o.effective_status === "trial").length
              : f === "active" ? orgs.filter(o => o.effective_status === "active" && !o.billing_exempt).length
              : f === "exempt" ? orgs.filter(o => o.billing_exempt).length
              : orgs.filter(o => ["suspended", "read_only", "past_due"].includes(o.effective_status)).length
            })
          </button>
        ))}
      </div>

      <div className="card-crm overflow-x-auto" data-testid="admin-orgs-table-wrap">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-stone-50 dark:bg-stone-900 text-left text-xs uppercase tracking-wider text-stone-500">
            <tr>
              <th className="p-3">Organisation</th>
              <th className="p-3">Forfait</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Sièges</th>
              <th className="p-3">Créée</th>
              <th className="p-3">Fin d'essai</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} className="border-t border-stone-100 dark:border-stone-800" data-testid={`admin-org-row-${o.id}`}>
                <td className="p-3">
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs text-stone-500 font-mono">{o.id.slice(0, 8)}</div>
                </td>
                <td className="p-3 capitalize">{o.plan || "—"}</td>
                <td className="p-3">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${statusColor(o.effective_status)}`}>
                    {o.effective_status}
                  </span>
                  {o.billing_exempt && (
                    <span className="ml-1 inline-flex items-center px-2 py-1 rounded text-xs bg-purple-100 text-purple-800" title={o.billing_exempt_reason || "exemptée"}>
                      exemptée
                    </span>
                  )}
                </td>
                <td className="p-3">{o.seats_active ?? "—"}</td>
                <td className="p-3 text-xs text-stone-500">
                  {o.created_at ? new Date(o.created_at).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="p-3 text-xs text-stone-500">
                  {o.trial_ends_at ? new Date(o.trial_ends_at).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="p-3 text-right whitespace-nowrap space-x-1">
                  <button
                    onClick={() => toggleExempt(o)}
                    disabled={!!busy[o.id]}
                    className="btn-ghost text-xs min-h-[36px] px-2"
                    title={o.billing_exempt ? "Retirer l'exemption" : "Accorder l'exemption"}
                    data-testid={`toggle-exempt-${o.id}`}
                  >
                    {o.billing_exempt ? <X size={14} aria-hidden="true"/> : <Shield size={14} aria-hidden="true"/>}
                    <span className="ml-1">{o.billing_exempt ? "Retirer" : "Exempter"}</span>
                  </button>
                  {o.effective_status === "trial" && !o.billing_exempt && (
                    <button
                      onClick={() => extendTrial(o)}
                      disabled={!!busy[o.id]}
                      className="btn-ghost text-xs min-h-[36px] px-2"
                      data-testid={`extend-trial-${o.id}`}
                    >
                      <Clock size={14} aria-hidden="true"/>
                      <span className="ml-1">Prolonger</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-stone-500">Aucune organisation dans ce filtre.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="text-xs text-stone-500 dark:text-stone-400 flex items-start gap-2">
        <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true"/>
        <p>
          Ce compte n'a aucun accès aux données métier des organisations listées ci-dessus.
          Pour aider un client, il doit d'abord accorder un accès de support explicite depuis son propre espace
          (<Link to="/settings" className="underline">Réglages → Accès de support</Link>).
        </p>
      </footer>
    </div>
  );
}

function KpiCard({ icon, label, value, testid }) {
  return (
    <div className="card-crm p-4" data-testid={testid}>
      <div className="flex items-center gap-2 text-stone-500 text-xs uppercase tracking-wider">{icon} {label}</div>
      <p className="font-display text-3xl mt-2">{value}</p>
    </div>
  );
}

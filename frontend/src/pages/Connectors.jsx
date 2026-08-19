import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plug, Check, AlertCircle, Trash2, Plus, RefreshCw } from "lucide-react";
import { t } from "@/lib/i18n";

const PROVIDERS = [
  { key: "easybeer", name: "EasyBeer", desc: "Gestion brasseries & catalogues bières", color: "#C78B3A", fields: ["api_key", "workspace_id"] },
  { key: "vinovent", name: "Vinovent", desc: "Gestion cavistes / distribution vins", color: "#4A154B", fields: ["api_key", "region"] },
  { key: "pennylane", name: "Pennylane", desc: "Comptabilité & facturation", color: "#2D5A4C", fields: ["api_key"] },
  { key: "google_drive", name: "Google Drive", desc: "Étiquettes, tarifs, prospects", color: "#8C2A2A", fields: ["client_id", "client_secret"], oauth: true },
  { key: "custom", name: "Webhook custom", desc: "Connectez toute autre app via API", color: "#5C5C5C", fields: ["endpoint", "api_key"] },
];

export default function Connectors() {
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(null);
  const [config, setConfig] = useState({});

  const load = async () => { const { data } = await api.get("/connectors"); setItems(data); };
  useEffect(() => { load(); }, []);

  const connect = async (e) => {
    e.preventDefault();
    const p = show;
    await api.post("/connectors", { provider: p.key, name: p.name, config, status: "pending" });
    toast.success(t("toast.v1_ajoute", { v1: p.name }));
    setShow(null); setConfig({}); load();
  };

  const test = async (id) => {
    const { data } = await api.post(`/connectors/${id}/test`);
    if (data.status === "connected") toast.success(data.message);
    else toast.error(data.message);
    load();
  };

  const del = async (id) => { await api.delete(`/connectors/${id}`); load(); };

  return (
    <div className="space-y-6" data-testid="connectors-page">
      <div><p className="overline">Intégrations</p><h1 className="font-display text-4xl">Connecteurs</h1><p className="text-sm text-stone-500 mt-1">Reliez vos outils métiers à BEVID</p></div>

      {items.length > 0 && (
        <div className="card-crm p-4">
          <p className="overline mb-3">Connecteurs actifs</p>
          <div className="space-y-2">
            {items.map(c => {
              const p = PROVIDERS.find(x => x.key === c.provider);
              const StatusIcon = c.status === "connected" ? Check : AlertCircle;
              const statusColor = c.status === "connected" ? "#2D5A4C" : c.status === "error" ? "#8C2A2A" : "#C78B3A";
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg" data-testid={`connector-${c.id}`}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-display" style={{ background: p?.color || "#4A154B" }}>{c.name?.[0]}</div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{c.name}</div>
                    <div className="text-xs flex items-center gap-1" style={{ color: statusColor }}>
                      <StatusIcon size={11} />
                      <span className="capitalize">{c.status}</span>
                      {c.last_sync && <span className="text-stone-500">· {c.last_sync.slice(0,16).replace("T"," ")}</span>}
                    </div>
                  </div>
                  <button onClick={() => test(c.id)} className="btn-ghost text-xs flex items-center gap-1" data-testid={`test-${c.id}`}><RefreshCw size={11} /> Tester</button>
                  <button onClick={() => del(c.id)} className="text-stone-400 hover:text-[#8C2A2A]"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="overline mb-3">Ajouter un connecteur</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROVIDERS.map(p => (
            <button key={p.key} onClick={() => setShow(p)} className="card-crm p-5 text-left hover:border-[#4A154B]" data-testid={`add-${p.key}`}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white mb-3" style={{ background: p.color }}><Plug size={18} strokeWidth={1.5} /></div>
              <div className="font-display text-lg">{p.name}</div>
              <div className="text-xs text-stone-500 mt-1">{p.desc}</div>
              {p.oauth && <div className="text-[10px] text-[#4A154B] mt-2">OAuth 2.0</div>}
            </button>
          ))}
        </div>
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(null)}>
          <form onSubmit={connect} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 space-y-3" data-testid="connector-modal">
            <h3 className="font-display text-2xl">Connecter {show.name}</h3>
            <p className="text-xs text-stone-500">{show.desc}</p>
            {show.oauth && (
              <div className="bg-[#F7F5F2] p-3 rounded text-xs text-stone-600 border border-stone-200">
                <strong>OAuth requis :</strong> créez un projet sur console.cloud.google.com → OAuth 2.0 Client ID → collez ci-dessous. Redirect URI : <code className="bg-white px-1">{`${window.location.origin}/oauth/callback`}</code>
              </div>
            )}
            {show.fields.map(f => (
              <div key={f}>
                <label className="text-xs capitalize">{f.replace("_", " ")}</label>
                <input type={f.includes("secret") || f.includes("key") ? "password" : "text"} required value={config[f] || ""} onChange={e => setConfig({ ...config, [f]: e.target.value })} className="input-crm mt-1" data-testid={`field-${f}`} />
              </div>
            ))}
            <div className="flex gap-2 justify-end pt-2"><button type="button" onClick={() => setShow(null)} className="btn-ghost">Annuler</button><button className="btn-primary" data-testid="connect-submit">Connecter</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

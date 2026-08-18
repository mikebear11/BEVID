import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Radio, RefreshCw, Loader2, Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function Radar() {
  const [prospects, setProspects] = useState([]);
  const [depts, setDepts] = useState([]);
  const [inputDept, setInputDept] = useState("");
  const [scanning, setScanning] = useState(false);
  const [days, setDays] = useState(30);

  const load = async () => {
    const [{ data: p }, { data: s }] = await Promise.all([
      api.get(`/radar/new-prospects?days=${days}`),
      api.get(`/settings/monitored-departments`),
    ]);
    setProspects(p); setDepts(s.departments || []);
  };
  useEffect(() => { load(); }, [days]);

  const saveDepts = async (arr) => {
    await api.post("/settings/monitored-departments", { departments: arr });
    setDepts(arr);
    toast.success("Départements enregistrés");
  };

  const addDept = () => {
    const d = inputDept.trim();
    if (!d || depts.includes(d)) return;
    saveDepts([...depts, d]);
    setInputDept("");
  };

  const scan = async () => {
    setScanning(true);
    try {
      const { data } = await api.post("/radar/scan-now");
      toast.success(`Scan : ${data.new_prospects} nouveaux CHR (sur ${data.chr_count} filtrés, ${data.bodacc_count} annonces BODACC)`);
      load();
    } catch (e) { toast.error("Erreur scan"); }
    finally { setScanning(false); }
  };

  return (
    <div className="space-y-4" data-testid="radar-page">
      <div>
        <p className="overline flex items-center gap-2"><Radio size={12} /> Découverte automatique</p>
        <h1 className="font-display text-4xl">Radar d'ouvertures CHR</h1>
        <p className="text-xs text-stone-500 mt-1">Détecte chaque matin les nouveaux CHR sur les départements surveillés · BODACC + Recherche d'entreprises</p>
      </div>

      <div className="card-crm p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-stone-600">Départements surveillés</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {depts.map(d => (
              <span key={d} className="text-xs bg-stone-100 rounded-full px-2 py-1 flex items-center gap-1" data-testid={`dept-${d}`}>
                {d}
                <button onClick={() => saveDepts(depts.filter(x => x !== d))} className="text-stone-500 hover:text-red-600">×</button>
              </span>
            ))}
            <input value={inputDept} onChange={e => setInputDept(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addDept()}
              placeholder="+ dept (64, 75...)" className="input-crm text-xs h-8 w-32" data-testid="dept-input" />
          </div>
        </div>
        <div>
          <label className="text-xs text-stone-600">Fenêtre</label>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="input-crm text-sm ml-2 h-10">
            {[7, 30, 90].map(d => <option key={d} value={d}>{d} jours</option>)}
          </select>
        </div>
        <button onClick={scan} disabled={scanning || depts.length === 0} className="btn-primary flex items-center gap-2" data-testid="radar-scan-btn">
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Scanner maintenant
        </button>
      </div>

      <div className="card-crm p-4">
        <h3 className="font-display text-xl mb-3">Nouveaux CHR détectés ({prospects.length})</h3>
        <div className="space-y-2">
          {prospects.length === 0 && (
            <p className="text-sm text-stone-500 italic">Aucun nouveau CHR détecté. Lance un scan pour interroger BODACC.</p>
          )}
          {prospects.map(p => (
            <div key={p.id} className="flex justify-between items-start border-b border-stone-100 py-2" data-testid={`radar-item-${p.id}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800 flex items-center gap-2">
                  <Building2 size={14} className="text-[#4A154B]" />{p.name}
                </div>
                <p className="text-xs text-stone-500">{p.address || "—"} · {p.city || "—"} · SIREN {p.siren}</p>
                <p className="text-xs text-stone-600 mt-1">
                  <span className="capitalize">{p.segment}</span> · NAF {p.activite_principale}
                  {p.date_creation_entreprise && ` · créé le ${p.date_creation_entreprise}`}
                </p>
              </div>
              <Link to={`/clients/${p.id}`} className="text-xs text-[#4A154B] hover:underline ml-2">Fiche →</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

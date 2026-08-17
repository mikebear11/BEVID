import React, { useEffect, useState, useRef } from "react";
import { api, API } from "@/lib/api";
import { Link } from "react-router-dom";
import { Plus, Search, Mic, Upload } from "lucide-react";
import { toast } from "sonner";
import { useVoice } from "@/hooks/useVoice";

const TYPES = ["bar", "restaurant", "caviste", "supermarche", "hotel", "autre"];
const STATUSES = ["prospect", "actif", "vip", "inactif"];

export default function Clients() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", type: "bar", contact_name: "", phone: "", email: "", city: "", status: "prospect", notes: "" });
  const { supported, listening, transcript, start, stop, reset } = useVoice("fr-FR");
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const importCsv = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const token = localStorage.getItem("crm_token");
      const res = await fetch(`${API}/clients/bulk-import`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      toast.success(`${data.created} clients importés${data.total_errors ? ` (${data.total_errors} erreurs)` : ""}`);
      load();
    } catch { toast.error("Erreur import"); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const load = async () => {
    const { data } = await api.get("/clients"); setItems(data);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(c => (c.name + " " + (c.city||"") + " " + (c.contact_name||"")).toLowerCase().includes(q.toLowerCase()));

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/clients", form);
      toast.success("Client ajouté");
      setShowAdd(false); setForm({ name: "", type: "bar", contact_name: "", phone: "", email: "", city: "", status: "prospect", notes: "" });
      load();
    } catch(e){ toast.error("Erreur"); }
  };

  const voiceParse = async () => {
    if (!transcript.trim()) return;
    setParsing(true);
    try {
      const { data } = await api.post("/ai/parse-voice", { transcript, intent: "client" });
      if (data.parsed) setForm({ ...form, ...data.parsed });
      reset();
      toast.success("Champs remplis par l'IA");
    } catch(e) { toast.error("Erreur parsing"); }
    finally { setParsing(false); }
  };

  return (
    <div className="space-y-6" data-testid="clients-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="overline">Portefeuille</p>
          <h1 className="font-display text-4xl">Clients</h1>
        </div>
        <div className="flex gap-2 self-start flex-wrap">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCsv} data-testid="csv-input" />
          <button onClick={() => fileRef.current?.click()} disabled={importing} className="btn-ghost flex items-center gap-2" data-testid="csv-import-btn">
            <Upload size={16} /> {importing ? "Import…" : "Importer CSV"}
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2" data-testid="add-client-btn">
            <Plus size={16} /> Nouveau client
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input placeholder="Rechercher un client, ville, contact…" value={q} onChange={e => setQ(e.target.value)} className="input-crm pl-9" data-testid="clients-search" />
      </div>

      <div className="card-crm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3 hidden md:table-cell">Type</th>
              <th className="p-3 hidden md:table-cell">Ville</th>
              <th className="p-3 hidden lg:table-cell">Contact</th>
              <th className="p-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-stone-500">Aucun client. Cliquez sur "Nouveau client" ou utilisez la saisie vocale.</td></tr>}
            {filtered.map(c => (
              <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50" data-testid={`client-row-${c.id}`}>
                <td className="p-3">
                  <Link to={`/clients/${c.id}`} className="font-medium text-stone-800 hover:text-[#4A154B]">{c.name}</Link>
                </td>
                <td className="p-3 hidden md:table-cell text-stone-600 capitalize">{c.type}</td>
                <td className="p-3 hidden md:table-cell text-stone-600">{c.city || "—"}</td>
                <td className="p-3 hidden lg:table-cell text-stone-600">{c.contact_name || "—"}</td>
                <td className="p-3"><span className={`badge badge-${c.status}`}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto" data-testid="add-client-modal">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl">Nouveau client</h3>
              {supported && (
                <button type="button" onClick={listening ? stop : start} className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 ${listening ? "bg-[#8C2A2A] text-white" : "bg-[#4A154B] text-white"}`} data-testid="client-voice-btn">
                  <Mic size={12} /> {listening ? "Stop" : "Dicter"}
                </button>
              )}
            </div>
            {transcript && (
              <div className="bg-stone-50 border border-stone-200 rounded p-2 text-xs">
                <p className="text-stone-600 mb-1">{transcript}</p>
                <button type="button" onClick={voiceParse} disabled={parsing} className="text-[#4A154B] font-medium text-xs">{parsing ? "Analyse…" : "→ Remplir avec l'IA"}</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-stone-600">Nom *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-crm mt-1" data-testid="form-client-name" />
              </div>
              <div>
                <label className="text-xs text-stone-600">Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input-crm mt-1">
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-600">Statut</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input-crm mt-1">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-stone-600">Contact</label><input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className="input-crm mt-1" /></div>
              <div><label className="text-xs text-stone-600">Téléphone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-crm mt-1" /></div>
              <div className="col-span-2"><label className="text-xs text-stone-600">Ville</label><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="input-crm mt-1" /></div>
              <div className="col-span-2"><label className="text-xs text-stone-600">Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-crm mt-1" /></div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Annuler</button>
              <button type="submit" className="btn-primary" data-testid="submit-client">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

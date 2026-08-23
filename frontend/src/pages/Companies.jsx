import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Building, Plus, Search, Loader2, Building2, ArrowRight } from "lucide-react";
import SirenAutocomplete from "@/components/SirenAutocomplete";
import { usePageMeta } from "@/lib/pageMeta";
import { useAuth } from "@/contexts/AuthContext";

export default function Companies() {
  usePageMeta({ title: "Sociétés · BEVID" });
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const url = q ? `/companies?q=${encodeURIComponent(q)}` : "/companies";
      const { data } = await api.get(url);
      setItems(data);
    } catch { toast.error("Chargement impossible"); }
    finally { setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);

  const canCreate = user?.role === "manager";

  return (
    <div className="space-y-6" data-testid="companies-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="overline flex items-center gap-1"><Building2 size={12} aria-hidden="true" /> Portefeuille</p>
          <h1 className="font-display text-4xl">Sociétés</h1>
          <p className="text-xs text-stone-500 mt-1">Entités juridiques (SIREN). Chaque société peut regrouper plusieurs établissements (SIRETs distincts).</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="new-company-btn">
            <Plus size={16} aria-hidden="true" /> Nouvelle société
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true" />
        <label htmlFor="companies-search" className="sr-only">Rechercher une société</label>
        <input id="companies-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Nom ou SIREN…" className="input-crm pl-9 min-h-[44px]" data-testid="companies-search" autoComplete="off" />
      </div>

      <div className="card-crm overflow-x-auto scroll-shadow">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
            <tr>
              <th className="p-3 sticky left-0 bg-stone-50 z-10">Raison sociale</th>
              <th className="p-3">SIREN</th>
              <th className="p-3">Forme</th>
              <th className="p-3">Établissements</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="p-6 text-center"><Loader2 size={16} className="mx-auto animate-spin text-stone-400" /></td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-stone-500">
                <Building size={28} className="mx-auto text-stone-300 mb-2" aria-hidden="true" />
                Aucune société. {canCreate && "Cliquez sur « Nouvelle société » pour en créer une."}
              </td></tr>
            )}
            {items.map(c => (
              <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50" data-testid={`company-row-${c.id}`}>
                <td className="p-3 sticky left-0 bg-white z-10">
                  <Link to={`/companies/${c.id}`} className="font-medium text-stone-800 hover:text-[#4A154B]">{c.legal_name}</Link>
                </td>
                <td className="p-3 font-mono text-xs text-stone-500">{c.siren || "—"}</td>
                <td className="p-3 text-stone-500">{c.ownership_type || "—"}</td>
                <td className="p-3">{c.establishments_count || 0}</td>
                <td className="p-3 text-right">
                  <Link to={`/companies/${c.id}`} className="text-xs bg-stone-100 text-stone-700 px-3 py-1.5 rounded-full min-h-[36px] inline-flex items-center gap-1" data-testid={`view-company-${c.id}`}>
                    <ArrowRight size={12} aria-hidden="true" /> Voir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && canCreate && <CreateCompanyModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateCompanyModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ legal_name: "", siren: "", ownership_type: "", headquarters_address: "", capital_social: "", tva_intracom: "", rcs: "", director: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.legal_name.trim()) { toast.error("Raison sociale requise"); return; }
    setBusy(true);
    try {
      await api.post("/companies", form);
      toast.success("Société créée");
      onCreated();
    } catch (e) { toast.error(e?.response?.data?.detail || "Création impossible"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose} data-testid="company-create-modal">
      <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl">Nouvelle société</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px]" aria-label="Fermer">✕</button>
        </div>
        <div className="space-y-3">
          <SirenAutocomplete onSelect={(r) => setForm(f => ({
            ...f,
            legal_name: r.denomination || r.nom_complet || f.legal_name,
            siren: r.siren || f.siren,
            headquarters_address: [r.adresse, r.commune].filter(Boolean).join(", ") || f.headquarters_address,
          }))} />
          <div>
            <label htmlFor="c-legal-name" className="text-xs text-stone-500 block">Raison sociale *</label>
            <input id="c-legal-name" value={form.legal_name} onChange={e => set("legal_name", e.target.value)} className="input-crm min-h-[44px]" data-testid="c-legal-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="c-siren" className="text-xs text-stone-500 block">SIREN</label>
              <input id="c-siren" value={form.siren} onChange={e => set("siren", e.target.value)} inputMode="numeric" pattern="[0-9]{9}" className="input-crm min-h-[44px] font-mono" data-testid="c-siren" />
            </div>
            <div>
              <label htmlFor="c-ownership" className="text-xs text-stone-500 block">Forme</label>
              <select id="c-ownership" value={form.ownership_type} onChange={e => set("ownership_type", e.target.value)} className="input-crm min-h-[44px]" data-testid="c-ownership">
                <option value="">—</option>
                {["SAS", "SARL", "EURL", "SA", "SCI", "SNC", "autre"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="c-address" className="text-xs text-stone-500 block">Siège social</label>
            <input id="c-address" value={form.headquarters_address} onChange={e => set("headquarters_address", e.target.value)} className="input-crm min-h-[44px]" data-testid="c-address" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="c-capital" className="text-xs text-stone-500 block">Capital social</label>
              <input id="c-capital" value={form.capital_social} onChange={e => set("capital_social", e.target.value)} placeholder="10 000 €" className="input-crm min-h-[44px]" data-testid="c-capital" />
            </div>
            <div>
              <label htmlFor="c-rcs" className="text-xs text-stone-500 block">RCS</label>
              <input id="c-rcs" value={form.rcs} onChange={e => set("rcs", e.target.value)} placeholder="Paris B 123…" className="input-crm min-h-[44px]" data-testid="c-rcs" />
            </div>
          </div>
          <div>
            <label htmlFor="c-tva" className="text-xs text-stone-500 block">TVA intracom</label>
            <input id="c-tva" value={form.tva_intracom} onChange={e => set("tva_intracom", e.target.value)} placeholder="FR12345678901" className="input-crm min-h-[44px] font-mono" data-testid="c-tva" />
          </div>
          <div>
            <label htmlFor="c-director" className="text-xs text-stone-500 block">Dirigeant</label>
            <input id="c-director" value={form.director} onChange={e => set("director", e.target.value)} className="input-crm min-h-[44px]" data-testid="c-director" />
          </div>
          <div className="pt-2 flex justify-end">
            <button onClick={submit} disabled={busy} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="c-submit">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

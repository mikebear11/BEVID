import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Zap } from "lucide-react";
import SirenAutocomplete from "@/components/SirenAutocomplete";
import PuceEtat from "@/components/system/PuceEtat";
import { t } from "@/lib/i18n";

const TYPES = ["bar", "restaurant", "caviste", "hotel", "epicerie", "autre"];

export default function EstablishmentNew() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", siret: "", type: "bar", address: "", city: "", postal_code: "" });
  const [picked, setPicked] = useState(null);
  const [creating, setCreating] = useState(false);
  const [autoEnrich, setAutoEnrich] = useState(true);

  const onSelect = (item) => {
    setPicked(item);
    setForm(f => ({
      ...f,
      name: item.denomination || f.name,
      siret: item.siren || f.siret,
      address: item.adresse || f.address,
      city: item.commune || f.city,
    }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error(t("toast.nom_requis")); return; }
    setCreating(true);
    try {
      const { data } = await api.post("/establishments", form);
      toast.success(t("toast.etablissement_cree"));
      // Verrouille immédiatement le siren par édition manuelle (source=user) si fourni
      if (form.siret && form.siret.length === 9) {
        await api.put(`/establishments/${data.id}/enriched-field/siren`, { valeur: form.siret }).catch(() => {});
        if (autoEnrich) {
          try {
            const r = await api.post(`/establishments/${data.id}/enrichir`);
            toast.success(t("toast.couche_a_v1_champ_s_remplis_automat", { v1: r.data.changed }));
          } catch (e) { toast.warning(t("toast.enrichissement_auto_echoue_v1", { v1: e?.response?.data?.detail || "erreur" })); }
        }
      }
      nav(`/etab/${data.id}/enrichissement`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("toast.erreur"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="establishment-new-page">
      <div>
        <Link to="/clients" className="text-sm inline-flex items-center gap-1 mb-2" style={{ color: "var(--ds-accent)" }}>
          <ArrowLeft size={14} /> Retour
        </Link>
        <p className="overline">Nouveau</p>
        <h1 className="font-display text-4xl">Nouvel établissement</h1>
        <p className="text-sm" style={{ color: "var(--ds-text-muted)" }}>
          Cherche par nom — l'adresse, le SIREN et le code NAF s'auto-remplissent depuis Recherche-Entreprises. Sélectionne et enregistre en un clic.
        </p>
      </div>

      <div className="card-crm p-5 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider mb-1 block" style={{ color: "var(--ds-text-secondary)" }}>Recherche entreprise</label>
          <SirenAutocomplete onSelect={onSelect} autoFocus />
          {picked && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <PuceEtat etat="succes" variante="douce" libelle="Rempli automatiquement" />
              <span style={{ color: "var(--ds-text-muted)" }}>SIREN {picked.siren}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label>
            <span className="text-xs uppercase tracking-wider block mb-1" style={{ color: "var(--ds-text-secondary)" }}>Nom</span>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="est-name"
              className="ds-focus" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ds-border-strong)", borderRadius: "var(--ds-radius-md)", background: "var(--ds-bg-surface)", color: "var(--ds-text-primary)", fontSize: "var(--ds-font-size-sm)", minHeight: 44 }} />
          </label>
          <label>
            <span className="text-xs uppercase tracking-wider block mb-1" style={{ color: "var(--ds-text-secondary)" }}>SIREN</span>
            <input value={form.siret} onChange={e => setForm({ ...form, siret: e.target.value })} data-testid="est-siren"
              className="ds-focus ds-tabular" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ds-border-strong)", borderRadius: "var(--ds-radius-md)", background: "var(--ds-bg-surface)", color: "var(--ds-text-primary)", fontSize: "var(--ds-font-size-sm)", minHeight: 44 }} />
          </label>
          <label>
            <span className="text-xs uppercase tracking-wider block mb-1" style={{ color: "var(--ds-text-secondary)" }}>Type</span>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} data-testid="est-type"
              className="ds-focus" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ds-border-strong)", borderRadius: "var(--ds-radius-md)", background: "var(--ds-bg-surface)", color: "var(--ds-text-primary)", fontSize: "var(--ds-font-size-sm)", minHeight: 44 }}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs uppercase tracking-wider block mb-1" style={{ color: "var(--ds-text-secondary)" }}>Ville</span>
            <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} data-testid="est-city"
              className="ds-focus" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ds-border-strong)", borderRadius: "var(--ds-radius-md)", background: "var(--ds-bg-surface)", color: "var(--ds-text-primary)", fontSize: "var(--ds-font-size-sm)", minHeight: 44 }} />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs uppercase tracking-wider block mb-1" style={{ color: "var(--ds-text-secondary)" }}>Adresse</span>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} data-testid="est-address"
              className="ds-focus" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ds-border-strong)", borderRadius: "var(--ds-radius-md)", background: "var(--ds-bg-surface)", color: "var(--ds-text-primary)", fontSize: "var(--ds-font-size-sm)", minHeight: 44 }} />
          </label>
        </div>

        <label className="flex items-center gap-2 pt-2">
          <input type="checkbox" checked={autoEnrich} onChange={e => setAutoEnrich(e.target.checked)} data-testid="auto-enrich" style={{ width: 18, height: 18, accentColor: "var(--ds-accent)" }} />
          <span className="text-sm" style={{ color: "var(--ds-text-primary)" }}>Lancer immédiatement l'enrichissement Couche A (gratuit)</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Link to="/clients" className="ds-focus px-4 py-2 rounded" style={{ border: "1px solid var(--ds-border-strong)", color: "var(--ds-text-primary)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Annuler</Link>
          <button onClick={save} disabled={creating} data-testid="est-save"
            className="ds-focus px-4 py-2 rounded font-medium inline-flex items-center gap-2"
            style={{ background: "var(--ds-accent)", color: "var(--ds-accent-fg)", minHeight: 44, opacity: creating ? 0.6 : 1 }}>
            <Zap size={16} /> {creating ? "Création…" : "Créer et enrichir"}
          </button>
        </div>
      </div>
    </div>
  );
}

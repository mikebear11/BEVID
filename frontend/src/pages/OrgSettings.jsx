import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Building2, Palette, Coins, Globe } from "lucide-react";
import { t as tt } from "@/lib/i18n";

/**
 * Réglages entreprise (manager only).
 * Nom, couleur d'accent (palette pré-validée), devise, fuseau, mentions légales.
 */
export default function OrgSettings() {
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/org/branding").then(r => setS(r.data)); }, []);

  if (user?.role !== "manager") {
    return <div className="card-crm p-6" data-testid="orgsettings-forbidden">Réservé aux managers.</div>;
  }

  const save = async (patch) => {
    setSaving(true);
    try {
      const { data } = await api.put("/org/branding", patch);
      setS(data);
      toast.success(tt("toast.saved"));
    } catch (e) {
      toast.error(e.response?.data?.detail || tt("toast.error_generic"));
    } finally { setSaving(false); }
  };

  if (!s) return <div className="text-stone-500">{tt("loading")}</div>;

  const palette = s.palette || {};

  return (
    <div className="space-y-6 max-w-2xl" data-testid="orgsettings-page">
      <div>
        <p className="overline flex items-center gap-1"><Building2 size={12} /> Organisation</p>
        <h1 className="font-display text-4xl">{s.name}</h1>
        <p className="text-xs text-stone-500 mt-1">Slug : {s.slug} · Forfait : {s.plan || "—"} · Statut : {s.status || "—"}</p>
      </div>

      <section className="card-crm p-6 space-y-3">
        <label htmlFor="org-name" className="text-xs text-stone-500 block">Nom commercial (affiché dans la barre latérale et les PDF)</label>
        <input id="org-name" name="name" defaultValue={s.name}
          onBlur={(e) => e.target.value !== s.name && save({ name: e.target.value })}
          className="input-crm min-h-[44px]" data-testid="orgsettings-name" />
      </section>

      <section className="card-crm p-6 space-y-3">
        <p className="overline flex items-center gap-1"><Palette size={12} /> Couleur d'accent</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Palette d'accent">
          {Object.entries(palette).map(([k, v]) => (
            <button key={k} type="button" role="radio" aria-checked={s.accent_color === k}
              onClick={() => save({ accent_color: k })}
              data-testid={`orgsettings-accent-${k}`}
              className={`p-3 rounded-lg border min-h-[52px] flex items-center gap-3 ${s.accent_color === k ? "ring-2 ring-offset-2" : ""}`}
              style={{ borderColor: v.hex, ringColor: v.hex }}
            >
              <span className="w-6 h-6 rounded-full" style={{ background: v.hex }} aria-hidden="true" />
              <span className="text-sm">{v.name}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500">Choix restreint et pré-validé pour garantir le contraste sur toute l'application.</p>
      </section>

      <section className="card-crm p-6 space-y-3">
        <p className="overline flex items-center gap-1"><Coins size={12} /> Devise</p>
        <select value={s.currency} onChange={(e) => save({ currency: e.target.value })}
          className="input-crm min-h-[44px]" data-testid="orgsettings-currency">
          {["EUR", "USD", "GBP", "CHF"].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </section>

      <section className="card-crm p-6 space-y-3">
        <p className="overline flex items-center gap-1"><Globe size={12} /> Fuseau horaire</p>
        <input defaultValue={s.timezone}
          onBlur={(e) => e.target.value !== s.timezone && save({ timezone: e.target.value })}
          placeholder="Europe/Paris"
          className="input-crm min-h-[44px]" data-testid="orgsettings-timezone" />
      </section>

      <section className="card-crm p-6 space-y-3">
        <label htmlFor="org-legal" className="text-xs text-stone-500 block">Mentions légales (reprises sur les bons de commande)</label>
        <textarea id="org-legal" defaultValue={s.legal_notice}
          onBlur={(e) => e.target.value !== s.legal_notice && save({ legal_notice: e.target.value })}
          rows={4}
          className="input-crm" data-testid="orgsettings-legal" />
      </section>
      {saving && <p className="text-xs text-stone-500">Enregistrement…</p>}
    </div>
  );
}

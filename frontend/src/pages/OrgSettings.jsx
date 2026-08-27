import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Building2, Palette, Coins, Globe, Sparkles, Loader2 } from "lucide-react";
import { t as tt } from "@/lib/i18n";
import SirenAutocomplete from "@/components/SirenAutocomplete";

/**
 * Réglages entreprise (manager only).
 * Nom, couleur d'accent (palette pré-validée), devise, fuseau, mentions légales.
 */
export default function OrgSettings() {
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateReport, setConsolidateReport] = useState(null);

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

      {/* Lot Compliance — Identité éditeur (affichée sur /legal/mentions-legales et /legal/cgv) */}
      <section className="card-crm p-6 space-y-3" data-testid="orgsettings-editor-identity">
        <p className="overline flex items-center gap-1"><Building2 size={12} aria-hidden="true" /> Identité éditeur légale</p>
        <p className="text-xs text-stone-500">Ces informations sont reprises sur les pages Mentions légales, CGV et la Politique de confidentialité publiques. Requises pour la mise en production.</p>

        <SirenAutocomplete onSelect={(pick) => save({
          legal_name: pick.denomination || pick.nom_complet,
          siren: pick.siren,
          legal_address: [pick.adresse, pick.commune].filter(Boolean).join(", "),
        })} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="legal-name" className="text-xs text-stone-500 block">Raison sociale</label>
            <input id="legal-name" defaultValue={s.legal_name || ""}
              onBlur={(e) => e.target.value !== s.legal_name && save({ legal_name: e.target.value })}
              className="input-crm min-h-[44px]" data-testid="orgsettings-legal-name" />
          </div>
          <div>
            <label htmlFor="legal-siren" className="text-xs text-stone-500 block">SIREN (9 chiffres)</label>
            <input id="legal-siren" defaultValue={s.siren || ""} inputMode="numeric" pattern="[0-9]{9}"
              onBlur={(e) => e.target.value !== s.siren && save({ siren: e.target.value })}
              className="input-crm min-h-[44px] font-mono" data-testid="orgsettings-siren" />
          </div>
          <div>
            <label htmlFor="legal-rcs" className="text-xs text-stone-500 block">RCS (ville d'immatriculation + numéro)</label>
            <input id="legal-rcs" defaultValue={s.rcs || ""} placeholder="Paris B 123 456 789"
              onBlur={(e) => e.target.value !== s.rcs && save({ rcs: e.target.value })}
              className="input-crm min-h-[44px]" data-testid="orgsettings-rcs" />
          </div>
          <div>
            <label htmlFor="legal-capital" className="text-xs text-stone-500 block">Capital social</label>
            <input id="legal-capital" defaultValue={s.capital_social || ""} placeholder="10 000 €"
              onBlur={(e) => e.target.value !== s.capital_social && save({ capital_social: e.target.value })}
              className="input-crm min-h-[44px]" data-testid="orgsettings-capital" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="legal-address" className="text-xs text-stone-500 block">Adresse du siège</label>
            <input id="legal-address" defaultValue={s.legal_address || ""}
              onBlur={(e) => e.target.value !== s.legal_address && save({ legal_address: e.target.value })}
              className="input-crm min-h-[44px]" data-testid="orgsettings-legal-address" />
          </div>
          <div>
            <label htmlFor="legal-director" className="text-xs text-stone-500 block">Directeur de la publication</label>
            <input id="legal-director" defaultValue={s.director_publication || ""}
              onBlur={(e) => e.target.value !== s.director_publication && save({ director_publication: e.target.value })}
              className="input-crm min-h-[44px]" data-testid="orgsettings-director" />
          </div>
          <div>
            <label htmlFor="legal-tva" className="text-xs text-stone-500 block">Numéro TVA intracom</label>
            <input id="legal-tva" defaultValue={s.tva_intracom || ""} placeholder="FR12345678901"
              onBlur={(e) => e.target.value !== s.tva_intracom && save({ tva_intracom: e.target.value })}
              className="input-crm min-h-[44px] font-mono" data-testid="orgsettings-tva" />
          </div>
          <div>
            <label htmlFor="legal-email" className="text-xs text-stone-500 block">Email de contact public</label>
            <input id="legal-email" type="email" defaultValue={s.legal_email || ""} placeholder="contact@…"
              onBlur={(e) => e.target.value !== s.legal_email && save({ legal_email: e.target.value })}
              className="input-crm min-h-[44px]" data-testid="orgsettings-legal-email" />
          </div>
          <div>
            <label htmlFor="dpo-email" className="text-xs text-stone-500 block">Email du DPO (RGPD)</label>
            <input id="dpo-email" type="email" defaultValue={s.dpo_email || ""} placeholder="dpo@…"
              onBlur={(e) => e.target.value !== s.dpo_email && save({ dpo_email: e.target.value })}
              className="input-crm min-h-[44px]" data-testid="orgsettings-dpo-email" />
          </div>
        </div>
        <p className="text-xs text-stone-500">Une fois ces champs remplis, les pages publiques /legal/mentions-legales et /legal/cgv les affichent automatiquement à la place des placeholders.</p>
      </section>

      {/* Zone démo — purge les fake data et enrichit les vrais établissements
          avec 6 mois d'historique cohérent (visites, commandes, objections,
          engagements). Idempotent : safe à rejouer. */}
      <section className="card-crm p-6 space-y-3" data-testid="orgsettings-consolidate-section">
        <p className="overline flex items-center gap-1"><Sparkles size={12} /> Consolidation des données de démo</p>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Purge les fake clients (TESTP_, PROPTEST-, BAR LE CENTRAL…) et enrichit les
          établissements réels (ADT 64, BEKAST, SAS CASSOULET…) avec 6 mois d'historique
          crédible : commandes, visites, objections, engagements. À utiliser en préparation
          d'une démo.
        </p>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm("Purger les fake data et enrichir les vrais établissements avec 6 mois d'historique ? Idempotent, safe à rejouer.")) return;
            setConsolidating(true); setConsolidateReport(null);
            try {
              const { data } = await api.post("/admin/demo/consolidate");
              setConsolidateReport(data);
              toast.success(`Purgé ${data.establishments_purged + data.clients_purged} fiches / ${data.orders_purged} commandes · ${data.enriched_establishments} enrichi(s)`);
            } catch (e) {
              toast.error(e?.response?.data?.detail || "Consolidation impossible");
            } finally { setConsolidating(false); }
          }}
          disabled={consolidating}
          className="btn-primary flex items-center gap-2"
          data-testid="orgsettings-consolidate-btn"
        >
          {consolidating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Lancer la consolidation
        </button>
        {consolidateReport && (
          <div className="mt-3 border border-stone-200 dark:border-stone-700 rounded-lg overflow-hidden" data-testid="orgsettings-consolidate-report">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-stone-200 dark:bg-stone-700">
              <div className="bg-white dark:bg-stone-900 p-2 text-center">
                <p className="overline">Établiss. purgés</p>
                <p className="font-display text-lg text-[#8C2A2A]">{consolidateReport.establishments_purged}</p>
              </div>
              <div className="bg-white dark:bg-stone-900 p-2 text-center">
                <p className="overline">Commandes purgées</p>
                <p className="font-display text-lg text-[#8C2A2A]">{consolidateReport.orders_purged}</p>
              </div>
              <div className="bg-white dark:bg-stone-900 p-2 text-center">
                <p className="overline">Produits purgés</p>
                <p className="font-display text-lg text-[#8C2A2A]">{consolidateReport.products_purged}</p>
              </div>
              <div className="bg-white dark:bg-stone-900 p-2 text-center">
                <p className="overline">Étab. enrichis</p>
                <p className="font-display text-lg text-[#2D5A4C]">{consolidateReport.enriched_establishments}</p>
              </div>
              <div className="bg-white dark:bg-stone-900 p-2 text-center">
                <p className="overline">Commandes créées</p>
                <p className="font-display text-lg text-[#4A154B]">{consolidateReport.orders_created}</p>
              </div>
              <div className="bg-white dark:bg-stone-900 p-2 text-center">
                <p className="overline">Visites créées</p>
                <p className="font-display text-lg text-[#4A154B]">{consolidateReport.visits_created}</p>
              </div>
              <div className="bg-white dark:bg-stone-900 p-2 text-center">
                <p className="overline">Objections</p>
                <p className="font-display text-lg text-[#4A154B]">{consolidateReport.objections_created}</p>
              </div>
              <div className="bg-white dark:bg-stone-900 p-2 text-center">
                <p className="overline">Engagements</p>
                <p className="font-display text-lg text-[#4A154B]">{consolidateReport.engagements_created}</p>
              </div>
            </div>
            <div className="px-3 py-2 text-xs text-stone-500 bg-stone-50 dark:bg-stone-800">
              Préservés : {(consolidateReport.preserved_establishments || []).join(" · ")}
            </div>
          </div>
        )}
      </section>
      {saving && <p className="text-xs text-stone-500">Enregistrement…</p>}
    </div>
  );
}

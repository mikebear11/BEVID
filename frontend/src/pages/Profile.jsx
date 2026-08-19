import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { User, Palette, Home, Bell, Globe } from "lucide-react";
import { t as tt } from "@/lib/i18n";

/**
 * Page « Mon profil » — préférences utilisateur (P3).
 * Persisté serveur, chargé dans le snapshot hors-ligne.
 */
function initialsFrom(name = "") {
  const parts = name.trim().split(/\s+/);
  const chars = parts.slice(0, 2).map(p => p[0] || "").join("");
  return chars.toUpperCase() || "?";
}

function colorFromName(name = "") {
  // Hash stable → teinte HSL déterministe (pas d'aléatoire)
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 55% 45%)`;
}

const HOME_SCREENS = [
  { value: "/", label: "Tableau de bord" },
  { value: "/tournee", label: "Ma tournée" },
  { value: "/clients", label: "Clients" },
  { value: "/orders", label: "Commandes" },
  { value: "/products", label: "Catalogue" },
  { value: "/stock", label: "Stock" },
  { value: "/reports", label: "Rapports" },
  { value: "/pipeline", label: "Cycle client" },
  { value: "/deals", label: "Opportunités" },
  { value: "/paiements", label: "Paiements" },
];

export default function Profile() {
  const { user } = useAuth();
  const { setLanguage } = useI18n();
  const [p, setP] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/me/profile").then(r => setP(r.data)); }, []);

  const avatarBg = useMemo(() => colorFromName(p?.display_name || p?.name || ""), [p]);
  const initials = useMemo(() => initialsFrom(p?.display_name || p?.name || ""), [p]);

  const save = async (patch) => {
    setSaving(true);
    try {
      const { data } = await api.put("/me/profile", patch);
      setP(data);
      if (patch.language) setLanguage(patch.language);
      toast.success(tt("toast.saved"));
    } catch (e) {
      toast.error(e.response?.data?.detail || tt("toast.error_generic"));
    } finally { setSaving(false); }
  };

  if (!p) return <div className="text-stone-500">{tt("loading")}</div>;

  return (
    <div className="space-y-6 max-w-2xl" data-testid="profile-page">
      <div>
        <p className="overline">Personnalisation</p>
        <h1 className="font-display text-4xl">Mon profil</h1>
      </div>

      <section className="card-crm p-6 flex items-center gap-4">
        <div
          data-testid="profile-avatar"
          className="w-16 h-16 rounded-full flex items-center justify-center text-white font-display text-2xl"
          style={{ background: avatarBg }}
          aria-label={`Avatar ${initials}`}
        >{initials}</div>
        <div className="flex-1">
          <label htmlFor="prof-display" className="text-xs text-stone-500">Nom affiché</label>
          <input id="prof-display" name="display_name" defaultValue={p.display_name}
            onBlur={(e) => e.target.value !== p.display_name && save({ display_name: e.target.value })}
            className="input-crm mt-1 min-h-[44px]" data-testid="profile-display-name" />
          <p className="text-xs text-stone-500 mt-1">{p.email} · {p.role}</p>
        </div>
      </section>

      <section className="card-crm p-6 space-y-4">
        <p className="overline flex items-center gap-1"><Home size={12} /> Écran d'accueil par défaut</p>
        <select
          value={p.home_screen}
          onChange={(e) => save({ home_screen: e.target.value })}
          className="input-crm min-h-[44px]" data-testid="profile-home-screen"
          aria-label="Écran d'accueil"
        >
          {HOME_SCREENS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
        </select>
        <p className="text-xs text-stone-500">Choisissez la page qui s'affiche après connexion.</p>
      </section>

      <section className="card-crm p-6 space-y-4">
        <p className="overline flex items-center gap-1"><Palette size={12} /> Thème</p>
        <div className="flex gap-2" data-testid="profile-theme-group">
          {[
            { v: "light", l: "Clair" }, { v: "dark", l: "Sombre" }, { v: "system", l: "Système" },
          ].map(({ v, l }) => (
            <button key={v} type="button" onClick={() => save({ theme: v })}
              data-testid={`profile-theme-${v}`}
              className={`btn-ghost min-h-[44px] px-4 ${p.theme === v ? "bg-[#4A154B] text-white" : ""}`}>{l}</button>
          ))}
        </div>
      </section>

      <section className="card-crm p-6 space-y-4">
        <p className="overline flex items-center gap-1"><Globe size={12} /> Langue</p>
        <select value={p.language} onChange={(e) => save({ language: e.target.value })}
          className="input-crm min-h-[44px]" data-testid="profile-language">
          <option value="fr">🇫🇷 Français</option>
          <option value="en">🇬🇧 English</option>
        </select>
      </section>

      <section className="card-crm p-6 space-y-4">
        <p className="overline">Format des montants</p>
        <div className="flex gap-2">
          {[
            { v: "with_cents", l: "Avec centimes (12,90 €)" },
            { v: "no_cents",   l: "Sans centimes (13 €)" },
          ].map(({ v, l }) => (
            <button key={v} type="button" onClick={() => save({ amount_format: v })}
              data-testid={`profile-amount-${v}`}
              className={`btn-ghost min-h-[44px] px-4 ${p.amount_format === v ? "bg-[#4A154B] text-white" : ""}`}>{l}</button>
          ))}
        </div>
      </section>

      <section className="card-crm p-6 space-y-4">
        <p className="overline flex items-center gap-1"><Bell size={12} /> Notifications</p>
        {[
          { k: "relance_reminders", l: "Rappels de relance" },
          { k: "unpaid_alerts",     l: "Alertes d'impayés" },
          { k: "morning_summary",   l: "Résumé du matin" },
        ].map(({ k, l }) => (
          <label key={k} className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input type="checkbox" checked={!!p.notif_prefs?.[k]}
              onChange={(e) => save({ notif_prefs: { ...p.notif_prefs, [k]: e.target.checked } })}
              style={{ width: 20, height: 20, accentColor: "var(--ds-accent)" }}
              data-testid={`profile-notif-${k}`} />
            <span>{l}</span>
          </label>
        ))}
      </section>
      {saving && <p className="text-xs text-stone-500">Enregistrement…</p>}
    </div>
  );
}

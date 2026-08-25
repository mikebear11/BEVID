import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Percent, Save, Bell, Palette, RotateCcw } from "lucide-react";
import { t } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";
import StorageQuotaBanner from "@/components/StorageQuotaBanner";

export default function SettingsPage() {
  usePageMeta({ title: `${t("preferences")} · BEVID` });
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/settings").then(r => setS(r.data)); }, []);

  const save = async () => {
    setSaving(true);
    try { await api.put("/settings", s); toast.success(t("toast.preferences_enregistrees")); }
    catch { toast.error(t("toast.erreur")); }
    finally { setSaving(false); }
  };

  // Bloc "Apparence" — thème sidebar + reset menu
  const [sidebarTheme, setSidebarTheme] = useState("sobre");
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    api.get("/me/sidebar-prefs").then(r => setSidebarTheme(r.data?.theme || "sobre")).catch(() => {});
  }, []);
  const pickTheme = async (v) => {
    setSidebarTheme(v);
    try {
      await api.put("/me/sidebar-prefs", { theme: v });
      // Mise à jour du cache local pour que la sidebar re-render au reload
      try {
        const raw = localStorage.getItem("bevid_sidebar_prefs_v1");
        const cur = raw ? JSON.parse(raw) : {};
        localStorage.setItem("bevid_sidebar_prefs_v1", JSON.stringify({ ...cur, theme: v }));
      } catch {}
      toast.success("Thème appliqué — rechargez pour voir");
    } catch { toast.error(t("toast.erreur")); }
  };
  const resetMenu = async () => {
    if (!window.confirm("Réinitialiser l'ordre des sections et les épingles ? Le thème sera conservé.")) return;
    setResetting(true);
    try {
      await api.put("/me/sidebar-prefs", { pinned_user: [], section_order: {} });
      try {
        const raw = localStorage.getItem("bevid_sidebar_prefs_v1");
        const cur = raw ? JSON.parse(raw) : {};
        localStorage.setItem("bevid_sidebar_prefs_v1", JSON.stringify({ ...cur, pinned_user: [], section_order: {} }));
      } catch {}
      toast.success("Menu réinitialisé — rechargez pour voir");
    } catch { toast.error(t("toast.erreur")); }
    finally { setResetting(false); }
  };

  if (!s) return <div className="text-stone-500">{t("loading_ellipsis")}</div>;

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-page">
      <div><p className="overline">{t("automations")}</p><h1 className="font-display text-4xl">{t("preferences")}</h1></div>

      <StorageQuotaBanner />

      <div className="card-crm p-6" data-testid="settings-appearance">
        <div className="flex items-center gap-2 mb-4"><Palette size={18} className="text-[#4A154B]" aria-hidden="true" /><h2 className="font-display text-xl">Apparence de la barre latérale</h2></div>
        <p className="text-xs text-stone-500 mb-3">Choisissez le style qui vous convient le mieux au quotidien.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Thème sidebar">
          {[
            { v: "sobre", l: "Sobre", d: "Beige clair, discret", bg: "bg-stone-100" },
            { v: "vibrant", l: "Vibrant", d: "Dégradé aubergine léger", bg: "bg-gradient-to-b from-[#F0EAF0] to-white" },
            { v: "contrast", l: "Contraste renforcé", d: "Fond noir, texte blanc", bg: "bg-stone-950" },
          ].map(({ v, l, d, bg }) => (
            <button key={v} type="button" role="radio" aria-checked={sidebarTheme === v}
              onClick={() => pickTheme(v)}
              data-testid={`sidebar-theme-${v}`}
              className={`p-3 rounded-lg border text-left transition-all min-h-[80px] ${sidebarTheme === v ? "ring-2 ring-[#4A154B] border-[#4A154B]" : "border-stone-200 dark:border-stone-700 hover:border-stone-400"}`}>
              <div className={`h-8 rounded ${bg} border border-stone-200 dark:border-stone-700 mb-2`} aria-hidden="true" />
              <p className="font-medium text-sm">{l}</p>
              <p className="text-[11px] text-stone-500 mt-0.5">{d}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-700">
          <p className="text-xs font-medium mb-2">Réinitialiser mon menu</p>
          <p className="text-[11px] text-stone-500 mb-3">Efface toutes les épingles et remet l'ordre par défaut des sections. Le thème choisi ci-dessus est conservé.</p>
          <button onClick={resetMenu} disabled={resetting}
            data-testid="reset-menu-btn"
            className="btn-ghost flex items-center gap-2 min-h-[40px] text-sm">
            <RotateCcw size={14} aria-hidden="true" className={resetting ? "animate-spin" : ""} />
            Réinitialiser mon menu
          </button>
        </div>
      </div>

      <div className="card-crm p-6">
        <div className="flex items-center gap-2 mb-4"><Bell size={18} className="text-[#4A154B]" aria-hidden="true" /><h2 className="font-display text-xl">{t("auto_reminders")}</h2></div>
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-stone-50" data-testid="toggle-reminders">
          <input type="checkbox" checked={s.reminders_enabled} onChange={e => setS({...s, reminders_enabled: e.target.checked})} className="w-5 h-5 accent-[#4A154B]" />
          <div className="flex-1">
            <div className="text-sm font-medium">Activer les relances J+15 et J+30</div>
            <div className="text-xs text-stone-500">Message automatique envoyé chaque matin (9h Paris) aux clients dont la commande est impayée depuis 15 ou 30 jours</div>
          </div>
        </label>
        {s.reminders_enabled && (
          <div className="mt-3 pl-8">
            <label className="text-xs text-stone-600">Canal préféré</label>
            <select value={s.reminder_channel} onChange={e => setS({...s, reminder_channel: e.target.value})} className="input-crm mt-1" data-testid="reminder-channel">
              <option value="whatsapp">WhatsApp (Twilio)</option>
              <option value="sms">SMS (Twilio)</option>
              <option value="email">Email (à venir)</option>
            </select>
          </div>
        )}
      </div>

      <div className="card-crm p-6">
        <div className="flex items-center gap-2 mb-4"><Percent size={18} className="text-[#2D5A4C]" /><h3 className="font-display text-xl">Escompte rapide</h3></div>
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-stone-50" data-testid="toggle-discount">
          <input type="checkbox" checked={s.discount_enabled} onChange={e => setS({...s, discount_enabled: e.target.checked})} className="w-5 h-5 accent-[#2D5A4C]" />
          <div className="flex-1">
            <div className="text-sm font-medium">Appliquer automatiquement une remise sur les liens Stripe</div>
            <div className="text-xs text-stone-500">Incite le client à payer immédiatement via le lien Stripe pour accélérer l'encaissement</div>
          </div>
        </label>
        {s.discount_enabled && (
          <div className="mt-3 pl-8 grid grid-cols-2 gap-3">
            <div><label className="text-xs">Remise (%)</label><input type="number" step="0.5" min={0} max={20} value={s.discount_pct} onChange={e => setS({...s, discount_pct: parseFloat(e.target.value)})} className="input-crm mt-1" data-testid="discount-pct" /></div>
            <div><label className="text-xs">Validité (heures)</label><input type="number" min={1} max={168} value={s.discount_hours} onChange={e => setS({...s, discount_hours: parseInt(e.target.value)})} className="input-crm mt-1" /></div>
          </div>
        )}
      </div>

      <div className="card-crm p-6">
        <div className="flex items-center gap-2 mb-4"><MessageSquare size={18} className="text-[#25D366]" /><h3 className="font-display text-xl">WhatsApp / SMS via Twilio</h3></div>
        <p className="text-sm text-stone-600 mb-2">Pour envoyer WhatsApp/SMS directement (relances auto + reçus 1-clic), ajoute tes credentials Twilio dans <code className="bg-stone-100 px-1">/app/backend/.env</code> :</p>
        <pre className="bg-stone-50 border border-stone-200 rounded p-3 text-xs overflow-x-auto">TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  (sandbox par défaut)
TWILIO_SMS_FROM=+33xxxxxxxxx</pre>
        <p className="text-xs text-stone-500 mt-2">Obtiens tes clés sur <a href="https://console.twilio.com" target="_blank" rel="noreferrer" className="text-[#4A154B] underline">console.twilio.com</a>. En sandbox WhatsApp, chaque destinataire doit d'abord envoyer "join &lt;code&gt;" au numéro sandbox.</p>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="save-settings"><Save size={16} aria-hidden="true" /> {saving ? t("saving_ellipsis") : t("save")}</button>
    </div>
  );
}

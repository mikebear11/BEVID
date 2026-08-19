import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Percent, Save, Bell } from "lucide-react";
import { t } from "@/lib/i18n";

export default function SettingsPage() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/settings").then(r => setS(r.data)); }, []);

  const save = async () => {
    setSaving(true);
    try { await api.put("/settings", s); toast.success(t("toast.preferences_enregistrees")); }
    catch { toast.error(t("toast.erreur")); }
    finally { setSaving(false); }
  };

  if (!s) return <div className="text-stone-500">Chargement…</div>;

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-page">
      <div><p className="overline">Automatisations</p><h1 className="font-display text-4xl">Préférences</h1></div>

      <div className="card-crm p-6">
        <div className="flex items-center gap-2 mb-4"><Bell size={18} className="text-[#4A154B]" /><h3 className="font-display text-xl">Relances automatiques</h3></div>
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

      <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2" data-testid="save-settings"><Save size={16} /> {saving ? "Enregistrement…" : "Enregistrer"}</button>
    </div>
  );
}

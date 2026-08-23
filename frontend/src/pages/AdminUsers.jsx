import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { KeyRound, UserPlus, ShieldCheck, ShieldAlert, Copy } from "lucide-react";
import PuceEtat from "@/components/system/PuceEtat";
import { t } from "@/lib/i18n";

export default function AdminUsers() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", role: "commercial" });
  const [creating, setCreating] = useState(false);
  const [lastTemp, setLastTemp] = useState(null);

  const load = async () => {
    const [u, r] = await Promise.all([
      api.get("/admin/users"),
      api.get("/admin/reset-requests"),
    ]);
    setUsers(u.data);
    setRequests(r.data);
  };
  useEffect(() => { load(); }, []);

  if (user?.role !== "manager") {
    return <div className="p-8 text-stone-500">Réservé au manager.</div>;
  }

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post("/admin/users", form);
      setLastTemp({ email: data.user.email, tmp: data.temp_password });
      setForm({ name: "", email: "", role: "commercial" });
      toast.success(t("toast.utilisateur_cree"));
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("toast.erreur"));
    } finally { setCreating(false); }
  };

  const resetPwd = async (uid) => {
    const { data } = await api.post(`/admin/users/${uid}/reset-password`);
    const target = users.find(x => x.id === uid);
    setLastTemp({ email: target?.email, tmp: data.temp_password });
    toast.success(t("toast.mot_de_passe_temporaire_genere"));
  };

  const approveRequest = async (rid) => {
    const { data } = await api.post(`/admin/reset-requests/${rid}/approve`);
    setLastTemp({ email: data.email, tmp: data.temp_password });
    toast.success(t("toast.demande_traitee"));
    load();
  };

  const toggle = async (uid, active) => {
    await api.put(`/admin/users/${uid}`, { active: !active });
    load();
  };

  const copy = (txt) => {
    navigator.clipboard.writeText(txt);
    toast.success(t("toast.copie"));
  };

  return (
    <div className="space-y-6" data-testid="admin-users-page">
      <div>
        <p className="overline">Administration</p>
        <h2 className="font-display text-3xl mt-1">{t("users")}</h2>
      </div>

      {lastTemp && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-4" data-testid="temp-password-banner">
          <div>
            <p className="text-sm font-medium text-amber-900">Mot de passe temporaire pour <b>{lastTemp.email}</b></p>
            <code className="mt-2 inline-block bg-white px-3 py-1.5 rounded-md text-amber-900 font-mono text-sm">{lastTemp.tmp}</code>
            <p className="text-xs text-amber-700 mt-2">L'utilisateur sera invité à le changer à la prochaine connexion. Communiquez-le en canal sécurisé.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => copy(lastTemp.tmp)} className="btn-ghost min-h-[44px]" data-testid="copy-temp-btn"><Copy size={16} /></button>
            <button onClick={() => setLastTemp(null)} className="btn-ghost min-h-[44px]" data-testid="close-temp-btn">✕</button>
          </div>
        </div>
      )}

      {requests.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4" data-testid="reset-requests-section">
          <h3 className="font-medium mb-3 flex items-center gap-2"><ShieldAlert size={18} /> Demandes de réinitialisation ({requests.length})</h3>
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{r.email}</p>
                  <p className="text-xs text-stone-500">Reçue le {r.created_at?.slice(0, 16).replace("T", " ")}</p>
                </div>
                <button onClick={() => approveRequest(r.id)} className="btn-primary min-h-[44px]" data-testid={`approve-reset-${r.id}`}>
                  Approuver
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2"><UserPlus size={18} /> Ajouter un utilisateur</h3>
        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input required placeholder={t("name")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-crm min-h-[48px]" data-testid="new-user-name" />
          <input required type="email" placeholder={t("email")} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-crm min-h-[48px]" data-testid="new-user-email" />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="input-crm min-h-[48px]" data-testid="new-user-role">
            <option value="commercial">Commercial</option>
            <option value="manager">Manager</option>
          </select>
          <button type="submit" disabled={creating} className="btn-primary min-h-[48px]" data-testid="new-user-submit">
            {creating ? "…" : t("add")}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto scroll-shadow">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-stone-50">
            <tr className="text-left text-stone-500">
              <th className="p-3 sticky left-0 bg-stone-50 z-10">{t("name")}</th>
              <th className="p-3">{t("email")}</th>
              <th className="p-3">{t("role")}</th>
              <th className="p-3">{t("column.status")}</th>
              <th className="p-3">{t("column.date")}</th>
              <th className="p-3 text-right">{t("column.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-stone-100" data-testid={`user-row-${u.id}`}>
                <td className="p-3 font-medium sticky left-0 bg-white z-10">{u.name}</td>
                <td className="p-3 text-stone-600">{u.email}</td>
                <td className="p-3"><PuceEtat etat="info" variante="douce" libelle={u.role} /></td>
                <td className="p-3">
                  {u.active === false ? <span className="text-red-600 text-xs">Désactivé</span> : <span className="text-emerald-600 text-xs flex items-center gap-1"><ShieldCheck size={12} /> Actif</span>}
                  {u.must_reset && <span className="ml-2 text-amber-600 text-xs">Reset requis</span>}
                </td>
                <td className="p-3 text-stone-500 text-xs">{u.created_at?.slice(0, 10)}</td>
                <td className="p-3 text-right">
                  <button onClick={() => resetPwd(u.id)} className="btn-ghost text-xs min-h-[44px]" data-testid={`reset-pwd-${u.id}`}><KeyRound size={14} /> Reset MDP</button>
                  <button onClick={() => toggle(u.id, u.active !== false)} className="btn-ghost text-xs min-h-[44px] ml-2" data-testid={`toggle-${u.id}`}>{u.active !== false ? "Désactiver" : "Activer"}</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-stone-400">Aucun utilisateur.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

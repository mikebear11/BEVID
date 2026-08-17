import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "commercial", language: lang });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      setLanguage(form.language);
      toast.success("✓");
      nav("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Échec");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="register-form">
        <div>
          <p className="overline">{t("welcome")}</p>
          <h2 className="font-display text-4xl mt-1">{t("register")}</h2>
        </div>
        <div>
          <label className="text-xs text-stone-600">{t("language")}</label>
          <select
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
            className="input-crm mt-1 min-h-[48px]"
            data-testid="register-lang"
          >
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-stone-600">{t("name")}</label>
          <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-crm mt-1 min-h-[48px]" data-testid="register-name" />
        </div>
        <div>
          <label className="text-xs text-stone-600">{t("email")}</label>
          <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-crm mt-1 min-h-[48px]" data-testid="register-email" />
        </div>
        <div>
          <label className="text-xs text-stone-600">{t("password")}</label>
          <input type="password" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-crm mt-1 min-h-[48px]" data-testid="register-password" />
        </div>
        <div>
          <label className="text-xs text-stone-600">{t("role")}</label>
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="input-crm mt-1 min-h-[48px]" data-testid="register-role">
            <option value="commercial">Commercial</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full min-h-[48px]" data-testid="register-submit">
          {loading ? "…" : t("register")}
        </button>
        <p className="text-sm text-stone-500 text-center">
          <Link to="/login" className="text-[#4A154B] font-medium">{t("back_to_login")}</Link>
        </p>
      </form>
    </div>
  );
}

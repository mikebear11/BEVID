import React, { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import BevidLogo from "@/components/BevidLogo";
import PasswordInput from "@/components/PasswordInput";
import { usePageMeta } from "@/lib/pageMeta";

function scorePassword(pwd) {
  if (!pwd) return { score: 0, label: "" };
  let s = 0;
  if (pwd.length >= 10) s++;
  if (pwd.length >= 14) s++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) s++;
  if (/[0-9]/.test(pwd)) s++;
  if (/[^a-zA-Z0-9]/.test(pwd)) s++;
  const label = ["Très faible", "Faible", "Correct", "Bon", "Fort", "Excellent"][s];
  return { score: s, label };
}

export default function Register() {
  usePageMeta({
    title: "Créer un compte · BEVID",
    canonical: "/register",
    description: "Démarrez votre essai BEVID — 7 jours gratuits, sans carte bancaire.",
  });
  const { register } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", password_confirm: "", language: lang, accept_terms: false });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => scorePassword(form.password), [form.password]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Nom requis.";
    if (!form.email.trim()) e.email = "Email requis.";
    if (form.password.length < 10) e.password = "10 caractères minimum.";
    if (form.password !== form.password_confirm) e.password_confirm = "Les deux mots de passe ne correspondent pas.";
    if (!form.accept_terms) e.accept_terms = "Vous devez accepter les CGU et la politique de confidentialité.";
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        password_confirm: form.password_confirm,
        language: form.language,
        accept_terms: form.accept_terms,
      });
      setLanguage(form.language);
      toast.success(t("toast.account_created"));
      nav("/");
    } catch (err) {
      const detail = err.response?.data;
      if (detail?.errors) setErrors(detail.errors);
      toast.error(detail?.detail || t("toast.register_failed"));
    } finally { setLoading(false); }
  };

  const barColor = strength.score >= 4 ? "var(--ds-state-success)" : strength.score >= 2 ? "var(--ds-state-warning)" : "var(--ds-state-danger)";

  return (
    <div className="min-h-screen flex">
      <div data-testid="brand-panel" className="hidden md:flex md:w-1/2 relative bg-[#4A154B] text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-90" aria-hidden="true" style={{ background: "radial-gradient(circle at 20% 20%, #6B2470 0%, transparent 55%), radial-gradient(circle at 80% 70%, #B076B4 0%, transparent 45%), linear-gradient(135deg, #4A154B 0%, #2B0C2D 100%)" }} />
        <div className="absolute inset-0 opacity-10" aria-hidden="true" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="relative z-10 flex items-center gap-2">
          <BevidLogo size={28} />
          <span className="overline text-white/80">BEVID · CRM</span>
        </div>
        <div className="relative z-10">
          <h1 className="font-display text-5xl leading-tight mb-4">{t("login_hero_title_line1")}<br/>{t("login_hero_title_line2")}</h1>
          <p className="text-white/80 max-w-md">{t("login_hero_subtitle")}</p>
        </div>
        <div className="relative z-10 overline text-white/50">© 2026 BEVID</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4" data-testid="register-form" noValidate>
          <div className="flex items-start justify-between">
            <div>
              <p className="overline">{t("welcome")}</p>
              <h2 className="font-display text-4xl mt-1">{t("register")}</h2>
            </div>
            <select
              id="reg-lang-top" name="language"
              value={form.language}
              onChange={(e) => { setForm({ ...form, language: e.target.value }); setLanguage(e.target.value); }}
              className="text-sm border border-stone-300 rounded-lg px-2 py-1.5 bg-white min-h-[44px]"
              data-testid="register-lang"
              aria-label={t("language")}
            >
              {languages.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
            </select>
          </div>

          <p className="text-xs text-stone-500 -mt-1">Les managers sont créés par invitation depuis l'espace d'administration.</p>

          <div>
            <label htmlFor="reg-name" className="text-xs text-stone-600 dark:text-stone-300 block">{t("name")}</label>
            <input id="reg-name" name="name" autoComplete="name" required value={form.name}
              aria-invalid={!!errors.name} aria-describedby={errors.name ? "err-name" : undefined}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="input-crm mt-1 min-h-[48px]" data-testid="register-name" />
            {errors.name && <p id="err-name" className="text-xs mt-1" style={{ color: "var(--ds-state-danger-text)" }}>{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="reg-email" className="text-xs text-stone-600 dark:text-stone-300 block">{t("email")}</label>
            <input id="reg-email" name="email" type="email" autoComplete="email" required value={form.email}
              aria-invalid={!!errors.email} aria-describedby={errors.email ? "err-email" : undefined}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="input-crm mt-1 min-h-[48px]" data-testid="register-email" />
            {errors.email && <p id="err-email" className="text-xs mt-1" style={{ color: "var(--ds-state-danger-text)" }}>{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="reg-password" className="text-xs text-stone-600 dark:text-stone-300 block">{t("password")}</label>
            <PasswordInput id="reg-password" name="password" required minLength={10} value={form.password}
              aria-invalid={!!errors.password} aria-describedby={errors.password ? "err-password" : "hint-password"}
              onChange={e => setForm({ ...form, password: e.target.value })}
              className="mt-1" autoComplete="new-password" data-testid="register-password" />
            {form.password && (
              <div className="mt-1.5" data-testid="password-strength">
                <div className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
                  <div style={{ width: `${(strength.score / 5) * 100}%`, background: barColor, transition: "width 0.2s" }} className="h-full" />
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--ds-text-muted)" }}>Robustesse : <strong>{strength.label}</strong></p>
              </div>
            )}
            <p id="hint-password" className="text-xs mt-1" style={{ color: "var(--ds-text-muted)" }}>10 caractères min · idéalement majuscules + chiffres + symboles</p>
            {errors.password && <p id="err-password" className="text-xs mt-1" style={{ color: "var(--ds-state-danger-text)" }}>{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="reg-password-confirm" className="text-xs text-stone-600 dark:text-stone-300 block">Confirmer le mot de passe</label>
            <PasswordInput id="reg-password-confirm" name="password_confirm" required minLength={10} value={form.password_confirm}
              aria-invalid={!!errors.password_confirm} aria-describedby={errors.password_confirm ? "err-password-confirm" : undefined}
              onChange={e => setForm({ ...form, password_confirm: e.target.value })}
              className="mt-1" autoComplete="new-password" data-testid="register-password-confirm" />
            {errors.password_confirm && <p id="err-password-confirm" className="text-xs mt-1" style={{ color: "var(--ds-state-danger-text)" }}>{errors.password_confirm}</p>}
          </div>

          <label htmlFor="reg-terms" className="flex items-start gap-2 text-sm cursor-pointer">
            <input id="reg-terms" name="accept_terms" type="checkbox" checked={form.accept_terms}
              aria-invalid={!!errors.accept_terms} aria-describedby={errors.accept_terms ? "err-terms" : undefined}
              onChange={e => setForm({ ...form, accept_terms: e.target.checked })}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--ds-accent)" }}
              data-testid="register-accept-terms" />
            <span style={{ color: "var(--ds-text-primary)" }}>
              J'accepte les <Link to="/legal/cgu" className="underline" style={{ color: "var(--ds-accent)" }}>CGU</Link>, les <Link to="/legal/cgv" className="underline" style={{ color: "var(--ds-accent)" }}>CGV</Link> et la
              {" "}<Link to="/legal/politique-confidentialite" className="underline" style={{ color: "var(--ds-accent)" }}>politique de confidentialité (RGPD)</Link>.
            </span>
          </label>
          {errors.accept_terms && <p id="err-terms" className="text-xs" style={{ color: "var(--ds-state-danger-text)" }}>{errors.accept_terms}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full min-h-[48px]" data-testid="register-submit">
            {loading ? "…" : t("register")}
          </button>
          <p className="text-sm text-stone-500 text-center">
            <Link to="/login" className="text-[#4A154B] font-medium">{t("back_to_login")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

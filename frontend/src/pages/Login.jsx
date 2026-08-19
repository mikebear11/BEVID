import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import PasswordInput from "@/components/PasswordInput";
import { t } from "@/lib/i18n";

export default function Login() {
  const { login } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [netError, setNetError] = useState(null);
  const [rateError, setRateError] = useState(null);
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname && location.state.from.pathname !== "/login"
    ? location.state.from.pathname + (location.state.from.search || "")
    : null;

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setNetError(null); setRateError(null);
    setLoading(true);
    try {
      const u = await login(email, password);
      if (u.language) setLanguage(u.language);
      toast.success(t("login") + " ✓");
      // Redirection : deep-link explicite > home_screen préférence > racine
      const dest = u.must_reset ? "/change-password" : (from || u.home_screen || "/");
      nav(dest, { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (!err.response) {
        setNetError("Connexion impossible. Vérifiez votre réseau et réessayez.");
      } else if (status === 422 && data?.errors) {
        setErrors(data.errors);
      } else if (status === 429) {
        // Message dans le formulaire, pas seulement en toast
        setRateError(data?.detail || t("toast.login_ratelimit"));
      } else {
        setErrors({ password: data?.detail || "Identifiants invalides" });
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      <div data-testid="brand-panel" className="hidden md:flex md:w-1/2 relative bg-[#4A154B] text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1562601579-599dec564e06?w=1200')", backgroundSize: "cover", backgroundPosition: "center", mixBlendMode: "multiply" }} />
        <div className="relative z-10 flex items-center gap-2">
          <BevidLogo size={28} />
          <span className="overline text-white/80">BEVID · CRM</span>
        </div>
        <div className="relative z-10">
          <h1 className="font-display text-5xl leading-tight mb-4">La distribution de boissons,<br/>simplifiée.</h1>
          <p className="text-white/80 max-w-md">Saisie vocale, hors-ligne, DRM douane, DSO temps réel. Vos commerciaux passent enfin plus de temps sur le terrain.</p>
        </div>
        <div className="relative z-10 overline text-white/50">© 2026 BEVID</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="login-form" noValidate>
          <div className="flex items-start justify-between">
            <div>
              <p className="overline">{t("welcome")}</p>
              <h2 className="font-display text-4xl mt-1">{t("login")}</h2>
            </div>
            <select
              id="login-lang" name="language"
              value={lang}
              onChange={(e) => setLanguage(e.target.value)}
              className="text-sm border border-stone-300 rounded-lg px-2 py-1.5 bg-white min-h-[44px]"
              data-testid="login-lang-select"
              aria-label={t("language")}
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>
          </div>

          {netError && (
            <div role="alert" data-testid="login-net-error"
                 style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--ds-state-danger-soft-bg)", color: "var(--ds-state-danger-soft-fg)", borderRadius: "var(--ds-radius-md)", border: "1px solid var(--ds-state-danger)" }}>
              <WifiOff size={16} aria-hidden="true" />
              <span className="text-sm">{netError}</span>
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="text-xs text-stone-600 dark:text-stone-300 block">{t("email")}</label>
            <input id="login-email" name="email" type="email" autoComplete="username" required inputMode="email"
              value={email} onChange={e => setEmail(e.target.value)}
              aria-invalid={!!errors.email} aria-describedby={errors.email ? "login-email-err" : undefined}
              className="input-crm mt-1 min-h-[48px]" data-testid="login-email" />
            {errors.email && <p id="login-email-err" className="text-xs mt-1" style={{ color: "var(--ds-state-danger-text)" }}>{errors.email}</p>}
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-xs text-stone-600 dark:text-stone-300">{t("password")}</label>
              <Link to="/forgot-password" className="text-xs text-[#4A154B] font-medium hover:underline" data-testid="login-forgot-link">
                {t("forgot_password")}
              </Link>
            </div>
            <PasswordInput id="login-password" name="password" required value={password}
              aria-invalid={!!errors.password} aria-describedby={errors.password ? "login-password-err" : undefined}
              onChange={e => setPassword(e.target.value)} className="mt-1" autoComplete="current-password" data-testid="login-password" />
            {errors.password && <p id="login-password-err" className="text-xs mt-1" style={{ color: "var(--ds-state-danger-text)" }}>{errors.password}</p>}
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full min-h-[48px]" data-testid="login-submit">
            {loading ? "…" : t("login")}
          </button>
          {rateError && (
            <p role="alert" data-testid="login-rate-error"
               className="text-sm text-center"
               style={{
                 color: "var(--ds-state-danger-soft-fg)",
                 background: "var(--ds-state-danger-soft-bg)",
                 border: "1px solid var(--ds-state-danger)",
                 padding: "10px 12px", borderRadius: "var(--ds-radius-md)",
               }}>{rateError}</p>
          )}
          <p className="text-sm text-stone-500 text-center">
            <Link to="/register" className="text-[#4A154B] font-medium">{t("register")}</Link>
            {" · "}
            <Link to="/pricing" className="text-[#4A154B] font-medium" data-testid="login-pricing-link">Voir les tarifs</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

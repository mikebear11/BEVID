import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { Wine } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import PasswordInput from "@/components/PasswordInput";

export default function Login() {
  const { login } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      if (u.language) setLanguage(u.language);
      toast.success(t("login") + " ✓");
      nav(u.must_reset ? "/change-password" : "/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Échec");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 relative bg-[#4A154B] text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1562601579-599dec564e06?w=1200')", backgroundSize: "cover", backgroundPosition: "center", mixBlendMode: "multiply" }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <BevidLogo size={28} />
            <span className="overline text-white/80">BEVID · CRM</span>
          </div>
        </div>
        <div className="relative z-10">
          <h1 className="font-display text-5xl leading-tight mb-4">La distribution de boissons,<br/>simplifiée.</h1>
          <p className="text-white/80 max-w-md">Saisie vocale, assistant IA par compte, rapports en un clic. Vos commerciaux passent enfin plus de temps sur le terrain.</p>
        </div>
        <div className="relative z-10 overline text-white/50">© 2026 BEVID</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="login-form">
          <div className="flex items-start justify-between">
            <div>
              <p className="overline">{t("welcome")}</p>
              <h2 className="font-display text-4xl mt-1">{t("login")}</h2>
            </div>
            <select
              value={lang}
              onChange={(e) => setLanguage(e.target.value)}
              className="text-sm border border-stone-300 rounded-lg px-2 py-1.5 bg-white min-h-[44px]"
              data-testid="login-lang-select"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-600">{t("email")}</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-crm mt-1 min-h-[48px]" data-testid="login-email" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-stone-600">{t("password")}</label>
              <Link to="/forgot-password" className="text-xs text-[#4A154B] font-medium hover:underline" data-testid="login-forgot-link">
                {t("forgot_password")}
              </Link>
            </div>
            <PasswordInput required value={password} onChange={e => setPassword(e.target.value)} className="mt-1" autoComplete="current-password" data-testid="login-password" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full min-h-[48px]" data-testid="login-submit">
            {loading ? "…" : t("login")}
          </button>
          <p className="text-sm text-stone-500 text-center">
            <Link to="/register" className="text-[#4A154B] font-medium">{t("register")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Wine } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Connexion réussie");
      nav("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Échec de connexion");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 relative bg-[#4A154B] text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1562601579-599dec564e06?w=1200')", backgroundSize: "cover", backgroundPosition: "center", mixBlendMode: "multiply" }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <Wine size={22} />
            <span className="overline text-white/80">Cellier · CRM</span>
          </div>
        </div>
        <div className="relative z-10">
          <h1 className="font-display text-5xl leading-tight mb-4">La distribution de boissons,<br/>simplifiée.</h1>
          <p className="text-white/80 max-w-md">Saisie vocale, assistant IA par compte, rapports en un clic. Vos commerciaux passent enfin plus de temps sur le terrain.</p>
        </div>
        <div className="relative z-10 overline text-white/50">© 2026 Cellier</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="login-form">
          <div>
            <p className="overline">Bienvenue</p>
            <h2 className="font-display text-4xl mt-1">Connexion</h2>
          </div>
          <div>
            <label className="text-xs text-stone-600">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-crm mt-1" data-testid="login-email" />
          </div>
          <div>
            <label className="text-xs text-stone-600">Mot de passe</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="input-crm mt-1" data-testid="login-password" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full" data-testid="login-submit">
            {loading ? "…" : "Se connecter"}
          </button>
          <p className="text-sm text-stone-500 text-center">
            Pas de compte ? <Link to="/register" className="text-[#4A154B] font-medium">Créer un compte</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

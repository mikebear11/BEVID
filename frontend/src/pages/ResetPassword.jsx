import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import PasswordInput from "@/components/PasswordInput";

export default function ResetPassword() {
  const { token } = useParams();
  const nav = useNavigate();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pwd !== confirm) { toast.error("Les mots de passe ne correspondent pas"); return; }
    if (pwd.length < 8) { toast.error("8 caractères minimum"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pwd });
      setDone(true);
      setTimeout(() => nav("/login"), 2500);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Lien invalide ou expiré");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-sm border border-stone-200" data-testid="reset-password-page">
        <p className="overline">BEVID</p>
        <h2 className="font-display text-3xl mt-1 mb-6">Nouveau mot de passe</h2>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-lg text-emerald-800 text-sm" data-testid="reset-done-message">
              <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0" />
              <p>Mot de passe mis à jour. Redirection vers la connexion…</p>
            </div>
            <Link to="/login" className="btn-primary w-full flex items-center justify-center min-h-[48px]">Se connecter</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
            <p className="text-sm text-stone-600">Choisissez un mot de passe sûr (8 caractères minimum).</p>
            <div>
              <label className="text-xs text-stone-600">Nouveau mot de passe</label>
              <PasswordInput required minLength={8} value={pwd} onChange={e => setPwd(e.target.value)} className="mt-1" autoComplete="new-password" data-testid="reset-new" />
            </div>
            <div>
              <label className="text-xs text-stone-600">Confirmer</label>
              <PasswordInput required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} className="mt-1" autoComplete="new-password" data-testid="reset-confirm" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full min-h-[48px]" data-testid="reset-submit">
              {loading ? "…" : "Enregistrer"}
            </button>
            <p className="text-sm text-stone-500 text-center">
              <Link to="/login" className="text-[#4A154B] font-medium">Retour à la connexion</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

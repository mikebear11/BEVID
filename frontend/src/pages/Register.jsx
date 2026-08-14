import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "commercial" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      toast.success("Compte créé");
      nav("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Échec");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="register-form">
        <div>
          <p className="overline">Rejoindre</p>
          <h2 className="font-display text-4xl mt-1">Créer un compte</h2>
        </div>
        <div>
          <label className="text-xs text-stone-600">Nom complet</label>
          <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-crm mt-1" data-testid="register-name" />
        </div>
        <div>
          <label className="text-xs text-stone-600">Email</label>
          <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-crm mt-1" data-testid="register-email" />
        </div>
        <div>
          <label className="text-xs text-stone-600">Mot de passe</label>
          <input type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-crm mt-1" data-testid="register-password" />
        </div>
        <div>
          <label className="text-xs text-stone-600">Rôle</label>
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="input-crm mt-1" data-testid="register-role">
            <option value="commercial">Commercial</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full" data-testid="register-submit">
          {loading ? "…" : "Créer mon compte"}
        </button>
        <p className="text-sm text-stone-500 text-center">
          Déjà un compte ? <Link to="/login" className="text-[#4A154B] font-medium">Se connecter</Link>
        </p>
      </form>
    </div>
  );
}

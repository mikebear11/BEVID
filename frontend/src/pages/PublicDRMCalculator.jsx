import React, { useState } from "react";
import { Link } from "react-router-dom";
import BevidLogo from "@/components/BevidLogo";
import LegalFooter from "@/components/LegalFooter";
import { Calculator, ArrowRight, AlertTriangle } from "lucide-react";
import { usePageMeta } from "@/lib/pageMeta";
import axios from "axios";

/**
 * /calculateur-drm — outil public gratuit d'accise brasserie.
 *
 * Aucune authentification. Page indexable, canonical propre. Sert de vitrine
 * SEO et de porte d'entrée sur BEVID (bandeau discret vers l'app).
 */
const CATEGORIES = [
  { key: "biere_petite_brasserie", label: "Bière — petite brasserie (< 200 000 hL/an)", degree: 5.5 },
  { key: "biere_standard",         label: "Bière — brasserie standard", degree: 5.5 },
  { key: "vin_tranquille",         label: "Vin tranquille",              degree: 12.5 },
  { key: "vin_mousseux",           label: "Vin mousseux / effervescent", degree: 11.5 },
  { key: "spiritueux",             label: "Spiritueux",                  degree: 40.0 },
  { key: "cidre_poire",            label: "Cidre / poiré",               degree: 4.5 },
];

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

export default function PublicDRMCalculator() {
  usePageMeta({
    title: "Calculateur DRM gratuit · Accise bière, vin, spiritueux — BEVID",
    canonical: "/calculateur-drm",
    description: "Calcul instantané et gratuit de vos droits d'accise DRM : bière petite brasserie, vin, spiritueux, cidre. Détail du calcul étape par étape. Aucun compte requis.",
  });
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [volume, setVolume] = useState("1000");
  const [degree, setDegree] = useState("5.5");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const compute = async () => {
    setErr(""); setResult(null); setBusy(true);
    try {
      const url = `${BACKEND}/api/public/drm-calculator?volume_l=${encodeURIComponent(volume)}&degree=${encodeURIComponent(degree)}&category=${encodeURIComponent(category)}`;
      const { data } = await axios.get(url);
      setResult(data);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Calcul impossible");
    } finally { setBusy(false); }
  };

  const eur = (n) => n?.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }) || "—";

  return (
    <div className="min-h-screen bg-stone-50" data-testid="public-drm-page">
      <header className="border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <BevidLogo size={22} />
            <span className="overline">BEVID</span>
          </Link>
          <Link to="/pricing" className="text-sm text-[#4A154B] font-medium hover:underline">Voir les forfaits</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="overline flex items-center gap-1"><Calculator size={12} aria-hidden="true" /> Outil gratuit</p>
        <h1 className="font-display text-4xl md:text-5xl mt-1">Calculateur DRM</h1>
        <p className="text-stone-600 mt-2 max-w-2xl">
          Calculez instantanément vos droits d'accise sur les alcools produits (bière, vin, spiritueux, cidre). Détail du calcul, aucune inscription requise.
        </p>

        <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card-crm p-5 space-y-4" data-testid="drm-form">
            <div>
              <label htmlFor="drm-category" className="text-xs text-stone-500 block mb-1">Catégorie</label>
              <select id="drm-category" value={category} onChange={e => {
                setCategory(e.target.value);
                const c = CATEGORIES.find(x => x.key === e.target.value);
                if (c) setDegree(String(c.degree));
              }}
                className="input-crm min-h-[44px]" data-testid="drm-category">
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="drm-volume" className="text-xs text-stone-500 block mb-1">Volume produit (litres)</label>
              <input id="drm-volume" type="number" min="0" step="1"
                value={volume} onChange={e => setVolume(e.target.value)}
                className="input-crm min-h-[44px]" data-testid="drm-volume" />
            </div>
            <div>
              <label htmlFor="drm-degree" className="text-xs text-stone-500 block mb-1">Degré alcoolique (% vol)</label>
              <input id="drm-degree" type="number" min="0" max="100" step="0.1"
                value={degree} onChange={e => setDegree(e.target.value)}
                className="input-crm min-h-[44px]" data-testid="drm-degree" />
            </div>
            <button onClick={compute} disabled={busy}
              className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2"
              data-testid="drm-compute-btn">
              {busy ? "Calcul…" : "Calculer l'accise"} <ArrowRight size={16} aria-hidden="true" />
            </button>
            {err && <p className="text-sm text-red-700" data-testid="drm-error">{err}</p>}
          </div>

          <div className="card-crm p-5" data-testid="drm-result">
            {!result && <p className="text-stone-500 text-sm">Renseignez volume et degré puis cliquez sur « Calculer » pour obtenir le détail.</p>}
            {result && (
              <div className="space-y-3">
                <div>
                  <p className="overline">Accise due</p>
                  <p className="font-display text-4xl text-[#4A154B]" data-testid="drm-accise">{eur(result.computed.accise_eur)}</p>
                </div>
                <div className="border-t border-stone-200 pt-3 space-y-1">
                  <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Détail du calcul</p>
                  {result.steps.map((s, i) => (
                    <p key={i} className="text-sm text-stone-700" data-testid={`drm-step-${i}`}>{s}</p>
                  ))}
                </div>
                <div className="border-t border-stone-200 pt-3">
                  <p className="text-xs text-stone-500">Tarif appliqué : <strong>{result.computed.tarif_eur_hl_alcool_pur} €/hL d'alcool pur</strong></p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-2 text-sm text-amber-900" data-testid="drm-disclaimer">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Barème indicatif 2026. <strong>La conformité du format et l'exactitude des tarifs doivent être validées auprès de la DGDDI avant tout dépôt officiel.</strong> Une DRM fausse expose à un redressement.
          </p>
        </div>

        <section className="mt-10 bg-[#4A154B] text-white rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between" data-testid="drm-upsell">
          <div>
            <p className="overline text-white/70">BEVID</p>
            <h2 className="font-display text-2xl">Générez votre DRM automatiquement</h2>
            <p className="text-white/80 text-sm mt-1">Cet outil fait partie de BEVID, le CRM qui construit votre DRM mensuelle depuis vos stocks — sans tableur, sans copier-coller.</p>
          </div>
          <Link to="/pricing" className="bg-white text-[#4A154B] px-5 py-3 rounded-lg font-medium min-h-[44px] flex items-center gap-2 hover:bg-white/90" data-testid="drm-cta-pricing">
            Voir BEVID <ArrowRight size={16} />
          </Link>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}

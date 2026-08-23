import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Cookie } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import LegalFooter from "@/components/LegalFooter";
import { usePageMeta } from "@/lib/pageMeta";
import { revokeAnalytics, grantAnalytics, analyticsConsentStatus } from "@/components/PostHogConsent";
import { toast } from "sonner";

export default function LegalCookies() {
  usePageMeta({
    title: "Politique cookies · BEVID",
    canonical: "/legal/cookies",
    description: "Détail des cookies et traceurs utilisés par BEVID — gestion du consentement.",
  });
  const status = analyticsConsentStatus();

  const revoke = () => {
    revokeAnalytics();
    toast.success("Consentement analytique révoqué.");
    setTimeout(() => window.location.reload(), 400);
  };
  const grant = () => {
    grantAnalytics();
    toast.success("Consentement analytique accordé.");
    setTimeout(() => window.location.reload(), 400);
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-[#4A154B] dark:text-[#B076B4]">
            <BevidLogo size={22} />
            <span className="font-display text-xl" aria-hidden="true">BEVID</span>
          </Link>
          <Link to="/login" className="text-sm text-stone-500 hover:text-[#4A154B] flex items-center gap-1 min-h-[44px]">
            <ArrowLeft size={14} aria-hidden="true" /> Retour
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12" data-testid="legal-cookies-page">
        <p className="overline flex items-center gap-2"><Cookie size={12} aria-hidden="true" /> Traceurs</p>
        <h1 className="font-display text-4xl md:text-5xl mt-1 mb-8">Politique cookies</h1>

        <section className="space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="font-display text-xl mb-2">Qu'est-ce qu'un cookie ?</h2>
            <p>Un cookie est un petit fichier texte déposé sur votre appareil lors de la visite d'un site ou d'une application web. Il permet de conserver des informations d'usage (session, langue, préférence de thème) et, dans certains cas, de mesurer l'audience.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Cookies strictement nécessaires (dispensés de consentement)</h2>
            <p>Ces cookies sont indispensables au fonctionnement du service. Ils ne peuvent pas être désactivés sans empêcher l'usage normal de la plateforme.</p>
            <div className="overflow-x-auto scroll-shadow mt-3 border border-stone-200 dark:border-stone-700 rounded-xl">
              <table className="w-full text-xs min-w-[560px]">
                <thead className="bg-stone-100 dark:bg-stone-800">
                  <tr className="text-left">
                    <th className="p-2">Nom</th><th className="p-2">Finalité</th><th className="p-2">Durée</th><th className="p-2">Émetteur</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-stone-200 dark:border-stone-700"><td className="p-2 font-mono">bevid_auth</td><td className="p-2">Authentification (httpOnly, Secure, SameSite=Lax)</td><td className="p-2">90 jours</td><td className="p-2">BEVID</td></tr>
                  <tr className="border-t border-stone-200 dark:border-stone-700"><td className="p-2 font-mono">bevid_session</td><td className="p-2">Flag non-sensible pour la reprise hors-ligne</td><td className="p-2">Session</td><td className="p-2">BEVID</td></tr>
                  <tr className="border-t border-stone-200 dark:border-stone-700"><td className="p-2 font-mono">bevid_analytics_consent</td><td className="p-2">Mémorisation de votre choix (accepté/refusé)</td><td className="p-2">13 mois</td><td className="p-2">BEVID</td></tr>
                  <tr className="border-t border-stone-200 dark:border-stone-700"><td className="p-2 font-mono">bevid_nav_open_sections_v2</td><td className="p-2">Ouverture/fermeture des sections de la barre latérale</td><td className="p-2">1 an</td><td className="p-2">BEVID</td></tr>
                  <tr className="border-t border-stone-200 dark:border-stone-700"><td className="p-2 font-mono">bevid_sidebar_prefs_v1</td><td className="p-2">Personnalisation de la barre latérale (épingles, ordre)</td><td className="p-2">1 an</td><td className="p-2">BEVID</td></tr>
                  <tr className="border-t border-stone-200 dark:border-stone-700"><td className="p-2 font-mono">__cf_bm</td><td className="p-2">Protection anti-bot Cloudflare</td><td className="p-2">30 min</td><td className="p-2">Cloudflare</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Cookies analytiques (consentement requis)</h2>
            <p>Ces traceurs mesurent l'audience de la plateforme de manière anonymisée. Ils ne sont déposés qu'après votre consentement explicite. L'enregistrement de session (« session replay ») est <strong>désactivé en permanence</strong>, même après acceptation, sur toutes les pages authentifiées.</p>
            <div className="overflow-x-auto scroll-shadow mt-3 border border-stone-200 dark:border-stone-700 rounded-xl">
              <table className="w-full text-xs min-w-[560px]">
                <thead className="bg-stone-100 dark:bg-stone-800">
                  <tr className="text-left">
                    <th className="p-2">Nom</th><th className="p-2">Finalité</th><th className="p-2">Durée</th><th className="p-2">Émetteur</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-stone-200 dark:border-stone-700"><td className="p-2 font-mono">ph_*</td><td className="p-2">Mesure d'audience anonymisée</td><td className="p-2">1 an</td><td className="p-2">PostHog</td></tr>
                  <tr className="border-t border-stone-200 dark:border-stone-700"><td className="p-2 font-mono">posthog_*</td><td className="p-2">Identifiant de session anonyme</td><td className="p-2">Session</td><td className="p-2">PostHog</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Votre choix</h2>
            <p className="mb-3">Vous pouvez à tout moment révoquer ou re-accorder votre consentement. Votre choix est mémorisé pendant 13 mois maximum, conformément aux recommandations de la CNIL.</p>
            <p className="mb-4">État actuel : <span className={`badge inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${status === "granted" ? "bg-emerald-100 text-emerald-800" : status === "denied" ? "bg-red-100 text-red-800" : "bg-stone-100 text-stone-700"}`} data-testid="cookies-current-status">{status === "granted" ? "Accepté" : status === "denied" ? "Refusé" : "Non exprimé"}</span></p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={grant} className="btn-primary min-h-[44px]" data-testid="cookies-grant-btn">Accepter les cookies analytiques</button>
              <button onClick={revoke} className="btn-ghost min-h-[44px]" data-testid="cookies-revoke-btn">Refuser / révoquer</button>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Vos droits</h2>
            <p>Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition et de portabilité sur vos données. Pour l'exercer, écrivez à <a href="mailto:dpo@bevid-crm.fr" className="text-[#4A154B] dark:text-[#B076B4] underline">dpo@bevid-crm.fr</a>. Vous pouvez également adresser une réclamation à la <a href="https://www.cnil.fr" target="_blank" rel="noreferrer" className="text-[#4A154B] dark:text-[#B076B4] underline">CNIL</a>.</p>
          </div>

          <p className="text-xs text-stone-500 mt-8">Politique révisée le 23 février 2026.</p>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}

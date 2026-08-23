import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import LegalFooter from "@/components/LegalFooter";
import { usePageMeta } from "@/lib/pageMeta";

export default function LegalCGU() {
  usePageMeta({
    title: "Conditions Générales d'Utilisation · BEVID",
    canonical: "/legal/cgu",
    description: "Conditions Générales d'Utilisation de la plateforme BEVID CRM.",
  });
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

      <main className="max-w-3xl mx-auto px-6 py-12" data-testid="legal-cgu-page">
        <p className="overline">Usage</p>
        <h1 className="font-display text-4xl md:text-5xl mt-1 mb-8">Conditions Générales d'Utilisation</h1>

        <section className="space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="font-display text-xl mb-2">1. Acceptation</h2>
            <p>L'accès et l'utilisation de la plateforme BEVID CRM impliquent l'acceptation sans réserve des présentes CGU par tout utilisateur, qu'il agisse en tant qu'administrateur (gérant, manager) ou commercial itinérant. Les CGU peuvent être modifiées à tout moment ; les utilisateurs sont notifiés en cas de changement substantiel.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">2. Comptes et identifiants</h2>
            <p>Chaque utilisateur dispose d'un compte personnel identifié par un email unique. Le partage d'identifiants est strictement interdit et engage la responsabilité pleine du titulaire. La politique de mot de passe impose un minimum de 10 caractères ; un mot de passe compromis doit être renouvelé sans délai depuis le profil utilisateur.</p>
            <p>La procédure de récupération repose sur un code OTP à 6 chiffres valable 15 minutes, envoyé par email et affiché en secours à l'écran pour ne jamais bloquer un utilisateur légitime.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">3. Usage autorisé</h2>
            <p>La plateforme est destinée à la gestion commerciale, logistique et fiscale des distributeurs de boissons opérant en France. Sont interdits notamment :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>l'usage de la plateforme pour toute activité illégale ou contraire aux bonnes mœurs ;</li>
              <li>toute tentative d'atteinte à la sécurité du Service (injection, scraping massif, contournement des quotas) ;</li>
              <li>l'ingestion massive de données personnelles obtenues sans base légale ;</li>
              <li>le contournement du mécanisme d'isolation multi-tenant.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">4. Contenu de l'utilisateur</h2>
            <p>L'utilisateur reste titulaire du contenu qu'il saisit (fiches clients, comptes rendus, dictées vocales, photos, commentaires). BEVID en garantit la confidentialité conformément à sa Politique de confidentialité et au RGPD. La dictée vocale est traitée par nos partenaires (Claude Sonnet via Emergent Integrations) ; les transcriptions sont purgées selon la durée choisie par l'organisation dans les Réglages (7 à 90 jours).</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">5. Disponibilité</h2>
            <p>Le Service est accessible 24/7, y compris hors-ligne pour la partie terrain (tournée, prise de commande, dictée vocale, signature GPS). En cas de coupure réseau prolongée, les données saisies sont mises en file de synchronisation locale (IndexedDB via Dexie) et envoyées automatiquement dès le retour du réseau.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">6. Sécurité</h2>
            <p>Authentification par cookie httpOnly Secure SameSite=Lax. Rate limiting progressif sur les endpoints sensibles. Multi-tenancy strict par isolation contextvars + wrapper Motor. Chiffrement TLS 1.2+ pour tous les échanges. Journal d'audit des actions sensibles conservé et exportable par le manager (voir page Confidentialité).</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">7. Suspension du compte</h2>
            <p>Un compte peut être suspendu ou résilié en cas de violation des présentes CGU. L'utilisateur est notifié par email avec les motifs et dispose de 15 jours pour formuler une observation écrite avant décision définitive.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">8. Modifications</h2>
            <p>BEVID se réserve le droit de faire évoluer le Service, ses fonctionnalités et son interface. Les mises à jour majeures sont annoncées via le bandeau applicatif « Nouvelle version — Recharger », sans coupure en cours de saisie.</p>
          </div>

          <p className="text-xs text-stone-500 mt-8">Version en vigueur au 23 février 2026.</p>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}

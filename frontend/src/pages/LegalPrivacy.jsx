import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import LegalFooter from "@/components/LegalFooter";
import { usePageMeta } from "@/lib/pageMeta";

export default function LegalPrivacy() {
  usePageMeta({
    title: "Politique de confidentialité · BEVID",
    canonical: "/legal/politique-confidentialite",
    description: "Politique de confidentialité BEVID — traitement des données personnelles, RGPD, droits des personnes.",
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

      <main className="max-w-3xl mx-auto px-6 py-12" data-testid="legal-privacy-page">
        <p className="overline flex items-center gap-2"><ShieldCheck size={12} aria-hidden="true" /> RGPD</p>
        <h1 className="font-display text-4xl md:text-5xl mt-1 mb-8">Politique de confidentialité</h1>

        <section className="space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="font-display text-xl mb-2">Responsables de traitement</h2>
            <p><strong>Pour les données de vos clients CHR (établissements, contacts, commandes, tournées) :</strong> l'organisation utilisatrice de BEVID est responsable de traitement au sens du RGPD. BEVID intervient en qualité de <strong>sous-traitant</strong> (article 28 RGPD), conformément aux instructions documentées du responsable.</p>
            <p><strong>Pour les données des utilisateurs de la plateforme (comptes, cookies, journal d'audit) :</strong> BEVID est responsable de traitement pour son propre fonctionnement (facturation, sécurité, statistiques anonymisées).</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Données collectées</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Compte utilisateur</strong> : nom, email professionnel, rôle, préférences UI, langue, thème.</li>
              <li><strong>Établissements CHR</strong> : raison sociale, SIREN/SIRET, adresse, contacts nominatifs, notes commerciales, historique de commandes.</li>
              <li><strong>Terrain</strong> : géolocalisation ponctuelle lors des visites, comptes rendus texte et vocaux, signatures GPS.</li>
              <li><strong>Documents</strong> : factures, bons de livraison, devis émis par l'organisation.</li>
              <li><strong>Journal d'audit</strong> : actions sensibles (connexion, export, suppression) conservé pour la traçabilité.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Finalités</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Exécution du contrat d'abonnement au CRM (base : article 6.1.b RGPD — contrat).</li>
              <li>Sécurité et prévention de la fraude (base : article 6.1.f — intérêt légitime).</li>
              <li>Facturation et obligations comptables (base : article 6.1.c — obligation légale).</li>
              <li>Statistiques d'audience anonymisées (base : article 6.1.a — consentement, révocable à tout moment).</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Destinataires</h2>
            <p>Vos données ne sont accessibles qu'à votre organisation (isolation multi-tenant stricte). Aucun partage commercial n'est effectué. Les sous-traitants techniques suivants interviennent, encadrés par des clauses conformes à l'article 28 RGPD :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Emergent Labs (hébergement cloud, UE)</li>
              <li>Stripe (paiements, PCI-DSS)</li>
              <li>Twilio (WhatsApp/SMS, UE) — si activé par votre organisation</li>
              <li>Resend (emails transactionnels, UE)</li>
              <li>PostHog (analytics anonymisé, sur consentement)</li>
              <li>Anthropic / OpenAI / Google via Emergent Integrations (IA copilote, dictée vocale) — les données sont pseudonymisées avant transmission ; aucune donnée n'est utilisée pour l'entraînement.</li>
              <li>Pennylane (comptabilité) — uniquement si le connecteur est activé, sur clé API fournie par l'organisation.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Transferts hors UE</h2>
            <p>Les traitements d'IA (Anthropic, OpenAI, Google) peuvent impliquer des transferts vers les États-Unis. Ces transferts s'appuient sur les Clauses Contractuelles Types de la Commission européenne (décision 2021/914). Aucune donnée d'identification directe n'est transférée sans consentement.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Durées de conservation</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Compte actif : durée de l'abonnement + 3 ans après résiliation (obligations comptables, article L.123-22 du Code de commerce).</li>
              <li>Journal d'audit : 12 mois.</li>
              <li>Transcriptions vocales : durée choisie par l'organisation (7 à 90 jours).</li>
              <li>Cookies analytiques : 13 mois maximum.</li>
              <li>Sauvegardes chiffrées : 90 jours après suppression du compte.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Vos droits (personnes concernées)</h2>
            <p>Conformément aux articles 15 à 22 du RGPD, vous pouvez exercer vos droits :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Accès</strong> : obtenir une copie de vos données.</li>
              <li><strong>Rectification</strong> : corriger des données inexactes.</li>
              <li><strong>Effacement</strong> : supprimer vos données (« droit à l'oubli »).</li>
              <li><strong>Limitation</strong> : geler un traitement contesté.</li>
              <li><strong>Opposition</strong> : refuser un traitement fondé sur l'intérêt légitime.</li>
              <li><strong>Portabilité</strong> : recevoir vos données dans un format lisible par machine (JSON, XLSX).</li>
              <li><strong>Retrait de consentement</strong> à tout moment (cookies analytiques).</li>
            </ul>
            <p className="mt-2">Contact DPO : <a href="mailto:dpo@bevid-crm.fr" className="text-[#4A154B] dark:text-[#B076B4] underline">dpo@bevid-crm.fr</a>. En cas d'insatisfaction : <a href="https://www.cnil.fr" target="_blank" rel="noreferrer" className="text-[#4A154B] dark:text-[#B076B4] underline">CNIL</a>.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Sécurité</h2>
            <p>Chiffrement TLS 1.2+ en transit, chiffrement au repos sur les bases MongoDB Atlas UE, authentification par cookie httpOnly Secure SameSite=Lax, rate limiting progressif, journalisation des accès sensibles, hébergement dans l'Union européenne. Une politique interne de gestion des incidents permet la notification à la CNIL sous 72 heures en cas de violation susceptible d'engendrer un risque pour les personnes.</p>
          </div>

          <p className="text-xs text-stone-500 mt-8">Politique révisée le 23 février 2026.</p>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}

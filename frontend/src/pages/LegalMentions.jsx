import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import LegalFooter from "@/components/LegalFooter";
import { usePageMeta } from "@/lib/pageMeta";
import { api } from "@/lib/api";

export default function LegalMentions() {
  usePageMeta({
    title: "Mentions légales · BEVID",
    canonical: "/legal/mentions-legales",
    description: "Mentions légales de BEVID CRM — éditeur, hébergeur, données personnelles.",
  });
  const [identity, setIdentity] = useState(null);
  useEffect(() => {
    api.get("/config/legal-identity").then((r) => setIdentity(r.data)).catch(() => setIdentity({ configured: false }));
  }, []);
  const id = identity || {};
  const commercialName = id.commercial_name || "BEVID";
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-[#4A154B] dark:text-[#B076B4]" data-testid="legal-back-home">
            <BevidLogo size={22} />
            <span className="font-display text-xl" aria-hidden="true">BEVID</span>
          </Link>
          <Link to="/login" className="text-sm text-stone-500 hover:text-[#4A154B] flex items-center gap-1 min-h-[44px]">
            <ArrowLeft size={14} aria-hidden="true" /> Retour
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12" data-testid="legal-mentions-page">
        <p className="overline">Mentions</p>
        <h1 className="font-display text-4xl md:text-5xl mt-1 mb-8">Mentions légales</h1>

        <section className="prose prose-stone dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="font-display text-xl mb-2">Éditeur du service</h2>
            {id.configured ? (
              <>
                <p><strong>{id.legal_name}</strong> (nom commercial : {commercialName})</p>
                {id.legal_address && <p>Siège social : {id.legal_address}</p>}
                {id.rcs && <p>Immatriculée au RCS : {id.rcs}</p>}
                {id.siren && <p>SIREN : {id.siren}</p>}
                {id.tva_intracom && <p>Numéro de TVA intracommunautaire : {id.tva_intracom}</p>}
                {id.capital_social && <p>Capital social : {id.capital_social}</p>}
                {id.director_publication && <p>Directeur de la publication : {id.director_publication}</p>}
                <p>Contact : <a href={`mailto:${id.legal_email}`} className="text-[#4A154B] dark:text-[#B076B4] underline">{id.legal_email}</a></p>
              </>
            ) : (
              <>
                <p><strong>{commercialName} SAS</strong> (dénomination provisoire — à personnaliser par le client de la plateforme dans Réglages entreprise)</p>
                <p>Siège social : à compléter</p>
                <p>Immatriculée au RCS : à compléter · SIREN : à compléter</p>
                <p>Numéro de TVA intracommunautaire : à compléter</p>
                <p>Capital social : à compléter</p>
                <p>Directeur de la publication : à compléter</p>
                <p>Contact : <a href="mailto:contact@bevid-crm.fr" className="text-[#4A154B] dark:text-[#B076B4] underline">contact@bevid-crm.fr</a></p>
              </>
            )}
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Hébergeur</h2>
            <p>L'application est hébergée par <strong>Emergent Labs</strong> — infrastructure cloud gérée. Les serveurs de production sont situés dans l'Union européenne. Un accord de sous-traitance conforme à l'article 28 du RGPD est en place entre l'éditeur et l'hébergeur.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Propriété intellectuelle</h2>
            <p>L'ensemble des éléments constituant la plateforme BEVID (marque, logo, interface, code source, textes, images, base de données, architecture logicielle) est protégé par les lois françaises et internationales relatives à la propriété intellectuelle. Toute reproduction, représentation, adaptation ou exploitation, totale ou partielle, sans autorisation écrite préalable de l'éditeur est prohibée et constitutive d'une contrefaçon.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Données personnelles</h2>
            <p>Le traitement des données personnelles est régi par notre <Link to="/legal/politique-confidentialite" className="text-[#4A154B] dark:text-[#B076B4] underline">Politique de confidentialité</Link>. Le responsable du traitement pour les données de vos clients (établissements CHR gérés dans le CRM) est l'organisation utilisatrice ; BEVID intervient en qualité de sous-traitant conformément à l'article 28 du RGPD.</p>
            <p>Droits RGPD (accès, rectification, effacement, limitation, opposition, portabilité) : voir la page <Link to="/confidentialite" className="text-[#4A154B] dark:text-[#B076B4] underline">Confidentialité</Link> une fois connecté ou écrire à <a href={`mailto:${id.dpo_email || "dpo@bevid-crm.fr"}`} className="text-[#4A154B] dark:text-[#B076B4] underline">{id.dpo_email || "dpo@bevid-crm.fr"}</a>.</p>
            <p>Autorité de contrôle : Commission nationale de l'informatique et des libertés (CNIL) — <a href="https://www.cnil.fr" target="_blank" rel="noreferrer" className="text-[#4A154B] dark:text-[#B076B4] underline">cnil.fr</a>.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Cookies et traceurs</h2>
            <p>Consultez notre <Link to="/legal/cookies" className="text-[#4A154B] dark:text-[#B076B4] underline">Politique cookies</Link> pour connaître le détail des traceurs utilisés et exercer votre choix.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">Signalement</h2>
            <p>Tout contenu jugé illicite ou tout dysfonctionnement peut être signalé à <a href="mailto:signalement@bevid-crm.fr" className="text-[#4A154B] dark:text-[#B076B4] underline">signalement@bevid-crm.fr</a>. Nous étudions chaque signalement dans un délai raisonnable.</p>
          </div>

          <p className="text-xs text-stone-500 mt-8">Dernière mise à jour : 23 février 2026.</p>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}

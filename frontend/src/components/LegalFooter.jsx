import React from "react";
import { Link } from "react-router-dom";

/**
 * Pied de page légal — visible sur pages publiques (login, register, tarifs,
 * pages légales). Les liens sont toujours actifs, même hors-connexion.
 */
export default function LegalFooter() {
  const links = [
    { to: "/legal/mentions-legales", label: "Mentions légales" },
    { to: "/legal/cgv", label: "CGV" },
    { to: "/legal/cgu", label: "CGU" },
    { to: "/legal/politique-confidentialite", label: "Confidentialité" },
    { to: "/legal/cookies", label: "Cookies" },
    { to: "/pricing", label: "Tarifs" },
  ];
  return (
    <footer className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950" data-testid="legal-footer">
      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
        <p className="text-xs text-stone-500">© {new Date().getFullYear()} BEVID — Tous droits réservés.</p>
        <nav aria-label="Liens légaux" className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              data-testid={`footer-link-${l.to.replace(/[/]/g, "_")}`}
              className="text-xs text-stone-500 hover:text-[#4A154B] dark:hover:text-[#B076B4] underline-offset-2 hover:underline min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

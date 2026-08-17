import React from "react";

/**
 * Logo BEVID — monogramme SVG inline, s'adapte à currentColor.
 * "B" stylisé avec la boucle en gouttes/houblon (clin d'œil à la boisson).
 */
export default function BevidLogo({ size = 32, showWord = false, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="BEVID">
        <rect x="1" y="1" width="38" height="38" rx="10" fill="currentColor" opacity="0.08" />
        <path d="M11 8h11a7 7 0 0 1 4.5 12.4A7.5 7.5 0 0 1 22 32H11V8Zm4 4v6h6.5a3 3 0 0 0 0-6H15Zm0 10v6h7a3.5 3.5 0 0 0 0-7H15v1Z" fill="currentColor" />
        <circle cx="30" cy="12" r="2.5" fill="currentColor" />
        <circle cx="30" cy="12" r="1" fill="#fff" opacity="0.9" />
      </svg>
      {showWord && <span className="font-display font-display-black tracking-tight text-current">BEVID</span>}
    </span>
  );
}

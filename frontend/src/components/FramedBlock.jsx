import React from "react";

/** Affiché à la place de tout formulaire d'authentification quand la page est encadrée. */
export default function FramedBlock() {
  const url = window.location.href;
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center" data-testid="framed-block">
      <div>
        <h1 className="font-display text-2xl mb-2">Ouvrez BEVID directement</h1>
        <p className="text-base text-stone-700 mb-4">Pour votre sécurité, la connexion n'est pas possible depuis une page tierce.</p>
        <a href={url} target="_top" rel="noopener" className="btn-primary inline-flex min-h-[48px] items-center px-6" data-testid="framed-open">Ouvrir BEVID</a>
      </div>
    </div>
  );
}

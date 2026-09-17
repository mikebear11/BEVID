import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { isNative } from "@/lib/native";
import { setupDeepLinks, setupPush, checkMinVersion } from "@/lib/nativeFeatures";
import { useAuth } from "@/contexts/AuthContext";

export const APP_VERSION = process.env.REACT_APP_VERSION || "1.0.0";

/** Monté une fois dans l'app : liens profonds, push (après la 1re visite), version minimale, démarrage à froid. */
export function NativeBoot() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    if (!isNative()) return;
    setupDeepLinks(nav);
    checkMinVersion(APP_VERSION).then((v) => (v.required || v.suggested) && setUpdate(v));
    // Mesure du démarrage à froid du bundle embarqué (N6) — envoyée au serveur sans donnée client
    const t = Math.round(performance.now());
    import("@/lib/api").then(({ api }) => api.post("/telemetry/errors", { kind: "cold_start_ms", value: t, platform: window.Capacitor?.getPlatform?.(), message: `cold_start ${t}ms` }).catch(() => {}));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Permission push demandée au bon moment : première visite enregistrée (retour sur une fiche depuis /visite)
    if (isNative() && user && sessionStorage.getItem("bevid_visit_saved") === "1" && !sessionStorage.getItem("bevid_push_asked")) {
      sessionStorage.setItem("bevid_push_asked", "1");
      setupPush(nav);
    }
  }, [loc.pathname, user, nav]);

  if (!update) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end" data-testid="update-screen">
      <div className="bg-white w-full rounded-t-2xl p-5 space-y-3">
        <h2 className="font-display text-2xl">{update.required ? "Mise à jour requise" : "Mise à jour disponible"}</h2>
        <p className="text-base text-stone-700">{update.message}</p>
        <a href={window.Capacitor?.getPlatform?.() === "ios" ? update.store_ios : update.store_android} className="btn-primary w-full min-h-[56px] flex items-center justify-center text-base" data-testid="update-store">Mettre à jour</a>
        {!update.required && <button type="button" onClick={() => setUpdate(null)} className="w-full min-h-[48px] text-base text-stone-700" data-testid="update-later">Plus tard</button>}
      </div>
    </div>
  );
}

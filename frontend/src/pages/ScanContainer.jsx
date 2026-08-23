import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api } from "@/lib/api";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Keyboard, ArrowLeft, Camera, CameraOff } from "lucide-react";
import { t } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";

export default function ScanContainer() {
  usePageMeta({ title: t("scan_page_title") + " · BEVID" });
  const nav = useNavigate();
  const readerRef = useRef(null);
  const scannerRef = useRef(null);
  const [manual, setManual] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [requested, setRequested] = useState(false);

  const start = async () => {
    if (running) return;
    setError(null);
    setRequested(true);
    try {
      const html5 = new Html5Qrcode("qr-reader-region");
      scannerRef.current = html5;
      await html5.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 }, formatsToSupport: undefined },
        (decoded) => onDecoded(decoded),
        () => {}
      );
      setRunning(true);
    } catch (e) {
      setError(t("scan_camera_denied") || "Impossible d'accéder à la caméra. Autorisez l'accès ou saisissez le code manuellement.");
    }
  };

  const stop = async () => {
    try { await scannerRef.current?.stop(); await scannerRef.current?.clear(); } catch {}
    scannerRef.current = null;
    setRunning(false);
  };

  // Nettoyage seulement — jamais de démarrage automatique (P0 QA).
  useEffect(() => () => { stop(); }, []);

  const onDecoded = async (code) => {
    await stop();
    try {
      const { data } = await api.get(`/containers/scan/${encodeURIComponent(code)}`);
      toast.success(t("toast.v1_localise", { v1: data.product_name || data.type }));
      nav(`/containers/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("toast.contenant_inconnu"));
      // Ne redémarre pas automatiquement — l'utilisateur relancera si besoin.
    }
  };

  const submitManual = async (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    onDecoded(manual.trim());
  };

  return (
    <div className="space-y-6" data-testid="scan-page">
      <Link to="/containers" className="text-sm text-stone-500 flex items-center gap-1 min-h-[44px]" aria-label={t("back_to_containers") || "Retour aux contenants"}><ArrowLeft size={14} aria-hidden="true" /> {t("containers")}</Link>
      <div>
        <p className="overline">{t("traceability") || "Traçabilité"}</p>
        <h1 className="font-display text-4xl">{t("scan_page_title") || "Scanner un contenant"}</h1>
        <p className="text-sm text-stone-500 mt-1">{t("scan_help") || "QR code ou code-barres. Pointez la caméra vers l'étiquette."}</p>
      </div>

      <div className="bg-black rounded-2xl overflow-hidden max-w-md mx-auto">
        <div id="qr-reader-region" ref={readerRef} className="w-full min-h-[320px] flex items-center justify-center" data-testid="qr-reader-region">
          {!running && !requested && (
            <div className="text-center text-white/70 p-6">
              <Camera size={48} className="mx-auto mb-3 opacity-70" aria-hidden="true" />
              <p className="text-sm">{t("scan_permission_hint") || "Aucun accès caméra tant que vous ne cliquez pas ci-dessous."}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        {!running ? (
          <button onClick={start} className="btn-primary min-h-[48px] flex items-center gap-2" data-testid="start-camera-btn" aria-label={t("activate_camera") || "Activer la caméra"}>
            <Camera size={18} aria-hidden="true" /> {t("activate_camera") || "Activer la caméra"}
          </button>
        ) : (
          <button onClick={stop} className="btn-ghost min-h-[44px] flex items-center gap-2" data-testid="stop-scanner" aria-label={t("stop_camera") || "Arrêter la caméra"}>
            <CameraOff size={18} aria-hidden="true" /> {t("stop_camera") || "Arrêter la caméra"}
          </button>
        )}
      </div>

      {error && <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm max-w-md mx-auto" data-testid="camera-error" role="alert">{error}</div>}

      <div className="bg-white rounded-2xl border border-stone-200 p-5 max-w-md mx-auto">
        <h2 className="font-medium mb-3 flex items-center gap-2 text-base"><Keyboard size={16} aria-hidden="true" /> {t("manual_entry") || "Saisie manuelle"}</h2>
        <form onSubmit={submitManual} className="flex gap-2">
          <label htmlFor="scan-manual-code" className="sr-only">{t("manual_entry") || "Saisie manuelle"}</label>
          <input id="scan-manual-code" name="code" value={manual} onChange={e => setManual(e.target.value)} placeholder={t("scan_manual_placeholder") || "ID ou code-barres"} className="input-crm flex-1 min-h-[48px] font-mono" data-testid="manual-code" autoComplete="off" />
          <button className="btn-primary min-h-[48px]" data-testid="submit-manual" aria-label={t("submit") || "Valider"}>OK</button>
        </form>
      </div>
    </div>
  );
}

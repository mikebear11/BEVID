import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api } from "@/lib/api";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { QrCode, Keyboard, ArrowLeft } from "lucide-react";

export default function ScanContainer() {
  const nav = useNavigate();
  const readerRef = useRef(null);
  const scannerRef = useRef(null);
  const [manual, setManual] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const start = async () => {
    if (running) return;
    setError(null);
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
      setError("Impossible d'accéder à la caméra. Autorisez l'accès ou saisissez le code manuellement.");
    }
  };

  const stop = async () => {
    try { await scannerRef.current?.stop(); await scannerRef.current?.clear(); } catch {}
    scannerRef.current = null;
    setRunning(false);
  };

  useEffect(() => { start(); return () => { stop(); }; }, []);

  const onDecoded = async (code) => {
    await stop();
    try {
      const { data } = await api.get(`/containers/scan/${encodeURIComponent(code)}`);
      toast.success(`${data.product_name || data.type} localisé`);
      nav(`/containers/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Contenant inconnu");
      start();
    }
  };

  const submitManual = async (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    onDecoded(manual.trim());
  };

  return (
    <div className="space-y-6" data-testid="scan-page">
      <Link to="/containers" className="text-sm text-stone-500 flex items-center gap-1"><ArrowLeft size={14} /> Contenants</Link>
      <div>
        <p className="overline">Traçabilité</p>
        <h1 className="font-display text-4xl">Scanner un contenant</h1>
        <p className="text-sm text-stone-500 mt-1">QR code ou code-barres. Pointez la caméra vers l'étiquette.</p>
      </div>

      <div className="bg-black rounded-2xl overflow-hidden max-w-md mx-auto">
        <div id="qr-reader-region" ref={readerRef} className="w-full min-h-[320px]" data-testid="qr-reader-region" />
      </div>

      {error && <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm max-w-md mx-auto" data-testid="camera-error">{error}</div>}

      <div className="bg-white rounded-2xl border border-stone-200 p-5 max-w-md mx-auto">
        <h3 className="font-medium mb-3 flex items-center gap-2"><Keyboard size={16} /> Saisie manuelle</h3>
        <form onSubmit={submitManual} className="flex gap-2">
          <input value={manual} onChange={e => setManual(e.target.value)} placeholder="ID ou code-barres" className="input-crm flex-1 min-h-[48px] font-mono" data-testid="manual-code" />
          <button className="btn-primary min-h-[48px]" data-testid="submit-manual">OK</button>
        </form>
      </div>

      {running && <div className="text-center">
        <button onClick={stop} className="btn-ghost min-h-[44px]" data-testid="stop-scanner">Arrêter la caméra</button>
      </div>}
    </div>
  );
}

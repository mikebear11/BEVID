import React, { useRef, useState, useEffect } from "react";

export default function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0A0A0A";
  }, []);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  const start = (e) => { setDrawing(true); const { x, y } = getPos(e); const ctx = canvasRef.current.getContext("2d"); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e) => {
    if (!drawing) return; e.preventDefault();
    const { x, y } = getPos(e); const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y); ctx.stroke(); setEmpty(false);
  };
  const stop = () => setDrawing(false);
  const clear = () => { const c = canvasRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setEmpty(true); };
  const save = () => { if (empty) return; onSave(canvasRef.current.toDataURL("image/png")); };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-stone-200 p-6 max-w-lg w-full" onClick={e => e.stopPropagation()} data-testid="signature-pad">
        <h3 className="font-display text-2xl mb-3">Signature client</h3>
        <p className="text-xs text-stone-500 mb-3">Signez dans le cadre ci-dessous</p>
        <canvas
          ref={canvasRef} width={460} height={180}
          className="border-2 border-dashed border-stone-300 rounded-lg w-full touch-none bg-stone-50"
          onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
          data-testid="signature-canvas"
        />
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={clear} className="btn-ghost" data-testid="sig-clear">Effacer</button>
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={save} disabled={empty} className="btn-primary" data-testid="sig-save">Valider</button>
        </div>
      </div>
    </div>
  );
}

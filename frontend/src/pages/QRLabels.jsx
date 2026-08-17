import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { QRCodeCanvas } from "qrcode.react";
import { Link } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";

/**
 * Feuille A4 imprimable de 24 étiquettes QR (3 × 8) pour marquer un batch de fûts.
 * Utilisation : cocher les contenants, appuyer sur Imprimer.
 */
export default function QRLabels() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api.get("/containers").then(r => setItems(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(c => {
    const s = filter.toLowerCase();
    return !s || (c.product_name || "").toLowerCase().includes(s) || (c.batch_lot || "").toLowerCase().includes(s) || c.id.startsWith(s);
  });

  const toggle = (id) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const selectAll = () => setSelected(new Set(filtered.slice(0, 24).map(c => c.id)));
  const clear = () => setSelected(new Set());

  const selArr = Array.from(selected).map(id => items.find(c => c.id === id)).filter(Boolean);

  return (
    <div className="space-y-6" data-testid="qr-labels-page">
      <div className="print:hidden">
        <Link to="/containers" className="text-sm text-stone-500 flex items-center gap-1"><ArrowLeft size={14} /> Contenants</Link>
        <div className="flex items-start justify-between flex-wrap gap-3 mt-2">
          <div>
            <p className="overline">Impression</p>
            <h1 className="font-display text-4xl">Feuille d'étiquettes QR</h1>
            <p className="text-sm text-stone-500 mt-1">A4 · grille 3 × 8 = 24 étiquettes. Cochez les fûts à étiqueter.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={selectAll} className="btn-ghost min-h-[44px]" data-testid="select-all">Sélectionner 24</button>
            <button onClick={clear} className="btn-ghost min-h-[44px]" data-testid="clear-sel">Effacer</button>
            <button onClick={() => window.print()} disabled={selArr.length === 0} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="print-labels">
              <Printer size={16} /> Imprimer ({selArr.length})
            </button>
          </div>
        </div>

        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Rechercher par produit / lot / id…" className="input-crm mt-4 max-w-md min-h-[48px]" data-testid="labels-filter" />

        {loading ? <p className="text-stone-500 mt-4">Chargement…</p> : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-4 max-h-[420px] overflow-y-auto p-1 border border-stone-200 rounded-2xl bg-white">
            {filtered.map(c => (
              <label key={c.id} className={`flex items-start gap-2 p-2 border rounded-lg cursor-pointer ${selected.has(c.id) ? "border-[#4A154B] bg-[#4A154B]/5" : "border-stone-200"}`} data-testid={`pick-${c.id}`}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{c.product_name || "(sans produit)"}</p>
                  <p className="text-[10px] text-stone-500 font-mono truncate">{c.id.slice(0, 8)}</p>
                  <p className="text-[10px] text-stone-500">{c.type} · {c.filled_volume_l || "—"}L</p>
                </div>
              </label>
            ))}
            {filtered.length === 0 && <p className="col-span-full text-center text-stone-400 py-6">Aucun contenant.</p>}
          </div>
        )}
      </div>

      {/* Grille d'impression A4 : 3 col × 8 lignes */}
      <div className="print-sheet grid grid-cols-3 gap-1" data-testid="print-sheet">
        {selArr.slice(0, 24).map(c => (
          <div key={c.id} className="border border-stone-300 rounded-lg p-2 flex gap-2 items-center bg-white" style={{ height: "3.4cm" }}>
            <QRCodeCanvas value={c.id} size={78} bgColor="#ffffff" fgColor="#0A0A0A" includeMargin={false} />
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1 text-[#4A154B]"><BevidLogo size={12} /><span className="text-[9px] font-medium tracking-widest">BEVID</span></div>
              <p className="font-medium text-xs mt-0.5 leading-tight truncate">{c.product_name || "—"}</p>
              <p className="text-[10px] text-stone-500">{c.type} · {c.filled_volume_l || "—"}L</p>
              {c.batch_lot && <p className="text-[9px] text-stone-500 truncate">Lot {c.batch_lot}</p>}
              <p className="text-[9px] text-stone-400 font-mono mt-0.5">{c.id.slice(0, 8)}</p>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          nav, aside, header, .print\\:hidden { display: none !important; }
          .print-sheet { grid-template-columns: repeat(3, 1fr) !important; gap: 4px !important; page-break-inside: avoid; }
          @page { size: A4; margin: 8mm; }
        }
      `}</style>
    </div>
  );
}

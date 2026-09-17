import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Download, Printer, MoveRight, Package } from "lucide-react";
import { t } from "@/lib/i18n";

const STATUS = ["en_stock", "sorti", "chez_client", "retour", "vide", "consigne_facturee", "casse"];

export default function ContainerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState(null);
  const [establishments, setEstablishments] = useState([]);
  const [move, setMove] = useState({ to_location: "", status: "", kind: "transfert", note: "" });
  const qrRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [cont, est] = await Promise.all([
        api.get(`/containers/${id}`),
        api.get("/establishments").catch(() => ({ data: [] })),
      ]);
      setC(cont.data);
      setEstablishments(est.data);
    } catch { toast.error(t("toast.introuvable")); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const doMove = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/containers/${id}/move`, move);
      toast.success(t("toast.mouvement_enregistre"));
      setMove({ to_location: "", status: "", kind: "transfert", note: "" });
      load();
    } catch { toast.error(t("toast.erreur")); }
  };

  const downloadQR = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `qr-${id.slice(0, 8)}.png`; a.click();
  };
  const printQR = () => window.print();

  if (!c) return <div className="p-8 text-stone-500">Chargement…</div>;

  return (
    <div className="space-y-6" data-testid="container-detail-page">
      <Link to="/containers" className="text-sm text-stone-500 flex items-center gap-1 print:hidden"><ArrowLeft size={14} /> Contenants</Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* QR + infos */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
          <p className="overline">{c.type} · {c.filled_volume_l || "—"} L</p>
          <h1 className="font-display text-2xl mt-1">{c.product_name || "(sans produit)"}</h1>
          <p className="text-xs text-stone-500 mt-1 font-mono">{c.id}</p>
          {c.barcode && <p className="text-xs text-stone-500 mt-1">Code-barres : {c.barcode}</p>}
          {c.batch_lot && <p className="text-xs text-stone-500 mt-1">Lot : {c.batch_lot}</p>}

          <div className="mt-4 flex justify-center" ref={qrRef} data-testid="qr-code">
            <QRCodeCanvas value={c.id} size={200} bgColor="#ffffff" fgColor="#0A0A0A" includeMargin={true} />
          </div>

          <div className="mt-3 flex gap-2 justify-center print:hidden">
            <button onClick={downloadQR} className="btn-ghost text-sm min-h-[44px] flex items-center gap-1" data-testid="download-qr"><Download size={14} /> PNG</button>
            <button onClick={printQR} className="btn-ghost text-sm min-h-[44px] flex items-center gap-1" data-testid="print-qr"><Printer size={14} /> Imprimer</button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-stone-500">Statut</p><p className="font-medium">{c.status}</p></div>
            <div><p className="text-xs text-stone-500">Position</p><p className="font-medium flex items-center gap-1"><MapPin size={12} /> {c.current_location_name || c.current_location || "—"}</p></div>
            <div><p className="text-xs text-stone-500">Consigne</p><p className="font-medium">{c.deposit_amount?.toFixed(2)} €</p></div>
            <div><p className="text-xs text-stone-500">Dernier mvt</p><p className="font-medium text-xs">{c.last_moved_at?.slice(0, 16).replace("T", " ")}</p></div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4 print:hidden">
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="font-medium mb-3 flex items-center gap-2"><MoveRight size={16} /> Enregistrer un mouvement</h3>
            <form onSubmit={doMove} className="space-y-3">
              <div>
                <label className="text-xs text-stone-600">Destination</label>
                <select value={move.to_location} onChange={e => setMove({ ...move, to_location: e.target.value })} required className="input-crm mt-1 min-h-[48px]" data-testid="move-to">
                  <option value="">—</option>
                  <option value="entrepot">Entrepôt</option>
                  {establishments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs">Type de mvt</label>
                  <select value={move.kind} onChange={e => setMove({ ...move, kind: e.target.value })} className="input-crm mt-1 min-h-[44px]" data-testid="move-kind">
                    <option value="sortie">Sortie</option>
                    <option value="retour">Retour</option>
                    <option value="transfert">Transfert</option>
                    <option value="casse">Casse</option>
                    <option value="degustation">Dégustation</option>
                    <option value="don">Don</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs">Nouveau statut</label>
                  <select value={move.status} onChange={e => setMove({ ...move, status: e.target.value })} className="input-crm mt-1 min-h-[44px]" data-testid="move-status">
                    <option value="">— Ne change pas</option>
                    {STATUS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs">Note</label>
                <input value={move.note} onChange={e => setMove({ ...move, note: e.target.value })} className="input-crm mt-1 min-h-[44px]" />
              </div>
              <button type="submit" className="btn-primary w-full min-h-[48px]" data-testid="submit-move">Enregistrer</button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-5 max-h-96 overflow-y-auto">
            <h3 className="font-medium mb-3">Historique</h3>
            <div className="space-y-2">
              {(c.movements || []).map(m => (
                <div key={m.id} className="border-l-2 border-stone-200 pl-3 py-1">
                  <p className="text-xs text-stone-500">{m.at?.slice(0, 16).replace("T", " ")}</p>
                  <p className="text-sm">{m.kind} — {m.from_location || "?"} → <b>{m.to_location || "?"}</b></p>
                  {m.note && <p className="text-xs text-stone-500 italic">{m.note}</p>}
                </div>
              ))}
              {(!c.movements || c.movements.length === 0) && <p className="text-xs text-stone-400">Aucun mouvement.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

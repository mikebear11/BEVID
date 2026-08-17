import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import SignaturePad from "@/components/SignaturePad";
import { Check, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PublicSignature() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [showPad, setShowPad] = useState(false);
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/signature/${token}`)
      .then(r => { setInfo(r.data); setSigned(r.data.signed); })
      .catch(e => setErr(e.response?.data?.detail || "Lien invalide"));
  }, [token]);

  const save = async (dataUrl) => {
    setSaving(true);
    try {
      await axios.post(`${API}/public/signature/${token}`, { signature: dataUrl });
      setSigned(true); setShowPad(false);
    } catch { setErr("Erreur lors de l'enregistrement"); }
    finally { setSaving(false); }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center p-6"><div className="card-crm p-8 text-center max-w-md"><p className="font-display text-2xl text-[#8C2A2A]">Erreur</p><p className="text-stone-600 mt-2">{err}</p></div></div>;
  if (!info) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen p-6" data-testid="public-signature-page">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <p className="overline">BEVID · Bon de commande</p>
          <h1 className="font-display text-4xl mt-2">#{info.id.slice(0, 8).toUpperCase()}</h1>
          <p className="text-stone-500 text-sm mt-1">{info.client_name} · {info.created_at?.slice(0, 10)}</p>
        </div>

        <div className="card-crm p-6">
          <p className="overline mb-3">Détails</p>
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 text-stone-500 text-left">
              <tr><th className="p-2">Produit</th><th className="p-2 text-right">Qté</th><th className="p-2 text-right">Total</th></tr>
            </thead>
            <tbody>
              {info.lines.map((l, i) => (
                <tr key={i} className="border-b border-stone-100">
                  <td className="p-2">{l.product_name}</td>
                  <td className="p-2 text-right">{l.quantity}</td>
                  <td className="p-2 text-right">{(l.quantity * l.unit_price).toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between mt-4 pt-3 border-t-2 border-[#4A154B]">
            <span className="overline">Total TTC</span>
            <span className="font-display text-3xl text-[#2D5A4C]">{info.total.toLocaleString('fr-FR')} €</span>
          </div>
        </div>

        {signed ? (
          <div className="card-crm p-6 text-center border-l-4 border-l-[#2D5A4C]" data-testid="signed-confirmation">
            <Check size={40} className="text-[#2D5A4C] mx-auto" />
            <h2 className="font-display text-2xl mt-3">Merci !</h2>
            <p className="text-stone-600 text-sm mt-1">Votre signature a bien été enregistrée. Bonne journée.</p>
          </div>
        ) : (
          <button onClick={() => setShowPad(true)} disabled={saving} className="btn-primary w-full py-4 text-base" data-testid="open-signpad">
            {saving ? "Enregistrement…" : "Signer la commande"}
          </button>
        )}

        {showPad && <SignaturePad onSave={save} onClose={() => setShowPad(false)} />}
      </div>
    </div>
  );
}

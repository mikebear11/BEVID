import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Mic, MicOff, Camera, MapPin, Check, WifiOff, Loader2 } from "lucide-react";
import { api, postOffline } from "@/lib/api";
import { useVoice } from "@/hooks/useVoice";
import { getPosition } from "@/lib/mobile";
import { usePageMeta } from "@/lib/pageMeta";

// Résultat → (next_action, interest) du modèle existant
const OUTCOMES = [
  ["commande", "Commande prise", { next_action: "commande", interest: "chaud", mood: "bon" }],
  ["interesse", "Intéressé", { next_action: "devis", interest: "chaud", mood: "bon" }],
  ["relance", "À relancer", { next_action: "relance", interest: "tiede", mood: "neutre" }],
  ["pas_interesse", "Pas intéressé", { next_action: "aucune", interest: "froid", mood: "difficile" }],
  ["absent", "Absent", { next_action: "visite", interest: "tiede", mood: "neutre" }],
];
const OBJECTIONS = ["Prix", "Déjà un fournisseur", "Pas de place", "Contrat en cours", "Autre"];
const NEXT = [["1", "Demain"], ["7", "+7 j"], ["15", "+15 j"], ["30", "+1 mois"], ["libre", "Date"]];
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function compress(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const s = Math.min(1, 640 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.6);
}

/** Note de visite mobile (< 30 s) : check-in auto, gros boutons, dictée d'abord, hors ligne garanti. */
export default function MobileVisit() {
  usePageMeta({ title: "Note de visite · BEVID" });
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { supported, listening, transcript, start, stop } = useVoice("fr-FR");
  const nativeStopRef = useRef(null);
  const [nativeText, setNativeText] = useState("");
  // Dictée : plugin natif en priorité, repli Web Speech API (web) — même bouton, même champ
  const micStart = async () => {
    const stopFn = await import("@/lib/nativeFeatures").then((m) => m.nativeSpeechStart(setNativeText)).catch(() => null);
    if (stopFn) nativeStopRef.current = stopFn; else start();
  };
  const micStop = async () => { if (nativeStopRef.current) { await nativeStopRef.current(); nativeStopRef.current = null; } else stop(); };
  const [etab, setEtab] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [objs, setObjs] = useState([]);
  const [next, setNext] = useState(null);
  const [nextDate, setNextDate] = useState("");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [gps, setGps] = useState(null);
  const [saving, setSaving] = useState(false);
  const checkin = useRef(new Date().toISOString());
  const fileRef = useRef(null);

  useEffect(() => {
    api.get(`/establishments/${id}`).then((r) => setEtab(r.data)).catch(() => setEtab({ name: "Client" }));
    getPosition().then(setGps).catch(() => {});
    if (sp.get("voice") === "1") setTimeout(() => micStart(), 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    if (!outcome) { toast.error("Choisissez le résultat de la visite"); return; }
    setSaving(true);
    const o = OUTCOMES.find((x) => x[0] === outcome)[2];
    const nd = next === "libre" ? nextDate : next ? plusDays(parseInt(next, 10)) : "";
    const summary = [text.trim() || nativeText.trim() || transcript.trim(), objs.length ? `Objections : ${objs.join(", ")}` : ""].filter(Boolean).join("\n");
    const payload = { client_id: id, ...o, next_date: nd || null, summary, voice_transcript: transcript, objections: objs, photo: photo || null,
      gps, checkin_at: checkin.current, client_uuid: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` };
    try {
      const res = await postOffline("/visits", payload);
      toast.success(res.offline ? "Note enregistrée hors ligne — synchronisée au retour du réseau" : "Note de visite enregistrée", res.offline ? { icon: "📶" } : undefined);
      sessionStorage.setItem("bevid_visit_saved", "1");
      import("@/lib/nativeFeatures").then((m) => m.haptic("success")).catch(() => {});
      if (outcome === "commande") nav(`/etab/${id}/commande`); else nav(`/etab/${id}`);
    } catch { toast.error("Erreur à l'enregistrement"); }
    finally { setSaving(false); }
  };

  const Chip = ({ on, onClick, children, testId }) => (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className={`min-h-[52px] px-3 rounded-xl text-base font-medium border ${on ? "bg-[#4A154B] text-white border-transparent" : "bg-white border-stone-300 text-stone-800"}`}>{children}</button>
  );

  return (
    <div className="space-y-4 pb-28" data-testid="mobile-visit-page">
      <Link to={`/etab/${id}`} className="inline-flex items-center gap-1 min-h-[44px] text-base text-stone-700" data-testid="mvisit-back"><ArrowLeft size={18} aria-hidden="true" /> {etab?.name || "Fiche"}</Link>
      <h1 className="font-display text-2xl">Note de visite</h1>
      <p className="text-sm text-stone-700 flex items-center gap-1" data-testid="mvisit-checkin">
        <MapPin size={14} aria-hidden="true" /> Check-in {new Date(checkin.current).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}{gps ? " · position enregistrée" : " · position en cours…"}
      </p>

      <div>
        <p className="overline mb-1">Résultat</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Résultat de la visite">
          {OUTCOMES.map(([k, l]) => <Chip key={k} on={outcome === k} onClick={() => setOutcome(k)} testId={`outcome-${k}`}>{l}</Chip>)}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
        <button type="button" onClick={listening || nativeStopRef.current ? micStop : micStart} disabled={!supported && !window.Capacitor?.isNativePlatform?.()} data-testid="mvisit-mic"
          className={`w-full min-h-[64px] rounded-xl text-white text-lg font-semibold flex items-center justify-center gap-2 ${listening ? "bg-[#8C2A2A] animate-pulse" : "bg-[#4A154B]"} disabled:opacity-40`}>
          {listening ? <MicOff size={26} aria-hidden="true" /> : <Mic size={26} aria-hidden="true" />}{listening ? "Arrêter la dictée" : supported ? "Dicter la note" : "Dictée indisponible"}
        </button>
        <textarea value={text || nativeText || transcript} onChange={(e) => setText(e.target.value)} rows={3} placeholder="…ou tapez quelques mots" aria-label="Note"
          className="input-crm w-full text-base min-h-[80px]" data-testid="mvisit-text" />
      </div>

      <div>
        <p className="overline mb-1">Objections</p>
        <div className="flex flex-wrap gap-2">
          {OBJECTIONS.map((o) => <Chip key={o} on={objs.includes(o)} onClick={() => setObjs((s) => s.includes(o) ? s.filter((x) => x !== o) : [...s, o])} testId={`obj-${o.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{o}</Chip>)}
        </div>
      </div>

      <div>
        <p className="overline mb-1">Prochaine action (crée la relance)</p>
        <div className="grid grid-cols-5 gap-1.5">
          {NEXT.map(([k, l]) => <Chip key={k} on={next === k} onClick={() => setNext(k)} testId={`next-${k}`}>{l}</Chip>)}
        </div>
        {next === "libre" && <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} aria-label="Date de relance" className="input-crm w-full min-h-[52px] text-base mt-2" data-testid="next-date" />}
      </div>

      <div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Photo" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compress(f)); }} data-testid="mvisit-photo-input" />
        <button type="button" onClick={() => fileRef.current?.click()} className="w-full min-h-[52px] rounded-xl border border-stone-300 bg-white text-base font-medium flex items-center justify-center gap-2" data-testid="mvisit-photo-btn">
          <Camera size={20} aria-hidden="true" /> {photo ? "Reprendre la photo" : "Photo (linéaire, tireuse, carte)"}
        </button>
        {photo && <img src={photo} alt="Photo de visite" className="mt-2 rounded-xl w-full max-h-40 object-cover" />}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t border-stone-200 z-40 pb-safe">
        <button type="button" onClick={save} disabled={saving} className="btn-primary w-full min-h-[56px] text-base flex items-center justify-center gap-2" data-testid="mvisit-save">
          {saving ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : navigator.onLine ? <Check size={20} aria-hidden="true" /> : <WifiOff size={20} aria-hidden="true" />}
          {outcome === "commande" ? "Enregistrer et passer la commande" : navigator.onLine ? "Enregistrer la note" : "Enregistrer (hors ligne)"}
        </button>
      </div>
    </div>
  );
}

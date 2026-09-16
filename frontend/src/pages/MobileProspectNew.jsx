import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Camera, MapPin, Phone, User, Check, Loader2, WifiOff } from "lucide-react";
import { api } from "@/lib/api";
import { db, enqueueMutation } from "@/lib/db";
import { getPosition, pushRecent } from "@/lib/mobile";
import { usePageMeta } from "@/lib/pageMeta";

const TYPES = [["bar", "Bar"], ["restaurant", "Restaurant"], ["caviste", "Cave"], ["hotel", "Hôtel"], ["epicerie", "Épicerie"], ["autre", "Autre"]];
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

async function compressPhoto(file, max = 640) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.6);
}

/** Création rapide d'un prospect (< 30 s) : GPS → adresse déduite, type en boutons, doublon, photo, hors ligne. */
export default function MobileProspectNew() {
  usePageMeta({ title: "Nouveau prospect · BEVID" });
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [form, setForm] = useState({ name: sp.get("name") || "", type: "bar", address: "", city: "", postal_code: "", phone: "", contact_name: "", lat: null, lng: null });
  const [geo, setGeo] = useState("pending");
  const [photo, setPhoto] = useState(null);
  const [dups, setDups] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    (async () => {
      try {
        const pos = await getPosition();
        setForm((f) => ({ ...f, lat: pos.lat, lng: pos.lng }));
        setGeo("ok");
        const { data } = await api.get(`/geo/reverse?lat=${pos.lat}&lng=${pos.lng}`);
        if (data.found) setForm((f) => ({ ...f, address: f.address || data.address, city: f.city || data.city, postal_code: f.postal_code || data.postal_code }));
      } catch { setGeo((g) => (g === "ok" ? g : "denied")); }
    })();
  }, []);

  useEffect(() => {
    if (form.name.trim().length < 2 && form.phone.replace(/\D/g, "").length < 9) { setDups([]); return; }
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ name: form.name, phone: form.phone });
        if (form.lat != null) { p.set("lat", form.lat); p.set("lng", form.lng); }
        const { data } = await api.get(`/establishments/check-duplicate?${p}`);
        setDups(data.matches || []);
      } catch { setDups([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [form.name, form.phone, form.lat, form.lng]);

  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (f) setPhoto(await compressPhoto(f));
  };

  const save = async () => {
    if (form.name.trim().length < 2) { toast.error("Le nom est requis"); return; }
    setSaving(true);
    const id = uuid();
    const payload = { ...form, id, client_uuid: id, name: form.name.trim(), status: "prospect", facade_photo: photo || undefined };
    try {
      const { data } = await api.post("/establishments", payload);
      pushRecent(data);
      db.establishments.put(data).catch(() => {});
      db.establishments.where("id").equals(id).and((e) => e._pending === true).delete().catch(() => {});
      toast.success("Prospect créé");
      nav(`/etab/${data.id}`);
    } catch (err) {
      if (!navigator.onLine || !err.response) {
        await enqueueMutation({ url: "/establishments", method: "POST", data: payload });
        await db.establishments.put({ ...payload, credit_status: "vert", _pending: true }).catch(() => {});
        toast.success("Enregistré hors ligne — synchronisé au retour du réseau", { icon: "📶" });
        nav("/clients");
      } else {
        toast.error(err.response?.data?.detail || "Erreur à l'enregistrement");
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 pb-28" data-testid="prospect-new-page">
      <Link to="/terrain" className="inline-flex items-center gap-1 min-h-[48px] text-base text-stone-700" data-testid="prospect-back"><ArrowLeft size={18} aria-hidden="true" /> Terrain</Link>
      <h1 className="font-display text-3xl">Nouveau prospect</h1>

      <label className="block">
        <span className="overline block mb-1">Nom de l'établissement</span>
        <input autoFocus={!form.name} value={form.name} onChange={set("name")} placeholder="Ex. Bar du Port" enterKeyHint="next"
          className="input-crm w-full min-h-[56px] text-base" data-testid="prospect-name" />
      </label>

      {dups.length > 0 && (
        <div className="rounded-xl border-2 border-[#C78B3A] bg-[#FDF6EC] p-3 space-y-2" data-testid="prospect-duplicates">
          <p className="text-base font-medium text-[#7A4B10]">Fiche existante probable</p>
          {dups.map((d) => (
            <button key={d.id} type="button" onClick={() => nav(`/etab/${d.id}`)} data-testid={`dup-${d.id}`}
              className="w-full text-left min-h-[56px] rounded-lg bg-white border border-stone-200 px-3 py-2 flex items-center justify-between gap-2">
              <span className="min-w-0"><span className="block text-base font-medium truncate">{d.name}</span>
                <span className="block text-sm text-stone-600">{d.city || "—"}{d.distance_m != null ? ` · à ${d.distance_m} m` : ""}{d.reason === "phone" ? " · même téléphone" : ""}</span></span>
              <span className="text-sm font-medium text-[#4A154B] shrink-0">Ouvrir</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <span className="overline block mb-1">Type</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type d'établissement">
          {TYPES.map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={form.type === v} onClick={() => setForm((f) => ({ ...f, type: v }))} data-testid={`type-${v}`}
              className={`min-h-[52px] rounded-xl text-base font-medium border ${form.type === v ? "bg-[#4A154B] text-white border-transparent" : "bg-white border-stone-300 text-stone-800"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-2" data-testid="prospect-position">
        <p className="text-sm text-stone-700 flex items-center gap-1">
          <MapPin size={16} aria-hidden="true" />
          {geo === "pending" && "Position GPS en cours…"}
          {geo === "ok" && <span data-testid="geo-ok">Position captée{form.lat != null ? ` (${form.lat.toFixed(4)}, ${form.lng.toFixed(4)})` : ""}</span>}
          {geo === "denied" && "Position indisponible — saisissez l'adresse"}
        </p>
        <input value={form.address} onChange={set("address")} placeholder="Adresse" aria-label="Adresse" className="input-crm w-full min-h-[52px] text-base" data-testid="prospect-address" />
        <div className="grid grid-cols-3 gap-2">
          <input value={form.postal_code} onChange={set("postal_code")} placeholder="CP" inputMode="numeric" aria-label="Code postal" className="input-crm min-h-[52px] text-base" data-testid="prospect-cp" />
          <input value={form.city} onChange={set("city")} placeholder="Ville" aria-label="Ville" className="input-crm col-span-2 min-h-[52px] text-base" data-testid="prospect-city" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="relative block">
          <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden="true" />
          <span className="sr-only">Téléphone (facultatif)</span>
          <input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} placeholder="Téléphone (facultatif)" className="input-crm w-full pl-10 min-h-[52px] text-base" data-testid="prospect-phone" />
        </label>
        <label className="relative block">
          <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden="true" />
          <span className="sr-only">Nom du contact (facultatif)</span>
          <input value={form.contact_name} onChange={set("contact_name")} placeholder="Nom du contact (facultatif)" autoComplete="off" className="input-crm w-full pl-10 min-h-[52px] text-base" data-testid="prospect-contact" />
        </label>
      </div>

      <div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} aria-label="Photo de la devanture" data-testid="prospect-photo-input" />
        <button type="button" onClick={() => fileRef.current?.click()} className="w-full min-h-[56px] rounded-xl border border-stone-300 bg-white text-base font-medium flex items-center justify-center gap-2" data-testid="prospect-photo-btn">
          <Camera size={20} aria-hidden="true" /> {photo ? "Reprendre la photo" : "Photo de la devanture (facultatif)"}
        </button>
        {photo && <img src={photo} alt="Devanture" className="mt-2 rounded-xl w-full max-h-48 object-cover" data-testid="prospect-photo-preview" />}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t border-stone-200 z-40 pb-safe">
        <button type="button" onClick={save} disabled={saving} className="btn-primary w-full min-h-[56px] text-base flex items-center justify-center gap-2" data-testid="prospect-save">
          {saving ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : navigator.onLine ? <Check size={20} aria-hidden="true" /> : <WifiOff size={20} aria-hidden="true" />}
          {navigator.onLine ? "Enregistrer le prospect" : "Enregistrer (hors ligne)"}
        </button>
      </div>
    </div>
  );
}

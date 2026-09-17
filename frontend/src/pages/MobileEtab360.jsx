import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Phone, Navigation, ClipboardCheck, ShoppingCart, ArrowLeft, Loader2, ChevronRight, Camera, Mic } from "lucide-react";
import { api } from "@/lib/api";
import { pushRecent } from "@/lib/mobile";
import { Sheet } from "@/components/mobile/Sheet";
import { SalesTab } from "@/components/mobile/SalesTab";

const ALERT = { impaye: "bg-[#8C2A2A] text-white", fut: "bg-[#4A154B] text-white", relance: "bg-[#C78B3A] text-white", rupture: "bg-[#2D5A4C] text-white" };
const OUTCOME = { commande: "Commande prise", devis: "Devis", relance: "À relancer", visite: "Revisite", aucune: "Pas de suite" };
const MOOD = { excellent: "😄", bon: "🙂", neutre: "😐", difficile: "😟" };
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—");
const eur = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} €`;

const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent || "");
// Apps d'itinéraire : Plans + Waze sur iPhone, Google Maps + Waze ailleurs (dernier choix mémorisé)
const NAV_APPS = [
  ...(IOS ? [{ key: "plans", label: "Plans", url: (q) => `maps://?daddr=${q}` }] : [{ key: "gmaps", label: "Google Maps", url: (q) => `https://www.google.com/maps/dir/?api=1&destination=${q}` }]),
  { key: "waze", label: "Waze", url: (q) => `https://waze.com/ul?ll=${q}&navigate=yes` },
];
function destQuery(e) {
  return e.lat != null ? `${e.lat},${e.lng}` : encodeURIComponent(`${e.address || ""} ${e.postal_code || ""} ${e.city || ""}`.trim());
}

function VisitCard({ v }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left rounded-xl border border-stone-200 bg-white p-3 min-h-[64px]" data-testid={`visit-${v.id}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold">{fmtDate(v.created_at)} · {OUTCOME[v.next_action] || v.next_action} {MOOD[v.mood] || ""}</p>
        <span className="flex items-center gap-1 text-stone-500">{v.photo && <Camera size={16} aria-label="photo" />}{v.voice_transcript && <Mic size={16} aria-label="audio" />}<ChevronRight size={18} className={open ? "rotate-90" : ""} aria-hidden="true" /></span>
      </div>
      <p className={`text-sm text-stone-700 mt-1 ${open ? "" : "line-clamp-2"}`}>{v.summary || "(aucune note)"}</p>
      {open && v.objections?.length > 0 && <p className="text-sm text-stone-600 mt-1">Objections : {v.objections.join(", ")}</p>}
    </button>
  );
}

export default function MobileEtab360() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("notes");
  const [callSheet, setCallSheet] = useState(false);
  const [routeSheet, setRouteSheet] = useState(false);
  const openRoute = (app, remember) => {
    if (remember) localStorage.setItem("bevid_nav_app", app.key);
    setRouteSheet(false);
    window.open(app.url(destQuery(d.establishment)), "_blank", "noopener");
  };
  const route = () => {
    const saved = NAV_APPS.find((a) => a.key === localStorage.getItem("bevid_nav_app"));
    if (saved) openRoute(saved, false); else setRouteSheet(true);
  };

  useEffect(() => {
    api.get(`/establishments/${id}/mobile-summary`).then((r) => { setD(r.data); pushRecent(r.data.establishment); }).catch(() => setD({ error: true }));
  }, [id]);

  if (!d) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="animate-spin" aria-label="Chargement" /></div>;
  if (d.error) return <p className="text-base text-stone-700" data-testid="etab-error">Fiche indisponible hors ligne.</p>;
  const e = d.establishment;
  const phones = [...(d.contacts || []).filter((c) => c.phone).map((c) => ({ name: c.name, role: c.role, phone: c.phone })), ...(e.phone ? [{ name: e.name, role: "établissement", phone: e.phone }] : [])];
  const call = () => { if (phones.length <= 1) { if (phones[0]) window.location.href = `tel:${phones[0].phone.replace(/\s/g, "")}`; } else setCallSheet(true); };
  const blocked = e.credit_status === "rouge";

  return (
    <div className="pb-28 space-y-3" data-testid="mobile-etab-page">
      <Link to="/terrain" className="inline-flex items-center gap-1 min-h-[44px] text-base text-stone-700" data-testid="metab-back"><ArrowLeft size={18} aria-hidden="true" /> Terrain</Link>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight truncate" data-testid="metab-name">{e.name}</h1>
          <p className="text-sm text-stone-700">{e.type} · {e.city || "—"}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${e.credit_status === "rouge" ? "bg-[#8C2A2A] text-white" : e.credit_status === "orange" ? "bg-[#C78B3A] text-white" : "bg-[#2D5A4C] text-white"}`} data-testid="metab-status">
          {e.credit_status === "rouge" ? "Bloqué" : e.credit_status === "orange" ? "Retard" : "En règle"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center" data-testid="metab-vitals">
        <div className="rounded-xl bg-white border border-stone-200 p-2"><p className="text-xs text-stone-600">Dernière visite</p><p className="text-base font-semibold">{fmtDate(d.last_visit?.created_at)}</p><p className="text-xs text-stone-700 truncate">{d.last_visit ? OUTCOME[d.last_visit.next_action] || d.last_visit.next_action : "—"}</p></div>
        <div className="rounded-xl bg-white border border-stone-200 p-2"><p className="text-xs text-stone-600">Dernière cmd</p><p className="text-base font-semibold">{fmtDate(d.last_order?.created_at)}</p><p className="text-xs text-stone-700">{d.last_order ? eur(d.last_order.total) : "—"}</p></div>
        <div className="rounded-xl bg-white border border-stone-200 p-2"><p className="text-xs text-stone-600">CA 12 mois</p><p className="text-base font-semibold">{eur(d.ca_12m)}</p><p className={`text-xs font-medium ${d.trend_pct == null ? "text-stone-500" : d.trend_pct >= 0 ? "text-[#2D5A4C]" : "text-[#8C2A2A]"}`}>{d.trend_pct == null ? "—" : `${d.trend_pct >= 0 ? "▲" : "▼"} ${Math.abs(d.trend_pct)} %`}</p></div>
      </div>

      {d.alerts.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="metab-alerts">
          {d.alerts.map((a) => <span key={a.key} className={`text-sm font-medium px-2.5 py-1 rounded-full ${ALERT[a.key]}`}>{a.label}</span>)}
        </div>
      )}

      {d.contacts.length > 0 && (
        <div className="rounded-xl bg-white border border-stone-200 p-3" data-testid="metab-contacts">
          {d.contacts.slice(0, 3).map((c, i) => (
            <div key={c.id || i} className="flex items-center justify-between min-h-[40px]">
              <p className="text-base truncate"><span className="font-medium">{c.name}</span> <span className="text-stone-600 text-sm">· {c.role || "contact"}</span></p>
              {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#4A154B]" aria-label={`Appeler ${c.name}`}><Phone size={18} /></a>}
            </div>
          ))}
        </div>
      )}

      <div role="tablist" className="grid grid-cols-4 gap-1 bg-stone-200 rounded-xl p-1" data-testid="metab-tabs">
        {[["notes", "Notes"], ["orders", "Cmdes"], ["sales", "Ventes"], ["infos", "Infos"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            aria-label={k === "orders" ? "Commandes" : l}
            className={`min-h-[48px] rounded-lg text-base font-semibold ${tab === k ? "bg-white text-[#4A154B] shadow" : "text-stone-700"}`}>{l}</button>
        ))}
      </div>

      {tab === "notes" && (
        <div className="space-y-2" data-testid="metab-notes">
          {d.visits.length === 0 && <p className="text-base text-stone-600">Aucune visite enregistrée.</p>}
          {d.visits.map((v) => <VisitCard key={v.id} v={v} />)}
        </div>
      )}
      {tab === "orders" && (
        <div className="space-y-2" data-testid="metab-orders">
          {d.orders.length === 0 && <p className="text-base text-stone-600">Aucune commande.</p>}
          {d.orders.map((o) => (
            <div key={o.id} className="rounded-xl border border-stone-200 bg-white p-3">
              <div className="flex justify-between text-base"><span className="font-semibold">{fmtDate(o.created_at)}</span><span className="font-semibold">{eur(o.total)}</span></div>
              <p className="text-sm text-stone-700 line-clamp-2">{(o.lines || []).map((l) => `${l.quantity}× ${l.product_name}`).join(" · ")}</p>
              <p className="text-xs text-stone-500 mt-1">{o.status}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "sales" && <SalesTab sales={d.sales} etabId={id} />}
      {tab === "infos" && (
        <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-1 text-base" data-testid="metab-infos">
          <p>{e.address || "Adresse non renseignée"}{e.postal_code ? `, ${e.postal_code}` : ""} {e.city || ""}</p>
          {e.phone && <p>Tél. {e.phone}</p>}
          {e.email && <p>{e.email}</p>}
          {e.siret && <p className="text-sm text-stone-600">SIRET {e.siret}</p>}
          {e.notes && <p className="text-sm text-stone-700 whitespace-pre-wrap">{e.notes}</p>}
          {e.facade_photo && <img src={e.facade_photo} alt="Devanture" className="rounded-xl w-full max-h-48 object-cover" />}
          <Link to={`/etab/${id}/enrichissement`} className="inline-flex min-h-[44px] items-center text-[#4A154B] font-medium">Compléter la fiche (SIRET, TVA…)</Link>
          <button type="button" onClick={() => { localStorage.removeItem("bevid_nav_app"); setRouteSheet(true); }} className="block min-h-[44px] text-base text-stone-700 underline" data-testid="route-change">Changer d'application d'itinéraire</button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-2 grid grid-cols-4 gap-2 z-40 pb-safe" data-testid="cta-bar">
        <button type="button" onClick={call} disabled={phones.length === 0} className="min-h-[56px] rounded-xl bg-black text-white text-sm font-medium flex flex-col items-center justify-center gap-0.5 disabled:opacity-40" data-testid="cta-call"><Phone size={20} aria-hidden="true" />Appeler</button>
        <button type="button" onClick={route} className="min-h-[56px] rounded-xl bg-stone-700 text-white text-sm font-medium flex flex-col items-center justify-center gap-0.5" data-testid="cta-route"><Navigation size={20} aria-hidden="true" />Itinéraire</button>
        <button type="button" onClick={() => nav(`/etab/${id}/visite`)} className="min-h-[56px] rounded-xl bg-[#4A154B] text-white text-sm font-medium flex flex-col items-center justify-center gap-0.5" data-testid="cta-visite"><ClipboardCheck size={20} aria-hidden="true" />Visite</button>
        <button type="button" onClick={() => !blocked && nav(`/etab/${id}/commande`)} disabled={blocked} className="min-h-[56px] rounded-xl bg-[#2D5A4C] text-white text-sm font-medium flex flex-col items-center justify-center gap-0.5 disabled:bg-stone-300" data-testid="cta-commande"><ShoppingCart size={20} aria-hidden="true" />{blocked ? "Bloqué" : "Commande"}</button>
      </div>

      <Sheet open={routeSheet} onClose={() => setRouteSheet(false)} title="Itinéraire avec…" testId="route-sheet">
        <div className="space-y-2">
          {NAV_APPS.map((a) => (
            <div key={a.key} className="flex gap-2">
              <button type="button" onClick={() => openRoute(a, false)} className="flex-1 min-h-[56px] rounded-xl border border-stone-300 text-base font-medium" data-testid={`route-${a.key}`}>{a.label}</button>
              <button type="button" onClick={() => openRoute(a, true)} className="min-h-[56px] px-3 rounded-xl bg-[#4A154B] text-white text-sm font-medium" data-testid={`route-${a.key}-always`}>Toujours</button>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={callSheet} onClose={() => setCallSheet(false)} title="Qui appeler ?" testId="call-sheet">
        <div className="space-y-2">
          {phones.map((p, i) => (
            <a key={p.phone} href={`tel:${p.phone.replace(/\s/g, "")}`} onClick={() => setCallSheet(false)} className="flex items-center justify-between min-h-[56px] rounded-xl border border-stone-200 px-3 text-base" data-testid={`call-${i}`}>
              <span><span className="font-medium">{p.name}</span> <span className="text-stone-600 text-sm">· {p.role}</span></span><span className="text-[#4A154B] font-medium">{p.phone}</span>
            </a>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

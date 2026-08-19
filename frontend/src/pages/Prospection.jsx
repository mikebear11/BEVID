import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { MapPin, Search, Plus, Loader2, Award, Music, Leaf, Compass } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

// Leaflet — chargement dynamique pour ne pas casser SSR/tests
let L = null;
async function loadLeaflet() {
  if (L) return L;
  const mod = await import("leaflet");
  L = mod.default || mod;
  await import("leaflet/dist/leaflet.css");
  return L;
}

export default function Prospection() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [radius, setRadius] = useState(3);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Géoloc
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPos({ lat: 43.29, lng: -0.37 }), // Pau par défaut
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  // Init map
  useEffect(() => {
    if (!pos || !mapRef.current || mapInstanceRef.current) return;
    let cancel = false;
    (async () => {
      const L = await loadLeaflet();
      if (cancel) return;
      const map = L.map(mapRef.current, { attributionControl: false }).setView([pos.lat, pos.lng], 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 19,
      }).addTo(map);
      L.control.attribution({ prefix: false }).addAttribution("© OpenStreetMap").addTo(map);
      // marqueur position
      L.circleMarker([pos.lat, pos.lng], { radius: 8, color: "#4A154B", fillColor: "#4A154B", fillOpacity: 0.9 })
        .addTo(map).bindPopup("Vous êtes ici");
      mapInstanceRef.current = map;
    })();
    return () => { cancel = true; };
  }, [pos]);

  // Draw markers when results change
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;
    // Clear old markers
    mapInstanceRef.current.eachLayer(l => {
      if (l.options && l.options.__prospect) mapInstanceRef.current.removeLayer(l);
    });
    results.forEach(r => {
      if (r.lat == null || r.lng == null) return;
      const m = L.marker([r.lat, r.lng], { __prospect: true });
      const badges = [];
      if (r.badges?.bio) badges.push('<span style="background:#5C8A6A;color:#fff;padding:1px 6px;border-radius:9px;font-size:10px;margin-right:4px">Bio</span>');
      if (r.badges?.entrepreneur_spectacle) badges.push('<span style="background:#4A154B;color:#fff;padding:1px 6px;border-radius:9px;font-size:10px;margin-right:4px">Spectacle</span>');
      if (r.badges?.confiance_sanitaire) badges.push('<span style="background:#2D5A4C;color:#fff;padding:1px 6px;border-radius:9px;font-size:10px">Confiance</span>');
      m.bindPopup(`<b>${r.name || "?"}</b><br/><span style="font-size:11px;color:#666">${r.address || ""} · ${r.commune || ""}</span><br/><span style="font-size:11px">${r.activite_principale || ""} · ${r.segment || ""}</span><div style="margin-top:6px">${badges.join("")}</div>`);
      m.addTo(mapInstanceRef.current);
    });
  }, [results]);

  const search = async () => {
    if (!pos) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/prospection/nearby?lat=${pos.lat}&lng=${pos.lng}&radius_km=${radius}`);
      setResults(data.results || []);
      toast.success(t("toast.v1_prospects_trouves_dans_un_rayon_", { v1: data.count, v2: radius }));
    } catch (e) { toast.error(e.response?.data?.detail || t("toast.source_publique_indisponible")); }
    finally { setLoading(false); }
  };

  const convert = async (r) => {
    try {
      const { data } = await api.post("/prospection/convert", r);
      if (data.already) toast.info(t("toast.prospect_deja_dans_le_portefeuille"));
      else toast.success(t("toast.prospect_ajoute_au_portefeuille"));
    } catch { toast.error(t("toast.erreur_conversion")); }
  };

  return (
    <div className="space-y-4" data-testid="prospection-page">
      <div>
        <p className="overline flex items-center gap-2"><Compass size={12} /> Radar géographique</p>
        <h1 className="font-display text-4xl">Prospection autour de moi</h1>
        <p className="text-xs text-stone-500 mt-1">CHR ouverts sur le territoire · exclus les clients existants · via API Recherche d'entreprises</p>
      </div>

      <div className="card-crm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-stone-600">Rayon</label>
          <select value={radius} onChange={e => setRadius(Number(e.target.value))} className="input-crm text-sm ml-2 h-10" data-testid="prospection-radius">
            {[1, 2, 3, 5, 10, 20, 50].map(r => <option key={r} value={r}>{r} km</option>)}
          </select>
        </div>
        <div className="text-xs text-stone-500">
          {pos ? `Position: ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` : "Géolocalisation en cours…"}
        </div>
        <button onClick={search} disabled={!pos || loading}
          className="btn-primary flex items-center gap-2 min-h-[40px] ml-auto"
          data-testid="prospection-search-btn">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Rechercher
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div ref={mapRef} className="card-crm h-[500px] overflow-hidden" data-testid="prospection-map" />
        <div className="card-crm p-4 max-h-[500px] overflow-y-auto">
          <h3 className="font-display text-lg mb-3">Résultats ({results.length})</h3>
          {results.length === 0 && (
            <p className="text-sm text-stone-500 italic">Lance une recherche pour voir les prospects du secteur.</p>
          )}
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={r.siren || i} className="border border-stone-200 rounded-lg p-3" data-testid={`prospect-${r.siren}`}>
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-stone-800 truncate">{r.name}</p>
                    <p className="text-xs text-stone-500">{r.address} · {r.commune} · <span className="capitalize">{r.segment || "chr"}</span></p>
                    <div className="flex gap-1 mt-2">
                      {r.badges?.bio && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Leaf size={9} /> Bio</span>}
                      {r.badges?.entrepreneur_spectacle && <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Music size={9} /> Spectacle</span>}
                      {r.badges?.confiance_sanitaire && <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Award size={9} /> Confiance</span>}
                    </div>
                  </div>
                  <button onClick={() => convert(r)} className="text-xs bg-[#4A154B] text-white px-2 py-1.5 rounded flex items-center gap-1 ml-2 min-h-[36px]" data-testid={`convert-${r.siren}`}>
                    <Plus size={11} /> Ajouter
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

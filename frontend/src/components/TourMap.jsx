import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
// Icônes servies depuis le bundle (webpack) — plus aucun appel vers unpkg.com
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Fix marker icons in leaflet+webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

const bordeauxIcon = new L.DivIcon({
  html: '<div style="background:#4A154B;width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [points, map]);
  return null;
}

export default function TourMap({ clients }) {
  const geoClients = clients.filter(c => c.lat != null && c.lng != null);
  if (geoClients.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-stone-500 border border-dashed border-stone-300 rounded-lg" data-testid="empty-map">
        Aucun client géolocalisé. Cliquez sur "Géocoder les adresses" pour placer les clients sur la carte.
      </div>
    );
  }
  const center = [geoClients[0].lat, geoClients[0].lng];
  const route = geoClients.map(c => [c.lat, c.lng]);
  return (
    <div className="h-96 rounded-lg overflow-hidden border border-stone-200" data-testid="tour-map">
      <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geoClients.map((c, i) => (
          <Marker key={c.id} position={[c.lat, c.lng]} icon={bordeauxIcon}>
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 600, color: "#4A154B" }}>#{i + 1} · {c.name}</div>
                <div style={{ fontSize: 12, color: "#5C5C5C" }}>{c.type} · {c.city}</div>
                {c.phone && <div style={{ fontSize: 12 }}>{c.phone}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
        {route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#4A154B", weight: 3, dashArray: "6,6" }} />}
        <FitBounds points={geoClients} />
      </MapContainer>
    </div>
  );
}

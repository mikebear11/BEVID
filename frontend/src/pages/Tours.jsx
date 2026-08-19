import React, { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { Plus, MapPin, Calendar, Locate, Loader2 } from "lucide-react";
import { toast } from "sonner";
import TourMap from "@/components/TourMap";
import { t } from "@/lib/i18n";

export default function Tours() {
  const [tours, setTours] = useState([]);
  const [clients, setClients] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", date: new Date().toISOString().slice(0,10), client_ids: [] });
  const [selectedTour, setSelectedTour] = useState(null);
  const [geocoding, setGeocoding] = useState(false);

  const load = async () => {
    const [{ data: t }, { data: c }] = await Promise.all([api.get("/tours"), api.get("/clients")]);
    setTours(t); setClients(c);
    if (!selectedTour && t.length > 0) setSelectedTour(t[0]);
  };
  useEffect(() => { load(); }, []);

  const toggle = (id) => setForm(f => ({ ...f, client_ids: f.client_ids.includes(id) ? f.client_ids.filter(x => x!==id) : [...f.client_ids, id] }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.client_ids.length === 0) { toast.error(t("toast.tour_add_client")); return; }
    const { data } = await api.post("/tours", form);
    toast.success(t("toast.tour_created"));
    setShow(false); setForm({ name: "", date: new Date().toISOString().slice(0,10), client_ids: [] });
    setSelectedTour(data);
    load();
  };

  const setStatus = async (t, status) => {
    await api.put(`/tours/${t.id}`, { status }); load();
  };

  const geocodeAll = async () => {
    setGeocoding(true);
    try {
      const { data } = await api.post("/clients/geocode-all");
      toast.success(t("toast.v1_clients_geolocalises", { v1: data.updated }));
      await load();
    } catch { toast.error(t("toast.geocode_error")); }
    finally { setGeocoding(false); }
  };

  const mapClients = selectedTour
    ? clients.filter(c => selectedTour.client_ids?.includes(c.id))
    : clients;

  return (
    <div className="space-y-6" data-testid="tours-page">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <div><p className="overline">Planning terrain</p><h1 className="font-display text-4xl">Tournées</h1></div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={geocodeAll} disabled={geocoding} className="btn-ghost flex items-center gap-2" data-testid="geocode-all-btn">
            {geocoding ? <Loader2 size={14} className="animate-spin" /> : <Locate size={14} />}
            Géocoder les adresses
          </button>
          <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2" data-testid="add-tour-btn"><Plus size={16} /> Nouvelle</button>
        </div>
      </div>

      <div className="card-crm p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-xl">Carte {selectedTour ? `· ${selectedTour.name}` : "· Tous les clients"}</h3>
          {tours.length > 0 && (
            <select value={selectedTour?.id || ""} onChange={e => setSelectedTour(tours.find(x => x.id === e.target.value))} className="text-xs border border-stone-200 rounded px-2 py-1" data-testid="tour-select">
              <option value="">Tous les clients</option>
              {tours.map(t => <option key={t.id} value={t.id}>{t.name} · {t.date}</option>)}
            </select>
          )}
        </div>
        <TourMap clients={mapClients} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tours.length === 0 && <p className="text-stone-500 text-sm">Aucune tournée planifiée</p>}
        {tours.map(t => (
          <div key={t.id} className={`card-crm p-5 cursor-pointer ${selectedTour?.id === t.id ? 'border-[#4A154B]' : ''}`} onClick={() => setSelectedTour(t)} data-testid={`tour-${t.id}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="overline flex items-center gap-1"><Calendar size={11} /> {t.date}</p>
                <h3 className="font-display text-xl mt-1">{t.name}</h3>
              </div>
              <select value={t.status} onChange={e => { e.stopPropagation(); setStatus(t, e.target.value); }} onClick={e => e.stopPropagation()} className="text-xs border rounded px-2 py-1">
                <option value="planifiee">Planifiée</option>
                <option value="en_cours">En cours</option>
                <option value="terminee">Terminée</option>
              </select>
            </div>
            <div className="mt-3 space-y-1">
              {t.client_ids.map(cid => {
                const c = clients.find(x => x.id === cid);
                if (!c) return null;
                return (
                  <div key={cid} className="flex items-center gap-2 text-sm text-stone-700">
                    <MapPin size={12} className="text-[#4A154B]" />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs text-stone-500">{c.city}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-lg w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto" data-testid="tour-modal">
            <h3 className="font-display text-2xl">Nouvelle tournée</h3>
            <div><label className="text-xs">Nom *</label><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-crm mt-1" data-testid="tour-name" /></div>
            <div><label className="text-xs">Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-crm mt-1" /></div>
            <div>
              <label className="text-xs overline">Clients à visiter</label>
              <div className="max-h-48 overflow-y-auto border border-stone-200 rounded p-2 space-y-1 mt-1">
                {clients.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.client_ids.includes(c.id)} onChange={() => toggle(c.id)} />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs text-stone-500">{c.city}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShow(false)} className="btn-ghost">Annuler</button>
              <button className="btn-primary" data-testid="tour-submit">Créer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

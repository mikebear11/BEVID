import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Users, User, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TYPES = ["visite", "reunion", "relance", "tournee", "autre"];
const TYPE_COLOR = { visite: "#4A154B", reunion: "#2D5A4C", relance: "#C78B3A", tournee: "#8C2A2A", autre: "#5C5C5C" };

export default function Planning() {
  const [events, setEvents] = useState([]);
  const [clients, setClients] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: "", start: new Date().toISOString().slice(0, 16), type: "visite", client_id: "", shared: false, notes: "" });

  const load = async () => {
    const [{ data: e }, { data: c }] = await Promise.all([api.get("/events"), api.get("/clients")]);
    setEvents(e); setClients(c);
  };
  useEffect(() => { load(); }, []);

  const submit = async (ev) => {
    ev.preventDefault();
    const payload = { ...form, client_id: form.client_id || null };
    await api.post("/events", payload);
    toast.success("Événement créé");
    setShow(false);
    setForm({ title: "", start: new Date().toISOString().slice(0, 16), type: "visite", client_id: "", shared: false, notes: "" });
    load();
  };

  const del = async (id) => { await api.delete(`/events/${id}`); load(); };

  const grouped = events.reduce((acc, e) => {
    const day = e.start.slice(0, 10);
    (acc[day] = acc[day] || []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-6" data-testid="planning-page">
      <div className="flex justify-between items-center">
        <div><p className="overline">Agenda</p><h1 className="font-display text-4xl">Planning</h1></div>
        <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2" data-testid="add-event-btn"><Plus size={16} /> Événement</button>
      </div>

      {Object.keys(grouped).length === 0 && <p className="text-stone-500 text-sm">Aucun événement planifié</p>}
      {Object.keys(grouped).sort().map(day => (
        <div key={day} className="card-crm p-4" data-testid={`day-${day}`}>
          <p className="overline mb-3">{new Date(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
          <div className="space-y-2">
            {grouped[day].map(e => {
              const c = clients.find(x => x.id === e.client_id);
              return (
                <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg bg-stone-50 border-l-4" style={{ borderColor: TYPE_COLOR[e.type] }}>
                  <div className="text-xs font-mono text-stone-600 w-16">{e.start.slice(11, 16)}</div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{e.title}</div>
                    <div className="text-xs text-stone-500 flex items-center gap-2">
                      {e.shared ? <Users size={11} /> : <User size={11} />}
                      <span className="capitalize">{e.type}</span>
                      {c && <span>· {c.name}</span>}
                    </div>
                  </div>
                  <button onClick={() => del(e.id)} className="text-stone-400 hover:text-[#8C2A2A]"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {show && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <form onSubmit={submit} onClick={ev => ev.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto" data-testid="event-modal">
            <h3 className="font-display text-2xl">Nouvel événement</h3>
            <div><label className="text-xs">Titre *</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input-crm mt-1" data-testid="event-title" /></div>
            <div><label className="text-xs">Date & heure</label><input type="datetime-local" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} className="input-crm mt-1" /></div>
            <div><label className="text-xs">Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input-crm mt-1">{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label className="text-xs">Client (optionnel)</label><select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="input-crm mt-1"><option value="">—</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.shared} onChange={e => setForm({ ...form, shared: e.target.checked })} data-testid="event-shared" /> Partagé avec l'équipe</label>
            <div><label className="text-xs">Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-crm mt-1" /></div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShow(false)} className="btn-ghost">Annuler</button>
              <button className="btn-primary" data-testid="event-submit">Créer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

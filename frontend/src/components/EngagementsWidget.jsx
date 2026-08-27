import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { AtSign, Clock, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Widget « Engagements » affiché en haut de la page Tournée.
 * Liste les `message_actions` pending du user avec échéance ≤ 7 jours.
 * Le clic marque l'engagement comme traité et ouvre l'objet source.
 */
export default function EngagementsWidget() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tour/engagements");
      setItems(data || []);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const done = async (a) => {
    try {
      await api.post(`/messages/${a.message_id}/mark-read`);
      toast.success("Engagement traité");
      load();
    } catch { toast.error("Impossible de marquer traité"); }
  };

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <section className="card-crm p-4" data-testid="engagements-widget">
      <div className="flex items-center gap-2 mb-3">
        <AtSign size={16} className="text-[#4A154B]" aria-hidden="true" />
        <h2 className="font-display text-lg">Engagements datés</h2>
        <span className="text-xs text-stone-500">· mentions à traiter avant échéance</span>
      </div>
      <ul className="space-y-2">
        {items.map(a => (
          <li key={a.id} className="flex items-center justify-between gap-3 p-2 border border-stone-200 dark:border-stone-700 rounded-lg" data-testid={`engagement-${a.id}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-[#4A154B] dark:text-[#B076B4]">@ {a.author_name}</span>
                {a.due_date && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"><Clock size={9} aria-hidden="true" /> {a.due_date}</span>}
              </div>
              <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5 line-clamp-1">{a.preview}</p>
              {a.object_type === "establishment" && a.object_name && (
                <Link to={`/clients/${a.object_id}`} className="text-xs text-[#4A154B] hover:underline" data-testid={`engagement-link-${a.id}`}>
                  {a.object_name} {a.object_city && `· ${a.object_city}`}
                </Link>
              )}
            </div>
            <button onClick={() => done(a)} aria-label="Marquer traité" className="text-emerald-700 hover:text-emerald-900 min-h-[36px] min-w-[36px] flex items-center justify-center" data-testid={`engagement-done-${a.id}`}>
              <CheckCircle2 size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

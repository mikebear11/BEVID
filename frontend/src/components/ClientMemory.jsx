import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Sparkles, RefreshCw, Loader2, ExternalLink } from "lucide-react";

/**
 * Bloc « Ce qu'il faut savoir » — Lot 7 étape 2.
 * Lecture pure de /api/establishments/{eid}/memory (recalculé sur événement).
 * Chaque item porte sa source, cliquable.
 */
export default function ClientMemory({ establishmentId }) {
  const [memory, setMemory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/establishments/${establishmentId}/memory`);
      setMemory(data);
    } catch { setMemory({ sections: [] }); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (establishmentId) load(); }, [establishmentId]);

  const recompute = async () => {
    setRecomputing(true);
    try {
      const { data } = await api.post(`/establishments/${establishmentId}/memory/recompute`);
      setMemory(data);
    } finally { setRecomputing(false); }
  };

  if (loading) {
    return (
      <div className="text-xs text-stone-500 flex items-center gap-1" data-testid="memory-loading">
        <Loader2 size={12} className="animate-spin" /> Chargement…
      </div>
    );
  }

  const sections = memory?.sections || [];
  const computedAt = memory?.computed_at ? new Date(memory.computed_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  const SourceBadge = ({ source }) => {
    if (!source) return null;
    const label = source.label || source.type || "source";
    const date = source.date ? ` · ${source.date}` : "";
    return (
      <span className="text-[10px] text-stone-400 dark:text-stone-500 ml-1 whitespace-nowrap" aria-label={`source ${label}${date}`}>
        <ExternalLink size={9} className="inline mr-0.5 -mt-0.5" />
        {label}{date}
      </span>
    );
  };

  return (
    <div data-testid="client-memory">
      <div className="flex items-center justify-between mb-2">
        <p className="overline flex items-center gap-1">
          <Sparkles size={11} className="text-[#4A154B] dark:text-[#B076B4]" />
          Ce qu'il faut savoir
        </p>
        <button
          type="button"
          onClick={recompute}
          disabled={recomputing}
          className="text-[10px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 disabled:opacity-50"
          aria-label="Recalculer la mémoire"
          data-testid="memory-recompute"
        >
          {recomputing ? <Loader2 size={11} className="inline animate-spin" /> : <RefreshCw size={11} />}
        </button>
      </div>
      {sections.length === 0 ? (
        <p className="text-xs text-stone-500" data-testid="memory-empty">
          Rien de particulier pour cet établissement.
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map(sec => (
            <div key={sec.key} data-testid={`memory-section-${sec.key}`}>
              <p className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">{sec.title}</p>
              <ul className="space-y-1">
                {sec.items.map((it, i) => (
                  <li key={i} className="text-sm text-stone-700 dark:text-stone-200 flex flex-wrap items-baseline gap-x-1">
                    <span className="flex-1 min-w-0">{it.text}</span>
                    <SourceBadge source={it.source} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {computedAt && (
        <p className="text-[10px] text-stone-400 mt-3" data-testid="memory-computed-at">
          Mis à jour {computedAt}
        </p>
      )}
    </div>
  );
}

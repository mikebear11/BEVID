import React, { useState } from "react";
import { api } from "@/lib/api";
import { ThumbsUp, ThumbsDown } from "lucide-react";

/**
 * Pouce haut/bas discret — Lot 7 mesure d'utilité.
 * Un tap, pas de formulaire. Idempotent côté serveur (upsert par user+target).
 */
export default function FeedbackThumbs({ kind, targetId, context = null, testIdPrefix = "fb" }) {
  const [vote, setVote] = useState(null);   // null | true | false
  const [busy, setBusy] = useState(false);

  const send = async (useful) => {
    if (busy || vote !== null || !targetId) return;  // Fix iter21 — vote unique par UI (idempotent côté serveur, mais UX propre)
    setBusy(true);
    setVote(useful);
    try {
      await api.post("/copilot/feedback", { kind, target_id: String(targetId), useful, context });
    } catch {
      setVote(null);
    } finally { setBusy(false); }
  };

  const active = vote !== null;
  return (
    <div className="inline-flex items-center gap-1" data-testid={`${testIdPrefix}-thumbs`}>
      <button
        type="button"
        onClick={() => send(true)}
        disabled={busy || vote !== null}
        aria-label="Utile"
        aria-pressed={vote === true}
        data-testid={`${testIdPrefix}-up`}
        className={`p-1 rounded transition-colors ${vote === true ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" : active ? "text-stone-300" : "text-stone-400 hover:text-emerald-600"}`}
      >
        <ThumbsUp size={12} />
      </button>
      <button
        type="button"
        onClick={() => send(false)}
        disabled={busy || vote !== null}
        aria-label="Pas utile"
        aria-pressed={vote === false}
        data-testid={`${testIdPrefix}-down`}
        className={`p-1 rounded transition-colors ${vote === false ? "text-red-600 bg-red-50 dark:bg-red-900/20" : active ? "text-stone-300" : "text-stone-400 hover:text-red-600"}`}
      >
        <ThumbsDown size={12} />
      </button>
    </div>
  );
}

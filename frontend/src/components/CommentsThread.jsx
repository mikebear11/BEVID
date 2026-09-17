import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Pin, PinOff, Trash2, Loader2, Send, Edit3, Check, X, MessageSquare } from "lucide-react";
import { toast } from "sonner";

/**
 * Fil de commentaires libres — Lot 7 étape 5.
 * Auteur seul peut modifier ; épinglage possible par tous. La mémoire client lit
 * les épinglés en tête.
 */
export default function CommentsThread({ establishmentId, onMemoryChange }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/establishments/${establishmentId}/comments`);
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [establishmentId]);

  useEffect(() => { if (establishmentId) load(); }, [establishmentId, load]);

  const post = async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    try {
      await api.post(`/establishments/${establishmentId}/comments`, { establishment_id: establishmentId, text });
      setDraft("");
      await load();
      onMemoryChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Envoi impossible");
    } finally { setPosting(false); }
  };

  const togglePin = async (c) => {
    try {
      await api.patch(`/comments/${c.id}`, { pinned: !c.pinned });
      await load();
      onMemoryChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Épinglage impossible");
    }
  };

  const del = async (c) => {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    try {
      await api.delete(`/comments/${c.id}`);
      await load();
      onMemoryChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Suppression impossible");
    }
  };

  const startEdit = (c) => { setEditingId(c.id); setEditText(c.text); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };
  const saveEdit = async (c) => {
    const t = editText.trim();
    if (!t) return;
    try {
      await api.patch(`/comments/${c.id}`, { text: t });
      cancelEdit();
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Édition impossible");
    }
  };

  return (
    <div data-testid="comments-thread">
      <p className="overline flex items-center gap-1 mb-2">
        <MessageSquare size={11} /> Commentaires
        {items.filter(c => c.pinned).length > 0 && (
          <span className="ml-1 text-xs text-stone-400">{items.filter(c => c.pinned).length} épinglé{items.filter(c => c.pinned).length > 1 ? "s" : ""}</span>
        )}
      </p>

      <form onSubmit={post} className="flex gap-2 mb-3">
        <textarea
          rows={2}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Une note qui ne rentre dans aucune case…"
          className="input-crm text-sm flex-1"
          data-testid="comment-draft"
        />
        <button
          type="submit"
          disabled={posting || !draft.trim()}
          className="btn-primary self-end text-sm px-3 py-2"
          data-testid="comment-post"
          aria-label="Publier"
        >
          {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </form>

      {loading ? (
        <div className="text-xs text-stone-500 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> Chargement…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-stone-500" data-testid="comments-empty">Aucun commentaire pour l'instant.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(c => {
            const mine = c.author_id === user?.id;
            const editing = editingId === c.id;
            return (
              <li key={c.id}
                data-testid={`comment-${c.id}`}
                className={`text-sm border rounded-lg p-2 ${c.pinned ? "border-amber-300 bg-amber-50 dark:bg-amber-900/10" : "border-stone-200 dark:border-stone-700"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-400">
                      {c.pinned && <Pin size={9} className="inline mr-1 -mt-0.5 text-amber-500" />}
                      {c.author_name} · {(c.created_at || "").slice(0, 10)}
                      {c.updated_at !== c.created_at && <span className="italic"> · modifié</span>}
                    </p>
                    {editing ? (
                      <div className="mt-1 space-y-1">
                        <textarea
                          rows={2}
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          className="input-crm text-sm w-full"
                          data-testid={`comment-edit-input-${c.id}`}
                        />
                        <div className="flex gap-2 text-xs">
                          <button onClick={() => saveEdit(c)} className="text-[#4A154B] font-medium" data-testid={`comment-save-${c.id}`}>
                            <Check size={11} className="inline mr-0.5" /> Enregistrer
                          </button>
                          <button onClick={cancelEdit} className="text-stone-500">
                            <X size={11} className="inline mr-0.5" /> Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-stone-700 dark:text-stone-200 whitespace-pre-wrap">{c.text}</p>
                    )}
                  </div>
                  {!editing && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => togglePin(c)}
                        className="text-stone-400 hover:text-amber-500"
                        aria-label={c.pinned ? "Désépingler" : "Épingler"}
                        data-testid={`comment-pin-${c.id}`}
                      >
                        {c.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                      </button>
                      {mine && (
                        <>
                          <button onClick={() => startEdit(c)} className="text-stone-400 hover:text-stone-700" aria-label="Modifier" data-testid={`comment-edit-${c.id}`}>
                            <Edit3 size={12} />
                          </button>
                          <button onClick={() => del(c)} className="text-stone-400 hover:text-red-600" aria-label="Supprimer" data-testid={`comment-delete-${c.id}`}>
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

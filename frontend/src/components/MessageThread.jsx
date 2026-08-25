import React, { useEffect, useRef, useState } from "react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Send, MessageSquare, AtSign, Loader2, Pencil, X, Check, Mic, Square, CloudOff } from "lucide-react";
import { enqueueMessage, listOutboxForObject } from "@/lib/db";
import { flushQueue } from "@/lib/syncQueue";
import ClientSnoozeButton from "@/components/ClientSnoozeButton";

/**
 * Fil de discussion rattaché à un objet.
 * Props : objectType ("establishment"|"order"|"document"|"tour"|"container")
 *         objectId    (id de l'objet)
 *         mentionsCatalog (liste { id, name } pour l'autocomplete @)
 *
 * Règles :
 *   - Chronologique plat, pas d'imbrication.
 *   - Édition auteur uniquement, 15 min max.
 *   - Aucune suppression du message d'un autre.
 *   - Mentions @Nom → engagements datés dans la boîte du destinataire.
 */
export default function MessageThread({ objectType, objectId, mentionsCatalog = [] }) {
  const [items, setItems] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorderBusy, setRecorderBusy] = useState(false);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordStartedRef = useRef(0);
  const inputRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recordChunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: "audio/webm" });
        if ((Date.now() - recordStartedRef.current) > 30000) {
          toast.error("Message vocal limité à 30 s");
          setRecording(false);
          return;
        }
        setRecorderBusy(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "voice.webm");
          fd.append("lang", "fr-FR");
          const res = await fetch(`${API}/voice/transcribe`, { method: "POST", credentials: "include", body: fd });
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          setText((prev) => (prev ? prev + " " : "") + (data.transcript || "(vocal non transcrit)"));
          toast.success("Vocal transcrit — éditez avant d'envoyer");
        } catch (e) {
          toast.error("Transcription impossible : " + String(e).slice(0, 80));
        } finally { setRecorderBusy(false); }
      };
      mr.start();
      recorderRef.current = mr;
      recordStartedRef.current = Date.now();
      setRecording(true);
      // Auto-stop à 30 s max
      setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 30000);
    } catch { toast.error("Micro indisponible ou refusé"); }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const loadOutbox = async () => {
    try { setOutbox(await listOutboxForObject(objectType, objectId || "")); } catch {}
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/messages?object_type=${objectType}&object_id=${encodeURIComponent(objectId)}`);
      setItems(data);
    } catch { /* silencieux : hors-ligne on affiche uniquement l'outbox */ }
    finally { setLoading(false); await loadOutbox(); }
  };
  useEffect(() => { if (objectId) load(); }, [objectType, objectId]);

  // Rechargement quand un message quitte la file d'envoi
  useEffect(() => {
    const onDelivered = () => { load(); };
    window.addEventListener("bevid:message-delivered", onDelivered);
    return () => window.removeEventListener("bevid:message-delivered", onDelivered);
  }, [objectType, objectId]);

  const parseMentions = (t) => {
    const found = [];
    for (const u of mentionsCatalog) {
      const alias = "@" + (u.name || "").split(" ")[0];
      if (t.includes(alias)) found.push(u.id);
    }
    return found;
  };

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const payload = {
      object_type: objectType, object_id: objectId,
      text: text.trim(), mentions: parseMentions(text),
      due_date: dueDate || undefined,
    };
    // Toujours enfiler d'abord dans l'outbox (horodatage à la rédaction). Le
    // flush envoie immédiatement si en ligne, sinon retente au retour réseau.
    try {
      await enqueueMessage(payload);
      setText(""); setDueDate("");
      await loadOutbox();
      toast.success(navigator.onLine ? "Message envoyé" : "Message en file — envoi au retour réseau");
      // Tentative de flush immédiate (non bloquante)
      flushQueue().catch(() => {});
    } catch (e) {
      toast.error("File locale indisponible");
    } finally { setBusy(false); }
  };

  const saveEdit = async (id) => {
    setBusy(true);
    try {
      await api.patch(`/messages/${id}`, { text: editText });
      setEditing(null); setEditText("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Édition impossible"); }
    finally { setBusy(false); }
  };

  return (
    <section className="card-crm p-4" data-testid={`message-thread-${objectType}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <MessageSquare size={16} className="text-[#4A154B]" aria-hidden="true" />
        <h2 className="font-display text-lg">Discussion</h2>
        <span className="text-xs text-stone-500 flex-1 min-w-[120px]">· visible par l'équipe qui a accès à cet objet</span>
        {objectType === "establishment" && objectId && (
          <ClientSnoozeButton establishmentId={objectId} establishmentName={null} />
        )}
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto pr-1" data-testid="message-list">
        {loading && <div className="text-center py-6"><Loader2 size={16} className="mx-auto animate-spin text-stone-400" /></div>}
        {!loading && items.length === 0 && <p className="text-center text-sm text-stone-500 py-6">Aucun message. Ouvrez le fil en écrivant une note ou en @mentionnant un collègue.</p>}
        {outbox.filter(o => o.status === "pending" || o.status === "failed").map(o => (
          <div key={"outbox-" + o.id} className="border-l-2 border-amber-300 pl-3 py-1 opacity-80" data-testid={`msg-outbox-${o.id}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-stone-800 dark:text-stone-200">Moi</span>
                <span className="text-[10px] text-stone-400">{(o.at || "").slice(0, 16).replace("T", " ")}</span>
                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                  <CloudOff size={9} aria-hidden="true" /> {o.status === "failed" ? "Retenté au prochain envoi" : "En attente d'envoi"}
                </span>
              </div>
            </div>
            <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap">{o.payload?.text}</p>
          </div>
        ))}
        {items.map(m => (
          <div key={m.id} className="border-l-2 border-stone-200 dark:border-stone-700 pl-3 py-1" data-testid={`msg-${m.id}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-stone-800 dark:text-stone-200">{m.author_name}</span>
                <span className="text-[10px] text-stone-400">{(m.created_at || "").slice(0, 16).replace("T", " ")}</span>
                {m.edited && <span className="text-[10px] text-stone-400 italic">modifié</span>}
                {m.due_date && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">⏱ {m.due_date}</span>}
              </div>
              {editing !== m.id && (
                <button onClick={() => { setEditing(m.id); setEditText(m.text); }} className="text-stone-400 hover:text-[#4A154B]" aria-label="Modifier" data-testid={`msg-edit-${m.id}`}>
                  <Pencil size={12} aria-hidden="true" />
                </button>
              )}
            </div>
            {editing === m.id ? (
              <div className="mt-1 flex gap-2 items-start">
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="input-crm text-sm flex-1" data-testid={`msg-edit-input-${m.id}`} />
                <button onClick={() => saveEdit(m.id)} disabled={busy} className="text-emerald-700 hover:text-emerald-900" aria-label="Enregistrer" data-testid={`msg-edit-save-${m.id}`}><Check size={14} aria-hidden="true" /></button>
                <button onClick={() => setEditing(null)} className="text-stone-400" aria-label="Annuler"><X size={14} aria-hidden="true" /></button>
              </div>
            ) : (
              <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap">{renderWithMentions(m.text, mentionsCatalog)}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-stone-200 dark:border-stone-700 pt-3">
        <div className="relative">
          <label htmlFor="msg-input" className="sr-only">Nouveau message</label>
          <textarea
            id="msg-input" ref={inputRef} value={text}
            onChange={(e) => { setText(e.target.value); setShowMentions(e.target.value.endsWith("@")); }}
            rows={2} placeholder="Écrire un message. @nom pour créer une action datée."
            className="input-crm text-sm" data-testid="msg-input"
          />
          {showMentions && mentionsCatalog.length > 0 && (
            <ul className="absolute z-10 bottom-full mb-1 left-0 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-md max-h-40 overflow-y-auto min-w-[200px]" role="listbox">
              {mentionsCatalog.map(u => (
                <li key={u.id}>
                  <button type="button" onClick={() => { setText(text + (u.name || "").split(" ")[0] + " "); setShowMentions(false); inputRef.current?.focus(); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[36px]" data-testid={`msg-mention-${u.id}`}>
                    <AtSign size={12} className="inline mr-1" aria-hidden="true" />{u.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <label className="text-xs text-stone-500 flex items-center gap-1">
            <span className="hidden sm:inline">Échéance :</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="input-crm min-h-[32px] text-xs py-1" data-testid="msg-due-date" aria-label="Échéance de la mention" />
          </label>
          <div className="flex items-center gap-2">
            {!recording ? (
              <button onClick={startRecording} disabled={recorderBusy} className="text-stone-600 hover:text-[#4A154B] min-h-[36px] min-w-[36px] flex items-center justify-center" aria-label="Enregistrer un vocal" data-testid="msg-voice-start">
                {recorderBusy ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} aria-hidden="true" />}
              </button>
            ) : (
              <button onClick={stopRecording} className="text-red-600 animate-pulse min-h-[36px] min-w-[36px] flex items-center justify-center" aria-label="Arrêter l'enregistrement" data-testid="msg-voice-stop">
                <Square size={16} aria-hidden="true" />
              </button>
            )}
            <button onClick={send} disabled={busy || !text.trim()} className="btn-primary flex items-center gap-1 min-h-[36px] text-sm px-4" data-testid="msg-send">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} aria-hidden="true" />}
              Envoyer
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function renderWithMentions(text, catalog) {
  if (!text) return "";
  const parts = text.split(/(@[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]+)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      const short = p.slice(1);
      const user = catalog.find(u => (u.name || "").toLowerCase().startsWith(short.toLowerCase()));
      if (user) return <span key={i} className="text-[#4A154B] font-medium">{p}</span>;
    }
    return <span key={i}>{p}</span>;
  });
}

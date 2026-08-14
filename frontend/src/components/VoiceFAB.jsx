import React, { useState } from "react";
import { Mic, X, Sparkles, Loader2 } from "lucide-react";
import { useVoice } from "@/hooks/useVoice";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function VoiceFAB() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState("ai");
  const { supported, listening, transcript, start, stop, reset, setTranscript } = useVoice("fr-FR");

  const ask = async () => {
    const text = (transcript || prompt).trim();
    if (!text) return;
    setLoading(true); setAnswer("");
    try {
      if (intent === "client") {
        const { data } = await api.post("/ai/parse-voice", { transcript: text, intent: "client" });
        if (data.parsed && data.parsed.name) {
          const { data: created } = await api.post("/clients", data.parsed);
          toast.success(`Client "${created.name}" créé`);
          setAnswer(`✓ Client créé:\n${JSON.stringify(data.parsed, null, 2)}`);
        } else {
          setAnswer("Impossible d'extraire un client. Essayez: 'Nouveau restaurant Le Central à Paris, contact Marc, 0612345678'");
        }
      } else {
        const { data } = await api.post("/ai/ask", { prompt: text });
        setAnswer(data.answer);
      }
    } catch (e) {
      toast.error("Erreur IA");
    } finally { setLoading(false); }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="voice-fab"
          className="fixed bottom-24 md:bottom-8 right-6 z-50 w-14 h-14 rounded-full bg-[#4A154B] text-white shadow-lg flex items-center justify-center pulse-ring"
          aria-label="Assistant vocal">
          <Sparkles size={22} strokeWidth={1.5} />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
          <div className="glass w-full md:max-w-lg m-0 md:m-4 rounded-t-2xl md:rounded-2xl border border-stone-200 p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="voice-panel">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[#4A154B]" />
                <h3 className="font-display text-lg">Assistant IA</h3>
              </div>
              <button onClick={() => setOpen(false)} data-testid="voice-close"><X size={20} /></button>
            </div>

            <div className="flex gap-2 mb-3">
              <button onClick={() => setIntent("ai")} data-testid="intent-ai" className={`text-xs px-3 py-1.5 rounded-full ${intent === "ai" ? "bg-[#4A154B] text-white" : "bg-stone-100"}`}>Analyse</button>
              <button onClick={() => setIntent("client")} data-testid="intent-client" className={`text-xs px-3 py-1.5 rounded-full ${intent === "client" ? "bg-[#4A154B] text-white" : "bg-stone-100"}`}>Nouveau client</button>
            </div>

            <textarea
              value={transcript || prompt}
              onChange={(e) => { setTranscript(""); setPrompt(e.target.value); }}
              placeholder={intent === "client" ? "Ex: Nouveau bar Le Central à Lyon, contact Sophie, 0612345678" : "Posez une question ou demandez une analyse…"}
              rows={4}
              data-testid="voice-textarea"
              className="input-crm resize-none mb-3"
            />

            <div className="flex items-center gap-2 mb-4">
              {supported ? (
                <button
                  onClick={listening ? stop : start}
                  data-testid="voice-mic-btn"
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors duration-200 ${listening ? "bg-[#8C2A2A] text-white" : "bg-[#4A154B] text-white"}`}>
                  {listening ? <span className="equalizer"><span/><span/><span/><span/><span/></span> : <Mic size={18} />}
                </button>
              ) : <span className="text-xs text-stone-500">Voix non supportée</span>}
              <button onClick={reset} className="text-xs text-stone-500 underline">Effacer</button>
              <button onClick={ask} disabled={loading} data-testid="voice-send" className="btn-primary ml-auto flex items-center gap-2">
                {loading && <Loader2 size={14} className="animate-spin" />}
                Envoyer
              </button>
            </div>

            {answer && (
              <div className="border-t border-stone-200 pt-4">
                <p className="overline mb-2">Réponse</p>
                <div className="text-sm whitespace-pre-wrap text-stone-800" data-testid="voice-answer">{answer}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

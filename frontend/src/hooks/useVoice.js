import { useEffect, useRef, useState } from "react";
import { enqueueVoiceRecording } from "@/lib/db";

/**
 * useVoice — dictée hybride, robuste terrain.
 * Trois modes détectés au montage :
 *   - "speech"      : Web Speech API (Chrome/Edge desktop + Android — rapide, en ligne)
 *   - "recorder"    : MediaRecorder (Safari, Firefox — enregistrement local, transcription différée)
 *   - "unavailable" : aucun des deux → l'UI doit demander la saisie manuelle
 *
 * En mode "recorder", stop() enregistre le blob dans Dexie ; syncQueue.flushQueue()
 * envoie ensuite le fichier à `/api/voice/transcribe` dès le retour du réseau.
 */
export function useVoice(lang = "fr-FR") {
  const [mode, setMode] = useState("unavailable");
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState(null);
  const recogRef = useRef(null);
  const finalTextRef = useRef("");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    const hasRecorder = typeof window !== "undefined"
      && !!window.MediaRecorder
      && !!navigator.mediaDevices?.getUserMedia;

    if (SR) {
      const r = new SR();
      r.lang = lang || "fr-FR";
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const text = res[0].transcript;
          if (res.isFinal) {
            finalTextRef.current = (finalTextRef.current + " " + text).replace(/\s+/g, " ").trim();
          } else {
            interim += text;
          }
        }
        setTranscript((finalTextRef.current + " " + interim).replace(/\s+/g, " ").trim());
      };
      r.onerror = (e) => {
        // Erreur visible — plus jamais un échec silencieux
        const reason = e?.error || "inconnue";
        if (reason === "no-speech") {
          setError("Aucun son détecté — approche le micro et réessaie.");
        } else if (reason === "not-allowed" || reason === "service-not-allowed") {
          setError("Micro refusé par le navigateur — autorise l'accès pour dicter.");
        } else if (reason === "network") {
          setError("Réseau indisponible pour la dictée en direct — passe en enregistrement local (repli MediaRecorder).");
        } else {
          setError(`Erreur de dictée : ${reason}`);
        }
        setListening(false);
      };
      r.onend = () => setListening(false);
      recogRef.current = r;
      setMode("speech");
      setSupported(true);
    } else if (hasRecorder) {
      setMode("recorder");
      setSupported(true);
    } else {
      setMode("unavailable");
      setSupported(false);
    }

    return () => {
      try { recogRef.current?.stop(); } catch {}
      try { recorderRef.current?.stop(); } catch {}
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    };
  }, [lang]);

  const startSpeech = () => {
    if (!recogRef.current) return;
    finalTextRef.current = "";
    setTranscript("");
    setError(null);
    try { recogRef.current.start(); setListening(true); }
    catch (e) { setError(`Impossible de démarrer : ${e.message || e}`); }
  };

  const startRecorder = async () => {
    setError(null);
    setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        try {
          await enqueueVoiceRecording({ blob, mime: blob.type, lang });
          setTranscript("[Enregistrement audio en attente de transcription — sera envoyé au retour du réseau]");
        } catch (e) {
          setError(`Impossible de sauvegarder l'enregistrement : ${e.message || e}`);
        }
      };
      rec.onerror = (e) => {
        setError(`Erreur d'enregistrement : ${e?.error?.name || "inconnue"}`);
        setListening(false);
      };
      rec.start();
      setListening(true);
    } catch (e) {
      setError(`Micro refusé ou indisponible : ${e.message || e}`);
    }
  };

  const start = () => {
    if (mode === "speech") return startSpeech();
    if (mode === "recorder") return startRecorder();
    setError("Dictée indisponible sur ce navigateur — saisissez votre compte rendu à la main.");
  };

  const stop = () => {
    if (mode === "speech") { try { recogRef.current?.stop(); } catch {} }
    else if (mode === "recorder") { try { recorderRef.current?.stop(); } catch {} }
    setListening(false);
  };

  const reset = () => { finalTextRef.current = ""; setTranscript(""); setError(null); };

  return { supported, listening, transcript, start, stop, reset, setTranscript, error, mode };
}

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of options) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

import { useEffect, useRef, useState } from "react";

export function useVoice(lang = "fr-FR") {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recogRef = useRef(null);
  const finalTextRef = useRef("");

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      // Parcours de TOUS les résultats depuis resultIndex, en séparant final/intérim.
      // On ne pousse dans finalTextRef que les résultats marqués final.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) {
          finalTextRef.current = (finalTextRef.current + " " + text).replace(/\s+/g, " ").trim();
        } else {
          interim += text;
        }
      }
      const combined = (finalTextRef.current + " " + interim).replace(/\s+/g, " ").trim();
      setTranscript(combined);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recogRef.current = r;
    return () => { try { r.stop(); } catch(e){} };
  }, [lang]);

  const start = () => {
    if (!recogRef.current) return;
    finalTextRef.current = "";
    setTranscript("");
    try { recogRef.current.start(); setListening(true); } catch(e) {}
  };
  const stop = () => {
    if (!recogRef.current) return;
    try { recogRef.current.stop(); } catch(e) {}
    setListening(false);
  };
  const reset = () => { finalTextRef.current = ""; setTranscript(""); };

  return { supported, listening, transcript, start, stop, reset, setTranscript };
}

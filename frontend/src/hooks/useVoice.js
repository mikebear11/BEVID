import { useEffect, useRef, useState } from "react";

export function useVoice(lang = "fr-FR") {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recogRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        final += e.results[i][0].transcript;
      }
      setTranscript(prev => prev + " " + final);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recogRef.current = r;
    return () => { try { r.stop(); } catch(e){} };
  }, [lang]);

  const start = () => {
    if (!recogRef.current) return;
    setTranscript("");
    try { recogRef.current.start(); setListening(true); } catch(e) {}
  };
  const stop = () => {
    if (!recogRef.current) return;
    try { recogRef.current.stop(); } catch(e) {}
    setListening(false);
  };
  const reset = () => setTranscript("");

  return { supported, listening, transcript, start, stop, reset, setTranscript };
}

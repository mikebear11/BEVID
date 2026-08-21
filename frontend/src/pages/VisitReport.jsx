import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, postOffline } from "@/lib/api";
import { useVoice } from "@/hooks/useVoice";
import { Mic, Check, Sparkles, Loader2, CloudOff, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import VoiceOrderReview from "@/components/VoiceOrderReview";
import ObjectionExtractPanel from "@/components/ObjectionExtractPanel";
import EngagementExtractPanel from "@/components/EngagementExtractPanel";

const MOODS = [
  { v: "excellent", label: "😄 Excellent", color: "#2D5A4C" },
  { v: "bon", label: "🙂 Bon", color: "#5C8A6A" },
  { v: "neutre", label: "😐 Neutre", color: "#8A8A8A" },
  { v: "difficile", label: "😟 Difficile", color: "#8C2A2A" },
];
const INTERESTS = [
  { v: "chaud", label: "🔥 Chaud" },
  { v: "tiede", label: "🌤 Tiède" },
  { v: "froid", label: "❄️ Froid" },
];
const ACTIONS = [
  { v: "commande", label: "🛒 Commande" },
  { v: "devis", label: "📄 Devis" },
  { v: "relance", label: "📞 Relance" },
  { v: "visite", label: "🚗 Revisite" },
  { v: "aucune", label: "— Aucune" },
];

export default function VisitReport() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    client_id: params.get("client_id") || "",
    mood: "bon", interest: "tiede", next_action: "relance",
    next_date: "", summary: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [orderReviewOpen, setOrderReviewOpen] = useState(false);
  const [objectionsOpen, setObjectionsOpen] = useState(false);
  const [engagementsOpen, setEngagementsOpen] = useState(false);
  const [createdVisitId, setCreatedVisitId] = useState(null);
  const { supported, listening, transcript, start, stop, reset, setTranscript } = useVoice("fr-FR");

  useEffect(() => {
    // Fix walkthrough iter21 — fusionne db.clients + db.establishments dans le dropdown
    // pour qu'un commercial en tournée puisse sélectionner un vrai établissement
    // (ADT 64, BEKAST…) et pas seulement d'anciens clients hérités.
    Promise.all([
      api.get("/clients").catch(() => ({ data: [] })),
      api.get("/establishments").catch(() => ({ data: [] })),
    ]).then(([rc, re]) => {
      const merged = new Map();
      for (const c of (rc.data || [])) merged.set(c.id, { id: c.id, name: c.name, city: c.city });
      for (const e of (re.data || [])) if (!merged.has(e.id)) merged.set(e.id, { id: e.id, name: e.name, city: e.city });
      setClients(Array.from(merged.values()));
    });
  }, []);

  const aiFill = async () => {
    const text = (transcript || form.summary).trim();
    if (!text) return;
    setAiLoading(true);
    try {
      const { data } = await api.post("/ai/ask", {
        prompt: `Depuis ce compte-rendu vocal terrain, extrait STRICTEMENT au format JSON: {"mood":"excellent|bon|neutre|difficile","interest":"chaud|tiede|froid","next_action":"commande|devis|relance|visite|aucune","summary":"résumé de 1-2 phrases"}. Retourne UNIQUEMENT le JSON, sans markdown.\n\nTEXTE: ${text}`,
      });
      const clean = data.answer.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setForm(f => ({ ...f, ...parsed, summary: parsed.summary || text }));
      toast.success(t("toast.formulaire_rempli_par_l_ia"));
    } catch (e) { toast.error(t("toast.extraction_ia_echouee_completez_a_l")); }
    finally { setAiLoading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_id) { toast.error(t("toast.selectionnez_un_client")); return; }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        voice_transcript: transcript,
        summary: form.summary || transcript,
        client_uuid: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`,
      };
      const res = await postOffline("/visits", payload);
      if (res.offline) {
        toast.success(t("toast.enregistre_hors_ligne_sera_synchron"), { icon: "📶" });
        nav(`/etab/${form.client_id}`);
      } else {
        toast.success(t("toast.compte_rendu_enregistre"));
        // Extraction d'objections (Lot 7 étape 1) si transcription vocale présente.
        // Ouvre le modal ; la navigation vers la fiche client suit sa fermeture.
        const vid = res?.data?.id;
        const rawText = ((transcript || form.summary) || "").trim();
        if (vid && rawText.length > 8) {
          setCreatedVisitId(vid);
          setObjectionsOpen(true);
          return;  // pas de nav ici — voir onClose du panel
        }
        nav(`/etab/${form.client_id}`);
      }
    } catch { toast.error(t("toast.erreur")); }
    finally { setSubmitting(false); }
  };

  const Chip = ({ active, onClick, children, testId }) => (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`px-3 py-2 rounded-full text-sm border transition-colors duration-200 min-h-[44px] ${active ? "bg-[#4A154B] text-white border-[#4A154B]" : "bg-white text-stone-700 border-stone-200 hover:border-[#4A154B]"}`}>
      {children}
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-testid="visit-page">
      <div>
        <p className="overline">Terrain · Compte-rendu</p>
        <h1 className="font-display text-4xl">Nouvelle visite</h1>
        <p className="text-sm text-stone-500 mt-1">Dictez ou tapez en 30 secondes.</p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="overline">Client *</label>
          <select required value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="input-crm mt-1" data-testid="visit-client">
            <option value="">— Choisir —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name} · {c.city}</option>)}
          </select>
        </div>

        <div className="card-crm p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="overline">Dictée vocale</label>
            {supported && (
              <button type="button" onClick={listening ? stop : start} data-testid="visit-mic"
                className={`w-11 h-11 rounded-full flex items-center justify-center ${listening ? "bg-[#8C2A2A] text-white" : "bg-[#4A154B] text-white"}`}>
                {listening ? <span className="equalizer"><span/><span/><span/><span/><span/></span> : <Mic size={18} />}
              </button>
            )}
          </div>
          <textarea rows={3} placeholder="Racontez la visite… ou remplissez juste les boutons ci-dessous" value={transcript || form.summary}
            onChange={e => { setTranscript(""); setForm({ ...form, summary: e.target.value }); }}
            className="input-crm" data-testid="visit-summary" />
          {(transcript || form.summary) && (
            <div className="flex flex-wrap gap-3 mt-2">
              <button type="button" onClick={aiFill} disabled={aiLoading} className="text-xs text-[#4A154B] font-medium flex items-center gap-1" data-testid="visit-ai-fill">
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Remplir le formulaire avec l'IA
              </button>
              {form.client_id && (transcript || form.summary).trim().length > 8 && (
                <button
                  type="button"
                  onClick={() => setOrderReviewOpen(true)}
                  className="text-xs text-[#4A154B] font-medium flex items-center gap-1"
                  data-testid="visit-order-from-voice"
                >
                  <ShoppingCart size={12} />
                  Interpréter en commande
                </button>
              )}
            </div>
          )}
        </div>

        <VoiceOrderReview
          open={orderReviewOpen}
          transcript={(transcript || form.summary).trim()}
          clientId={form.client_id}
          onClose={() => setOrderReviewOpen(false)}
          onCreated={(order) => {
            const oid = order?.id || order?.data?.id;
            if (oid) {
              toast.success("Commande enregistrée depuis la dictée");
            }
          }}
          onFallback={(txt, reason) => {
            // Retombe sur le compte rendu texte — jamais d'écran d'erreur.
            if (reason && reason !== "user_canceled") {
              toast.message("Interprétation impossible — conservez le texte tel quel");
            }
            setForm(f => ({ ...f, summary: txt || f.summary }));
          }}
        />

        <div>
          <label className="overline">Ambiance</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {MOODS.map(m => <Chip key={m.v} active={form.mood === m.v} onClick={() => setForm({ ...form, mood: m.v })} testId={`mood-${m.v}`}>{m.label}</Chip>)}
          </div>
        </div>

        <div>
          <label className="overline">Intérêt du client</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {INTERESTS.map(i => <Chip key={i.v} active={form.interest === i.v} onClick={() => setForm({ ...form, interest: i.v })} testId={`interest-${i.v}`}>{i.label}</Chip>)}
          </div>
        </div>

        <div>
          <label className="overline">Prochaine action</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {ACTIONS.map(a => <Chip key={a.v} active={form.next_action === a.v} onClick={() => setForm({ ...form, next_action: a.v })} testId={`action-${a.v}`}>{a.label}</Chip>)}
          </div>
        </div>

        <div>
          <label className="overline">Date prochaine action (optionnel)</label>
          <input type="date" value={form.next_date} onChange={e => setForm({ ...form, next_date: e.target.value })} className="input-crm mt-1" />
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base" data-testid="visit-submit">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} />}
          Enregistrer le compte-rendu
        </button>
      </form>

      <ObjectionExtractPanel
        open={objectionsOpen}
        visitId={createdVisitId}
        onClose={() => {
          setObjectionsOpen(false);
          // Enchaîne sur les engagements après les objections.
          setEngagementsOpen(true);
        }}
        onConfirmed={() => { /* toast déjà géré dans le panel */ }}
      />

      <EngagementExtractPanel
        open={engagementsOpen}
        visitId={createdVisitId}
        onClose={() => {
          setEngagementsOpen(false);
          // Fix walkthrough iter21 — nav vers /etab/{id} (fiche copilote complète)
          // plutôt que /clients/{id} (legacy sans blocs Lot 7).
          if (form.client_id) nav(`/etab/${form.client_id}`);
        }}
        onConfirmed={() => { /* toast déjà géré dans le panel */ }}
      />
    </div>
  );
}

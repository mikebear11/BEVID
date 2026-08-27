import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Zap, ClipboardList, Mail } from "lucide-react";

/**
 * TraceStrip — affiche les 5 dernières actions automatisées pour un client.
 * Visible sur la fiche établissement et dans le brief de visite.
 * Objectif : le commercial ne se fait jamais surprendre par un email
 * automatique envoyé en son nom.
 */
export default function AutomationTraceStrip({ clientId, limit = 5 }) {
  const [traces, setTraces] = useState(null);
  useEffect(() => {
    if (!clientId) return;
    api.get(`/automations/traces?client_id=${clientId}&limit=${limit}`)
      .then(r => setTraces(r.data || []))
      .catch(() => setTraces([]));
  }, [clientId, limit]);
  if (!traces || traces.length === 0) return null;
  return (
    <div className="card-crm p-4" data-testid="automation-trace-strip">
      <div className="flex items-center gap-2 mb-2">
        <Zap size={14} className="text-[#4A154B]" aria-hidden="true" />
        <p className="text-xs font-medium uppercase tracking-wider text-stone-600">Actions automatiques récentes</p>
      </div>
      <ul className="space-y-1.5">
        {traces.map(tr => (
          <li key={tr.id} className="text-xs text-stone-700 flex items-start gap-2" data-testid={`trace-${tr.id}`}>
            {tr.action === "email" ? <Mail size={12} className="mt-0.5 shrink-0 opacity-60" /> : <ClipboardList size={12} className="mt-0.5 shrink-0 opacity-60" />}
            <span className="flex-1">
              <span className="text-stone-500">{new Date(tr.at).toLocaleDateString("fr-FR")}</span>
              {" · "}
              <span className="font-medium">{tr.preset_key.replace(/_/g, " ")}</span>
              {tr.action === "email" && <span className="text-stone-500"> — email envoyé au nom du commercial</span>}
              {tr.action === "task" && <span className="text-stone-500"> — tâche créée</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

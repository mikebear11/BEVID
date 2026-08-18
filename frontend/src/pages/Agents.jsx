import React from "react";
import { api } from "@/lib/api";
import PuceEtat from "@/components/system/PuceEtat";
import { useEffect, useState } from "react";

export default function Agents() {
  const [agents, setAgents] = useState([]);
  useEffect(() => { api.get("/agents").then(r => setAgents(r.data)); }, []);
  return (
    <div className="space-y-6" data-testid="agents-page">
      <div><p className="overline">Équipe commerciale</p><h1 className="font-display text-4xl">Agents</h1></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(a => (
          <div key={a.id} className="card-crm p-5">
            <div className="w-12 h-12 rounded-full bg-[#4A154B] text-white flex items-center justify-center font-display text-xl mb-3">{a.name?.[0]?.toUpperCase()}</div>
            <h3 className="font-display text-xl">{a.name}</h3>
            <p className="text-xs text-stone-500">{a.email}</p>
            <div className="mt-2"><PuceEtat etat={a.role === "manager" ? "info" : "succes"} variante="douce" libelle={a.role} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

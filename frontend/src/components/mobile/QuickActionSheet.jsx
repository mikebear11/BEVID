import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, ShoppingCart, UserPlus, Mic, ArrowLeft } from "lucide-react";
import { Sheet } from "./Sheet";
import { ClientPicker } from "./ClientPicker";

const ACTIONS = [
  { key: "visite", label: "Note de visite", icon: ClipboardCheck, color: "#4A154B", to: (id) => `/etab/${id}/visite` },
  { key: "commande", label: "Commande", icon: ShoppingCart, color: "#2D5A4C", to: (id) => `/etab/${id}/commande` },
  { key: "prospect", label: "Nouveau prospect", icon: UserPlus, color: "#C78B3A", to: () => "/etab/new" },
  { key: "vocal", label: "Note vocale", icon: Mic, color: "#8C2A2A", to: (id) => `/etab/${id}/visite?voice=1` },
];

/** Bouton central « + » : action → client (proches/récents d'abord) → formulaire pré-rempli. */
export function QuickActionSheet({ open, onClose }) {
  const nav = useNavigate();
  const [action, setAction] = useState(null);
  const close = () => { setAction(null); onClose(); };
  const choose = (a) => {
    if (a.key === "prospect") { close(); nav(a.to()); return; }
    setAction(a);
  };
  const pick = (e) => { const to = action.to(e.id); close(); nav(to); };

  return (
    <Sheet open={open} onClose={close} title={action ? `${action.label} — pour qui ?` : "Action rapide"} testId="quick-sheet">
      {!action ? (
        <div className="grid grid-cols-2 gap-3" data-testid="quick-actions">
          {ACTIONS.map(({ key, label, icon: Icon, color }) => (
            <button key={key} type="button" onClick={() => choose(ACTIONS.find((x) => x.key === key))} data-testid={`quick-${key}`}
              className="min-h-[88px] rounded-2xl text-white font-medium text-base flex flex-col items-center justify-center gap-2 active:scale-[0.98]"
              style={{ background: color }}>
              <Icon size={28} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={() => setAction(null)} className="min-h-[48px] text-base text-stone-700 flex items-center gap-1" data-testid="quick-back">
            <ArrowLeft size={18} aria-hidden="true" /> Autre action
          </button>
          <ClientPicker onPick={pick} />
        </div>
      )}
    </Sheet>
  );
}

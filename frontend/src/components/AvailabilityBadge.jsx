import React, { useEffect, useMemo, useState } from "react";
import { computeAvailability, AVAILABILITY_STYLES } from "@/lib/availability";
import { Clock } from "lucide-react";

/**
 * Pastille de joignabilité (Lot 9 étape 4).
 *
 * Le composant re-calcule sa propre couleur au fil du temps (setInterval 60s)
 * — un manager qui laisse une fiche ouverte pendant 30 min voit la pastille
 * passer d'orange à vert au moment où le service se termine.
 */
export default function AvailabilityBadge({ contact, establishment, size = "sm" }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const av = useMemo(
    () => computeAvailability(contact, establishment),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contact, establishment, tick]
  );
  const style = AVAILABILITY_STYLES[av.level] || AVAILABILITY_STYLES.neutral;
  const dim = size === "xs"
    ? { padding: "1px 5px", fontSize: 9 }
    : { padding: "2px 7px", fontSize: 10 };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full font-medium tracking-wide"
      style={{ background: style.bg + "18", color: style.bg, ...dim }}
      title={av.hint}
      data-testid={`availability-${av.level}`}
    >
      <span
        className={av.level === "amber" || av.level === "red" ? "animate-pulse" : ""}
        style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: style.dot }}
        aria-hidden
      />
      <Clock size={9} className="opacity-70" />
      {av.label}
    </span>
  );
}

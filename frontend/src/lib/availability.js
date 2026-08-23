/**
 * Lot 9 étape 4 — Pastille de joignabilité dynamique.
 *
 * Calcule si un contact est joignable maintenant, à partir de :
 *   - son `creneau_joignabilite` (matin, apres_midi, avant_service,
 *     jamais_pendant_service, jour_fermeture, n_importe_quand),
 *   - l'heure courante,
 *   - le type d'établissement (bar / restaurant → coup de feu 11h30-15h
 *     et 18h30-23h — à ne PAS déranger),
 *   - le jour de la semaine (dimanche = souvent jour de fermeture CHR).
 *
 * Rendu volontairement conservateur : sur un doute, on affiche « à éviter »
 * plutôt que « joignable ». Griller la relation en appelant au mauvais
 * moment coûte plus cher qu'un appel retardé.
 */

const SERVICE_TYPES = new Set(["bar", "restaurant", "hotel"]);

// Créneaux de service CHR standards. Une fenêtre = [heure_debut, heure_fin]
// en heures locales décimales (11.5 = 11h30).
const SERVICE_WINDOWS = [
  [11.5, 15.0],  // service midi
  [18.5, 23.0],  // service soir
];

function _currentDecimalHour(now = new Date()) {
  return now.getHours() + now.getMinutes() / 60;
}

function _isInService(hour) {
  return SERVICE_WINDOWS.some(([a, b]) => hour >= a && hour < b);
}

function _isBeforeService(hour) {
  // « Avant service » = fenêtre 9h-11h30 (livreurs, préparation) puis 15h-18h30
  return (hour >= 9 && hour < 11.5) || (hour >= 15 && hour < 18.5);
}

/**
 * @param {object} contact — `creneau_joignabilite`, éventuellement plus.
 * @param {object} establishment — `type`, `jours_fermeture` optionnel.
 * @returns {object} { level: "green"|"amber"|"red"|"neutral", label: string, hint: string }
 */
export function computeAvailability(contact, establishment) {
  const now = new Date();
  const hour = _currentDecimalHour(now);
  const weekday = now.getDay(); // 0 = dimanche
  const slot = contact?.creneau_joignabilite || "";
  const type = establishment?.type || "";
  const isCHR = SERVICE_TYPES.has(type);
  const inService = isCHR && _isInService(hour);
  const beforeService = isCHR && _isBeforeService(hour);

  // Jour de fermeture explicite (établissement)
  const closedDays = establishment?.jours_fermeture || [];
  if (Array.isArray(closedDays) && closedDays.includes(weekday)) {
    return { level: "neutral", label: "jour de fermeture", hint: "L'établissement est fermé aujourd'hui" };
  }

  // Créneau explicite du contact — priorité absolue.
  if (slot === "jamais_pendant_service" && inService) {
    return { level: "red", label: "à éviter — en service", hint: "Le contact demande à ne pas être dérangé pendant le service" };
  }
  if (slot === "matin" && hour >= 6 && hour < 12) {
    return { level: "green", label: "joignable maintenant", hint: "Créneau matin" };
  }
  if (slot === "apres_midi" && hour >= 14 && hour < 19) {
    return { level: "green", label: "joignable maintenant", hint: "Créneau après-midi" };
  }
  if (slot === "avant_service" && beforeService) {
    return { level: "green", label: "joignable maintenant", hint: "Créneau avant service" };
  }
  if (slot === "jour_fermeture") {
    // On ne connaît pas ses jours de fermeture perso → neutre
    return { level: "neutral", label: "à contacter en jour de fermeture", hint: "Créneau réservé au(x) jour(s) de fermeture" };
  }
  if (slot === "n_importe_quand") {
    return { level: "green", label: "joignable", hint: "Contact disponible à tout moment" };
  }

  // Fallback : logique CHR pure sans créneau explicite
  if (inService) {
    return { level: "amber", label: "à éviter — en service", hint: `Coup de feu CHR (${_serviceLabel(hour)})` };
  }
  if (isCHR && (hour < 8 || hour >= 23.5)) {
    return { level: "amber", label: "trop tôt / trop tard", hint: "Hors des horaires professionnels CHR" };
  }
  return { level: "green", label: "joignable maintenant", hint: "" };
}

function _serviceLabel(hour) {
  if (hour >= 11.5 && hour < 15) return "service midi 11h30-15h";
  if (hour >= 18.5 && hour < 23) return "service soir 18h30-23h";
  return "en service";
}

// Couleurs de la pastille (design system cohérent avec les états PuceEtat).
export const AVAILABILITY_STYLES = {
  green:   { bg: "#2D5A4C", fg: "#fff", dot: "#2D5A4C" },
  amber:   { bg: "#C78B3A", fg: "#fff", dot: "#C78B3A" },
  red:     { bg: "#8C2A2A", fg: "#fff", dot: "#8C2A2A" },
  neutral: { bg: "#78716C", fg: "#fff", dot: "#78716C" },
};

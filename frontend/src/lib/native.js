/**
 * Pont natif (Capacitor) — N2/N3. Sur le web, ces fonctions sont des no-op.
 * Règles : géolocalisation au PREMIER PLAN uniquement ; jetons dans le Trousseau iOS / Keystore Android (jamais Preferences).
 */
import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // "web" | "ios" | "android"

const ACCESS_KEY = "bevid.access";
const REFRESH_KEY = "bevid.refresh";
const BIO_FLAG = "bevid_biometric_lock";

async function secure() {
  const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
  return SecureStorage;
}

/** Écriture des jetons : Keychain (iOS, kSecAttrAccessibleWhenUnlockedThisDeviceOnly) / Keystore chiffré (Android). */
export async function saveTokens({ token, refresh_token }) {
  if (!isNative()) return;
  const s = await secure();
  if (token) await s.set(ACCESS_KEY, token, true);
  if (refresh_token) await s.set(REFRESH_KEY, refresh_token, true);
}
export async function loadTokens() {
  if (!isNative()) return { token: null, refresh_token: null };
  const s = await secure();
  return { token: await s.get(ACCESS_KEY), refresh_token: await s.get(REFRESH_KEY) };
}
export async function clearTokens() {
  if (!isNative()) return;
  const s = await secure();
  await s.remove(ACCESS_KEY); await s.remove(REFRESH_KEY);
}

/** Verrou biométrique optionnel (Face ID / Touch ID / empreinte). Le flag n'est pas un secret : Preferences suffit. */
export async function biometricLockEnabled() {
  if (!isNative()) return false;
  const { Preferences } = await import("@capacitor/preferences");
  return (await Preferences.get({ key: BIO_FLAG })).value === "1";
}
export async function setBiometricLock(on) {
  const { Preferences } = await import("@capacitor/preferences");
  if (on) await Preferences.set({ key: BIO_FLAG, value: "1" }); else await Preferences.remove({ key: BIO_FLAG });
}
export async function biometricUnlock() {
  const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
  const info = await BiometricAuth.checkBiometry();
  if (!info.isAvailable) return true; // pas de capteur : on n'enferme pas l'utilisateur
  await BiometricAuth.authenticate({ reason: "Déverrouiller BEVID", cancelTitle: "Annuler", allowDeviceCredential: true });
  return true;
}

/** Position au premier plan, une seule lecture, permission « pendant l'utilisation » uniquement. */
export async function nativePosition({ timeout = 8000, maxAgeMs = 120000 } = {}) {
  const { Geolocation } = await import("@capacitor/geolocation");
  const perm = await Geolocation.checkPermissions();
  if (perm.location !== "granted") {
    const req = await Geolocation.requestPermissions({ permissions: ["location"] });
    if (req.location !== "granted") throw new Error("geo-denied");
  }
  const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout, maximumAge: maxAgeMs });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}

export async function openExternal(url) {
  if (!isNative()) { window.open(url, "_blank", "noopener"); return; }
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url });
}

export async function initNative() {
  if (!isNative()) return;
  try { const { restoreFromSQLite } = await import("@/lib/nativeStore"); await restoreFromSQLite(); } catch { /* Dexie seul */ }
  try { const { StatusBar, Style } = await import("@capacitor/status-bar"); await StatusBar.setStyle({ style: Style.Light }); } catch { /* config */ }
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", ({ canGoBack }) => { if (canGoBack) window.history.back(); else App.exitApp(); });
  } catch { /* plugin absent */ }
  try {
    const { Network } = await import("@capacitor/network");
    Network.addListener("networkStatusChange", (s) => window.dispatchEvent(new Event(s.connected ? "online" : "offline")));
  } catch { /* plugin absent */ }
  try { const { SplashScreen } = await import("@capacitor/splash-screen"); await SplashScreen.hide(); } catch { /* plugin absent */ }
  document.documentElement.classList.add("native", `native-${platform()}`);
}

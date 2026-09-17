/**
 * N4 — Capacités natives derrière l'interface commune. Sur le web : repli sur l'existant (no-op ou API web).
 * Tout échoue proprement et silencieusement (aucune dépendance à un compte externe).
 */
import { api } from "@/lib/api";
import { isNative, platform } from "@/lib/native";

/** Dictée FR native (plugin), repli : null → le composant garde la Web Speech API / transcription serveur. */
export async function nativeSpeechStart(onResult) {
  if (!isNative()) return null;
  try {
    const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
    const { available } = await SpeechRecognition.available();
    if (!available) return null;
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") return null;
    const sub = await SpeechRecognition.addListener("partialResults", (d) => onResult((d.matches || [])[0] || ""));
    await SpeechRecognition.start({ language: "fr-FR", partialResults: true, popup: false });
    return async () => { try { await SpeechRecognition.stop(); } finally { sub.remove(); } };
  } catch { return null; }
}

/** Photo native compressée (JPEG, 640 px max) → data URL ; repli : null → <input capture>. */
export async function nativePhoto() {
  if (!isNative()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const p = await Camera.getPhoto({ quality: 60, width: 640, resultType: CameraResultType.DataUrl, source: CameraSource.Camera, correctOrientation: true });
    return p.dataUrl || null;
  } catch { return null; }
}

/** Scan QR / code-barres natif avec lampe ; repli : null → scanner web (html5-qrcode). */
export async function nativeScan() {
  if (!isNative()) return null;
  try {
    const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== "granted" && camera !== "limited") return null;
    try { await BarcodeScanner.enableTorch(); } catch { /* lampe optionnelle */ }
    const { barcodes } = await BarcodeScanner.scan();
    try { await BarcodeScanner.disableTorch(); } catch { /* idem */ }
    return barcodes?.[0]?.rawValue || null;
  } catch { return null; }
}

/** Partage d'un PDF (bon de commande, facture, BL) via la feuille native ; repli : ouverture du blob. */
export async function sharePdf(blob, filename, title = "Document BEVID") {
  if (!isNative()) {
    const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(url), 60000); return;
  }
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
  const f = await Filesystem.writeFile({ path: filename, data: b64, directory: Directory.Cache });
  await Share.share({ title, files: [f.uri] });
}

/** Retour haptique léger (enregistrement visite / commande). */
export async function haptic(kind = "success") {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType, ImpactStyle } = await import("@capacitor/haptics");
    if (kind === "light") await Haptics.impact({ style: ImpactStyle.Light });
    else await Haptics.notification({ type: kind === "error" ? NotificationType.Error : NotificationType.Success });
  } catch { /* pas de moteur haptique */ }
}

/**
 * Push : demande la permission au bon moment (après la 1re visite enregistrée, pas au démarrage),
 * enregistre le jeton côté serveur, route au toucher. Sans google-services.json / clé APNs : échec silencieux.
 */
export async function setupPush(navigate) {
  if (!isNative()) return false;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let { receive } = await PushNotifications.checkPermissions();
    if (receive === "prompt") ({ receive } = await PushNotifications.requestPermissions());
    if (receive !== "granted") return false;
    PushNotifications.addListener("registration", (t) => api.post("/me/devices", { token: t.value, platform: platform() }).catch(() => {}));
    PushNotifications.addListener("registrationError", () => { /* Firebase/APNs non configurés : silencieux */ });
    PushNotifications.addListener("pushNotificationActionPerformed", (a) => { const to = a.notification?.data?.route; if (to && navigate) navigate(to); });
    await PushNotifications.register();
    return true;
  } catch { return false; }
}

/** Liens profonds (App Links / Universal Links) → routage interne. */
export async function setupDeepLinks(navigate) {
  if (!isNative()) return;
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appUrlOpen", ({ url }) => {
      try { const u = new URL(url); navigate(u.pathname + u.search); } catch { /* URL invalide */ }
    });
  } catch { /* plugin absent */ }
}

/** N6 — mise à jour obligatoire / suggérée (compare la version embarquée à /app/version). */
export async function checkMinVersion(currentVersion) {
  try {
    const { data } = await api.get("/app/version");
    const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
    return { required: cmp(currentVersion, data.min_version) < 0, suggested: cmp(currentVersion, data.latest_version) < 0, ...data };
  } catch { return { required: false, suggested: false }; }
}

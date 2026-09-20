import { api } from "./api";

export type PushState = "unsupported" | "denied" | "prompt" | "subscribed" | "insecure";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (err) {
    console.warn("Registrazione service worker fallita", err);
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub && Notification.permission === "granted") return "subscribed";
  return "prompt";
}

export async function subscribeToPush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!window.isSecureContext) return "insecure";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "prompt";

  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;

  const { publicKey } = await api<{ publicKey: string }>("/api/push/vapid-public-key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
  return "subscribed";
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await api("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) }).catch(() => undefined);
}

/** Mostra una notifica locale (usata come fallback quando l'app è aperta). */
export async function showLocalNotification(title: string, body: string, url = "/") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        data: { url },
      });
      return;
    }
    new Notification(title, { body, icon: "/icons/icon-192.png" });
  } catch {
    /* ignore */
  }
}

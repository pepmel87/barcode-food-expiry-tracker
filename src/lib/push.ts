import { db } from "@/db";
import { appSettings, pushSubscriptions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";

interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cachedKeys: VapidKeys | null = null;

/**
 * Restituisce le chiavi VAPID: da env se presenti, altrimenti le genera una
 * sola volta e le salva in app_settings così restano stabili tra i riavvii.
 */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;

  const subject = process.env.VAPID_SUBJECT || "mailto:admin@scadenze.local";

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cachedKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject,
    };
    return cachedKeys;
  }

  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, ["vapid_public_key", "vapid_private_key"]));
  const pub = rows.find((r) => r.key === "vapid_public_key")?.value;
  const priv = rows.find((r) => r.key === "vapid_private_key")?.value;

  if (pub && priv) {
    cachedKeys = { publicKey: pub, privateKey: priv, subject };
    return cachedKeys;
  }

  const generated = webpush.generateVAPIDKeys();
  await db
    .insert(appSettings)
    .values([
      { key: "vapid_public_key", value: generated.publicKey },
      { key: "vapid_private_key", value: generated.privateKey },
    ])
    .onConflictDoNothing();

  // Rileggi per gestire eventuali inserimenti concorrenti
  const again = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, ["vapid_public_key", "vapid_private_key"]));
  cachedKeys = {
    publicKey: again.find((r) => r.key === "vapid_public_key")?.value ?? generated.publicKey,
    privateKey: again.find((r) => r.key === "vapid_private_key")?.value ?? generated.privateKey,
    subject,
  };
  return cachedKeys;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  batchId?: number;
  type?: string;
}

/**
 * Invia una notifica push a tutti i dispositivi registrati.
 * Rimuove automaticamente le sottoscrizioni scadute (404/410).
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number; removed: number }> {
  const subs = await db.select().from(pushSubscriptions);
  if (!subs.length) return { sent: 0, failed: 0, removed: 0 };

  const keys = await getVapidKeys();
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  let sent = 0;
  let failed = 0;
  let removed = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          removed += 1;
        } else {
          failed += 1;
        }
      }
    }),
  );

  return { sent, failed, removed };
}

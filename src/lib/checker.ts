import { db } from "@/db";
import { batches, notifications, products } from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { formatDateIT, todayISO, daysUntil } from "./dates";
import type { StorageType } from "./expiry";
import { sendPushToAll } from "./push";

export interface CheckResult {
  ranAt: string;
  today: string;
  checked: number;
  created: number;
  push: { sent: number; failed: number; removed: number };
}

interface CreatedNotification {
  id: number;
  title: string;
  body: string;
  type: "alert" | "expired";
  batchId: number;
}

let running: Promise<CheckResult> | null = null;

/** Esegue il controllo (serializzato: una sola esecuzione alla volta nel processo). */
export function runExpiryCheck(): Promise<CheckResult> {
  if (running) return running;
  running = doRun().finally(() => {
    running = null;
  });
  return running;
}

function alertTitle(name: string, storageType: StorageType, manyPieces: boolean, daysLeft: number): { title: string; body: string } {
  const when = daysLeft === 0 ? "oggi" : daysLeft === 1 ? "domani" : `tra ${daysLeft} giorni`;
  if (storageType === "long_life") {
    return {
      title: `Metti in offerta: ${name}`,
      body: `Lunga conservazione, scade ${when}. Preavviso di 15 giorni per metterlo in offerta.`,
    };
  }
  if (manyPieces) {
    return {
      title: `Metti in offerta: ${name}`,
      body: `Molti pezzi con la stessa scadenza, scadono ${when}. Preavviso di 7 giorni per metterli in offerta.`,
    };
  }
  return {
    title: `In scadenza: ${name}`,
    body: `Prodotto fresco, scade ${when}. Preavviso di 3 giorni.`,
  };
}

async function doRun(): Promise<CheckResult> {
  const today = todayISO();
  const rows = await db
    .select({
      id: batches.id,
      expiryDate: batches.expiryDate,
      alertDays: batches.alertDays,
      manyPieces: batches.manyPieces,
      storageType: batches.storageType,
      quantity: batches.quantity,
      alertSentAt: batches.alertSentAt,
      expiredSentAt: batches.expiredSentAt,
      productName: products.name,
      productBrand: products.brand,
    })
    .from(batches)
    .innerJoin(products, eq(products.id, batches.productId))
    .where(inArray(batches.status, ["active", "on_sale"]));

  const created: CreatedNotification[] = [];
  const now = new Date();

  for (const row of rows) {
    const daysLeft = daysUntil(row.expiryDate, today);
    const displayName = row.productBrand ? `${row.productName} (${row.productBrand})` : row.productName;
    const expiryLabel = formatDateIT(row.expiryDate);

    // 1) Prodotto scaduto
    if (daysLeft < 0 && !row.expiredSentAt) {
      const claimed = await db
        .update(batches)
        .set({ expiredSentAt: now, alertSentAt: row.alertSentAt ?? now, updatedAt: now })
        .where(and(eq(batches.id, row.id), isNull(batches.expiredSentAt)))
        .returning({ id: batches.id });
      if (claimed.length) {
        const title = `Scaduto: ${displayName}`;
        const body = `Scaduto il ${expiryLabel} (${row.quantity} pz). Rimuovilo dalla vendita.`;
        const [n] = await db
          .insert(notifications)
          .values({ batchId: row.id, type: "expired", title, body })
          .returning({ id: notifications.id });
        created.push({ id: n.id, title, body, type: "expired", batchId: row.id });
      }
      continue;
    }

    // 2) Soglia di preavviso raggiunta (3 / 7 / 15 giorni)
    if (daysLeft >= 0 && daysLeft <= row.alertDays && !row.alertSentAt) {
      const claimed = await db
        .update(batches)
        .set({ alertSentAt: now, updatedAt: now })
        .where(and(eq(batches.id, row.id), isNull(batches.alertSentAt)))
        .returning({ id: batches.id });
      if (claimed.length) {
        const storageType: StorageType = row.storageType === "long_life" ? "long_life" : "fresh";
        const { title, body: ruleBody } = alertTitle(displayName, storageType, row.manyPieces, daysLeft);
        const body = `${ruleBody} Scadenza: ${expiryLabel}, ${row.quantity} pz.`;
        const [n] = await db
          .insert(notifications)
          .values({ batchId: row.id, type: "alert", title, body })
          .returning({ id: notifications.id });
        created.push({ id: n.id, title, body, type: "alert", batchId: row.id });
      }
    }
  }

  // 3) Invio push (singola o riepilogativa)
  let push = { sent: 0, failed: 0, removed: 0 };
  if (created.length === 1) {
    const n = created[0];
    push = await sendPushToAll({
      title: n.title,
      body: n.body,
      url: "/",
      tag: `batch-${n.batchId}`,
      batchId: n.batchId,
      type: n.type,
    });
  } else if (created.length > 1) {
    const expired = created.filter((c) => c.type === "expired").length;
    const alerts = created.length - expired;
    const parts: string[] = [];
    if (alerts) parts.push(`${alerts} da mettere in offerta / in scadenza`);
    if (expired) parts.push(`${expired} scadut${expired === 1 ? "o" : "i"}`);
    const names = created
      .slice(0, 3)
      .map((c) => c.title.replace(/^[^:]+:\s*/, ""))
      .join(", ");
    push = await sendPushToAll({
      title: `${created.length} avvisi di scadenza`,
      body: `${parts.join(", ")}. ${names}${created.length > 3 ? "…" : ""}`,
      url: "/",
      tag: "expiry-summary",
      type: "summary",
    });
  }

  // Aggiorna timestamp ultimo controllo (best effort)
  try {
    await db.execute(sql`
      insert into app_settings (key, value, updated_at)
      values ('last_check_at', ${now.toISOString()}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `);
  } catch {
    /* ignore */
  }

  return { ranAt: now.toISOString(), today, checked: rows.length, created: created.length, push };
}

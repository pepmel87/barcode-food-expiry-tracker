import { db } from "@/db";
import { batches, notifications, products } from "@/db/schema";
import type { BatchStatus } from "@/lib/expiry";
import type { NotificationDTO } from "@/lib/types";
import { desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 100));
  const rows = await db
    .select({
      n: notifications,
      batchId: batches.id,
      expiryDate: batches.expiryDate,
      status: batches.status,
      productName: products.name,
      imageUrl: products.imageUrl,
    })
    .from(notifications)
    .leftJoin(batches, eq(batches.id, notifications.batchId))
    .leftJoin(products, eq(products.id, batches.productId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*) filter (where ${notifications.read} = false)::int` })
    .from(notifications);

  const items: NotificationDTO[] = rows.map((r) => ({
    id: r.n.id,
    batchId: r.n.batchId,
    type: r.n.type as NotificationDTO["type"],
    title: r.n.title,
    body: r.n.body,
    read: r.n.read,
    createdAt: r.n.createdAt.toISOString(),
    batch: r.batchId
      ? {
          id: r.batchId,
          expiryDate: r.expiryDate!,
          status: (r.status ?? "active") as BatchStatus,
          productName: r.productName ?? "",
          imageUrl: r.imageUrl ?? null,
        }
      : null,
  }));

  return NextResponse.json({ items, unread });
}

/** Segna tutte le notifiche come lette. */
export async function PATCH() {
  await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
  return NextResponse.json({ ok: true });
}

/** Elimina tutte le notifiche già lette. */
export async function DELETE() {
  await db.delete(notifications).where(eq(notifications.read, true));
  return NextResponse.json({ ok: true });
}

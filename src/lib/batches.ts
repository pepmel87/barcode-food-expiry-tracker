import { db } from "@/db";
import { batches, products, type Batch, type Product } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { todayISO } from "./dates";
import { alertDate, urgencyFor, type BatchStatus, type StorageType } from "./expiry";
import type { BatchDTO, ProductDTO } from "./types";

export function toProductDTO(p: Product): ProductDTO {
  return {
    id: p.id,
    ean: p.ean,
    name: p.name,
    brand: p.brand,
    description: p.description,
    imageUrl: p.imageUrl,
    category: p.category,
    quantity: p.quantity,
    storageType: (p.storageType === "long_life" ? "long_life" : "fresh") as StorageType,
    source: p.source,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toBatchDTO(b: Batch, p: Product, today: string = todayISO()): BatchDTO {
  const { level, daysLeft } = urgencyFor(b.expiryDate, b.alertDays, today);
  return {
    id: b.id,
    productId: b.productId,
    expiryDate: b.expiryDate,
    quantity: b.quantity,
    manyPieces: b.manyPieces,
    storageType: (b.storageType === "long_life" ? "long_life" : "fresh") as StorageType,
    alertDays: b.alertDays,
    notes: b.notes,
    status: b.status as BatchStatus,
    alertSentAt: b.alertSentAt ? b.alertSentAt.toISOString() : null,
    expiredSentAt: b.expiredSentAt ? b.expiredSentAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    product: toProductDTO(p),
    daysLeft,
    urgency: level,
    alertDate: alertDate(b.expiryDate, b.alertDays),
  };
}

const URGENCY_ORDER = { expired: 0, today: 1, alert: 2, soon: 3, ok: 4 } as const;

export async function listBatches(opts: { statuses?: BatchStatus[]; productId?: number } = {}): Promise<BatchDTO[]> {
  const statuses = opts.statuses ?? ["active", "on_sale"];
  const today = todayISO();

  const conditions = [inArray(batches.status, statuses)];
  if (opts.productId) conditions.push(eq(batches.productId, opts.productId));

  const rows = await db
    .select({ batch: batches, product: products })
    .from(batches)
    .innerJoin(products, eq(products.id, batches.productId))
    .where(and(...conditions))
    .orderBy(batches.expiryDate, desc(batches.createdAt));

  return rows
    .map((r) => toBatchDTO(r.batch, r.product, today))
    .sort((a, b) => {
      const ua = URGENCY_ORDER[a.urgency];
      const ub = URGENCY_ORDER[b.urgency];
      if (ua !== ub) return ua - ub;
      if (a.expiryDate !== b.expiryDate) return a.expiryDate < b.expiryDate ? -1 : 1;
      return b.id - a.id;
    });
}

export async function getBatchDTO(id: number): Promise<BatchDTO | null> {
  const rows = await db
    .select({ batch: batches, product: products })
    .from(batches)
    .innerJoin(products, eq(products.id, batches.productId))
    .where(eq(batches.id, id))
    .limit(1);
  if (!rows.length) return null;
  return toBatchDTO(rows[0].batch, rows[0].product);
}

import { db } from "@/db";
import { batches } from "@/db/schema";
import { getBatchDTO } from "@/lib/batches";
import { runExpiryCheck } from "@/lib/checker";
import { daysUntil, isValidISODate } from "@/lib/dates";
import { computeAlertDays, isBatchStatus, isStorageType, type StorageType } from "@/lib/expiry";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id non valido" }, { status: 400 });
  const dto = await getBatchDTO(id);
  if (!dto) return NextResponse.json({ error: "Lotto non trovato" }, { status: 404 });
  return NextResponse.json(dto);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id non valido" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const existing = await db.select().from(batches).where(eq(batches.id, id)).limit(1);
  if (!existing.length) return NextResponse.json({ error: "Lotto non trovato" }, { status: 404 });
  const current = existing[0];

  const set: Partial<typeof batches.$inferInsert> = { updatedAt: new Date() };

  if (isBatchStatus(body.status)) set.status = body.status;
  if ("quantity" in body) set.quantity = Math.max(1, Math.min(100000, Number(body.quantity) || 1));
  if ("notes" in body) set.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  // Ricalcolo delle regole di preavviso se cambiano scadenza / tipo / spunta
  const expiryDate = isValidISODate(body.expiryDate) ? body.expiryDate : current.expiryDate;
  const storageType: StorageType = isStorageType(body.storageType)
    ? body.storageType
    : current.storageType === "long_life"
      ? "long_life"
      : "fresh";
  const manyPieces = storageType === "fresh" ? ("manyPieces" in body ? Boolean(body.manyPieces) : current.manyPieces) : false;
  const alertDays = computeAlertDays(storageType, manyPieces);

  const rulesChanged =
    expiryDate !== current.expiryDate ||
    storageType !== current.storageType ||
    manyPieces !== current.manyPieces ||
    alertDays !== current.alertDays;

  if (rulesChanged) {
    set.expiryDate = expiryDate;
    set.storageType = storageType;
    set.manyPieces = manyPieces;
    set.alertDays = alertDays;
    // Se la nuova soglia non è ancora raggiunta, riabilita l'avviso futuro
    const days = daysUntil(expiryDate);
    if (days > alertDays) set.alertSentAt = null;
    if (days >= 0) set.expiredSentAt = null;
  }

  await db.update(batches).set(set).where(eq(batches.id, id));

  if (rulesChanged && daysUntil(expiryDate) <= alertDays && set.status !== "sold" && set.status !== "discarded") {
    try {
      await runExpiryCheck();
    } catch (err) {
      console.error("[scadenze] controllo dopo modifica fallito", err);
    }
  }

  const dto = await getBatchDTO(id);
  return NextResponse.json(dto);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id non valido" }, { status: 400 });
  await db.delete(batches).where(eq(batches.id, id));
  return NextResponse.json({ ok: true });
}

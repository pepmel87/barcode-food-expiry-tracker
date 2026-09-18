import { db } from "@/db";
import { batches, products } from "@/db/schema";
import { getBatchDTO, listBatches } from "@/lib/batches";
import { runExpiryCheck } from "@/lib/checker";
import { daysUntil, isValidISODate } from "@/lib/dates";
import { computeAlertDays, isBatchStatus, isStorageType, type BatchStatus } from "@/lib/expiry";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const statusParam = req.nextUrl.searchParams.get("status");
  let statuses: BatchStatus[] | undefined;
  if (statusParam === "all") statuses = ["active", "on_sale", "sold", "discarded"];
  else if (statusParam === "archived") statuses = ["sold", "discarded"];
  else if (statusParam && statusParam.split(",").every(isBatchStatus)) statuses = statusParam.split(",") as BatchStatus[];

  const productId = Number(req.nextUrl.searchParams.get("productId"));
  const list = await listBatches({
    statuses,
    productId: Number.isInteger(productId) && productId > 0 ? productId : undefined,
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const productId = Number(body.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "productId mancante" }, { status: 400 });
  }
  if (!isValidISODate(body.expiryDate)) {
    return NextResponse.json({ error: "Data di scadenza non valida (formato AAAA-MM-GG)" }, { status: 400 });
  }
  const quantity = Math.max(1, Math.min(100000, Number(body.quantity) || 1));
  const manyPieces = Boolean(body.manyPieces);

  const productRows = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!productRows.length) return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
  const product = productRows[0];

  const storageType = isStorageType(body.storageType)
    ? body.storageType
    : product.storageType === "long_life"
      ? "long_life"
      : "fresh";

  // Per i prodotti a lunga conservazione la spunta "molti pezzi" non cambia il preavviso (15 gg)
  const effectiveManyPieces = storageType === "fresh" ? manyPieces : false;
  const alertDays = computeAlertDays(storageType, effectiveManyPieces);
  const now = new Date();

  // Se l'utente ha cambiato il tipo di conservazione, ricordalo sul prodotto
  if (product.storageType !== storageType) {
    await db.update(products).set({ storageType, updatedAt: now }).where(eq(products.id, productId));
  }

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const [created] = await db
    .insert(batches)
    .values({
      productId,
      expiryDate: body.expiryDate,
      quantity,
      manyPieces: effectiveManyPieces,
      storageType,
      alertDays,
      notes,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Se la soglia è già raggiunta (o già scaduto) avvisa subito
  let immediateCheck = null;
  if (daysUntil(created.expiryDate) <= alertDays) {
    try {
      immediateCheck = await runExpiryCheck();
    } catch (err) {
      console.error("[scadenze] controllo immediato fallito", err);
    }
  }

  const dto = await getBatchDTO(created.id);
  return NextResponse.json({ batch: dto, immediateCheck }, { status: 201 });
}

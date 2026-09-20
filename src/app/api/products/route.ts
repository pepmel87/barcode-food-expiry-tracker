import { db } from "@/db";
import { batches, products } from "@/db/schema";
import { toProductDTO } from "@/lib/batches";
import { isStorageType } from "@/lib/expiry";
import { normalizeEAN } from "@/lib/lookup";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Elenco catalogo prodotti con conteggio lotti attivi. */
export async function GET() {
  const rows = await db.select().from(products).orderBy(desc(products.updatedAt));
  const counts = await db
    .select({ productId: batches.productId, count: sql<number>`count(*)::int` })
    .from(batches)
    .where(inArray(batches.status, ["active", "on_sale"]))
    .groupBy(batches.productId);
  const countMap = new Map(counts.map((c) => [c.productId, c.count]));
  return NextResponse.json(
    rows.map((p) => ({ ...toProductDTO(p), activeBatches: countMap.get(p.id) ?? 0 })),
  );
}

/** Crea o aggiorna manualmente un prodotto (usato quando non viene trovato online). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  }
  const ean = normalizeEAN(String(body.ean ?? ""));
  if (!ean) return NextResponse.json({ error: "EAN non valido" }, { status: 400 });
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Il nome del prodotto è obbligatorio" }, { status: 400 });

  const str = (v: unknown) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  };
  const storageType = isStorageType(body.storageType) ? body.storageType : "fresh";
  const now = new Date();

  const [saved] = await db
    .insert(products)
    .values({
      ean,
      name,
      brand: str(body.brand),
      description: str(body.description),
      imageUrl: str(body.imageUrl),
      category: str(body.category),
      quantity: str(body.quantity),
      storageType,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: products.ean,
      set: {
        name,
        brand: str(body.brand),
        description: str(body.description),
        imageUrl: str(body.imageUrl),
        category: str(body.category),
        quantity: str(body.quantity),
        storageType,
        updatedAt: now,
      },
    })
    .returning();

  return NextResponse.json(toProductDTO(saved), { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id non valido" }, { status: 400 });
  await db.delete(products).where(eq(products.id, id));
  return NextResponse.json({ ok: true });
}

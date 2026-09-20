import { db } from "@/db";
import { products } from "@/db/schema";
import { toProductDTO } from "@/lib/batches";
import { isStorageType } from "@/lib/expiry";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id non valido" }, { status: 400 });
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
  return NextResponse.json(toProductDTO(rows[0]));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id non valido" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Body non valido" }, { status: 400 });

  const str = (v: unknown) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  };

  const set: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string" && body.name.trim()) set.name = body.name.trim();
  if ("brand" in body) set.brand = str(body.brand);
  if ("description" in body) set.description = str(body.description);
  if ("imageUrl" in body) set.imageUrl = str(body.imageUrl);
  if ("category" in body) set.category = str(body.category);
  if ("quantity" in body) set.quantity = str(body.quantity);
  if (isStorageType(body.storageType)) set.storageType = body.storageType;

  const [updated] = await db.update(products).set(set).where(eq(products.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
  return NextResponse.json(toProductDTO(updated));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id non valido" }, { status: 400 });
  await db.delete(products).where(eq(products.id, id));
  return NextResponse.json({ ok: true });
}

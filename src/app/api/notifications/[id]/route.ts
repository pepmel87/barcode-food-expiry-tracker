import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id non valido" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const read = typeof body?.read === "boolean" ? body.read : true;
  const [updated] = await db.update(notifications).set({ read }).where(eq(notifications.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "Notifica non trovata" }, { status: 404 });
  return NextResponse.json({ ok: true, read: updated.read });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id non valido" }, { status: 400 });
  await db.delete(notifications).where(eq(notifications.id, id));
  return NextResponse.json({ ok: true });
}

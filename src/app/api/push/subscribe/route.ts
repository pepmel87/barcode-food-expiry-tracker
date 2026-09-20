import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface SubscriptionBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function GET() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(pushSubscriptions);
  return NextResponse.json({ devices: count });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as SubscriptionBody | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Sottoscrizione non valida" }, { status: 400 });
  }
  await db
    .insert(pushSubscriptions)
    .values({ endpoint, p256dh, auth, userAgent: req.headers.get("user-agent") })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh, auth, userAgent: req.headers.get("user-agent") },
    });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "endpoint mancante" }, { status: 400 });
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint));
  return NextResponse.json({ ok: true });
}

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { sendPushToAll } from "@/lib/push";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Invia una notifica di prova a tutti i dispositivi registrati. */
export async function POST() {
  const title = "Notifica di prova";
  const body = "Le notifiche di scadenza funzionano correttamente su questo dispositivo.";
  await db.insert(notifications).values({ type: "info", title, body });
  const result = await sendPushToAll({ title, body, url: "/notifiche", tag: "test" });
  return NextResponse.json({ ok: true, ...result });
}

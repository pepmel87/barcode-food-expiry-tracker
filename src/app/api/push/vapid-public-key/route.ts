import { getVapidKeys } from "@/lib/push";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keys = await getVapidKeys();
    return NextResponse.json({ publicKey: keys.publicKey });
  } catch (err) {
    console.error("[push] impossibile ottenere le chiavi VAPID", err);
    return NextResponse.json({ error: "Chiavi push non disponibili" }, { status: 500 });
  }
}

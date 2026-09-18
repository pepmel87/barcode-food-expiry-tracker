import { runExpiryCheck } from "@/lib/checker";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Esegue subito il controllo delle scadenze.
 * Viene chiamato dal client quando l'app è aperta e può essere usato anche da un cron esterno.
 */
async function handle() {
  try {
    const result = await runExpiryCheck();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[scadenze] controllo fallito", err);
    return NextResponse.json({ error: "Controllo fallito" }, { status: 500 });
  }
}

export async function GET() {
  return handle();
}

export async function POST() {
  return handle();
}

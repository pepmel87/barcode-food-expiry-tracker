"use client";

import { subscribeToPush, unsubscribeFromPush } from "@/lib/client/push";
import { useState } from "react";
import { useNotifications } from "./NotificationsProvider";

export function PushBanner({ compact = false }: { compact?: boolean }) {
  const { pushState, refreshPushState, toast } = useNotifications();
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    try {
      const state = await subscribeToPush();
      await refreshPushState();
      if (state === "subscribed") {
        toast({ title: "Notifiche attivate", body: "Riceverai gli avvisi di scadenza su questo dispositivo.", tone: "success" });
      } else if (state === "denied") {
        toast({ title: "Permesso negato", body: "Abilita le notifiche dalle impostazioni del browser.", tone: "error" });
      }
    } catch (err) {
      toast({ title: "Attivazione fallita", body: (err as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      await refreshPushState();
      toast({ title: "Notifiche push disattivate", tone: "info" });
    } finally {
      setBusy(false);
    }
  };

  if (pushState === "subscribed") {
    if (compact) return null;
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-emerald-900">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Notifiche push attive su questo dispositivo
        </div>
        <button type="button" onClick={() => void disable()} disabled={busy} className="text-xs font-semibold text-emerald-800 hover:underline">
          Disattiva
        </button>
      </div>
    );
  }

  if (pushState === "unsupported" || pushState === "insecure") {
    if (compact) return null;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        {pushState === "insecure"
          ? "Le notifiche push richiedono una connessione HTTPS."
          : "Questo browser non supporta le notifiche push. Su iPhone/iPad aggiungi l'app alla schermata Home (Condividi → Aggiungi a Home) e riaprila da lì."}
        {" "}Gli avvisi restano comunque visibili nella sezione Notifiche quando l&apos;app è aperta.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-amber-900">
        <p className="font-semibold">Attiva le notifiche di scadenza</p>
        <p className="text-xs">
          {pushState === "denied"
            ? "Le notifiche sono bloccate: sbloccale dalle impostazioni del sito nel browser."
            : "Ricevi un avviso su questo dispositivo quando un prodotto va messo in offerta o sta per scadere."}
        </p>
      </div>
      {pushState !== "denied" ? (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy}
          className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? "Attivazione…" : "Attiva notifiche"}
        </button>
      ) : null}
    </div>
  );
}

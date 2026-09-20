"use client";

import { api } from "@/lib/client/api";
import { formatDateIT, formatDateTimeIT } from "@/lib/dates";
import { useState } from "react";
import { useNotifications } from "./NotificationsProvider";
import { ProductImage } from "./ProductImage";
import { PushBanner } from "./PushBanner";

const TYPE_STYLES = {
  alert: { icon: "🏷️", ring: "border-amber-200", bg: "bg-amber-50" },
  expired: { icon: "⛔", ring: "border-red-200", bg: "bg-red-50" },
  info: { icon: "ℹ️", ring: "border-slate-200", bg: "bg-slate-50" },
} as const;

export function NotificationCenter() {
  const { items, unread, loading, refresh, runCheck, pushState, lastCheckAt, toast } = useNotifications();
  const [busy, setBusy] = useState<string | null>(null);

  const markAll = async () => {
    setBusy("all");
    try {
      await api("/api/notifications", { method: "PATCH" });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const clearRead = async () => {
    setBusy("clear");
    try {
      await api("/api/notifications", { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const toggleRead = async (id: number, read: boolean) => {
    await api(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ read }) });
    await refresh();
  };

  const remove = async (id: number) => {
    await api(`/api/notifications/${id}`, { method: "DELETE" });
    await refresh();
  };

  const check = async () => {
    setBusy("check");
    try {
      await runCheck();
      toast({ title: "Controllo eseguito", body: "Le scadenze sono state verificate.", tone: "info" });
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy("test");
    try {
      const res = await api<{ sent: number; failed: number }>("/api/push/test", { method: "POST" });
      await refresh();
      toast({
        title: res.sent > 0 ? `Notifica di prova inviata a ${res.sent} dispositivo/i` : "Nessun dispositivo registrato",
        body: res.sent > 0 ? "Controlla la barra delle notifiche." : "Attiva prima le notifiche push su questo dispositivo.",
        tone: res.sent > 0 ? "success" : "warning",
      });
    } catch (err) {
      toast({ title: "Invio fallito", body: (err as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <PushBanner />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => void check()}
          disabled={busy !== null}
          className="rounded-full bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
        >
          {busy === "check" ? "Controllo…" : "Controlla ora"}
        </button>
        {pushState === "subscribed" ? (
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={busy !== null}
            className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-50"
          >
            Invia notifica di prova
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void markAll()}
          disabled={busy !== null || unread === 0}
          className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-50"
        >
          Segna tutte come lette
        </button>
        <button
          type="button"
          onClick={() => void clearRead()}
          disabled={busy !== null || items.every((n) => !n.read)}
          className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-50"
        >
          Elimina lette
        </button>
        {lastCheckAt ? (
          <span className="ml-auto text-slate-400">Ultimo controllo: {formatDateTimeIT(lastCheckAt)}</span>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Come funzionano gli avvisi</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Prodotti freschi / frigo: avviso <strong>3 giorni</strong> prima della scadenza.</li>
          <li>Freschi con spunta “molti pezzi con stessa scadenza”: avviso <strong>7 giorni</strong> prima per metterli in offerta.</li>
          <li>Lunga conservazione: avviso <strong>15 giorni</strong> prima per metterli in offerta.</li>
          <li>Il controllo avviene automaticamente ogni 10 minuti sul server e ogni minuto mentre l&apos;app è aperta.</li>
        </ul>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-white" />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          <p className="text-3xl">🔔</p>
          <p className="mt-2">Nessuna notifica per ora. Gli avvisi compariranno qui quando un prodotto si avvicina alla scadenza.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const style = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
            return (
              <li
                key={n.id}
                className={`flex gap-3 rounded-2xl border p-3 ${n.read ? "border-slate-200 bg-white" : `${style.ring} ${style.bg}`}`}
              >
                {n.batch?.imageUrl ? (
                  <ProductImage src={n.batch.imageUrl} alt={n.batch.productName} className="h-14 w-14 shrink-0 rounded-xl" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-2xl ring-1 ring-slate-200">
                    {style.icon}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-tight ${n.read ? "font-medium text-slate-800" : "font-bold text-slate-900"}`}>{n.title}</p>
                    {!n.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" /> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span>{formatDateTimeIT(n.createdAt)}</span>
                    {n.batch ? <span>Scadenza {formatDateIT(n.batch.expiryDate)}</span> : null}
                    <span className="flex-1" />
                    <button type="button" onClick={() => void toggleRead(n.id, !n.read)} className="font-semibold text-slate-700 hover:underline">
                      {n.read ? "Segna non letta" : "Segna letta"}
                    </button>
                    <button type="button" onClick={() => void remove(n.id)} className="font-semibold text-red-600 hover:underline">
                      Elimina
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

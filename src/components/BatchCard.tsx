"use client";

import { api } from "@/lib/client/api";
import { formatDateIT } from "@/lib/dates";
import {
  computeAlertDays,
  daysLeftLabel,
  STATUS_LABELS,
  STORAGE_LABELS,
  URGENCY_LABELS,
  type StorageType,
} from "@/lib/expiry";
import type { BatchDTO } from "@/lib/types";
import { useState } from "react";
import { useNotifications } from "./NotificationsProvider";
import { ProductImage } from "./ProductImage";

const URGENCY_STYLES = {
  expired: { badge: "bg-red-600 text-white", border: "border-red-200", bar: "bg-red-500" },
  today: { badge: "bg-red-500 text-white", border: "border-red-200", bar: "bg-red-400" },
  alert: { badge: "bg-amber-500 text-white", border: "border-amber-200", bar: "bg-amber-400" },
  soon: { badge: "bg-sky-100 text-sky-800", border: "border-slate-200", bar: "bg-sky-300" },
  ok: { badge: "bg-emerald-100 text-emerald-800", border: "border-slate-200", bar: "bg-emerald-300" },
} as const;

interface Props {
  batch: BatchDTO;
  onChanged: (updated: BatchDTO | null) => void;
}

export function BatchCard({ batch, onChanged }: Props) {
  const { toast } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expiryDate, setExpiryDate] = useState(batch.expiryDate);
  const [storageType, setStorageType] = useState<StorageType>(batch.storageType);
  const [manyPieces, setManyPieces] = useState(batch.manyPieces);
  const [quantity, setQuantity] = useState(batch.quantity);

  const styles = URGENCY_STYLES[batch.urgency];
  const archived = batch.status === "sold" || batch.status === "discarded";

  const patch = async (body: Record<string, unknown>, successMsg?: string) => {
    setBusy(true);
    try {
      const updated = await api<BatchDTO>(`/api/batches/${batch.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onChanged(updated);
      if (successMsg) toast({ title: successMsg, body: batch.product.name, tone: "success" });
      setEditing(false);
    } catch (err) {
      toast({ title: "Operazione fallita", body: (err as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Eliminare definitivamente il lotto di "${batch.product.name}"?`)) return;
    setBusy(true);
    try {
      await api(`/api/batches/${batch.id}`, { method: "DELETE" });
      onChanged(null);
      toast({ title: "Lotto eliminato", tone: "info" });
    } catch (err) {
      toast({ title: "Eliminazione fallita", body: (err as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const previewAlertDays = computeAlertDays(storageType, storageType === "fresh" && manyPieces);

  return (
    <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${styles.border} ${archived ? "opacity-70" : ""}`}>
      <div className={`h-1 ${archived ? "bg-slate-300" : styles.bar}`} />
      <div className="flex gap-3 p-3">
        <ProductImage src={batch.product.imageUrl} alt={batch.product.name} className="h-20 w-20 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight text-slate-900">{batch.product.name}</h3>
              <p className="truncate text-xs text-slate-500">
                {[batch.product.brand, batch.product.quantity].filter(Boolean).join(" · ") || `EAN ${batch.product.ean}`}
              </p>
            </div>
            {!archived ? (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles.badge}`}>
                {URGENCY_LABELS[batch.urgency]}
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {STATUS_LABELS[batch.status]}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{formatDateIT(batch.expiryDate)}</span>
            <span className={batch.daysLeft < 0 ? "font-semibold text-red-700" : ""}>{daysLeftLabel(batch.daysLeft)}</span>
            <span>{batch.quantity} pz</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
              {batch.storageType === "fresh" ? "🧊" : "🥫"} {STORAGE_LABELS[batch.storageType]}
            </span>
            {batch.manyPieces ? (
              <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] text-violet-800">Molti pezzi</span>
            ) : null}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
              Avviso {batch.alertDays} gg prima · {formatDateIT(batch.alertDate, { day: "numeric", month: "short" })}
            </span>
            {batch.status === "on_sale" ? (
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">🏷️ In offerta</span>
            ) : null}
          </div>
          {batch.notes ? <p className="mt-1 truncate text-[11px] text-slate-500">📝 {batch.notes}</p> : null}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Scadenza
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Pezzi
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200 p-1">
            {(["fresh", "long_life"] as StorageType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setStorageType(t)}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold ${storageType === t ? "bg-white text-emerald-700 shadow" : "text-slate-600"}`}
              >
                {STORAGE_LABELS[t]}
              </button>
            ))}
          </div>
          {storageType === "fresh" ? (
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={manyPieces} onChange={(e) => setManyPieces(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Molti pezzi con stessa scadenza (avviso a 7 giorni)
            </label>
          ) : null}
          <p className="text-[11px] text-slate-500">Nuovo preavviso: {previewAlertDays} giorni prima della scadenza.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600">
              Annulla
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ expiryDate, storageType, manyPieces, quantity }, "Lotto aggiornato")}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Salva
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2">
          {!archived && batch.status !== "on_sale" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ status: "on_sale" }, "Messo in offerta")}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              🏷️ Metti in offerta
            </button>
          ) : null}
          {!archived ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ status: "sold" }, "Segnato come venduto")}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              ✓ Venduto
            </button>
          ) : null}
          {!archived ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ status: "discarded" }, "Segnato come smaltito")}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Smaltito
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ status: "active" }, "Riportato in vendita")}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Ripristina
            </button>
          )}
          <span className="flex-1" />
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            Modifica
          </button>
          <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
            Elimina
          </button>
        </div>
      )}
    </article>
  );
}

"use client";

import { api } from "@/lib/client/api";
import { addDays, formatDateIT, todayISO } from "@/lib/dates";
import { computeAlertDays, STORAGE_LABELS, type StorageType } from "@/lib/expiry";
import type { ProductDTO } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNotifications } from "./NotificationsProvider";
import { ProductImage } from "./ProductImage";

type CatalogProduct = ProductDTO & { activeBatches: number };

const SOURCE_LABELS: Record<string, string> = {
  openfoodfacts: "Open Food Facts",
  upcitemdb: "UPCitemdb",
  google: "Google",
  manual: "Manuale",
};

export function ProductCatalog() {
  const { toast, refresh } = useNotifications();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setProducts(await api<CatalogProduct[]>("/api/products"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.brand ?? "").toLowerCase().includes(q) || p.ean.includes(q),
    );
  }, [products, query]);

  const setStorage = async (p: CatalogProduct, storageType: StorageType) => {
    if (p.storageType === storageType) return;
    try {
      const updated = await api<ProductDTO>(`/api/products/${p.id}`, { method: "PATCH", body: JSON.stringify({ storageType }) });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...updated } : x)));
    } catch (err) {
      toast({ title: "Aggiornamento fallito", body: (err as Error).message, tone: "error" });
    }
  };

  const remove = async (p: CatalogProduct) => {
    if (!confirm(`Eliminare "${p.name}" e tutti i suoi lotti dal catalogo?`)) return;
    try {
      await api(`/api/products/${p.id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      toast({ title: "Prodotto eliminato", tone: "info" });
    } catch (err) {
      toast({ title: "Eliminazione fallita", body: (err as Error).message, tone: "error" });
    }
  };

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca per nome, marca o EAN…"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />

      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-white" />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          <p className="text-3xl">📦</p>
          <p className="mt-2">Il catalogo è vuoto. I prodotti vengono aggiunti automaticamente ad ogni scansione.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((p) => (
            <li key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex gap-3">
                <ProductImage src={p.imageUrl} alt={p.name} className="h-16 w-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[p.brand, p.quantity].filter(Boolean).join(" · ")}
                  </p>
                  <p className="font-mono text-[11px] text-slate-400">
                    EAN {p.ean} · {SOURCE_LABELS[p.source] ?? p.source}
                    {p.activeBatches ? ` · ${p.activeBatches} lott${p.activeBatches === 1 ? "o" : "i"} attiv${p.activeBatches === 1 ? "o" : "i"}` : ""}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                    {(["fresh", "long_life"] as StorageType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => void setStorage(p, t)}
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold ${p.storageType === t ? "bg-white text-emerald-700 shadow" : "text-slate-600"}`}
                      >
                        {STORAGE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700"
                >
                  + Aggiungi scadenza
                </button>
                <span className="flex-1" />
                <button type="button" onClick={() => void remove(p)} className="rounded-lg px-2 py-1.5 font-semibold text-red-600 hover:bg-red-50">
                  Elimina
                </button>
              </div>
              {expanded === p.id ? (
                <QuickBatchForm
                  product={p}
                  onSaved={() => {
                    setExpanded(null);
                    void load();
                    void refresh();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickBatchForm({ product, onSaved }: { product: ProductDTO; onSaved: () => void }) {
  const { toast } = useNotifications();
  const today = todayISO();
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [manyPieces, setManyPieces] = useState(false);
  const [saving, setSaving] = useState(false);
  const alertDays = computeAlertDays(product.storageType, product.storageType === "fresh" && manyPieces);

  const save = async () => {
    if (!expiryDate) return;
    setSaving(true);
    try {
      await api("/api/batches", {
        method: "POST",
        body: JSON.stringify({ productId: product.id, expiryDate, quantity, manyPieces, storageType: product.storageType }),
      });
      toast({ title: "Scadenza registrata", body: `${product.name} · ${formatDateIT(expiryDate)}`, tone: "success" });
      onSaved();
    } catch (err) {
      toast({ title: "Salvataggio fallito", body: (err as Error).message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[7, 15, 30, 90, 180].map((d) => (
          <button key={d} type="button" onClick={() => setExpiryDate(addDays(today, d))} className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] text-slate-700">
            +{d} gg
          </button>
        ))}
      </div>
      {product.storageType === "fresh" ? (
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={manyPieces} onChange={(e) => setManyPieces(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
          Molti pezzi con stessa scadenza (avviso a 7 giorni)
        </label>
      ) : null}
      <p className="text-[11px] text-slate-500">
        {expiryDate ? `Avviso il ${formatDateIT(addDays(expiryDate, -alertDays))} (${alertDays} giorni prima).` : `Preavviso: ${alertDays} giorni.`}
      </p>
      <button
        type="button"
        disabled={!expiryDate || saving}
        onClick={() => void save()}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Salvataggio…" : "Salva scadenza"}
      </button>
    </div>
  );
}

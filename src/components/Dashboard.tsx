"use client";

import { api } from "@/lib/client/api";
import type { BatchDTO } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BatchCard } from "./BatchCard";
import { useNotifications } from "./NotificationsProvider";
import { PushBanner } from "./PushBanner";

type Filter = "all" | "action" | "expired" | "on_sale" | "archived";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Attivi" },
  { key: "action", label: "Da mettere in offerta" },
  { key: "expired", label: "Scaduti" },
  { key: "on_sale", label: "In offerta" },
  { key: "archived", label: "Archivio" },
];

export function Dashboard() {
  const { lastCheckAt } = useNotifications();
  const [batches, setBatches] = useState<BatchDTO[]>([]);
  const [archived, setArchived] = useState<BatchDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const [active, arch] = await Promise.all([
        api<BatchDTO[]>("/api/batches"),
        api<BatchDTO[]>("/api/batches?status=archived"),
      ]);
      setBatches(active);
      setArchived(arch);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, lastCheckAt]);

  const counts = useMemo(() => {
    const c = { expired: 0, action: 0, soon: 0, ok: 0, onSale: 0 };
    for (const b of batches) {
      if (b.urgency === "expired") c.expired += 1;
      else if (b.urgency === "today" || b.urgency === "alert") c.action += 1;
      else if (b.urgency === "soon") c.soon += 1;
      else c.ok += 1;
      if (b.status === "on_sale") c.onSale += 1;
    }
    return c;
  }, [batches]);

  const visible = useMemo(() => {
    let list: BatchDTO[];
    switch (filter) {
      case "action":
        list = batches.filter((b) => b.urgency === "alert" || b.urgency === "today");
        break;
      case "expired":
        list = batches.filter((b) => b.urgency === "expired");
        break;
      case "on_sale":
        list = batches.filter((b) => b.status === "on_sale");
        break;
      case "archived":
        list = archived;
        break;
      default:
        list = batches;
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          b.product.name.toLowerCase().includes(q) ||
          (b.product.brand ?? "").toLowerCase().includes(q) ||
          b.product.ean.includes(q) ||
          (b.notes ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [batches, archived, filter, query]);

  const onChanged = (id: number) => (updated: BatchDTO | null) => {
    const isArchived = updated && (updated.status === "sold" || updated.status === "discarded");
    setBatches((prev) => {
      const without = prev.filter((b) => b.id !== id);
      return updated && !isArchived ? [...without, updated].sort(sortBatches) : without;
    });
    setArchived((prev) => {
      const without = prev.filter((b) => b.id !== id);
      return updated && isArchived ? [updated, ...without] : without;
    });
  };

  return (
    <div className="space-y-4">
      <PushBanner compact />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Scaduti" value={counts.expired} tone="red" onClick={() => setFilter("expired")} active={filter === "expired"} />
        <StatCard label="Da mettere in offerta" value={counts.action} tone="amber" onClick={() => setFilter("action")} active={filter === "action"} />
        <StatCard label="In avvicinamento" value={counts.soon} tone="sky" onClick={() => setFilter("all")} active={false} />
        <StatCard label="In offerta" value={counts.onSale} tone="violet" onClick={() => setFilter("on_sale")} active={filter === "on_sale"} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === f.key ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
            {f.key === "all" ? ` (${batches.length})` : f.key === "archived" ? ` (${archived.length})` : ""}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca per nome, marca o EAN…"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-3xl">🛒</p>
          <p className="mt-2 font-semibold text-slate-800">
            {batches.length === 0 && filter !== "archived" ? "Nessun prodotto registrato" : "Nessun prodotto in questa vista"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Scansiona il codice a barre di un prodotto e inserisci la data di scadenza per iniziare.
          </p>
          <Link
            href="/scansiona"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700"
          >
            Scansiona un prodotto
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((b) => (
            <BatchCard key={b.id} batch={b} onChanged={onChanged(b.id)} />
          ))}
        </div>
      )}

      <Link
        href="/scansiona"
        aria-label="Scansiona"
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 sm:right-[calc(50%-24rem+1rem)]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-7 w-7">
          <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
          <path d="M8 8v8M11 8v8M14 8v8M16.5 8v8" />
        </svg>
      </Link>
    </div>
  );
}

const ORDER = { expired: 0, today: 1, alert: 2, soon: 3, ok: 4 } as const;
function sortBatches(a: BatchDTO, b: BatchDTO) {
  if (ORDER[a.urgency] !== ORDER[b.urgency]) return ORDER[a.urgency] - ORDER[b.urgency];
  if (a.expiryDate !== b.expiryDate) return a.expiryDate < b.expiryDate ? -1 : 1;
  return b.id - a.id;
}

function StatCard({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "sky" | "violet";
  onClick: () => void;
  active: boolean;
}) {
  const tones = {
    red: "text-red-700 bg-red-50 ring-red-200",
    amber: "text-amber-700 bg-amber-50 ring-amber-200",
    sky: "text-sky-700 bg-sky-50 ring-sky-200",
    violet: "text-violet-700 bg-violet-50 ring-violet-200",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl p-3 text-left ring-1 transition ${tones[tone]} ${active ? "ring-2" : ""}`}
    >
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-medium leading-tight opacity-80">{label}</p>
    </button>
  );
}

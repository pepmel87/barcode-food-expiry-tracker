"use client";

import { api } from "@/lib/client/api";
import { addDays, daysUntil, formatDateIT, todayISO } from "@/lib/dates";
import { computeAlertDays, describeRule, type StorageType } from "@/lib/expiry";
import type { BatchDTO, LookupResponse, ProductDTO } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarcodeScanner } from "./BarcodeScanner";
import { useNotifications } from "./NotificationsProvider";
import { ProductImage } from "./ProductImage";

type Step = "scan" | "lookup" | "form" | "saved";

const SOURCE_LABELS: Record<string, string> = {
  local: "Database locale",
  openfoodfacts: "Open Food Facts",
  upcitemdb: "UPCitemdb",
  google: "Google",
  manual: "Inserito manualmente",
};

interface ProductDraft {
  name: string;
  brand: string;
  description: string;
  imageUrl: string;
  quantity: string;
}

export function ScanFlow() {
  const { toast, refresh } = useNotifications();
  const [step, setStep] = useState<Step>("scan");
  const [ean, setEan] = useState("");
  const [manual, setManual] = useState("");
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductDTO | null>(null);
  const [draft, setDraft] = useState<ProductDraft>({ name: "", brand: "", description: "", imageUrl: "", quantity: "" });
  const [editing, setEditing] = useState(false);

  // Campi lotto
  const today = todayISO();
  const [expiryDate, setExpiryDate] = useState("");
  const [qty, setQty] = useState(1);
  const [storageType, setStorageType] = useState<StorageType>("fresh");
  const [manyPieces, setManyPieces] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedBatch, setSavedBatch] = useState<BatchDTO | null>(null);

  const alertDays = computeAlertDays(storageType, storageType === "fresh" && manyPieces);
  const alertDate = expiryDate ? addDays(expiryDate, -alertDays) : null;
  const daysLeft = expiryDate ? daysUntil(expiryDate, today) : null;

  const resetForm = useCallback(() => {
    setExpiryDate("");
    setQty(1);
    setManyPieces(false);
    setNotes("");
    setSaveError(null);
    setEditing(false);
  }, []);

  const startLookup = useCallback(
    async (code: string, refreshOnline = false) => {
      setEan(code);
      setStep("lookup");
      setLookupError(null);
      setLookup(null);
      setProduct(null);
      try {
        const res = await api<LookupResponse>(
          `/api/products/lookup?ean=${encodeURIComponent(code)}${refreshOnline ? "&refresh=1" : ""}`,
        );
        setLookup(res);
        if (res.product) {
          setProduct(res.product);
          setStorageType(res.product.storageType);
          setDraft({
            name: res.product.name,
            brand: res.product.brand ?? "",
            description: res.product.description ?? "",
            imageUrl: res.product.imageUrl ?? "",
            quantity: res.product.quantity ?? "",
          });
          setEditing(false);
        } else {
          setStorageType("fresh");
          setDraft({ name: "", brand: "", description: "", imageUrl: "", quantity: "" });
          setEditing(true);
        }
        resetForm();
        setStep("form");
      } catch (err) {
        setLookupError((err as Error).message || "Ricerca fallita");
        setStep("form");
        setEditing(true);
      }
    },
    [resetForm],
  );

  const onDetected = useCallback(
    (code: string) => {
      void startLookup(code);
    },
    [startLookup],
  );

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = manual.replace(/\D/g, "");
    if (![8, 12, 13, 14].includes(digits.length)) {
      toast({ title: "Codice non valido", body: "Inserisci un EAN di 8, 12, 13 o 14 cifre.", tone: "error" });
      return;
    }
    setManual("");
    void startLookup(digits);
  };

  const canSave = useMemo(() => {
    if (!expiryDate) return false;
    if (!product && !draft.name.trim()) return false;
    if (editing && !draft.name.trim()) return false;
    return true;
  }, [expiryDate, product, draft.name, editing]);

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      let productId = product?.id ?? null;

      // Prodotto nuovo (non trovato) oppure dettagli modificati
      if (!product) {
        const created = await api<ProductDTO>("/api/products", {
          method: "POST",
          body: JSON.stringify({ ean, ...draft, storageType }),
        });
        productId = created.id;
        setProduct(created);
      } else if (editing) {
        const updated = await api<ProductDTO>(`/api/products/${product.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...draft, storageType }),
        });
        setProduct(updated);
      }

      const res = await api<{ batch: BatchDTO; immediateCheck: { created: number } | null }>("/api/batches", {
        method: "POST",
        body: JSON.stringify({ productId, expiryDate, quantity: qty, manyPieces, storageType, notes }),
      });
      setSavedBatch(res.batch);
      setStep("saved");
      toast({ title: "Scadenza registrata", body: `${res.batch.product.name} · ${formatDateIT(expiryDate)}`, tone: "success" });
      if (res.immediateCheck?.created) void refresh();
    } catch (err) {
      setSaveError((err as Error).message || "Salvataggio fallito");
    } finally {
      setSaving(false);
    }
  };

  const scanAgain = () => {
    setStep("scan");
    setEan("");
    setLookup(null);
    setProduct(null);
    setSavedBatch(null);
    resetForm();
  };

  // Scorciatoia: invio da tastiera esterna / lettore USB (digita cifre + Invio)
  useEffect(() => {
    if (step !== "scan") return;
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const now = Date.now();
      if (now - last > 300) buffer = "";
      last = now;
      if (/^\d$/.test(e.key)) buffer += e.key;
      else if (e.key === "Enter" && [8, 12, 13, 14].includes(buffer.length)) {
        const code = buffer;
        buffer = "";
        void startLookup(code);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, startLookup]);

  /* ------------------------------------------------------------------ */

  if (step === "scan") {
    return (
      <div className="space-y-4">
        <BarcodeScanner active onDetected={onDetected} />
        <form onSubmit={submitManual} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="text-sm font-semibold text-slate-800">Oppure inserisci il codice EAN</label>
          <div className="mt-2 flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="es. 8001120000000"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-base tracking-wider outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700"
            >
              Cerca
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Funziona anche con un lettore di codici a barre USB/Bluetooth: spara il codice e premi Invio.
          </p>
        </form>
      </div>
    );
  }

  if (step === "lookup") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
        <div>
          <p className="font-semibold text-slate-900">Ricerca prodotto…</p>
          <p className="mt-1 font-mono text-sm text-slate-500">EAN {ean}</p>
          <p className="mt-2 text-xs text-slate-400">Database locale → Open Food Facts → UPCitemdb → Google</p>
        </div>
      </div>
    );
  }

  if (step === "saved" && savedBatch) {
    const b = savedBatch;
    const immediate = daysUntil(b.expiryDate, today) <= b.alertDays;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold text-emerald-900">Scadenza registrata</p>
              <p className="mt-0.5 text-sm text-emerald-800">
                {b.product.name}
                {b.product.brand ? ` · ${b.product.brand}` : ""} — {b.quantity} pz
              </p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-emerald-700">Scadenza</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{formatDateIT(b.expiryDate)}</dd>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-emerald-700">Avviso</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {immediate ? "Inviato subito" : formatDateIT(b.alertDate)}
              </dd>
              <dd className="text-xs text-slate-500">{b.alertDays} giorni prima</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-emerald-800">{describeRule(b.storageType, b.manyPieces)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={scanAgain}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-700"
          >
            Scansiona un altro
          </button>
          <Link
            href="/"
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Vai alle scadenze
          </Link>
        </div>
      </div>
    );
  }

  /* --------------------------- FORM --------------------------- */
  const found = Boolean(product);
  const imagePreview = editing ? draft.imageUrl : product?.imageUrl ?? "";

  return (
    <div className="space-y-4">
      {/* Scheda prodotto */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xs text-slate-500">EAN {ean}</p>
          <div className="flex items-center gap-2">
            {lookup && !lookup.checksumValid ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                Cifra di controllo dubbia
              </span>
            ) : null}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                found ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
              }`}
            >
              {found ? SOURCE_LABELS[lookup?.source ?? product?.source ?? "manual"] ?? "Trovato" : "Non trovato"}
            </span>
          </div>
        </div>

        {lookupError ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{lookupError}</p>
        ) : null}

        <div className="mt-3 flex gap-4">
          <ProductImage src={imagePreview || null} alt={draft.name || "Prodotto"} className="h-28 w-28 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            {!editing ? (
              <>
                <h2 className="text-lg font-bold leading-tight text-slate-900">{product?.name}</h2>
                {product?.brand ? <p className="text-sm text-slate-600">{product.brand}</p> : null}
                {product?.quantity ? <p className="text-xs text-slate-500">{product.quantity}</p> : null}
                {product?.category ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{product.category}</p>
                ) : null}
                {product?.description ? (
                  <p className="mt-2 line-clamp-4 whitespace-pre-line text-xs text-slate-600">{product.description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button type="button" onClick={() => setEditing(true)} className="font-semibold text-emerald-700 hover:underline">
                    Modifica dettagli
                  </button>
                  <button type="button" onClick={() => void startLookup(ean, true)} className="font-semibold text-slate-600 hover:underline">
                    Aggiorna da internet
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                {!found ? (
                  <p className="text-xs text-slate-600">
                    Prodotto non presente nei database. Inserisci i dati manualmente: verrà salvato nel tuo catalogo per le prossime scansioni.
                  </p>
                ) : null}
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Nome prodotto *"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={draft.brand}
                    onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                    placeholder="Marca"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                  <input
                    value={draft.quantity}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                    placeholder="Formato (es. 500 g)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <input
                  value={draft.imageUrl}
                  onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                  placeholder="URL immagine (opzionale)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Descrizione"
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                {found ? (
                  <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold text-slate-600 hover:underline">
                    Annulla modifica
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {!found && lookup ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Cerca informazioni online</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <a href={lookup.links.web} target="_blank" rel="noreferrer" className="rounded-full border border-slate-300 bg-white px-3 py-1 font-medium text-slate-800 hover:bg-slate-100">
                Google
              </a>
              <a href={lookup.links.images} target="_blank" rel="noreferrer" className="rounded-full border border-slate-300 bg-white px-3 py-1 font-medium text-slate-800 hover:bg-slate-100">
                Google Immagini
              </a>
              <a href={lookup.links.openFoodFacts} target="_blank" rel="noreferrer" className="rounded-full border border-slate-300 bg-white px-3 py-1 font-medium text-slate-800 hover:bg-slate-100">
                Open Food Facts
              </a>
            </div>
            {!lookup.googleConfigured ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Suggerimento: impostando le variabili GOOGLE_API_KEY e GOOGLE_CSE_ID la ricerca su Google diventa automatica.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Dati lotto */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">Data di scadenza</h3>
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { label: "+3 gg", d: 3 },
            { label: "+7 gg", d: 7 },
            { label: "+15 gg", d: 15 },
            { label: "+1 mese", d: 30 },
            { label: "+3 mesi", d: 90 },
            { label: "+6 mesi", d: 180 },
            { label: "+1 anno", d: 365 },
          ].map((s) => (
            <button
              key={s.d}
              type="button"
              onClick={() => setExpiryDate(addDays(today, s.d))}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <label className="text-sm font-semibold text-slate-900">Tipo di conservazione</label>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {(["fresh", "long_life"] as StorageType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setStorageType(t)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    storageType === t ? "bg-white text-emerald-700 shadow" : "text-slate-600"
                  }`}
                >
                  {t === "fresh" ? "🧊 Fresco / Frigo" : "🥫 Lunga conservazione"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Pezzi</label>
            <div className="mt-2 flex items-center rounded-xl border border-slate-300">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2 text-lg text-slate-600">
                −
              </button>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-12 border-x border-slate-200 py-2 text-center text-base outline-none"
              />
              <button type="button" onClick={() => setQty((q) => q + 1)} className="px-3 py-2 text-lg text-slate-600">
                +
              </button>
            </div>
          </div>
        </div>

        {storageType === "fresh" ? (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={manyPieces}
              onChange={(e) => setManyPieces(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-slate-300 accent-emerald-600"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Molti pezzi con stessa scadenza</span>
              <span className="block text-xs text-slate-600">
                Ricevi l&apos;avviso 7 giorni prima (invece di 3) per avere il tempo di mettere il prodotto in offerta.
              </span>
            </span>
          </label>
        ) : (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Per i prodotti a lunga conservazione il preavviso è di <strong>15 giorni</strong>, per poterli mettere in offerta per tempo.
          </p>
        )}

        <div
          className={`mt-4 rounded-xl p-3 text-sm ${
            !expiryDate
              ? "bg-slate-50 text-slate-500"
              : daysLeft !== null && daysLeft < 0
                ? "bg-red-50 text-red-800"
                : daysLeft !== null && daysLeft <= alertDays
                  ? "bg-amber-50 text-amber-900"
                  : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {!expiryDate ? (
            "Inserisci la data di scadenza per vedere quando riceverai l'avviso."
          ) : daysLeft !== null && daysLeft < 0 ? (
            <>
              <strong>Attenzione:</strong> questo prodotto risulta già scaduto ({formatDateIT(expiryDate)}).
            </>
          ) : daysLeft !== null && daysLeft <= alertDays ? (
            <>
              <strong>Avviso immediato:</strong> mancano {daysLeft} {daysLeft === 1 ? "giorno" : "giorni"} alla scadenza ({formatDateIT(expiryDate)}), entro la soglia di {alertDays} giorni.
            </>
          ) : (
            <>
              🔔 Riceverai l&apos;avviso il <strong>{alertDate ? formatDateIT(alertDate) : ""}</strong> ({alertDays} giorni prima della scadenza del {formatDateIT(expiryDate)}).
            </>
          )}
        </div>

        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Note (es. scaffale, lotto, fornitore)"
          className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />

        {saveError ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p> : null}

        <div className="mt-4 grid grid-cols-[auto_1fr] gap-3">
          <button
            type="button"
            onClick={scanAgain}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => void save()}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva scadenza"}
          </button>
        </div>
      </section>
    </div>
  );
}

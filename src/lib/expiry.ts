import { addDays, daysUntil } from "./dates";

export type StorageType = "fresh" | "long_life";
export type BatchStatus = "active" | "on_sale" | "sold" | "discarded";

/** Stato di urgenza calcolato per un lotto. */
export type UrgencyLevel = "expired" | "today" | "alert" | "soon" | "ok";

export const STORAGE_LABELS: Record<StorageType, string> = {
  fresh: "Fresco / Frigo",
  long_life: "Lunga conservazione",
};

export const STATUS_LABELS: Record<BatchStatus, string> = {
  active: "In vendita",
  on_sale: "In offerta",
  sold: "Venduto",
  discarded: "Smaltito",
};

/** Giorni di preavviso previsti dalle regole dell'app. */
export const ALERT_RULES = {
  fresh: 3, // prodotti freschi / frigo
  freshManyPieces: 7, // freschi con "molti pezzi con stessa scadenza"
  longLife: 15, // lunga conservazione
} as const;

export function isStorageType(value: unknown): value is StorageType {
  return value === "fresh" || value === "long_life";
}

export function isBatchStatus(value: unknown): value is BatchStatus {
  return value === "active" || value === "on_sale" || value === "sold" || value === "discarded";
}

/**
 * Regola centrale dell'app:
 *  - fresco / frigo: avviso 3 giorni prima
 *  - fresco con molti pezzi con stessa scadenza: avviso 7 giorni prima (per metterlo in offerta)
 *  - lunga conservazione: avviso 15 giorni prima (per metterlo in offerta)
 */
export function computeAlertDays(storageType: StorageType, manyPieces: boolean): number {
  if (storageType === "long_life") return ALERT_RULES.longLife;
  return manyPieces ? ALERT_RULES.freshManyPieces : ALERT_RULES.fresh;
}

export function describeRule(storageType: StorageType, manyPieces: boolean): string {
  if (storageType === "long_life") {
    return "Lunga conservazione: avviso 15 giorni prima per mettere il prodotto in offerta.";
  }
  if (manyPieces) {
    return "Fresco con molti pezzi: avviso 7 giorni prima per mettere il prodotto in offerta.";
  }
  return "Fresco / frigo: avviso 3 giorni prima della scadenza.";
}

/** Data in cui scatterà l'avviso per un lotto. */
export function alertDate(expiryDate: string, alertDays: number): string {
  return addDays(expiryDate, -alertDays);
}

export function urgencyFor(expiryDate: string, alertDays: number, today?: string): {
  level: UrgencyLevel;
  daysLeft: number;
} {
  const daysLeft = daysUntil(expiryDate, today);
  if (daysLeft < 0) return { level: "expired", daysLeft };
  if (daysLeft === 0) return { level: "today", daysLeft };
  if (daysLeft <= alertDays) return { level: "alert", daysLeft };
  if (daysLeft <= alertDays + 7) return { level: "soon", daysLeft };
  return { level: "ok", daysLeft };
}

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  expired: "Scaduto",
  today: "Scade oggi",
  alert: "Da mettere in offerta",
  soon: "In avvicinamento",
  ok: "OK",
};

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `Scaduto da ${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? "giorno" : "giorni"}`;
  if (daysLeft === 0) return "Scade oggi";
  if (daysLeft === 1) return "Scade domani";
  return `Scade tra ${daysLeft} giorni`;
}

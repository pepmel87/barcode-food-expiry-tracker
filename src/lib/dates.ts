export const APP_TIMEZONE = "Europe/Rome";

/** Restituisce la data odierna (YYYY-MM-DD) nel fuso orario dell'app. */
export function todayISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Converte una stringa YYYY-MM-DD in numero di giorni dall'epoca (UTC). */
function isoToDayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** Giorni di calendario tra oggi e la data indicata (negativo se passata). */
export function daysUntil(iso: string, today: string = todayISO()): number {
  return isoToDayNumber(iso) - isoToDayNumber(today);
}

/** Aggiunge (o sottrae) giorni ad una data ISO. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return dt.toISOString().slice(0, 10);
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Formatta una data ISO in italiano (es. "12 mar 2026"). */
export function formatDateIT(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(dt);
}

export function formatDateTimeIT(value: string | Date): string {
  const dt = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

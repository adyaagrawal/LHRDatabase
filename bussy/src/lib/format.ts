const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return usd.format(Number(n));
}

export function moneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return usd0.format(Number(n));
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Request numbers show as plain "#19" (ask Rohan → §16). To switch to "#2026-019",
 * change this one function.
 */
export function reqNo(n: number | null | undefined): string {
  if (n === null || n === undefined) return "#—";
  return `#${n}`;
}

export function dateShort(d: string | null | undefined): string {
  if (!d) return "—";
  const date = d.length === 10 ? new Date(`${d}T12:00:00`) : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}

export function dateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

export function daysBetween(from: string | null | undefined, to: Date = new Date()): number | null {
  if (!from) return null;
  const f = new Date(from);
  if (Number.isNaN(f.getTime())) return null;
  return Math.floor((to.getTime() - f.getTime()) / 86_400_000);
}

/** Today's date in Austin as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function truncate(s: string | null | undefined, n = 60): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Turn a Supabase/Postgres error into a sentence someone can act on. */
export function errorMessage(e: unknown): string {
  if (!e) return "Something went wrong.";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = String((e as { message: unknown }).message);
    return m.replace(/^.*?ERROR:\s*/i, "");
  }
  return "Something went wrong.";
}

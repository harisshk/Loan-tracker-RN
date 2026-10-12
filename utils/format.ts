// Shared number / date formatting for INR amounts (en-IN grouping: ₹12,34,567).

const LOCALE = "en-IN";

export const toNumber = (value: unknown): number => {
  const n = parseFloat(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Exact rupee amount, no decimals: ₹12,34,567 */
export const formatINR = (value: unknown): string => {
  const n = Math.round(toNumber(value));
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(n).toLocaleString(LOCALE, { maximumFractionDigits: 0 })}`;
};

/**
 * Compact rupee amount for tight spaces, using Indian units:
 * below 1 lakh stays exact (₹45,600), then ₹12.4L, then ₹1.23Cr.
 */
export const formatINRCompact = (value: unknown): string => {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const trim = (x: number, digits: number) =>
    x.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");

  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7, 2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5, abs >= 1e6 ? 1 : 2)}L`;
  return formatINR(n);
};

/** Percentage with at most one decimal: 42.7% */
export const formatPercent = (value: number, digits = 1): string => {
  if (!Number.isFinite(value)) return "0%";
  return `${parseFloat(value.toFixed(digits))}%`;
};

const toDate = (value: Date | string | number | null | undefined): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/** 14 Oct */
export const formatDateShort = (value: Date | string | null | undefined): string => {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
};

/** Wed, 14 Oct */
export const formatDateWithDay = (value: Date | string | null | undefined): string => {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
};

/** Oct 2026 */
export const formatMonthYear = (value: Date | string | null | undefined): string => {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(LOCALE, { month: "short", year: "numeric" });
};

/** Today / Tomorrow / In 5 days / Yesterday / 3 days ago */
export const formatRelativeDays = (daysLeft: number): string => {
  if (daysLeft === 0) return "Today";
  if (daysLeft === 1) return "Tomorrow";
  if (daysLeft === -1) return "Yesterday";
  if (daysLeft < 0) return `${Math.abs(daysLeft)} days ago`;
  return `In ${daysLeft} days`;
};

/** Whole days from today (local midnight) to the given date; negative if in the past. */
export const daysFromToday = (value: Date | string | null | undefined): number => {
  const d = toDate(value);
  if (!d) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

/** "Good morning" / "Good afternoon" / "Good evening" */
export const getGreeting = (date: Date = new Date()): string => {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

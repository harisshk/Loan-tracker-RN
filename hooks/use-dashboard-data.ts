import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { getAuthUser } from "../utils/auth";
import {
  addMonthsClamped,
  calculateEMIBreakdown,
  countsTowardBalance,
  daysInMonth,
  getBulletMaturityDate,
  getMonthsElapsed,
  getPaymentDate,
  getPremiumStepMonths,
  parseLocalDate,
} from "../utils/emiCalculator";
import {
  daysFromToday,
  formatDateWithDay,
  formatINR,
  formatMonthYear,
  formatPercent,
  formatRelativeDays,
  getGreeting,
  toNumber,
} from "../utils/format";
import { getInsurances, getLoans, getPayments, refreshAllNotifications } from "../utils/storage";
import {
  getBudgetLimit,
  getSupabaseConfig,
  getTransactions,
} from "../utils/transactions";

// ── Types ───────────────────────────────────────────────────────────────────

export type LoanKind = "emi" | "bullet";
export type DueKind = "emi" | "bullet" | "insurance";
export type Tone = "critical" | "warning" | "neutral" | "positive";

export interface LoanSummary {
  id: string;
  name: string;
  kind: LoanKind;
  rate: number;
  principal: number;
  tenure: number;
  /** Monthly EMI (the saved amount, or the formula EMI when none was saved). */
  emi: number;
  startDate: Date | null;
  /** Day of month the EMI is debited (start date's day). */
  emiDay: number | null;
  remainingPrincipal: number;
  remainingInterest: number;
  remainingAmount: number;
  /** Share of the original principal already repaid, 0-100. */
  repaidPct: number;
  /** Share of the term elapsed, 0-100 (by days for bullet loans). */
  termElapsedPct: number;
  /** Next EMI date, or the maturity date for bullet loans. Null once finished. */
  nextDueDate: Date | null;
  /** Instalment number of nextDueDate (EMI loans). */
  nextInstalment: number;
  /** Amount due on nextDueDate (EMI, or principal + interest at maturity). */
  nextDueAmount: number;
  /** Last EMI date, or maturity date for bullet loans. */
  endDate: Date | null;
  /** Number of the last EMI (tenure, or earlier if the EMI pays the loan off sooner). */
  lastInstalment: number;
  /** EMIs left (EMI loans) or whole months to maturity (bullet loans). */
  monthsLeft: number;
  /** Bullet loan past its maturity date but not closed: needs renewal or closure. */
  isMatured: boolean;
  daysOverdue: number;
  /** Interest avoided through prepayments on this loan. */
  interestSaved: number;
}

export interface DueItem {
  key: string;
  /** Loan or policy id. */
  id: string;
  kind: DueKind;
  name: string;
  /** "EMI 13 of 36 · auto-debit", "Maturity · principal + interest", "Premium · yearly" */
  meta: string;
  amount: number;
  date: Date;
  daysLeft: number;
  tone: Tone;
}

export interface InsuranceSummary {
  id: string;
  name: string;
  premium: number;
  frequency: string;
  nextDue: Date | null;
  daysLeft: number | null;
}

export interface MaturityItem {
  id: string;
  name: string;
  date: Date;
  amount: number;
  overdue: boolean;
}

export interface MonthSummary {
  monthName: string;
  dayOfMonth: number;
  daysInMonth: number;
  /** EMIs and premiums whose date this month has arrived (treated as paid, like the Calendar). */
  cleared: number;
  /** All EMIs and premiums scheduled this month. Bullet maturities are listed separately. */
  committed: number;
  left: number;
  leftCount: number;
  /** cleared / committed, 0-100. */
  clearedPct: number;
  nextDate: Date | null;
  emiTotal: number;
  premiumTotal: number;
  maturities: MaturityItem[];
  /** Prepayments / settlements made this month (regular EMI records excluded). */
  prepaidThisMonth: number;
  spent: number;
  budget: number;
  budgetIsDefault: boolean;
  budgetUsedPct: number;
  budgetLeft: number;
  perDayLeft: number;
  daysLeftInMonth: number;
  /** Share of the month elapsed, 0-100 (for the pace marker). */
  monthElapsedPct: number;
  budgetTone: Tone;
}

export interface PortfolioTotals {
  principalOutstanding: number;
  interestOutstanding: number;
  totalPayable: number;
  /** Original principal of active loans. */
  principalBorrowed: number;
  principalRepaid: number;
  /** principalRepaid / principalBorrowed, 0-100. */
  repaidPct: number;
  emisPerMonth: number;
  activeCount: number;
  /** Interest avoided through prepayments across active loans. */
  interestSaved: number;
  /** Last scheduled payment date; null when unknown (e.g. only matured loans remain). */
  debtFreeDate: Date | null;
  monthsToDebtFree: number;
}

export interface Insight {
  key: string;
  icon: string;
  tone: Tone | "ai";
  text: string;
  route: string;
  params?: Record<string, string>;
}

export interface StatusLine {
  text: string;
  tone: Tone;
}

export interface DashboardData {
  loading: boolean;
  refreshing: boolean;
  /** Set when the last load failed; earlier data (if any) is kept on screen. */
  error: string | null;
  /** True once at least one load has succeeded. */
  hasData: boolean;
  notConfigured: boolean;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  firstName: string;
  greeting: string;
  todayLabel: string;
  windowEnd: Date;
  /** Active loans, most urgent first. */
  loans: LoanSummary[];
  closedLoanCount: number;
  /** Policies, soonest premium first. */
  insurances: InsuranceSummary[];
  insuranceAnnualTotal: number;
  /** Everything due in the next 15 days (today included), soonest first. */
  dues: DueItem[];
  duesTotal: number;
  /** First item after the 15-day window, for the empty state. */
  nextBeyondWindow: DueItem | null;
  /** Active bullet loans past maturity. */
  maturedLoans: LoanSummary[];
  overdueTotal: number;
  status: StatusLine;
  insights: Insight[];
  totals: PortfolioTotals;
  month: MonthSummary;
  hasLoans: boolean;
  isNewUser: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface RawData {
  loans: any[];
  payments: any[];
  insurances: any[];
  transactions: any[];
  budgetLimit: number;
  budgetIsDefault: boolean;
}

const EMPTY_RAW: RawData = {
  loans: [],
  payments: [],
  insurances: [],
  transactions: [],
  budgetLimit: 50000,
  budgetIsDefault: true,
};

export const DUE_WINDOW_DAYS = 15;
const PREPAY_EXAMPLE = 10000;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

const isValidDate = (d: Date | null | undefined): d is Date => !!d && !isNaN(d.getTime());

const safeLocalDate = (value: unknown): Date | null => {
  if (!value) return null;
  const d = parseLocalDate(value);
  return isValidDate(d) ? d : null;
};

const frequencyLabel = (frequency: string) => {
  if (frequency === "monthly") return "monthly";
  if (frequency === "quarterly") return "quarterly";
  if (frequency === "half-yearly") return "half-yearly";
  return "yearly";
};

/** How many EMIs it takes to clear the loan (an EMI above the formula clears it early). */
const instalmentsToClear = (principal: number, ratePct: number, emi: number, tenure: number) => {
  const r = ratePct / 1200;
  if (emi <= 0 || principal <= 0) return tenure;
  let p = principal;
  for (let k = 1; k <= tenure; k++) {
    p -= Math.min(p, emi - p * r);
    if (p <= 0.01) return k;
  }
  return tenure;
};

/** Interest avoided by paying `extra` now on a reducing-balance loan with a fixed EMI. */
const interestSavedByPrepaying = (balance: number, ratePct: number, emi: number, extra: number) => {
  const r = ratePct / 1200;
  if (r <= 0 || emi <= 0 || balance <= 0) return 0;
  const interestUntilClosed = (start: number) => {
    let p = start;
    let total = 0;
    for (let i = 0; i < 1200 && p > 0.01; i++) {
      const interest = p * r;
      if (emi <= interest) return Infinity;
      total += interest;
      p -= Math.min(p, emi - interest);
    }
    return total;
  };
  const before = interestUntilClosed(balance);
  const after = interestUntilClosed(Math.max(0, balance - extra));
  return Number.isFinite(before) && Number.isFinite(after) ? Math.max(0, before - after) : 0;
};

const dueTone = (kind: DueKind, daysLeft: number): Tone => {
  if (daysLeft <= 0) return kind === "emi" ? "warning" : "critical";
  if (daysLeft === 1) return "warning";
  if (kind === "bullet" && daysLeft <= 7) return "warning";
  return "neutral";
};

/** Share of the term elapsed: by days for bullet loans (they mature on a date), by EMIs otherwise. */
const termElapsed = (
  kind: LoanKind,
  start: Date | null,
  end: Date | null,
  monthsElapsed: number,
  tenure: number,
  today: Date,
) => {
  if (kind === "bullet" && start && end && end > start) {
    const pct = ((today.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100;
    return Math.min(100, Math.max(0, pct));
  }
  return tenure > 0 ? Math.min(100, Math.max(0, (Math.min(monthsElapsed, tenure) / tenure) * 100)) : 0;
};

const summarizeLoan = (loan: any, payments: any[], today: Date): LoanSummary => {
  const principal = toNumber(loan.principal);
  const rate = toNumber(loan.interest);
  const tenure = Math.max(0, Math.round(toNumber(loan.tenure)));
  const kind: LoanKind = loan.loanType === "bullet" ? "bullet" : "emi";
  const start = safeLocalDate(loan.startDate);
  const monthsElapsed = start ? getMonthsElapsed(start, today) : 0;

  const breakdown = calculateEMIBreakdown(
    principal,
    rate,
    tenure,
    monthsElapsed,
    toNumber(loan.emiAmount),
    kind,
    payments.filter((p) => p.loanId === loan.id),
    start,
  );
  const emi = kind === "emi" ? toNumber(breakdown.emi) : 0;

  let nextDueDate: Date | null = null;
  let nextInstalment = 0;
  let nextDueAmount = 0;
  let endDate: Date | null = null;
  let lastInstalment = 0;
  let monthsLeft = 0;
  let isMatured = false;
  let daysOverdue = 0;

  if (start && kind === "bullet") {
    endDate = getBulletMaturityDate(loan.startDate, tenure);
    const daysToMaturity = daysFromToday(endDate);
    isMatured = daysToMaturity < 0 && breakdown.remainingAmount > 0;
    daysOverdue = isMatured ? -daysToMaturity : 0;
    nextDueDate = endDate;
    nextDueAmount = breakdown.remainingAmount > 0 ? breakdown.remainingAmount : breakdown.totalAmount;
    monthsLeft = Math.max(0, monthsBetween(today, endDate as Date));
  } else if (start && tenure > 0) {
    // EMI #k falls on start + (k - 1) months (clamped to month end), matching calculateLoanStats.
    lastInstalment = instalmentsToClear(principal, rate, emi, tenure);
    endDate = addMonthsClamped(start, lastInstalment - 1);
    let k = Math.max(1, monthsBetween(start, today) + 1);
    if (addMonthsClamped(start, k - 1) < today) k += 1;
    if (k <= lastInstalment) {
      nextInstalment = k;
      nextDueDate = addMonthsClamped(start, k - 1);
      nextDueAmount = emi;
    }
    monthsLeft = Math.max(0, lastInstalment - (k - 1));
  }

  const remainingPrincipal = Math.max(0, breakdown.remainingPrincipalAmount);
  return {
    id: String(loan.id),
    name: loan.loanName || "Unnamed loan",
    kind,
    rate,
    principal,
    tenure,
    emi,
    startDate: start,
    emiDay: start && kind === "emi" ? start.getDate() : null,
    remainingPrincipal,
    remainingInterest: Math.max(0, breakdown.remainingInterestAmount),
    remainingAmount: Math.max(0, breakdown.remainingAmount),
    repaidPct:
      principal > 0
        ? Math.min(100, Math.max(0, ((principal - remainingPrincipal) / principal) * 100))
        : 0,
    termElapsedPct: termElapsed(kind, start, endDate, monthsElapsed, tenure, today),
    nextDueDate,
    nextInstalment,
    nextDueAmount,
    endDate,
    lastInstalment,
    monthsLeft,
    isMatured,
    daysOverdue,
    interestSaved: Math.max(0, toNumber(breakdown.interestSaved)),
  };
};

/** Premium dates are start + n × step months (clamped), so they never drift after a short month. */
const insuranceOccurrence = (start: Date, step: number, n: number) => addMonthsClamped(start, n * step);
const insuranceStepMonths = (frequency: string) => getPremiumStepMonths(frequency);

const summarizeInsurance = (ins: any, today: Date): InsuranceSummary => {
  let nextDue: Date | null = null;
  const start = safeLocalDate(ins.startDate);
  if (start) {
    const step = insuranceStepMonths(ins.frequency);
    let n = Math.max(0, Math.floor(monthsBetween(start, today) / step));
    while (insuranceOccurrence(start, step, n) < today) n += 1;
    nextDue = insuranceOccurrence(start, step, n);
  }
  return {
    id: String(ins.id),
    name: ins.name || "Unnamed policy",
    premium: toNumber(ins.premiumAmount),
    frequency: ins.frequency || "yearly",
    nextDue,
    daysLeft: nextDue ? daysFromToday(nextDue) : null,
  };
};

/** The policy's premium date that falls in the given month, if any. */
const insuranceOccurrenceInMonth = (ins: any, year: number, monthIndex: number): Date | null => {
  const start = safeLocalDate(ins.startDate);
  if (!start) return null;
  const step = insuranceStepMonths(ins.frequency);
  const offset = monthsBetween(start, new Date(year, monthIndex, 1));
  if (offset < 0 || offset % step !== 0) return null;
  return insuranceOccurrence(start, step, offset / step);
};

const byDate = (a: Date | null, b: Date | null) =>
  (a ? a.getTime() : Number.MAX_SAFE_INTEGER) - (b ? b.getTime() : Number.MAX_SAFE_INTEGER);

// ── Derivation ──────────────────────────────────────────────────────────────

export function deriveDashboard(raw: RawData, firstName = "", hasData = true) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const monthIndex = today.getMonth();
  const monthDays = daysInMonth(year, monthIndex);
  const windowEnd = new Date(year, monthIndex, today.getDate() + DUE_WINDOW_DAYS);

  const activeRaw = raw.loans.filter((l) => l.status !== "closed");
  const summaries = activeRaw.map((l) => summarizeLoan(l, raw.payments, today));
  const loans = [...summaries].sort((a, b) => {
    if (a.isMatured !== b.isMatured) return a.isMatured ? -1 : 1;
    if (a.isMatured && b.isMatured) return b.daysOverdue - a.daysOverdue;
    return byDate(a.nextDueDate, b.nextDueDate) || a.name.localeCompare(b.name);
  });
  const insurances = raw.insurances
    .map((i) => summarizeInsurance(i, today))
    .sort((a, b) => byDate(a.nextDue, b.nextDue));

  // ── Upcoming items (one next date per loan / policy) ─────────────────────
  const upcoming: DueItem[] = [];
  summaries.forEach((l) => {
    if (!l.nextDueDate || l.isMatured || l.nextDueAmount <= 0) return;
    if (l.kind === "bullet" && l.remainingAmount <= 0) return;
    const daysLeft = daysFromToday(l.nextDueDate);
    if (daysLeft < 0) return;
    upcoming.push({
      key: `${l.kind}-${l.id}`,
      id: l.id,
      kind: l.kind,
      name: l.name,
      meta:
        l.kind === "emi"
          ? `EMI ${l.nextInstalment} of ${l.lastInstalment} · auto-debit`
          : "Maturity · principal + interest",
      amount: l.nextDueAmount,
      date: l.nextDueDate,
      daysLeft,
      tone: dueTone(l.kind, daysLeft),
    });
  });
  insurances.forEach((i) => {
    if (!i.nextDue || i.daysLeft === null || i.premium <= 0) return;
    upcoming.push({
      key: `insurance-${i.id}`,
      id: i.id,
      kind: "insurance",
      name: i.name,
      meta: `Premium · ${frequencyLabel(i.frequency)}`,
      amount: i.premium,
      date: i.nextDue,
      daysLeft: i.daysLeft,
      tone: dueTone("insurance", i.daysLeft),
    });
  });
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime() || b.amount - a.amount);
  const dues = upcoming.filter((d) => d.daysLeft <= DUE_WINDOW_DAYS);
  const duesTotal = dues.reduce((s, d) => s + d.amount, 0);
  const nextBeyondWindow = upcoming.find((d) => d.daysLeft > DUE_WINDOW_DAYS) || null;

  const maturedLoans = loans.filter((l) => l.isMatured);
  const overdueTotal = maturedLoans.reduce((s, l) => s + l.remainingAmount, 0);

  // ── This month ───────────────────────────────────────────────────────────
  let emiTotal = 0;
  let premiumTotal = 0;
  let cleared = 0;
  let leftCount = 0;
  let nextDate: Date | null = null;
  const noteNext = (d: Date) => {
    if (!nextDate || d < nextDate) nextDate = d;
  };
  const maturities: MaturityItem[] = [];
  const monthStart = new Date(year, monthIndex, 1);

  summaries.forEach((summary) => {
    if (!summary.startDate) return;
    if (summary.kind === "emi") {
      const k = monthsBetween(summary.startDate, monthStart) + 1;
      if (k < 1 || k > summary.lastInstalment || summary.emi <= 0) return;
      const due = addMonthsClamped(summary.startDate, k - 1);
      emiTotal += summary.emi;
      if (due <= today) {
        cleared += summary.emi;
      } else {
        leftCount += 1;
        noteNext(due);
      }
    } else if (
      summary.endDate &&
      summary.endDate.getFullYear() === year &&
      summary.endDate.getMonth() === monthIndex &&
      summary.remainingAmount > 0
    ) {
      maturities.push({
        id: summary.id,
        name: summary.name,
        date: summary.endDate,
        amount: summary.nextDueAmount,
        overdue: summary.isMatured,
      });
    }
  });
  raw.insurances.forEach((ins) => {
    const premium = toNumber(ins.premiumAmount);
    const occurrence = insuranceOccurrenceInMonth(ins, year, monthIndex);
    if (!occurrence || premium <= 0) return;
    premiumTotal += premium;
    if (occurrence < today) {
      cleared += premium;
    } else {
      leftCount += 1;
      noteNext(occurrence);
    }
  });
  const committed = emiTotal + premiumTotal;

  const loanById = new Map(raw.loans.map((l) => [l.id, l]));
  const emiById = new Map(summaries.map((l) => [l.id, l.emi]));
  const prepaidThisMonth = raw.payments
    .filter((p) => {
      const loan = loanById.get(p.loanId);
      if (!countsTowardBalance(p, loan?.loanType === "bullet" ? "bullet" : "emi", emiById.get(String(p.loanId)) || toNumber(loan?.emiAmount))) return false;
      const d = parseLocalDate(getPaymentDate(p));
      return !isNaN(d.getTime()) && d.getMonth() === monthIndex && d.getFullYear() === year;
    })
    .reduce((s, p) => s + toNumber(p.amount), 0);

  // Same filter as the Spend Tracker's monthly budget.
  const spent = raw.transactions
    .filter((t) => {
      const d = new Date(t.date);
      return (
        (t.type || "").toLowerCase() !== "credit" &&
        t.category !== "Credit Card Bill" &&
        t.calculate_budget !== false &&
        d.getMonth() === monthIndex &&
        d.getFullYear() === year
      );
    })
    .reduce((sum, t) => sum + toNumber(t.amount), 0);
  const budget = raw.budgetLimit > 0 ? raw.budgetLimit : 0;
  const daysLeftInMonth = monthDays - today.getDate() + 1;
  const budgetUsedPct = budget > 0 ? (spent / budget) * 100 : 0;

  const month: MonthSummary = {
    monthName: MONTH_NAMES[monthIndex],
    dayOfMonth: today.getDate(),
    daysInMonth: monthDays,
    cleared,
    committed,
    left: committed - cleared,
    leftCount,
    clearedPct: committed > 0 ? (cleared / committed) * 100 : 0,
    nextDate,
    emiTotal,
    premiumTotal,
    maturities,
    prepaidThisMonth,
    spent,
    budget,
    budgetIsDefault: raw.budgetIsDefault,
    budgetUsedPct,
    budgetLeft: budget - spent,
    perDayLeft: Math.max(0, budget - spent) / Math.max(1, daysLeftInMonth),
    daysLeftInMonth,
    monthElapsedPct: (today.getDate() / monthDays) * 100,
    // Same thresholds as the Spend Tracker's caution (90%) and alert (100%) banners.
    budgetTone: budgetUsedPct > 100 ? "critical" : budgetUsedPct >= 90 ? "warning" : "positive",
  };

  // ── Portfolio (summed from the same per-loan figures the rows show) ──────
  const principalBorrowed = summaries.reduce((s, l) => s + l.principal, 0);
  const principalOutstanding = summaries.reduce((s, l) => s + l.remainingPrincipal, 0);
  const principalRepaid = Math.max(0, principalBorrowed - principalOutstanding);
  const debtFreeDate = summaries
    .filter((l) => l.remainingAmount > 0 && l.endDate && !l.isMatured && l.endDate >= today)
    .reduce<Date | null>((max, l) => (!max || (l.endDate as Date) > max ? l.endDate : max), null);
  const totals: PortfolioTotals = {
    principalOutstanding,
    interestOutstanding: summaries.reduce((s, l) => s + l.remainingInterest, 0),
    totalPayable: summaries.reduce((s, l) => s + l.remainingAmount, 0),
    principalBorrowed,
    principalRepaid,
    repaidPct: principalBorrowed > 0 ? (principalRepaid / principalBorrowed) * 100 : 0,
    emisPerMonth: summaries
      .filter((l) => l.kind === "emi" && l.nextDueDate)
      .reduce((s, l) => s + l.emi, 0),
    activeCount: summaries.length,
    interestSaved: summaries.reduce((s, l) => s + l.interestSaved, 0),
    debtFreeDate,
    monthsToDebtFree: debtFreeDate ? Math.max(0, monthsBetween(today, debtFreeDate)) : 0,
  };

  const insuranceAnnualTotal = insurances.reduce((s, i) => {
    const perYear =
      i.frequency === "monthly" ? 12 : i.frequency === "quarterly" ? 4 : i.frequency === "half-yearly" ? 2 : 1;
    return s + i.premium * perYear;
  }, 0);

  // ── Status line: the single most urgent fact ─────────────────────────────
  const hasLoans = summaries.length > 0;
  const isNewUser = hasData && raw.loans.length === 0 && raw.insurances.length === 0;
  let status: StatusLine;
  const dueToday = dues.filter((d) => d.daysLeft === 0);
  const dueTomorrow = dues.filter((d) => d.daysLeft === 1);
  if (maturedLoans.length === 1) {
    const l = maturedLoans[0];
    status = {
      text: `${l.name} matured ${l.daysOverdue === 1 ? "yesterday" : `${l.daysOverdue} days ago`}`,
      tone: "critical",
    };
  } else if (maturedLoans.length > 1) {
    status = { text: `${maturedLoans.length} bullet loans are past maturity`, tone: "critical" };
  } else if (dueToday.length > 0) {
    status = {
      text: `${formatINR(dueToday.reduce((s, d) => s + d.amount, 0))} due today`,
      tone: dueToday.some((d) => d.kind !== "emi") ? "critical" : "warning",
    };
  } else if (dueTomorrow.length > 0) {
    status = { text: `${formatINR(dueTomorrow.reduce((s, d) => s + d.amount, 0))} due tomorrow`, tone: "warning" };
  } else if (dues.length > 0) {
    status = { text: `Next: ${dues[0].name} ${formatRelativeDays(dues[0].daysLeft).toLowerCase()}`, tone: "neutral" };
  } else if (!hasData) {
    status = { text: "Couldn't load your data", tone: "warning" };
  } else if (!isNewUser) {
    status = { text: `No payments due in the next ${DUE_WINDOW_DAYS} days`, tone: "positive" };
  } else {
    status = { text: "Let's set up your dashboard", tone: "neutral" };
  }

  // ── Insights: deterministic, first two rules that apply ──────────────────
  const insights: Insight[] = [];
  const upcomingMaturity = summaries
    .filter((l) => l.kind === "bullet" && !l.isMatured && l.endDate && l.remainingAmount > 0)
    .map((l) => ({ l, days: daysFromToday(l.endDate) }))
    .filter((x) => x.days > DUE_WINDOW_DAYS && x.days <= 45)
    .sort((a, b) => a.days - b.days)[0];
  if (upcomingMaturity) {
    insights.push({
      key: "maturity",
      icon: "hourglass-outline",
      tone: "warning",
      text: `${upcomingMaturity.l.name} matures on ${formatDateWithDay(upcomingMaturity.l.endDate)}. Keep ${formatINR(upcomingMaturity.l.nextDueAmount)} ready.`,
      route: "/maturity-alerts",
    });
  }
  if (budget > 0 && spent > budget) {
    insights.push({
      key: "budget-over",
      icon: "alert-circle-outline",
      tone: "critical",
      text: `You're ${formatINR(spent - budget)} over your ${MONTH_NAMES[monthIndex]} budget.`,
      route: "/spend-tracker",
    });
  } else if (budget > 0 && today.getDate() >= 5) {
    const projected = (spent / today.getDate()) * monthDays;
    if (projected > budget * 1.05) {
      insights.push({
        key: "budget-pace",
        icon: "trending-up-outline",
        tone: "warning",
        text: `At this pace you'll spend about ${formatINR(projected)} this month, above your ${formatINR(budget)} budget.`,
        route: "/spend-tracker",
      });
    }
  }
  const costliest = summaries
    .filter((l) => l.kind === "emi" && l.remainingPrincipal > PREPAY_EXAMPLE && l.rate > 0)
    .sort((a, b) => b.rate - a.rate)[0];
  if (costliest) {
    const saving = interestSavedByPrepaying(costliest.remainingPrincipal, costliest.rate, costliest.emi, PREPAY_EXAMPLE);
    if (saving >= 100) {
      insights.push({
        key: "prepay",
        icon: "flash-outline",
        tone: "positive",
        text: `Prepaying ${formatINR(PREPAY_EXAMPLE)} on ${costliest.name} (${formatPercent(costliest.rate, 2)}) could save about ${formatINR(saving)} in interest.`,
        route: "/debt-free",
      });
    }
  }
  const nearlyDone = summaries
    .filter((l) => l.kind === "emi" && l.nextDueDate && l.monthsLeft > 0 && l.monthsLeft <= 3)
    .sort((a, b) => a.monthsLeft - b.monthsLeft)[0];
  if (nearlyDone) {
    insights.push({
      key: "nearly-done",
      icon: "flag-outline",
      tone: "positive",
      text: `${nearlyDone.name} has ${nearlyDone.monthsLeft} EMI${nearlyDone.monthsLeft === 1 ? "" : "s"} left. The last one is on ${formatDateWithDay(nearlyDone.endDate)}.`,
      route: "/loan-detail",
      params: { id: nearlyDone.id },
    });
  }
  if (hasLoans && totals.debtFreeDate && maturedLoans.length === 0) {
    insights.push({
      key: "debt-free",
      icon: "rocket-outline",
      tone: "ai",
      text: `On track to be debt-free by ${formatMonthYear(totals.debtFreeDate)}. See how extra payments bring it closer.`,
      route: "/debt-free",
    });
  }
  if (!hasLoans && hasData) {
    insights.push({
      key: "ask-ai",
      icon: "sparkles-outline",
      tone: "ai",
      text: "Ask the AI Advisor to plan a budget or compare loan offers.",
      route: "/ai-advisor",
    });
  }

  return {
    firstName,
    greeting: `${getGreeting(now)}${firstName ? `, ${firstName}` : ""}`,
    todayLabel: formatDateWithDay(today),
    windowEnd,
    loans,
    closedLoanCount: raw.loans.length - activeRaw.length,
    insurances,
    insuranceAnnualTotal,
    dues,
    duesTotal,
    nextBeyondWindow,
    maturedLoans,
    overdueTotal,
    status,
    insights: insights.slice(0, 2),
    totals,
    month,
    hasLoans,
    isNewUser,
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Loads everything the dashboard needs and derives display-ready values.
 * Shows the skeleton only on the first load; later reloads refresh silently,
 * and a failed reload keeps the last good data on screen.
 */
export function useDashboardData(): DashboardData {
  const [raw, setRaw] = useState<RawData>(EMPTY_RAW);
  const [hasData, setHasData] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasLoadedOnce = useRef(false);
  const loadedDay = useRef("");
  const remindersDay = useRef("");

  const load = useCallback(async () => {
    try {
      const [loans, payments, insurances, transactions, budgetLimit, budgetRaw, config, user] =
        await Promise.all([
          getLoans({ strict: true }),
          getPayments({ strict: true }),
          getInsurances({ strict: true }),
          getTransactions(undefined, { strict: true }),
          getBudgetLimit(),
          AsyncStorage.getItem("@budget_limit").catch(() => null),
          getSupabaseConfig().catch(() => ({ url: "", key: "" })),
          getAuthUser().catch(() => null),
        ]);
      setRaw({
        loans: loans || [],
        payments: payments || [],
        insurances: insurances || [],
        transactions: transactions || [],
        budgetLimit: toNumber(budgetLimit),
        budgetIsDefault: budgetRaw === null,
      });
      setHasData(true);
      setNotConfigured(!config?.url || !config?.key);
      setFirstName(String(user?.name || "").trim().split(/\s+/)[0] || "");
      setLastUpdated(new Date());
      setError(null);
      loadedDay.current = new Date().toDateString();
      // Reminders are dated a few occurrences ahead; top them up once a day.
      if (remindersDay.current !== loadedDay.current) {
        remindersDay.current = loadedDay.current;
        refreshAllNotifications(loans || [], insurances || []).catch(() => {});
      }
    } catch (e: any) {
      console.error("Error loading dashboard data:", e);
      setError("Couldn't refresh. Check your connection and try again.");
    } finally {
      hasLoadedOnce.current = true;
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce.current) setLoading(true);
      load();
    }, [load]),
  );

  // Coming back to the app on a new day: refresh so "today", dues and the month roll over.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && loadedDay.current && loadedDay.current !== new Date().toDateString()) {
        load();
      }
    });
    return () => sub.remove();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const derived = useMemo(() => deriveDashboard(raw, firstName, hasData), [raw, firstName, hasData]);

  return { loading, refreshing, error, hasData, notConfigured, lastUpdated, refresh, ...derived };
}

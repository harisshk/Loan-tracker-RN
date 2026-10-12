/**
 * Advanced EMI Breakdown Engine (V4 - Bank Grade)
 * 1. Amortization (Reducing Balance Method)
 * 2. Precise Extra Payment Integration (Interest Cascading)
 * 3. Exact Interest Savings Calculation
 */

/**
 * Safely parse a date string (YYYY-MM-DD or ISO) into local date object (local midnight) without UTC timezone distortion
 */
export const parseLocalDate = (dateStr) => {
  if (!dateStr) return new Date();
  if (typeof dateStr === "string") {
    const clean = dateStr.split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day);
      }
    }
  }
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * Format a Date object as local YYYY-MM-DD string without timezone skew
 */
export const toLocalISOString = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Calculates the exact renewal/maturity date for a bullet loan.
 * In banking and gold loans: A tenure of T months starting on Day X ends on Day X - 1
 * after T months.
 * Example: Loan taken on 5th Jan for 12 months renews/matures on 4th Jan of next year.
 */
export const getBulletMaturityDate = (startDateStr, tenureMonths) => {
  const start = parseLocalDate(startDateStr);
  const tenure = parseInt(tenureMonths, 10) || 0;
  return new Date(
    start.getFullYear(),
    start.getMonth() + tenure,
    start.getDate() - 1,
  );
};

// ── Shared schedule helpers ─────────────────────────────────────────────────
// Every screen should use these so EMI and premium dates agree everywhere.

export const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

/**
 * `date` moved by `months`, keeping its day but clamping to the month's last day
 * (31 Jan + 1 month = 28/29 Feb, not 3 Mar).
 */
export const addMonthsClamped = (date, months) => {
  const d = date instanceof Date ? date : parseLocalDate(date);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const day = Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
  return new Date(target.getFullYear(), target.getMonth(), day);
};

/** Due date of EMI #k (1-based). EMI #1 falls on the start date. */
export const getInstalmentDate = (startDate, k) => addMonthsClamped(parseLocalDate(startDate), k - 1);

/**
 * Number of EMIs whose due date has arrived on `asOf` (inclusive). An EMI counts
 * as paid on its due date, clamped to month end for 29th-31st start dates.
 */
export const getMonthsElapsed = (startDate, asOf = new Date()) => {
  const start = parseLocalDate(startDate);
  const d = asOf instanceof Date ? asOf : parseLocalDate(asOf);
  let months = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
  const dueDay = Math.min(start.getDate(), daysInMonth(d.getFullYear(), d.getMonth()));
  if (d.getDate() >= dueDay) months += 1;
  return Math.max(0, months);
};

/** Next EMI on or after `asOf`: { number, date }, or null once the tenure is over. */
export const getNextInstalment = (startDate, tenure, asOf = new Date()) => {
  const start = parseLocalDate(startDate);
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  let k = Math.max(1, (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()) + 1);
  if (getInstalmentDate(start, k) < today) k += 1;
  const n = parseInt(tenure, 10) || 0;
  return k <= n ? { number: k, date: getInstalmentDate(start, k) } : null;
};

const PREMIUM_STEP = { monthly: 1, quarterly: 3, "half-yearly": 6, yearly: 12 };
export const getPremiumStepMonths = (frequency) => PREMIUM_STEP[frequency] || 12;

/** Next premium date on or after `asOf` (start + n x step months, never drifting). */
export const getNextPremiumDate = (startDate, frequency, asOf = new Date()) => {
  if (!startDate) return null;
  const start = parseLocalDate(startDate);
  if (isNaN(start.getTime())) return null;
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const step = getPremiumStepMonths(frequency);
  const months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  let n = Math.max(0, Math.floor(months / step));
  while (addMonthsClamped(start, n * step) < today) n += 1;
  return addMonthsClamped(start, n * step);
};

// ── Payments ────────────────────────────────────────────────────────────────

/**
 * prepayment: extra money towards principal (reduces the balance)
 * emi:        a regular EMI recorded for history (the schedule already counts it)
 * settlement: closing / renewal payment (reduces the balance)
 */
export const PAYMENT_KINDS = ["prepayment", "emi", "settlement"];

export const getPaymentDate = (p) => (p ? p.date || p.paidAt || p.createdAt || null : null);

const toAmount = (val) => parseFloat(String(val || "0").replace(/,/g, "")) || 0;

/**
 * Whether a logged payment reduces the loan balance. Tagged payments follow their kind.
 * Older untagged payments: always for bullet loans; for EMI loans unless the amount
 * equals one EMI (those were recorded from the Spend Tracker as regular EMIs).
 */
export const countsTowardBalance = (p, loanType = "emi", emi = 0) => {
  if (!p || toAmount(p.amount) <= 0 || !getPaymentDate(p)) return false;
  if (p.kind) return p.kind !== "emi";
  if (loanType === "bullet") return true;
  return !(emi > 0 && Math.abs(toAmount(p.amount) - emi) <= 1);
};

/**
 * @param {number} principal
 * @param {number} annualInterest
 * @param {number} tenure
 * @param {number} monthsElapsed
 * @param {number|null} [userEMI]
 * @param {string} [loanType]
 * @param {any[]} [extraPayments]
 * @param {string|Date|null} [startDate] lets prepayments apply from the month they were made
 */
export const calculateEMIBreakdown = (
  principal,
  annualInterest,
  tenure,
  monthsElapsed,
  userEMI = null,
  loanType = "emi",
  extraPayments = [],
  startDate = null,
) => {
  const monthlyRate = annualInterest / 12 / 100;
  const elapsed = monthsElapsed > 0 ? monthsElapsed : 0;

  // --- BULLET / GOLD LOAN LOGIC (Simple Interest is standard here) ---
  if (loanType === "bullet") {
    const totalInterest = principal * (annualInterest / 100) * (tenure / 12);
    const monthlyInterest = (principal * (annualInterest / 100)) / 12;
    const totalAmount = principal + totalInterest;
    const totalPaid = (extraPayments || [])
      .filter((p) => countsTowardBalance(p, "bullet"))
      .reduce((s, p) => s + toAmount(p.amount), 0);

    const interestPaid = Math.min(totalPaid, totalInterest);
    const principalPaid = Math.max(0, totalPaid - totalInterest);
    const remainingPrincipal = Math.max(0, principal - principalPaid);
    const remainingInterest = Math.max(0, totalInterest - interestPaid);

    return {
      emi: 0,
      monthlyInterest,
      principalPaid,
      interestPaid,
      totalPaid,
      extraPaid: totalPaid,
      interestSaved: 0,
      remainingAmount: remainingPrincipal + remainingInterest,
      remainingPrincipalAmount: remainingPrincipal,
      remainingInterestAmount: remainingInterest,
      totalInterest,
      totalAmount,
      isMatured: monthsElapsed >= tenure,
      paymentsMade: Math.min(monthsElapsed, tenure),
    };
  }

  // --- REGULAR EMI LOAN LOGIC (Reducing Balance) ---
  const emi =
    userEMI ||
    (monthlyRate === 0
      ? principal / tenure
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
        (Math.pow(1 + monthlyRate, tenure) - 1));

  // Each counted prepayment applies right after the last EMI due on or before its
  // date, so the interest it saves keeps cascading into later EMIs. Without a start
  // date it applies at the current point.
  const prepayments = (extraPayments || [])
    .filter((p) => countsTowardBalance(p, "emi", emi))
    .map((p) => {
      const afterEmi = startDate ? getMonthsElapsed(startDate, parseLocalDate(getPaymentDate(p))) : elapsed;
      return { amount: toAmount(p.amount), afterEmi: Number.isFinite(afterEmi) ? Math.min(afterEmi, elapsed) : elapsed };
    });

  const simulate = (withPrepayments) => {
    let balance = principal;
    let interestPaid = 0;
    let extraPaid = 0;
    let snapshot = null;
    const applyAfter = (m) => {
      if (!withPrepayments) return;
      prepayments.forEach((p) => {
        if (p.afterEmi !== m || balance <= 0.01) return;
        const amt = Math.min(balance, p.amount);
        balance -= amt;
        extraPaid += amt;
      });
    };
    const take = () => ({ balance: Math.max(0, balance), interestPaid, extraPaid });

    applyAfter(0);
    if (elapsed === 0) snapshot = take();
    let interestAfter = 0;
    const maxMonths = Math.max(tenure * 2, 1);
    for (let m = 1; m <= maxMonths && balance > 0.01; m++) {
      const interest = balance * monthlyRate;
      const fromEmi = Math.max(0, Math.min(balance, emi - interest));
      balance -= fromEmi;
      if (m <= elapsed) interestPaid += interest;
      else interestAfter += interest;
      if (m <= elapsed) applyAfter(m);
      if (m === elapsed) snapshot = take();
    }
    // Paid off before `elapsed` months: the loan is finished.
    if (!snapshot) snapshot = take();
    return { ...snapshot, interestRemaining: interestAfter };
  };

  const actual = simulate(true);
  const baseline = prepayments.length ? simulate(false) : actual;
  const remainingPrincipal = actual.balance;
  const principalPaid = principal - remainingPrincipal;
  const totalInterest = actual.interestPaid + actual.interestRemaining;

  return {
    emi,
    principalPaid,
    interestPaid: actual.interestPaid,
    totalPaid: principalPaid + actual.interestPaid,
    extraPaid: actual.extraPaid,
    interestSaved: Math.max(0, baseline.interestPaid + baseline.interestRemaining - totalInterest),
    remainingAmount: remainingPrincipal + actual.interestRemaining,
    remainingPrincipalAmount: remainingPrincipal,
    remainingInterestAmount: actual.interestRemaining,
    totalInterest,
    totalAmount: principal + totalInterest,
    isMatured: monthsElapsed >= tenure || remainingPrincipal <= 0,
    paymentsMade: Math.min(monthsElapsed, tenure),
  };
};

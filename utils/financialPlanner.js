/**
 * 12-Month Financial Planning Engine
 *
 * Rules:
 *  - Bullet loans > EMI loans for prepayment priority
 *  - Higher interest → higher priority
 *  - Smaller principal → higher priority (faster closure)
 *  - Always maintain minimumSavings (never zero)
 *  - Never use savings to pay loans
 *  - Never skip EMI
 *  - EMI loans: always pay EMI; do NOT prepay until most bullet loans cleared
 */

/**
 * Sort active loans by priority:
 *  1. Bullet > EMI
 *  2. Higher interest rate first
 *  3. Smaller remaining principal first (faster closure)
 */
const sortByPriority = (loanStates) =>
  [...loanStates]
    .filter((l) => !l.closed)
    .sort((a, b) => {
      if (a.loanType !== b.loanType)
        return a.loanType === 'bullet' ? -1 : 1;
      if (b.interest !== a.interest) return b.interest - a.interest;
      return a.remainingPrincipal - b.remainingPrincipal;
    });

/**
 * Main planner function.
 *
 * @param {Object} opts
 * @param {Array}  opts.loans              - Raw loan objects from storage
 * @param {Array}  opts.insurances         - Raw insurance objects from storage
 * @param {number} opts.salaryMonthly      - Monthly salary
 * @param {number} opts.rentMonthly        - Monthly rent income (0 if none)
 * @param {number} opts.livingExpensesMonthly
 * @param {number} opts.minimumSavings     - Minimum to save each month
 * @returns {Array} 12 month plan objects
 */
export function generateFinancialPlan({
  loans,
  insurances,
  salaryMonthly,
  rentMonthly,
  livingExpensesMonthly,
  minimumSavings,
  months = 12,          // ← configurable: 1–36
  incomeEvents = [],    // [{ fromMonth, salaryMonthly?, rentMonthly? }]
}) {
  const planMonths = Math.min(Math.max(parseInt(months) || 12, 1), 36);
  const sortedEvents = [...(incomeEvents || [])]
    .filter(e => e && parseInt(e.fromMonth) > 0)
    .sort((a, b) => parseInt(a.fromMonth) - parseInt(b.fromMonth));
  // ── Compute total annual insurance ─────────────────────────────────────────
  let totalAnnualInsurance = 0;
  (insurances || []).forEach((ins) => {
    const premium = parseFloat(ins.premiumAmount) || 0;
    const multiplier =
      ins.frequency === 'monthly'
        ? 12
        : ins.frequency === 'quarterly'
        ? 4
        : ins.frequency === 'half-yearly'
        ? 2
        : 1; // yearly
    totalAnnualInsurance += premium * multiplier;
  });
  const insuranceMonthly = totalAnnualInsurance / 12;

  // ── Init loan states (deep copy for tracking) ──────────────────────────────
  const loanStates = (loans || [])
    .filter((l) => l.status !== 'closed')
    .map((l) => ({
      id: l.id,
      name: l.loanName,
      loanType: l.loanType || 'emi',
      remainingPrincipal: parseFloat(l.principal) || 0,
      interest: parseFloat(l.interest) || 0,
      emiAmount: parseFloat(l.emiAmount) || 0,
      tenure: parseInt(l.tenure) || 0,
      closed: false,
    }));

  const plan = [];
  let emergencyFund = 0;
  const now = new Date(2026, 2, 21); // March 2026

  for (let m = 0; m < planMonths; m++) {
    const planDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const monthLabel = planDate.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    const activeLoanStates = loanStates.filter((l) => !l.closed);

    // ── Step 1: Total income (with event overrides) ─────────────────────────
    const monthNum = m + 1;
    const activeEvent = sortedEvents
      .filter(e => parseInt(e.fromMonth) <= monthNum)
      .slice(-1)[0]; // last applicable event
    const effectiveSalary = activeEvent?.salaryMonthly != null
      ? parseFloat(activeEvent.salaryMonthly) : salaryMonthly;
    const effectiveRent   = activeEvent?.rentMonthly   != null
      ? parseFloat(activeEvent.rentMonthly)   : rentMonthly;
    const incomeChanged   = !!activeEvent && parseInt(activeEvent.fromMonth) === monthNum;
    const income = effectiveSalary + effectiveRent;

    // ── Step 2: Fixed costs ──────────────────────────────────────────────────
    const emiLoans = activeLoanStates.filter((l) => l.loanType === 'emi');
    const emiTotal = emiLoans.reduce((s, l) => s + l.emiAmount, 0);
    const expenses = livingExpensesMonthly;
    const fixedCosts = emiTotal + insuranceMonthly + expenses;

    // ── Step 3: Available money ───────────────────────────────────────────────
    const available = income - fixedCosts;

    // ── Savings rule ─────────────────────────────────────────────────────────
    let savings = minimumSavings;
    if (available <= 0) {
      savings = Math.max(50, income * 0.02); // Never zero — at least 2% of income
    } else if (available < minimumSavings) {
      savings = Math.max(50, available * 0.5); // Reduce slightly, but not zero
    }
    emergencyFund += savings;

    // ── Loan budget ───────────────────────────────────────────────────────────
    const loanBudget = Math.max(0, available - savings);

    // ── Determine if most bullet loans are cleared ────────────────────────────
    const allBullets = loanStates.filter((l) => l.loanType === 'bullet');
    const openBullets = activeLoanStates.filter((l) => l.loanType === 'bullet');
    const mostBulletsCleared =
      allBullets.length === 0 || openBullets.length <= Math.floor(allBullets.length * 0.25);

    // ── Apply EMI principal reduction (implicit via amortization) ─────────────
    emiLoans.forEach((l) => {
      if (l.remainingPrincipal <= 0) return;
      const monthlyRate = l.interest / 12 / 100;
      const interestPortion = l.remainingPrincipal * monthlyRate;
      const principalPortion = Math.max(0, l.emiAmount - interestPortion);
      l.remainingPrincipal = Math.max(0, l.remainingPrincipal - principalPortion);
      if (l.remainingPrincipal < 1) {
        l.remainingPrincipal = 0;
        l.closed = true;
      }
    });

    // ── Apply extra loanBudget payments ───────────────────────────────────────
    const loanPayments = [];
    const closedThisMonth = [];
    let remainingBudget = loanBudget;

    // Build priority queue
    const eligibleForPrepay = sortByPriority(
      loanStates.filter((l) => {
        if (l.closed) return false;
        if (l.loanType === 'bullet') return true; // always eligible
        if (mostBulletsCleared) return true; // EMI prepay allowed now
        return false;
      })
    );

    // Focus on top 1–2 loans
    const focusLoans = eligibleForPrepay.slice(0, 2);
    for (const loan of focusLoans) {
      if (remainingBudget <= 0) break;
      const payment = Math.min(remainingBudget, loan.remainingPrincipal);
      if (payment <= 0) continue;
      loan.remainingPrincipal = Math.max(0, loan.remainingPrincipal - payment);
      remainingBudget -= payment;
      const didClose = loan.remainingPrincipal < 1;
      if (didClose) {
        loan.remainingPrincipal = 0;
        loan.closed = true;
        closedThisMonth.push(loan.name);
      }
      loanPayments.push({
        loanId: loan.id,
        name: loan.name,
        payment,
        type: loan.loanType,
        closed: didClose,
      });
      // If this loan closed, carry remaining budget to next focus loan
    }

    // ── Status calculation ────────────────────────────────────────────────────
    const comfortRatio = available / income;
    const status =
      comfortRatio >= 0.25
        ? 'comfortable'
        : comfortRatio >= 0.1
        ? 'tight'
        : 'critical';

    // ── Notes / insights for this month ──────────────────────────────────────
    const notes = [];
    if (closedThisMonth.length > 0)
      notes.push(`🎉 Loan(s) closed: ${closedThisMonth.join(', ')}`);
    if (status === 'critical')
      notes.push('⚠️ Very tight month — consider reducing expenses');
    if (status === 'tight')
      notes.push('💛 Tight month — savings slightly reduced');
    if (loanBudget === 0)
      notes.push('ℹ️ No extra budget for loan prepayment this month');
    if (mostBulletsCleared && openBullets.length === 0 && allBullets.length > 0)
      notes.push('✅ All bullet loans cleared — now targeting EMI loans');
    if (incomeChanged) {
      const old = activeEvent?.salaryMonthly != null
        ? `salary → ${fc(effectiveSalary)}` : '';
      const rentNote = activeEvent?.rentMonthly != null
        ? `rent → ${fc(effectiveRent)}` : '';
      notes.push(`📈 Income change this month: ${[old, rentNote].filter(Boolean).join(', ')}`);
    }

    plan.push({
      month: m + 1,
      monthLabel,
      income,
      salaryMonthly: effectiveSalary,
      rentMonthly: effectiveRent,
      incomeChanged,
      emiTotal,
      insuranceMonthly,
      expenses,
      fixedCosts,
      available,
      savings,
      emergencyFund,
      loanBudget,
      loanPayments,
      closedThisMonth,
      status,
      notes,
      // snapshot of remaining principals at end of month
      loanSnapshot: loanStates.map((l) => ({
        id: l.id,
        name: l.name,
        loanType: l.loanType,
        remainingPrincipal: l.remainingPrincipal,
        closed: l.closed,
      })),
    });
  }

  return plan;
}

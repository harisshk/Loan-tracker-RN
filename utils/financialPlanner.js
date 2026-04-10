import { calculateEMIBreakdown } from './emiCalculator';

/**
 * Advanced Financial Resilience & Planning Engine - V3
 * Features:
 * 1. 12-36 Month Debt Reduction Forecast
 * 2. Resilience Stress Test (Runway calculation)
 * 3. Emergency Buffer Optimization
 * 4. Interest Savings Projections
 */

const sortByPriority = (loanStates) =>
  [...loanStates]
    .filter((l) => !l.closed)
    .sort((a, b) => {
      // Prioritize high-interest loans first (Avalanche Method)
      if (b.interest !== a.interest) return b.interest - a.interest;
      // Then smaller principal for psychological wins (Snowball Method)
      return a.remainingPrincipal - b.remainingPrincipal;
    });

export function generateFinancialPlan({
  loans = [],
  insurances = [],
  payments = [],
  salaryMonthly,
  rentMonthly,
  livingExpensesMonthly,
  minimumSavings,
  months = 12,
  incomeEvents = [],
}) {
  const planMonths = Math.min(Math.max(parseInt(months) || 12, 1), 36);
  const sortedEvents = [...(incomeEvents || [])]
    .filter(e => e && parseInt(e.fromMonth) > 0)
    .sort((a, b) => parseInt(a.fromMonth) - parseInt(b.fromMonth));

  // 1. Fixed Monthly Overhead (Insurance + Expenses)
  let totalAnnualInsurance = 0;
  insurances.forEach((ins) => {
    const premium = parseFloat(String(ins.premiumAmount).replace(/,/g, '')) || 0;
    const multiplier =
      ins.frequency === 'monthly' ? 12 :
      ins.frequency === 'quarterly' ? 4 :
      ins.frequency === 'half-yearly' ? 2 : 1;
    totalAnnualInsurance += premium * multiplier;
  });
  const insuranceMonthly = totalAnnualInsurance / 12;
  const fixedOverhead = livingExpensesMonthly + insuranceMonthly;

  // 2. Initialize Loan States
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const loanStates = loans
    .filter((l) => l.status !== 'closed')
    .map((l) => {
      let monthsElapsed = 0;
      if (l.startDate) {
        const start = new Date(l.startDate);
        monthsElapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
        if (today.getDate() >= start.getDate()) monthsElapsed += 1;
      }
      
      const principal = parseFloat(String(l.principal).replace(/,/g, '')) || 0;
      const interest = parseFloat(l.interest) || 0;
      const tenure = parseInt(String(l.tenure).replace(/,/g, '')) || 0;
      const emi = parseFloat(String(l.emiAmount).replace(/,/g, '')) || 0;
      const loanType = l.loanType || 'emi';
      
      const extraPayments = payments.filter(p => p.loanId === l.id);
      const currentStatus = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emi, loanType, extraPayments);

      return {
        id: l.id,
        name: l.loanName,
        loanType,
        remainingPrincipal: currentStatus.remainingPrincipalAmount,
        interest,
        emiAmount: emi,
        tenureRemaining: Math.max(0, tenure - monthsElapsed),
        closed: currentStatus.remainingAmount <= 5 || (loanType === 'emi' && monthsElapsed >= tenure),
        totalInterestSaved: 0,
      };
    })
    .filter(l => !l.closed);

  // 3. Resilience Snapshot (Stress Test)
  const initialMonthlyEMI = loanStates.reduce((s, l) => s + (l.loanType === 'emi' ? l.emiAmount : 0), 0);
  const burnRate = fixedOverhead + initialMonthlyEMI; // Monthly cost to exist
  // We'll calculate runway and insights after the loop for final state, 
  // but we can compute initial runway here.
  
  const plan = [];
  let currentEmergencyFund = 0; // Starts from 0 for the simulator
  let accumulatedSavedInterest = 0;

  for (let m = 0; m < planMonths; m++) {
    const monthNum = m + 1;
    // Start from NEXT month (+ m + 1)
    const planDate = new Date(today.getFullYear(), today.getMonth() + m + 1, 1);
    const monthLabel = planDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    let activeLoanStates = loanStates.filter((l) => !l.closed);

    // Step A: Income at this point in time
    const activeEvent = sortedEvents.filter(e => parseInt(e.fromMonth) <= monthNum).slice(-1)[0];
    const effectiveSalary = activeEvent?.salaryMonthly != null ? parseFloat(activeEvent.salaryMonthly) : salaryMonthly;
    const effectiveRent   = activeEvent?.rentMonthly   != null ? parseFloat(activeEvent.rentMonthly)   : rentMonthly;
    const iIncome = effectiveSalary + effectiveRent;

    // Step B: Compulsory Costs
    const emiTotal = activeLoanStates.reduce((s, l) => s + (l.loanType === 'emi' ? l.emiAmount : 0), 0);
    const bulletDue = activeLoanStates.filter(l => l.loanType === 'bullet' && l.tenureRemaining <= 0);
    const balloonPenalty = bulletDue.reduce((s, l) => s + l.remainingPrincipal, 0);

    const compulsoryCosts = emiTotal + balloonPenalty + fixedOverhead;
    let netSurplus = iIncome - compulsoryCosts;

    // Step C: Savings Buffer allocation
    let savingsThisMonth = 0;
    if (netSurplus > 0) {
      savingsThisMonth = Math.min(netSurplus, minimumSavings);
      netSurplus -= savingsThisMonth;
    }
    currentEmergencyFund += savingsThisMonth;

    // Step D: Normal Loan Aging
    activeLoanStates.filter(l => l.loanType === 'emi').forEach((l) => {
      const monthlyRate = l.interest / 12 / 100;
      const intPortion = l.remainingPrincipal * monthlyRate;
      const prinPortion = Math.max(0, l.emiAmount - intPortion);
      l.remainingPrincipal = Math.max(0, l.remainingPrincipal - prinPortion);
      l.tenureRemaining -= 1;
      if (l.remainingPrincipal < 5 || l.tenureRemaining <= 0) {
        l.remainingPrincipal = 0;
        l.closed = true;
      }
    });

    bulletDue.forEach(l => {
      l.remainingPrincipal = 0; l.closed = true;
    });

    // Step E: Extra Debt Shredding (The Magic)
    const loanPayments = [];
    const closedThisMonth = [];
    let extraBudget = Math.max(0, netSurplus);

    const prepayCandidates = sortByPriority(activeLoanStates.filter(l => !l.closed));
    for (const loan of prepayCandidates) {
      if (extraBudget <= 100) break;
      const pay = Math.min(extraBudget, loan.remainingPrincipal);
      
      const monthlyRate = loan.interest / 12 / 100;
      const savings = pay * monthlyRate * Math.max(1, loan.tenureRemaining);
      accumulatedSavedInterest += savings;

      loan.remainingPrincipal -= pay;
      extraBudget -= pay;
      
      if (loan.remainingPrincipal < 5) {
        loan.remainingPrincipal = 0;
        loan.closed = true;
        closedThisMonth.push(loan.name);
      }
      
      loanPayments.push({
        name: loan.name,
        payment: pay,
        type: loan.loanType,
        closed: loan.closed,
        interestSaved: savings,
      });
    }

    const comfort = (iIncome - compulsoryCosts) / iIncome;
    const status = comfort >= 0.2 ? 'comfortable' : comfort >= 0 ? 'tight' : 'critical';

    plan.push({
      month: monthNum,
      monthLabel,
      income: iIncome,
      emiTotal,
      insuranceMonthly,
      expenses: livingExpensesMonthly,
      available: iIncome - compulsoryCosts,
      savings: savingsThisMonth,
      emergencyFund: currentEmergencyFund,
      loanBudget: Math.max(0, netSurplus + extraBudget),
      loanPayments,
      closedThisMonth,
      status,
      totalInterestSaved: accumulatedSavedInterest,
      notes: status === 'critical' ? ['⚠️ Cash flow deficit! Fixed costs exceed income.'] : [],
      loanSnapshot: loanStates.map(l => ({
        name: l.name,
        remainingPrincipal: Math.round(l.remainingPrincipal),
        closed: l.closed,
        loanType: l.loanType
      }))
    });
  }

  return plan;
}

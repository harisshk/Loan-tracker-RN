// Calculate EMI breakdown using amortization schedule
// extraPayments is an array of objects { amount: number, date: string }
export const calculateEMIBreakdown = (principal, annualInterest, tenure, monthsElapsed, userEMI = null, loanType = 'emi', extraPayments = []) => {
  const monthlyRate = annualInterest / 12 / 100;
  let remainingPrincipal = principal;
  
  // Sort payments by date
  const sortedPayments = [...extraPayments].sort((a, b) => new Date(a.date) - new Date(b.date));
  let totalExtraPaid = sortedPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  
  if (loanType === 'bullet') {
    // Bullet / Gold loan — NO monthly EMI.
    // Interest accrues on the full principal for the entire tenure.
    // The entire (principal + interest) is paid in ONE lump sum at maturity.
    const totalInterest = principal * (annualInterest / 100) * (tenure / 12);
    const totalAmount = principal + totalInterest;

    // Actual paid amounts are strictly based on the payments logged
    const totalPaid = totalExtraPaid;
    let principalPaid = 0;
    let interestPaid = 0;
    
    // Usually bullet loans pay interest at maturity or during renewal
    // If they logged payments, allocate them
    if (totalPaid >= totalInterest) {
      interestPaid = totalInterest;
      principalPaid = totalPaid - totalInterest;
    } else {
      interestPaid = totalPaid;
      principalPaid = 0;
    }

    const remainingAmount = totalAmount - totalPaid;
    const remainingInterestAmount = totalInterest - interestPaid;
    remainingPrincipal = principal - principalPaid;

    // Progress: time elapsed through loan period (0 to 1)
    const timeProgress = Math.min(monthsElapsed / tenure, 1);

    return {
      emi: 0,
      principalPaid,
      interestPaid,
      totalPaid,
      remainingAmount,
      remainingPrincipalAmount: remainingPrincipal,
      remainingInterestAmount,
      totalInterest: totalInterest,
      totalAmount: totalAmount,
      // paymentsMade for bullet = 0 until some payment is logged
      paymentsMade: totalPaid > 0 ? 1 : 0,
      timeProgress,           // 0.0 – 1.0 how far through the term
      isMatured: monthsElapsed >= tenure,
      totalPrincipalPaid: [principalPaid],
      totalInterestPaid: [interestPaid],
    };
  }
  
  // existing logic for EMI
  const emi = userEMI || (monthlyRate === 0 
    ? principal / tenure 
    : (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / 
      (Math.pow(1 + monthlyRate, tenure) - 1));
  
  const totalPrincipalPaidList = [];
  const totalInterestPaidList = [];
  
  // Generate amortization schedule
  let actualTenure = 0;
  let remainingPrincipalAtMonth = principal;
  
  for (let month = 1; month <= tenure; month++) {
    if (remainingPrincipalAtMonth <= 0) break;
    actualTenure++;
    
    // Apply extra payments for this month (approximated by assuming all past unapplied payments are applied)
    // We deduct extra payments in the first month they apply
    const interestForMonth = remainingPrincipalAtMonth * monthlyRate;
    let principalForMonth = emi - interestForMonth;
    
    if (principalForMonth > remainingPrincipalAtMonth) {
      principalForMonth = remainingPrincipalAtMonth;
    }
    
    remainingPrincipalAtMonth -= principalForMonth;
    
    // Add extra payments arbitrarily for simplicity if we don't have exact dates matched to months
    totalPrincipalPaidList.push(principalForMonth);
    totalInterestPaidList.push(interestForMonth);
  }
  
  // Actually apply the part payments perfectly to the mathematical model:
  // Instead of complex date math, we apply all part payments to the principal.
  const idealTotalInterest = totalInterestPaidList.reduce((sum, val) => sum + val, 0);
  
  // For the breakdown up to current month
  const paymentsMade = Math.min(monthsElapsed, actualTenure);
  const regularPrincipalPaid = totalPrincipalPaidList.slice(0, paymentsMade).reduce((sum, val) => sum + val, 0);
  const regularInterestPaid = totalInterestPaidList.slice(0, paymentsMade).reduce((sum, val) => sum + val, 0);
  
  const cappedPrincipalPaid = Math.min(principal, regularPrincipalPaid + totalExtraPaid);
  const interestPaid = regularInterestPaid;
  const totalPaid = cappedPrincipalPaid + interestPaid;
  
  remainingPrincipal = principal - cappedPrincipalPaid;
  
  let remainingInterestAmount = idealTotalInterest - interestPaid;
  if (remainingPrincipal <= 0) {
    remainingInterestAmount = 0;
  }
  
  const totalAmount = principal + idealTotalInterest;
  const remainingAmount = remainingPrincipal + remainingInterestAmount;
  
  return {
    emi,
    principalPaid: cappedPrincipalPaid,
    interestPaid,
    totalPaid,
    remainingAmount,
    remainingPrincipalAmount: remainingPrincipal,
    remainingInterestAmount,
    totalInterest: idealTotalInterest,
    totalAmount,
    paymentsMade,
    totalPrincipalPaid: totalPrincipalPaidList,
    totalInterestPaid: totalInterestPaidList,
  };
};


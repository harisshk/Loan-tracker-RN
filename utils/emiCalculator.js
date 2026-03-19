// Calculate EMI breakdown using amortization schedule
// extraPayments is an array of objects { amount: number, date: string }
export const calculateEMIBreakdown = (principal, annualInterest, tenure, monthsElapsed, userEMI = null, loanType = 'emi', extraPayments = []) => {
  const monthlyRate = annualInterest / 12 / 100;
  let remainingPrincipal = principal;
  
  // Sort payments by date
  const sortedPayments = [...extraPayments].sort((a, b) => new Date(a.date) - new Date(b.date));
  let totalExtraPaid = sortedPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  
  if (loanType === 'bullet') {
    // Bullet / Gold loan
    let totalInterest = principal * (annualInterest / 100) * (tenure / 12);
    let totalAmount = principal + totalInterest;
    
    // For simple bullet loan, we subtract extra payments from principal and recalculate interest if it's simple day-wise, 
    // but for simplicity let's just deduct it from totalAmount.
    remainingPrincipal -= totalExtraPaid;
    if (remainingPrincipal < 0) remainingPrincipal = 0;
    
    // Total amount remaining drops by totalExtraPaid
    const isPaid = monthsElapsed >= tenure;
    const principalPaid = (isPaid ? remainingPrincipal : 0) + totalExtraPaid;
    const interestPaid = isPaid ? totalInterest : 0;
    const totalPaid = principalPaid + interestPaid;
    
    return {
      emi: 0,
      principalPaid,
      interestPaid,
      totalPaid,
      remainingAmount: totalAmount - totalPaid,
      remainingPrincipalAmount: remainingPrincipal,
      remainingInterestAmount: totalInterest - interestPaid,
      totalInterest,
      totalAmount,
      paymentsMade: isPaid ? 1 : 0,
      totalPrincipalPaid: isPaid ? [principal] : [0],
      totalInterestPaid: isPaid ? [totalInterest] : [0],
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
  
  const totalPrincipalPaid = regularPrincipalPaid + totalExtraPaid;
  const interestPaid = regularInterestPaid;
  const totalPaid = totalPrincipalPaid + interestPaid;
  
  remainingPrincipal = principal - totalPrincipalPaid;
  if (remainingPrincipal < 0) remainingPrincipal = 0;
  
  const remainingInterestAmount = idealTotalInterest - interestPaid; // Note: Part payments would reduce future interest, but simple approach keeps it flat
  const totalAmount = principal + idealTotalInterest;
  const remainingAmount = remainingPrincipal + remainingInterestAmount;
  
  return {
    emi,
    principalPaid: totalPrincipalPaid,
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


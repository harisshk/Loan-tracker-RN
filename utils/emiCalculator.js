// Calculate EMI breakdown using amortization schedule
// If userEMI is provided, use it; otherwise calculate EMI
export const calculateEMIBreakdown = (principal, annualInterest, tenure, monthsElapsed, userEMI = null) => {
  const monthlyRate = annualInterest / 12 / 100;
  const totalPrincipalPaid = [];
  const totalInterestPaid = [];
  let remainingPrincipal = principal;
  
  // Use user-provided EMI if available, otherwise calculate it
  const emi = userEMI || (monthlyRate === 0 
    ? principal / tenure 
    : (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / 
      (Math.pow(1 + monthlyRate, tenure) - 1));
  
  // Generate amortization schedule
  for (let month = 1; month <= tenure; month++) {
    const interestForMonth = remainingPrincipal * monthlyRate;
    const principalForMonth = emi - interestForMonth;
    
    totalPrincipalPaid.push(principalForMonth);
    totalInterestPaid.push(interestForMonth);
    
    remainingPrincipal -= principalForMonth;
  }
  
  // Calculate totals up to current month
  const paymentsMade = Math.min(monthsElapsed, tenure);
  const principalPaid = totalPrincipalPaid.slice(0, paymentsMade).reduce((sum, val) => sum + val, 0);
  const interestPaid = totalInterestPaid.slice(0, paymentsMade).reduce((sum, val) => sum + val, 0);
  const totalPaid = principalPaid + interestPaid;
  
  // Calculate remaining
  const totalInterest = totalInterestPaid.reduce((sum, val) => sum + val, 0);
  const totalAmount = principal + totalInterest;
  const remainingAmount = totalAmount - totalPaid;
  const remainingPrincipalAmount = principal - principalPaid;
  const remainingInterestAmount = totalInterest - interestPaid;
  
  // Log for verification (first 3 months only to avoid spam)
  if (monthsElapsed <= 3) {
    console.log(`\n📊 EMI Breakdown (${paymentsMade} payments made):`);
    for (let i = 0; i < Math.min(3, paymentsMade); i++) {
      console.log(`Month ${i + 1}: Principal ₹${totalPrincipalPaid[i].toFixed(0)} + Interest ₹${totalInterestPaid[i].toFixed(0)} = EMI ₹${emi.toFixed(0)}`);
    }
    console.log(`Total: Principal Paid ₹${principalPaid.toFixed(0)}, Interest Paid ₹${interestPaid.toFixed(0)}`);
    console.log(`Remaining: Principal ₹${remainingPrincipalAmount.toFixed(0)}, Total ₹${remainingAmount.toFixed(0)}\n`);
  }
  
  return {
    emi,
    principalPaid,
    interestPaid,
    totalPaid,
    remainingAmount,
    remainingPrincipalAmount,
    remainingInterestAmount,
    totalInterest,
    totalAmount,
    paymentsMade,
    totalPrincipalPaid,
    totalInterestPaid,
  };
};


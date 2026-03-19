import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateEMIBreakdown } from './emiCalculator';
import { scheduleEMIReminder, cancelAllLoanNotifications, scheduleInsuranceReminder } from './notifications';

const LOANS_KEY = '@loans';
const PAYMENTS_KEY = '@payments';
const INSURANCES_KEY = '@insurances';

// Helper to refresh all notifications
const refreshAllNotifications = async (loans, insurances = []) => {
  try {
    await cancelAllLoanNotifications();
    
    if (loans) {
      for (const loan of loans) {
        if (loan.startDate && loan.emiAmount) {
          await scheduleEMIReminder(loan);
        }
      }
    }
    
    if (insurances) {
      for (const ins of insurances) {
        if (ins.startDate && ins.premiumAmount) {
          await scheduleInsuranceReminder(ins);
        }
      }
    }
  } catch (e) {
    console.error('Error refreshing notifications:', e);
  }
};

// Insurance operations
export const getInsurances = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(INSURANCES_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error reading insurances:', e);
    return [];
  }
};

export const saveInsurance = async (insurance) => {
  try {
    const insurances = await getInsurances();
    const newIns = {
      id: Date.now().toString(),
      ...insurance,
      createdAt: new Date().toISOString(),
    };
    insurances.push(newIns);
    await AsyncStorage.setItem(INSURANCES_KEY, JSON.stringify(insurances));
    
    // Refresh notifications
    const loans = await getLoans();
    await refreshAllNotifications(loans, insurances);
    
    return newIns;
  } catch (e) {
    console.error('Error saving insurance:', e);
    throw e;
  }
};

export const deleteInsurance = async (id) => {
  try {
    const insurances = await getInsurances();
    const filtered = insurances.filter(i => i.id !== id);
    await AsyncStorage.setItem(INSURANCES_KEY, JSON.stringify(filtered));
    
    // Refresh notifications
    const loans = await getLoans();
    await refreshAllNotifications(loans, filtered);
  } catch (e) {
    console.error('Error deleting insurance:', e);
    throw e;
  }
};

export const updateInsurance = async (id, updates) => {
  try {
    const insurances = await getInsurances();
    const idx = insurances.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('Insurance not found');
    insurances[idx] = { ...insurances[idx], ...updates };
    await AsyncStorage.setItem(INSURANCES_KEY, JSON.stringify(insurances));

    // Refresh notifications
    const loans = await getLoans();
    await refreshAllNotifications(loans, insurances);

    return insurances[idx];
  } catch (e) {
    console.error('Error updating insurance:', e);
    throw e;
  }
};

// Loan operations
export const getLoans = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(LOANS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error reading loans:', e);
    return [];
  }
};

export const saveLoan = async (loan) => {
  try {
    const loans = await getLoans();
    const newLoan = {
      id: Date.now().toString(),
      ...loan,
      createdAt: new Date().toISOString(),
    };
    loans.push(newLoan);
    await AsyncStorage.setItem(LOANS_KEY, JSON.stringify(loans));
    
    const insurances = await getInsurances();
    await refreshAllNotifications(loans, insurances);
    
    return newLoan;
  } catch (e) {
    console.error('Error saving loan:', e);
    throw e;
  }
};

export const updateLoan = async (loanId, updatedData) => {
  try {
    const loans = await getLoans();
    const loanIndex = loans.findIndex(loan => loan.id === loanId);
    
    if (loanIndex === -1) {
      throw new Error('Loan not found');
    }
    
    loans[loanIndex] = {
      ...loans[loanIndex],
      ...updatedData,
      updatedAt: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(LOANS_KEY, JSON.stringify(loans));
    
    const insurances = await getInsurances();
    await refreshAllNotifications(loans, insurances);
    
    return loans[loanIndex];
  } catch (e) {
    console.error('Error updating loan:', e);
    throw e;
  }
};

export const deleteLoan = async (loanId) => {
  try {
    const loans = await getLoans();
    const filteredLoans = loans.filter(loan => loan.id !== loanId);
    await AsyncStorage.setItem(LOANS_KEY, JSON.stringify(filteredLoans));
    
    const insurances = await getInsurances();
    await refreshAllNotifications(filteredLoans, insurances);
  } catch (e) {
    console.error('Error deleting loan:', e);
    throw e;
  }
};

// Payment operations
export const getPayments = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(PAYMENTS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error reading payments:', e);
    return [];
  }
};

export const addPayment = async (payment) => {
  try {
    const payments = await getPayments();
    const newPayment = {
      id: Date.now().toString(),
      ...payment,
      paidAt: new Date().toISOString(),
    };
    payments.push(newPayment);
    await AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
    return newPayment;
  } catch (e) {
    console.error('Error adding payment:', e);
    throw e;
  }
};

// Calculate loan statistics
export const calculateLoanStats = (loans, payments = [], insurances = []) => {
  let totalOutstanding = 0;
  let totalOutstandingPr = 0;
  let totalPaid = 0;
  let totalPrincipalPaid = 0;
  let totalInterestPaid = 0;
  let totalPrincipalPending = 0;
  let totalInterestPending = 0;
  let upcomingEMI = 0;
  let nextDueDate = null;
  let nextPaymentAmount = 0;
  let nextPaymentLoanName = '';
  
  let thisMonthDueAmount = 0;
  let thisMonthDueCount = 0;
  let thisMonthEMIAmount = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  loans.forEach(loan => {
    const principal = parseFloat(loan.principal) || 0;
    const interest = parseFloat(loan.interest) || 0;
    const tenure = parseInt(loan.tenure) || 0;
    const loanType = loan.loanType || 'emi';
    
    // Filter payments for this specific loan
    const extraPayments = payments.filter(p => p.loanId === loan.id);
    
    // Calculate months elapsed since start date
    let monthsElapsed = 0;
    
    if (loan.startDate) {
      const startDate = new Date(loan.startDate);
      const currentTime = new Date();
      
      // Calculate base months difference
      monthsElapsed = (currentTime.getFullYear() - startDate.getFullYear()) * 12 + 
                      (currentTime.getMonth() - startDate.getMonth());
      
      // If current day >= start day, we've completed this month's payment
      if (currentTime.getDate() >= startDate.getDate()) {
        monthsElapsed += 1;
      }
      
      monthsElapsed = Math.max(0, monthsElapsed);
    }
    
    // Use proper EMI breakdown calculation with user's EMI amount and extra payments
    const emiAmount = parseFloat(loan.emiAmount) || 0;
    const breakdown = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount, loanType, extraPayments);
    
    // Accumulate totals
    totalOutstanding += breakdown.remainingAmount;
    totalOutstandingPr += breakdown.remainingPrincipalAmount;
    totalPaid += breakdown.totalPaid;
    totalPrincipalPaid += breakdown.principalPaid;
    totalInterestPaid += breakdown.interestPaid;
    totalPrincipalPending += breakdown.remainingPrincipalAmount;
    totalInterestPending += breakdown.remainingInterestAmount;
    
    // Only add to upcoming EMI if loan is still active
    if (monthsElapsed < tenure) {
      if (loanType === 'emi') {
        upcomingEMI += emiAmount;  // Use user's EMI amount
        
        // Calculate next due date
        const startDate = new Date(loan.startDate);
        const nextDue = new Date(startDate.getFullYear(), startDate.getMonth() + monthsElapsed, startDate.getDate());
        if (nextDue < today) {
           nextDue.setMonth(nextDue.getMonth() + 1);
        }
        
        if (nextDue.getMonth() === currentMonth && nextDue.getFullYear() === currentYear && nextDue >= today) {
          thisMonthDueAmount += emiAmount;
          thisMonthDueCount += 1;
          thisMonthEMIAmount += emiAmount;
        }

        if (!nextDueDate || nextDue < nextDueDate) {
          nextDueDate = nextDue;
          nextPaymentAmount = emiAmount;
          nextPaymentLoanName = loan.loanName;
        } else if (nextDueDate && nextDue.getTime() === nextDueDate.getTime()) {
           nextPaymentAmount += emiAmount;
        }
      } else if (loanType === 'bullet') {
        const startDate = new Date(loan.startDate);
        const nextDue = new Date(startDate.getFullYear(), startDate.getMonth() + tenure, startDate.getDate());
        if (nextDue.getMonth() === currentMonth && nextDue.getFullYear() === currentYear && nextDue >= today) {
          thisMonthDueAmount += breakdown.totalAmount;
          thisMonthDueCount += 1;
          thisMonthEMIAmount += breakdown.totalAmount;
        }

        if (!nextDueDate || nextDue < nextDueDate) {
          nextDueDate = nextDue;
          nextPaymentAmount = breakdown.totalAmount;
          nextPaymentLoanName = loan.loanName;
        }
      }
    }
  });

  insurances.forEach(ins => {
    const principal = parseFloat(ins.premiumAmount) || 0;
    const startDate = new Date(ins.startDate);
    const freq = ins.frequency; 
    let stepMonths = 12;
    if (freq === 'yearly') stepMonths = 12;
    else if (freq === 'half-yearly') stepMonths = 6;
    else if (freq === 'quarterly') stepMonths = 3;
    else if (freq === 'monthly') stepMonths = 1;
    
    // Find next premium
    let nextDue = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    while (nextDue < today) {
      nextDue.setMonth(nextDue.getMonth() + stepMonths);
    }
    
    // Add to next payment logic
    if (!nextDueDate || nextDue < nextDueDate) {
      nextDueDate = nextDue;
      nextPaymentAmount = principal;
      nextPaymentLoanName = ins.name;
    } else if (nextDueDate && nextDue.getTime() === nextDueDate.getTime()) {
      nextPaymentAmount += principal;
    }
    
    // Add to this month due
    if (nextDue.getMonth() === currentMonth && nextDue.getFullYear() === currentYear && nextDue >= today) {
      thisMonthDueAmount += principal;
      thisMonthDueCount += 1;
    }
    
    // Add to abstract outstanding just for 1 year conceptually? Or we skip adding prep to outstanding.
  });

  return {
    totalOutstanding,
    totalOutstandingPr,
    totalPaid,
    totalPrincipalPaid,
    totalInterestPaid,
    totalPrincipalPending,
    totalInterestPending,
    upcomingEMI,
    nextDueDate,
    nextPaymentAmount,
    nextPaymentLoanName,
    pendingLoans: loans.length,
    thisMonthDueAmount,
    thisMonthDueCount,
    thisMonthEMIAmount,
  };
};

// Export all data for backup
export const exportAllData = async () => {
  try {
    const loans = await getLoans();
    const payments = await getPayments();
    const insurances = await getInsurances();
    return JSON.stringify({ loans, payments, insurances, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('Error exporting data:', e);
    throw e;
  }
};

// Import all data from backup
export const importAllData = async (jsonString) => {
  try {
    const data = JSON.parse(jsonString);
    if (data.loans) {
      await AsyncStorage.setItem(LOANS_KEY, JSON.stringify(data.loans));
    }
    if (data.payments) {
      await AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify(data.payments));
    }
    if (data.insurances) {
      await AsyncStorage.setItem(INSURANCES_KEY, JSON.stringify(data.insurances));
    }
    
    // Refresh notifications for all imported data
    const finalLoans = data.loans || [];
    const finalInsurances = data.insurances || [];
    await refreshAllNotifications(finalLoans, finalInsurances);
    
    return true;
  } catch (e) {
    console.error('Error importing data:', e);
    throw e;
  }
};


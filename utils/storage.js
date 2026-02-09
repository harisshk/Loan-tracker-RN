import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateEMIBreakdown } from './emiCalculator';
import { scheduleEMIReminder, cancelAllLoanNotifications } from './notifications';

const LOANS_KEY = '@loans';
const PAYMENTS_KEY = '@payments';

// Helper to refresh all notifications
const refreshAllNotifications = async (loans) => {
  try {
    await cancelAllLoanNotifications();
    for (const loan of loans) {
      if (loan.startDate && loan.emiAmount) {
        await scheduleEMIReminder(loan);
      }
    }
  } catch (e) {
    console.error('Error refreshing notifications:', e);
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
    
    // Refresh notifications
    await refreshAllNotifications(loans);
    
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
    
    // Refresh notifications
    await refreshAllNotifications(loans);
    
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
    
    // Refresh notifications
    await refreshAllNotifications(filteredLoans);
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
export const calculateLoanStats = (loans) => {
  let totalOutstanding = 0;
  let totalOutstandingPr = 0;
  let totalPaid = 0;
  let totalPrincipalPaid = 0;
  let totalInterestPaid = 0;
  let totalPrincipalPending = 0;
  let totalInterestPending = 0;
  let upcomingEMI = 0;
  let nextDueDate = null;

  loans.forEach(loan => {
    const principal = parseFloat(loan.principal) || 0;
    const interest = parseFloat(loan.interest) || 0;
    const tenure = parseInt(loan.tenure) || 0;
    
    // Calculate months elapsed since start date
    let monthsElapsed = 0;
    
    if (loan.startDate) {
      const startDate = new Date(loan.startDate);
      const today = new Date();
      
      // Calculate base months difference
      monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                      (today.getMonth() - startDate.getMonth());
      
      // If current day >= start day, we've completed this month's payment
      if (today.getDate() >= startDate.getDate()) {
        monthsElapsed += 1;
      }
      
      monthsElapsed = Math.max(0, monthsElapsed);
    }
    
    // Use proper EMI breakdown calculation with user's EMI amount
    const emiAmount = parseFloat(loan.emiAmount) || 0;
    const breakdown = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount);
    
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
      upcomingEMI += emiAmount;  // Use user's EMI amount
      
      // Calculate next due date
      const startDate = new Date(loan.startDate);
      const nextDue = new Date(startDate);
      nextDue.setMonth(nextDue.getMonth() + monthsElapsed + 1);
      
      if (!nextDueDate || nextDue < nextDueDate) {
        nextDueDate = nextDue;
      }
    }
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
    pendingLoans: loans.length,
  };
};

// Export all data for backup
export const exportAllData = async () => {
  try {
    const loans = await getLoans();
    const payments = await getPayments();
    return JSON.stringify({ loans, payments, timestamp: new Date().toISOString() });
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
      // Refresh notifications for the imported loans
      await refreshAllNotifications(data.loans);
    }
    if (data.payments) {
      await AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify(data.payments));
    }
    return true;
  } catch (e) {
    console.error('Error importing data:', e);
    throw e;
  }
};


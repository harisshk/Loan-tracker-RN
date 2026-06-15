import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateEMIBreakdown } from './emiCalculator';
import { cancelAllLoanNotifications, scheduleEMIReminder, scheduleInsuranceReminder } from './notifications';
import { getTransactions } from './transactions';

const LOANS_KEY = '@loans';
const PAYMENTS_KEY = '@payments';
const INSURANCES_KEY = '@insurances';
const TRANSACTIONS_KEY = '@transactions';
const BUDGET_LIMIT_KEY = '@budget_limit';

// Helper to refresh all notifications
const refreshAllNotifications = async (loans, insurances = []) => {
  try {
    await cancelAllLoanNotifications();
    
    if (loans) {
      for (const loan of loans) {
        if (loan.startDate && loan.emiAmount && loan.loanType !== 'bullet') {
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

// Raw list helpers to retrieve all users' data without filtering (for writing back)
const getAllInsurancesRaw = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(INSURANCES_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    return [];
  }
};

const getAllLoansRaw = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(LOANS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    return [];
  }
};

const getAllPaymentsRaw = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(PAYMENTS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    return [];
  }
};

// User-scoped getters
export const getInsurances = async () => {
  try {
    const all = await getAllInsurancesRaw();
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    return all.filter(i => (i.user_email || 'anonymous') === userEmail);
  } catch (e) {
    console.error('Error reading insurances:', e);
    return [];
  }
};

export const saveInsurance = async (insurance) => {
  try {
    const allInsurances = await getAllInsurancesRaw();
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    const newIns = {
      id: Date.now().toString(),
      ...insurance,
      user_email: userEmail,
      createdAt: new Date().toISOString(),
    };
    allInsurances.push(newIns);
    await AsyncStorage.setItem(INSURANCES_KEY, JSON.stringify(allInsurances));
    
    // Refresh notifications
    const loans = await getLoans();
    const userInsurances = await getInsurances();
    await refreshAllNotifications(loans, userInsurances);
    
    return newIns;
  } catch (e) {
    console.error('Error saving insurance:', e);
    throw e;
  }
};

export const deleteInsurance = async (id) => {
  try {
    const allInsurances = await getAllInsurancesRaw();
    const filtered = allInsurances.filter(i => i.id !== id);
    await AsyncStorage.setItem(INSURANCES_KEY, JSON.stringify(filtered));
    
    // Refresh notifications
    const loans = await getLoans();
    const userInsurances = await getInsurances();
    await refreshAllNotifications(loans, userInsurances);
  } catch (e) {
    console.error('Error deleting insurance:', e);
    throw e;
  }
};

export const updateInsurance = async (id, updates) => {
  try {
    const allInsurances = await getAllInsurancesRaw();
    const idx = allInsurances.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('Insurance not found');
    allInsurances[idx] = { ...allInsurances[idx], ...updates };
    await AsyncStorage.setItem(INSURANCES_KEY, JSON.stringify(allInsurances));

    // Refresh notifications
    const loans = await getLoans();
    const userInsurances = await getInsurances();
    await refreshAllNotifications(loans, userInsurances);

    return allInsurances[idx];
  } catch (e) {
    console.error('Error updating insurance:', e);
    throw e;
  }
};

// Loan operations
export const getLoans = async () => {
  try {
    const all = await getAllLoansRaw();
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    return all.filter(l => (l.user_email || 'anonymous') === userEmail);
  } catch (e) {
    console.error('Error reading loans:', e);
    return [];
  }
};

export const saveLoan = async (loan) => {
  try {
    const allLoans = await getAllLoansRaw();
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    const newLoan = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...loan,
      user_email: userEmail,
      createdAt: new Date().toISOString(),
    };
    allLoans.push(newLoan);
    await AsyncStorage.setItem(LOANS_KEY, JSON.stringify(allLoans));
    
    const insurances = await getInsurances();
    const userLoans = await getLoans();
    await refreshAllNotifications(userLoans, insurances);
    
    return newLoan;
  } catch (e) {
    console.error('Error saving loan:', e);
    throw e;
  }
};

export const updateLoan = async (loanId, updatedData) => {
  try {
    const allLoans = await getAllLoansRaw();
    const loanIndex = allLoans.findIndex(loan => loan.id === loanId);
    
    if (loanIndex === -1) {
      throw new Error('Loan not found');
    }
    
    allLoans[loanIndex] = {
      ...allLoans[loanIndex],
      ...updatedData,
      updatedAt: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(LOANS_KEY, JSON.stringify(allLoans));
    
    const insurances = await getInsurances();
    const userLoans = await getLoans();
    await refreshAllNotifications(userLoans, insurances);
    
    return allLoans[loanIndex];
  } catch (e) {
    console.error('Error updating loan:', e);
    throw e;
  }
};

export const deleteLoan = async (loanId) => {
  try {
    const allLoans = await getAllLoansRaw();
    const filteredLoans = allLoans.filter(loan => loan.id !== loanId);
    await AsyncStorage.setItem(LOANS_KEY, JSON.stringify(filteredLoans));
    
    // Clean up associated payments to prevent orphan data
    const allPayments = await getAllPaymentsRaw();
    const filteredPayments = allPayments.filter(p => p.loanId !== loanId);
    await AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify(filteredPayments));
    
    const insurances = await getInsurances();
    const userLoans = await getLoans();
    await refreshAllNotifications(userLoans, insurances);
  } catch (e) {
    console.error('Error deleting loan:', e);
    throw e;
  }
};

// Payment operations
export const getPayments = async () => {
  try {
    const all = await getAllPaymentsRaw();
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    return all.filter(p => (p.user_email || 'anonymous') === userEmail);
  } catch (e) {
    console.error('Error reading payments:', e);
    return [];
  }
};

export const addPayment = async (payment) => {
  try {
    const allPayments = await getAllPaymentsRaw();
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    const newPayment = {
      id: Date.now().toString(),
      ...payment,
      user_email: userEmail,
      paidAt: new Date().toISOString(),
    };
    allPayments.push(newPayment);
    await AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify(allPayments));
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
  let totalPrincipalBorrowed = 0;
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
  let thisMonthEMIPaid = 0;   // auto-EMIs whose due date has already passed this month
  let thisMonthExtraPaid = 0; // extra/manual payments logged this month

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const parseSafe = (val) => parseFloat(String(val || '0').replace(/,/g, ''));

  loans.forEach(loan => {
    const principal = parseSafe(loan.principal);
    const interest = parseFloat(loan.interest) || 0;
    const tenure = parseInt(String(loan.tenure).replace(/,/g, '')) || 0;
    const loanType = loan.loanType || 'emi';
    const emiAmount = parseSafe(loan.emiAmount);
    
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
    
    totalPrincipalBorrowed += principal;

    const breakdown = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount, loanType, extraPayments);
    
    // Accumulate totals
    if (loan.status !== 'closed') {
      totalOutstanding += breakdown.remainingAmount;
      totalOutstandingPr += breakdown.remainingPrincipalAmount;
      totalPrincipalPending += breakdown.remainingPrincipalAmount;
      totalInterestPending += breakdown.remainingInterestAmount;
    }
    totalPaid += breakdown.totalPaid;
    totalPrincipalPaid += breakdown.principalPaid;
    totalInterestPaid += breakdown.interestPaid;
    
    // Only add to upcoming EMI if loan is still active and not explicitly closed
    if (monthsElapsed < tenure && loan.status !== 'closed') {
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

        // ── Auto-paid: EMI whose due date has already passed this month ──────
        const emiDueThisMonth = new Date(currentYear, currentMonth, startDate.getDate());
        const monthsFromStart =
          (currentYear - startDate.getFullYear()) * 12 +
          (currentMonth - startDate.getMonth());
        if (
          loan.status !== 'closed' &&
          emiDueThisMonth <= today &&
          monthsFromStart >= 1 &&
          monthsFromStart <= (parseInt(loan.tenure) || 0)
        ) {
          thisMonthEMIPaid += emiAmount;
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

  // ── Extra payments logged this month ────────────────────────────────────────
  (payments || []).forEach(p => {
    const pDate = new Date(p.paidAt || p.date);
    if (
      !isNaN(pDate) &&
      pDate.getMonth() === currentMonth &&
      pDate.getFullYear() === currentYear
    ) {
      thisMonthExtraPaid += parseFloat(p.amount) || 0;
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
    totalPrincipalBorrowed,
    upcomingEMI,
    nextDueDate,
    nextPaymentAmount,
    nextPaymentLoanName,
    pendingLoans: loans.filter(l => l.status !== 'closed').length,
    thisMonthDueAmount,
    thisMonthDueCount,
    thisMonthEMIAmount,
    thisMonthEMIPaid,
    thisMonthExtraPaid,
    thisMonthTotalPaid: thisMonthEMIPaid + thisMonthExtraPaid,
  };
};

// Export all data for backup (user-scoped)
export const exportAllData = async () => {
  try {
    const loans = await getLoans();
    const payments = await getPayments();
    const insurances = await getInsurances();
    const transactions = await getTransactions();
    
    const limitValue = await AsyncStorage.getItem(BUDGET_LIMIT_KEY);
    const budgetLimit = limitValue ? parseFloat(limitValue) : 50000;

    return JSON.stringify({ loans, payments, insurances, transactions, budgetLimit, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('Error exporting data:', e);
    throw e;
  }
};

// Import all data from backup (user-scoped merge)
export const importAllData = async (jsonString) => {
  try {
    const data = JSON.parse(jsonString);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';

    // Load current raw data
    const allLoans = await getAllLoansRaw();
    const allPayments = await getAllPaymentsRaw();
    const allInsurances = await getAllInsurancesRaw();
    const txsValue = await AsyncStorage.getItem(TRANSACTIONS_KEY);
    const allTxs = txsValue ? JSON.parse(txsValue) : [];

    // Filter out current user's data to overwrite with imported
    const otherLoans = allLoans.filter(l => (l.user_email || 'anonymous') !== userEmail);
    const otherPayments = allPayments.filter(p => (p.user_email || 'anonymous') !== userEmail);
    const otherInsurances = allInsurances.filter(i => (i.user_email || 'anonymous') !== userEmail);

    // Tag imported data with current user_email
    const importedLoans = (data.loans || []).map(l => ({ ...l, user_email: userEmail }));
    const importedPayments = (data.payments || []).map(p => ({ ...p, user_email: userEmail }));
    const importedInsurances = (data.insurances || []).map(i => ({ ...i, user_email: userEmail }));
    const importedTxs = (data.transactions || []).map(t => ({ ...t, user_email: userEmail }));

    // Save merged raw data back
    await AsyncStorage.setItem(LOANS_KEY, JSON.stringify([...otherLoans, ...importedLoans]));
    await AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify([...otherPayments, ...importedPayments]));
    await AsyncStorage.setItem(INSURANCES_KEY, JSON.stringify([...otherInsurances, ...importedInsurances]));
    
    // Upload transactions directly to Supabase if configured
    let supabaseUrl = await AsyncStorage.getItem('@supabase_url');
    let supabaseKey = await AsyncStorage.getItem('@supabase_key');
    if (!supabaseUrl) supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseKey) supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
    
    if (supabaseUrl && supabaseKey && importedTxs.length > 0) {
      const cleanUrl = supabaseUrl.trim().replace(/\/$/, '');
      fetch(`${cleanUrl}/rest/v1/transactions`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(importedTxs.map(tx => ({
          id: tx.id,
          amount: tx.amount,
          type: tx.type,
          category: tx.category || 'Other',
          date: tx.date || new Date().toISOString(),
          description: tx.description || '',
          source: tx.source || 'manual',
          mode: tx.mode || 'UPI',
          user_email: userEmail,
        }))),
      }).catch(e => console.warn('Backup transactions import to Supabase failed:', e));
    }
    
    if (data.budgetLimit !== undefined) {
      await AsyncStorage.setItem(BUDGET_LIMIT_KEY, String(data.budgetLimit));
    }
    
    // Refresh notifications for this user
    await refreshAllNotifications(importedLoans, importedInsurances);
    
    return true;
  } catch (e) {
    console.error('Error importing data:', e);
    throw e;
  }
};


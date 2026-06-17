import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateEMIBreakdown } from './emiCalculator';
import { cancelAllLoanNotifications, scheduleEMIReminder, scheduleInsuranceReminder } from './notifications';
import { getTransactions, getSupabaseConfig, isUserEmailColumnSupported } from './transactions';

const BUDGET_LIMIT_KEY = '@budget_limit';

const getCleanUrl = (url) => {
  if (!url) return '';
  let clean = url.trim().replace(/\/$/, '');
  if (clean.endsWith('/rest/v1')) {
    clean = clean.substring(0, clean.length - 8);
  }
  return clean;
};

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

// User-scoped getters
export const getInsurances = async () => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      console.warn('Supabase not configured, returning empty insurances');
      return [];
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    
    let fetchUrl = `${cleanUrl}/rest/v1/insurances?select=*`;
    if (isUserEmailColumnSupported) {
      fetchUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
    }
    
    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch insurances: ${response.status}`);
    }

    const data = await response.json();
    return data.map(ins => ({
      id: ins.id,
      name: ins.name || ins.insuranceName || ins.insurance_name || 'Unnamed Policy',
      premiumAmount: parseFloat(ins.premiumamount || ins.premium_amount || ins.premiumAmount || 0),
      startDate: ins.startdate || ins.start_date || ins.startDate,
      frequency: ins.frequency || 'monthly',
      createdAt: ins.createdat || ins.created_at || ins.createdAt || new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Error reading insurances from Supabase:', e);
    return [];
  }
};

export const saveInsurance = async (insurance) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    const newIns = {
      id: insurance.id || Date.now().toString(),
      name: insurance.name || insurance.insuranceName || insurance.insurance_name || 'Unnamed Policy',
      premiumamount: parseFloat(insurance.premiumAmount || insurance.premium_amount || insurance.premiumamount || 0),
      startdate: insurance.startDate || insurance.start_date || insurance.startdate || new Date().toISOString().split('T')[0],
      frequency: insurance.frequency || 'monthly',
    };
    if (isUserEmailColumnSupported) {
      newIns.user_email = userEmail;
    }

    const response = await fetch(`${cleanUrl}/rest/v1/insurances`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(newIns),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to save insurance to Supabase: ${response.status} - ${errText}`);
    }

    const savedData = await response.json();
    const savedIns = savedData && savedData[0] ? savedData[0] : newIns;

    // Refresh notifications
    const loans = await getLoans();
    const userInsurances = await getInsurances();
    await refreshAllNotifications(loans, userInsurances);

    return {
      id: savedIns.id,
      name: savedIns.name,
      premiumAmount: parseFloat(savedIns.premiumamount || savedIns.premium_amount || savedIns.premiumAmount || 0),
      startDate: savedIns.startdate || savedIns.start_date || savedIns.startDate,
      frequency: savedIns.frequency || 'monthly',
      createdAt: savedIns.createdat || savedIns.created_at || savedIns.createdAt || new Date().toISOString(),
    };
  } catch (e) {
    console.error('Error saving insurance to Supabase:', e);
    throw e;
  }
};

export const deleteInsurance = async (id) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    
    let deleteUrl = `${cleanUrl}/rest/v1/insurances?id=eq.${id}`;
    if (isUserEmailColumnSupported) {
      deleteUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
    }

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to delete insurance from Supabase: ${response.status} - ${errText}`);
    }

    // Refresh notifications
    const loans = await getLoans();
    const userInsurances = await getInsurances();
    await refreshAllNotifications(loans, userInsurances);
  } catch (e) {
    console.error('Error deleting insurance from Supabase:', e);
    throw e;
  }
};

export const updateInsurance = async (id, updates) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';

    let patchUrl = `${cleanUrl}/rest/v1/insurances?id=eq.${id}`;
    if (isUserEmailColumnSupported) {
      patchUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
    }

    const patchPayload = {};
    if (updates.name !== undefined) patchPayload.name = updates.name;
    if (updates.premiumAmount !== undefined) patchPayload.premiumamount = parseFloat(updates.premiumAmount);
    if (updates.premium_amount !== undefined) patchPayload.premiumamount = parseFloat(updates.premium_amount);
    if (updates.startDate !== undefined) patchPayload.startdate = updates.startDate;
    if (updates.start_date !== undefined) patchPayload.startdate = updates.start_date;
    if (updates.frequency !== undefined) patchPayload.frequency = updates.frequency;

    const response = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(patchPayload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to update insurance on Supabase: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const updatedIns = data && data[0] ? data[0] : { id, ...updates };

    // Refresh notifications
    const loans = await getLoans();
    const userInsurances = await getInsurances();
    await refreshAllNotifications(loans, userInsurances);

    return {
      id: updatedIns.id,
      name: updatedIns.name,
      premiumAmount: parseFloat(updatedIns.premiumamount || updatedIns.premium_amount || updatedIns.premiumAmount || 0),
      startDate: updatedIns.startdate || updatedIns.start_date || updatedIns.startDate,
      frequency: updatedIns.frequency || 'monthly',
      createdAt: updatedIns.createdat || updatedIns.created_at || updatedIns.createdAt || new Date().toISOString(),
    };
  } catch (e) {
    console.error('Error updating insurance on Supabase:', e);
    throw e;
  }
};

// Loan operations
export const getLoans = async () => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      console.warn('Supabase not configured, returning empty loans');
      return [];
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';

    let fetchUrl = `${cleanUrl}/rest/v1/loans?select=*`;
    if (isUserEmailColumnSupported) {
      fetchUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
    }

    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch loans: ${response.status}`);
    }

    const data = await response.json();
    return data.map(loan => ({
      id: loan.id,
      loanName: loan.loanname || loan.loan_name || loan.loanName || 'Unnamed Loan',
      loanType: loan.loantype || loan.loan_type || loan.loanType || 'emi',
      principal: parseFloat(loan.principal || 0),
      interest: parseFloat(loan.interest || 0),
      tenure: parseInt(loan.tenure || 0),
      emiAmount: parseFloat(loan.emiamount || loan.emi_amount || loan.emiAmount || 0),
      startDate: loan.startdate || loan.start_date || loan.startDate,
      status: loan.status || 'active',
      createdAt: loan.createdat || loan.created_at || loan.createdAt || new Date().toISOString(),
      updatedAt: loan.updatedat || loan.updated_at || loan.updatedAt || new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Error reading loans from Supabase:', e);
    return [];
  }
};

export const saveLoan = async (loan) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    const newLoan = {
      id: loan.id || `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      loanname: loan.loanName || loan.loan_name || loan.loanname || 'Unnamed Loan',
      loantype: loan.loanType || loan.loan_type || loan.loantype || 'emi',
      principal: parseFloat(loan.principal || 0),
      interest: parseFloat(loan.interest || 0),
      tenure: parseInt(loan.tenure || 0),
      emiamount: parseFloat(loan.emiAmount || loan.emi_amount || loan.emiamount || 0),
      startdate: loan.startDate || loan.start_date || loan.startdate || new Date().toISOString().split('T')[0],
      status: loan.status || 'active',
    };
    if (isUserEmailColumnSupported) {
      newLoan.user_email = userEmail;
    }

    const response = await fetch(`${cleanUrl}/rest/v1/loans`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(newLoan),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to save loan to Supabase: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const savedLoan = data && data[0] ? data[0] : newLoan;

    const insurances = await getInsurances();
    const userLoans = await getLoans();
    await refreshAllNotifications(userLoans, insurances);

    return {
      id: savedLoan.id,
      loanName: savedLoan.loanname || savedLoan.loan_name || savedLoan.loanName || 'Unnamed Loan',
      loanType: savedLoan.loantype || savedLoan.loan_type || savedLoan.loanType || 'emi',
      principal: parseFloat(savedLoan.principal || 0),
      interest: parseFloat(savedLoan.interest || 0),
      tenure: parseInt(savedLoan.tenure || 0),
      emiAmount: parseFloat(savedLoan.emiamount || savedLoan.emi_amount || savedLoan.emiAmount || 0),
      startDate: savedLoan.startdate || savedLoan.start_date || savedLoan.startDate,
      status: savedLoan.status || 'active',
      createdAt: savedLoan.createdat || savedLoan.created_at || savedLoan.createdAt || new Date().toISOString(),
      updatedAt: savedLoan.updatedat || savedLoan.updated_at || savedLoan.updatedAt || new Date().toISOString(),
    };
  } catch (e) {
    console.error('Error saving loan to Supabase:', e);
    throw e;
  }
};

export const updateLoan = async (loanId, updatedData) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';

    let patchUrl = `${cleanUrl}/rest/v1/loans?id=eq.${loanId}`;
    if (isUserEmailColumnSupported) {
      patchUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
    }

    const patchPayload = {};
    if (updatedData.loanName !== undefined) patchPayload.loanname = updatedData.loanName;
    if (updatedData.loan_name !== undefined) patchPayload.loanname = updatedData.loan_name;
    if (updatedData.loanType !== undefined) patchPayload.loantype = updatedData.loanType;
    if (updatedData.loan_type !== undefined) patchPayload.loantype = updatedData.loan_type;
    if (updatedData.principal !== undefined) patchPayload.principal = parseFloat(updatedData.principal);
    if (updatedData.interest !== undefined) patchPayload.interest = parseFloat(updatedData.interest);
    if (updatedData.tenure !== undefined) patchPayload.tenure = parseInt(updatedData.tenure);
    if (updatedData.emiAmount !== undefined) patchPayload.emiamount = parseFloat(updatedData.emiAmount);
    if (updatedData.emi_amount !== undefined) patchPayload.emiamount = parseFloat(updatedData.emi_amount);
    if (updatedData.startDate !== undefined) patchPayload.startdate = updatedData.startDate;
    if (updatedData.start_date !== undefined) patchPayload.startdate = updatedData.start_date;
    if (updatedData.status !== undefined) patchPayload.status = updatedData.status;

    const response = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(patchPayload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to update loan on Supabase: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const updatedLoan = data && data[0] ? data[0] : { id: loanId, ...updatedData };

    const insurances = await getInsurances();
    const userLoans = await getLoans();
    await refreshAllNotifications(userLoans, insurances);

    return {
      id: updatedLoan.id,
      loanName: updatedLoan.loanname || updatedLoan.loan_name || updatedLoan.loanName || 'Unnamed Loan',
      loanType: updatedLoan.loantype || updatedLoan.loan_type || updatedLoan.loanType || 'emi',
      principal: parseFloat(updatedLoan.principal || 0),
      interest: parseFloat(updatedLoan.interest || 0),
      tenure: parseInt(updatedLoan.tenure || 0),
      emiAmount: parseFloat(updatedLoan.emiamount || updatedLoan.emi_amount || updatedLoan.emiAmount || 0),
      startDate: updatedLoan.startdate || updatedLoan.start_date || updatedLoan.startDate,
      status: updatedLoan.status || 'active',
      createdAt: updatedLoan.createdat || updatedLoan.created_at || updatedLoan.createdAt || new Date().toISOString(),
      updatedAt: updatedLoan.updatedat || updatedLoan.updated_at || updatedLoan.updatedAt || new Date().toISOString(),
    };
  } catch (e) {
    console.error('Error updating loan on Supabase:', e);
    throw e;
  }
};

export const deleteLoan = async (loanId) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';

    // 1. Delete associated payments to prevent orphan data in Supabase
    let deletePaymentsUrl = `${cleanUrl}/rest/v1/payments?loanid=eq.${loanId}`;
    if (isUserEmailColumnSupported) {
      deletePaymentsUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
    }

    await fetch(deletePaymentsUrl, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    // 2. Delete the loan itself
    let deleteLoanUrl = `${cleanUrl}/rest/v1/loans?id=eq.${loanId}`;
    if (isUserEmailColumnSupported) {
      deleteLoanUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
    }

    const response = await fetch(deleteLoanUrl, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to delete loan from Supabase: ${response.status} - ${errText}`);
    }

    const insurances = await getInsurances();
    const userLoans = await getLoans();
    await refreshAllNotifications(userLoans, insurances);
  } catch (e) {
    console.error('Error deleting loan from Supabase:', e);
    throw e;
  }
};

// Payment operations
export const getPayments = async () => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      console.warn('Supabase not configured, returning empty payments');
      return [];
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';

    let fetchUrl = `${cleanUrl}/rest/v1/payments?select=*`;
    if (isUserEmailColumnSupported) {
      fetchUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
    }

    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch payments: ${response.status}`);
    }

    const data = await response.json();
    return data.map(payment => ({
      id: payment.id,
      loanId: payment.loanid || payment.loan_id || payment.loanId,
      amount: parseFloat(payment.amount || 0),
      paidAt: payment.paidat || payment.paid_at || payment.paidAt,
      createdAt: payment.createdat || payment.created_at || payment.createdAt || payment.paidat || new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Error reading payments from Supabase:', e);
    return [];
  }
};

export const addPayment = async (payment) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    const newPayment = {
      id: payment.id || Date.now().toString(),
      loanid: payment.loanId || payment.loan_id || payment.loanid,
      amount: parseFloat(payment.amount || 0),
      paidat: payment.date || payment.paidAt || payment.paid_at || payment.paidat || new Date().toISOString(),
    };
    if (isUserEmailColumnSupported) {
      newPayment.user_email = userEmail;
    }

    const response = await fetch(`${cleanUrl}/rest/v1/payments`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(newPayment),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to add payment on Supabase: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const savedPayment = data && data[0] ? data[0] : newPayment;
    return {
      id: savedPayment.id,
      loanId: savedPayment.loanid || savedPayment.loan_id || savedPayment.loanId,
      amount: parseFloat(savedPayment.amount || 0),
      paidAt: savedPayment.paidat || savedPayment.paid_at || savedPayment.paidAt,
      createdAt: savedPayment.createdat || savedPayment.created_at || savedPayment.createdAt || new Date().toISOString(),
    };
  } catch (e) {
    console.error('Error adding payment on Supabase:', e);
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
  let totalInterestSaved = 0;
  
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

    const standardInterest = loanType === 'bullet'
      ? principal * (interest / 100) * (tenure / 12)
      : (emiAmount * tenure) - principal;
    const loanInterestSaved = Math.max(0, standardInterest - breakdown.totalInterest);
    totalInterestSaved += loanInterestSaved;
    
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
    totalInterestSaved,
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
    const { url, key } = await getSupabaseConfig();
    
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }
    
    const cleanUrl = getCleanUrl(url);

    // 1. Delete all current user's records from Supabase tables to override/overwrite
    const deleteHeaders = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    };

    let deleteFilter = `?user_email=eq.${encodeURIComponent(userEmail)}`;
    if (!isUserEmailColumnSupported) {
      deleteFilter = `?id=not.is.null`;
    }

    // Delete existing records (order: payments first due to foreign keys referencing loans)
    await fetch(`${cleanUrl}/rest/v1/payments${deleteFilter}`, { method: 'DELETE', headers: deleteHeaders });
    await fetch(`${cleanUrl}/rest/v1/loans${deleteFilter}`, { method: 'DELETE', headers: deleteHeaders });
    await fetch(`${cleanUrl}/rest/v1/insurances${deleteFilter}`, { method: 'DELETE', headers: deleteHeaders });
    await fetch(`${cleanUrl}/rest/v1/transactions${deleteFilter}`, { method: 'DELETE', headers: deleteHeaders });

    const cleanNumeric = (val) => {
      if (val === undefined || val === null) return 0;
      const cleaned = String(val).replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    const cleanInteger = (val) => {
      if (val === undefined || val === null) return 0;
      const cleaned = String(val).replace(/[^0-9-]/g, '');
      const num = parseInt(cleaned, 10);
      return isNaN(num) ? 0 : num;
    };

    // 2. Tag imported data with current user_email and filter to database columns only
    const importedLoans = (data.loans || []).map(l => {
      const loanObj = {
        id: String(l.id || l.loanId || `${Date.now()}-${Math.floor(Math.random() * 1000)}`),
        loanname: l.loanName || l.loan_name || l.loanname || 'Unnamed Loan',
        loantype: l.loanType || l.loan_type || l.loantype || 'emi',
        principal: cleanNumeric(l.principal),
        interest: cleanNumeric(l.interest),
        tenure: cleanInteger(l.tenure),
        emiamount: cleanNumeric(l.emiAmount || l.emi_amount || l.emiamount),
        startdate: l.startDate || l.start_date || l.startdate || new Date().toISOString().split('T')[0],
        status: l.status || 'active',
      };
      if (isUserEmailColumnSupported) {
        loanObj.user_email = userEmail;
      }
      return loanObj;
    });

    const importedPayments = (data.payments || []).map(p => {
      const paymentObj = {
        id: String(p.id || `${Date.now()}-${Math.floor(Math.random() * 1000)}`),
        loanid: String(p.loanId || p.loan_id || p.loanid),
        amount: cleanNumeric(p.amount),
        paidat: p.paidAt || p.paid_at || p.date || p.paidat || new Date().toISOString(),
      };
      if (isUserEmailColumnSupported) {
        paymentObj.user_email = userEmail;
      }
      return paymentObj;
    });

    const importedInsurances = (data.insurances || []).map(i => {
      const insObj = {
        id: String(i.id || `${Date.now()}-${Math.floor(Math.random() * 1000)}`),
        name: i.name || i.insuranceName || i.insurance_name || 'Unnamed Policy',
        premiumamount: cleanNumeric(i.premiumAmount || i.premium_amount || i.premiumamount),
        startdate: i.startDate || i.start_date || i.startdate || new Date().toISOString().split('T')[0],
        frequency: i.frequency || 'monthly',
      };
      if (isUserEmailColumnSupported) {
        insObj.user_email = userEmail;
      }
      return insObj;
    });

    const importedTxs = (data.transactions || []).map(t => {
      const txObj = {
        id: String(t.id || `${Date.now()}-${Math.floor(Math.random() * 1000)}`),
        amount: cleanNumeric(t.amount),
        type: String(t.type || 'debit').toLowerCase(),
        category: t.category || 'Other',
        mode: t.mode || 'UPI',
        date: t.date || t.created_at || new Date().toISOString(),
        description: t.description || '',
        source: t.source || 'manual',
      };
      if (isUserEmailColumnSupported) {
        txObj.user_email = userEmail;
      }
      return txObj;
    });

    const postHeaders = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    };

    // Upload records (order: loans first so payments can link correctly)
    if (importedLoans.length > 0) {
      const res = await fetch(`${cleanUrl}/rest/v1/loans`, {
        method: 'POST',
        headers: postHeaders,
        body: JSON.stringify(importedLoans),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to upload loans: ${res.status} - ${txt}`);
      }
    }

    const validLoanIds = new Set(importedLoans.map(l => l.id));
    const cleanPayments = importedPayments.filter(p => validLoanIds.has(p.loanid));

    if (cleanPayments.length > 0) {
      const res = await fetch(`${cleanUrl}/rest/v1/payments`, {
        method: 'POST',
        headers: postHeaders,
        body: JSON.stringify(cleanPayments),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to upload payments: ${res.status} - ${txt}`);
      }
    }

    if (importedInsurances.length > 0) {
      const res = await fetch(`${cleanUrl}/rest/v1/insurances`, {
        method: 'POST',
        headers: postHeaders,
        body: JSON.stringify(importedInsurances),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to upload insurances: ${res.status} - ${txt}`);
      }
    }

    if (importedTxs.length > 0) {
      const res = await fetch(`${cleanUrl}/rest/v1/transactions`, {
        method: 'POST',
        headers: postHeaders,
        body: JSON.stringify(importedTxs),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to upload transactions: ${res.status} - ${txt}`);
      }
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


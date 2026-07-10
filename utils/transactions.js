import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSmartCategory, bulkClassifyCategories } from './classifier';

const GENERATED_EMI_KEY = '@generated_emi_ids';

export let isUserEmailColumnSupported = true;

const initUserEmailSupport = async () => {
  try {
    const val = await AsyncStorage.getItem('@supabase_missing_user_email');
    if (val === 'true') {
      isUserEmailColumnSupported = false;
    }
  } catch (e) {
    // ignore
  }
};
initUserEmailSupport();

const markUserEmailMissing = async () => {
  isUserEmailColumnSupported = false;
  try {
    await AsyncStorage.setItem('@supabase_missing_user_email', 'true');
  } catch (e) {
    // ignore
  }
};

const TRANSACTIONS_KEY = '@transactions';
const BUDGET_LIMIT_KEY = '@budget_limit';
const SUPABASE_URL_KEY = '@supabase_url';
const SUPABASE_KEY_KEY = '@supabase_key';

const getCleanUrl = (url) => {
  if (!url) return '';
  let clean = url.trim().replace(/\/$/, '');
  if (clean.endsWith('/rest/v1')) {
    clean = clean.substring(0, clean.length - 8);
  }
  return clean;
};

export const normalizeMode = (m) => {
  if (!m) return 'UPI';
  const clean = m.trim().toLowerCase();
  if (clean === 'card' || clean === 'credit card' || clean === 'cc') {
    return 'Credit Card';
  }
  if (clean === 'cash') {
    return 'Cash';
  }
  return 'UPI';
};

const getAllTransactionsRaw = async () => {
  return [];
};

export const getTransactions = async (monthStr) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      console.warn('Supabase not configured, returning empty transactions');
      return [];
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    
    let dateFilter = '';
    if (monthStr) {
      const parts = monthStr.split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      
      // Get first day of next month
      let nextYear = year;
      let nextMonth = month + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
      
      dateFilter = `&date=gte.${start}&date=lt.${end}`;
    }

    let fetchUrl;
    if (isUserEmailColumnSupported) {
      fetchUrl = `${cleanUrl}/rest/v1/transactions?select=*&user_email=eq.${encodeURIComponent(userEmail)}${dateFilter}&order=date.desc`;
    } else {
      fetchUrl = `${cleanUrl}/rest/v1/transactions?select=*${dateFilter}&order=date.desc`;
    }

    let response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    let data = [];
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 400 && (errText.includes('user_email') || errText.includes('column'))) {
        console.warn('user_email column is missing in Supabase transactions table. Falling back to non-filtered GET.');
        await markUserEmailMissing();
        const fallbackUrl = `${cleanUrl}/rest/v1/transactions?select=*${dateFilter}&order=date.desc`;
        const fallbackResponse = await fetch(fallbackUrl, {
          method: 'GET',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          },
        });
        if (!fallbackResponse.ok) {
          throw new Error(`Supabase fallback API responded with status ${fallbackResponse.status}`);
        }
        data = await fallbackResponse.json();
      } else {
        throw new Error(`Supabase API responded with status ${response.status}: ${errText}`);
      }
    } else {
      data = await response.json();
    }

    const formatted = data.map((t) => ({
      ...t,
      amount: parseFloat(t.amount || 0),
      type: (t.type || 'debit').toLowerCase(),
      mode: normalizeMode(t.mode),
      synced: true,
    }));

    return formatted;
  } catch (e) {
    console.error('Error fetching transactions from Supabase:', e);
    return [];
  }
};

export const saveTransaction = async (transaction) => {
  try {
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    let finalCategory = transaction.category || 'Other';
    if (finalCategory === 'Other' && transaction.description) {
      finalCategory = await getSmartCategory(transaction.description);
    }

    const txData = {
      id: transaction.id || `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount: parseFloat(transaction.amount || 0),
      type: (transaction.type || 'debit').toLowerCase(),
      category: finalCategory,
      mode: normalizeMode(transaction.mode),
      date: transaction.date || new Date().toISOString(),
      description: transaction.description || `${transaction.type === 'credit' ? 'Inflow' : 'Outflow'} - ${finalCategory}`,
      source: transaction.source || 'manual',
    };

    if (isUserEmailColumnSupported) {
      txData.user_email = userEmail;
    }

    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }
    const cleanUrl = getCleanUrl(url);

    let response = await fetch(`${cleanUrl}/rest/v1/transactions`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(txData),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (isUserEmailColumnSupported && response.status === 400 && (errText.includes('user_email') || errText.includes('column'))) {
        await markUserEmailMissing();
        const { user_email, ...fallbackTx } = txData;
        let retryResponse = await fetch(`${cleanUrl}/rest/v1/transactions`, {
          method: 'POST',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(fallbackTx),
        });
        if (!retryResponse.ok) {
          throw new Error(`Failed to save transaction to Supabase (retry): ${retryResponse.status}`);
        }
        const data = await retryResponse.json();
        return { ...data[0], synced: true };
      } else {
        throw new Error(`Failed to save transaction to Supabase: ${response.status} - ${errText}`);
      }
    }

    const data = await response.json();
    return { ...data[0], synced: true };
  } catch (e) {
    console.error('Error saving transaction:', e);
    throw e;
  }
};

// Auto-generate EMI debit transactions for active EMI loans so they show up in
// the Spend Tracker and feed the budget. Idempotent: each (loan, month) is
// generated at most once ever (tracked in AsyncStorage), so re-running does
// nothing and deleting an EMI won't make it reappear. Bounded to the last 6
// months to match the spend tracker's viewing window.
export const syncEmiTransactions = async () => {
  try {
    const { getLoans } = require('./storage');
    const loans = await getLoans();
    const emiLoans = (loans || []).filter(
      (l) => (l.loanType || 'emi') === 'emi' && l.status !== 'closed' && l.emiAmount > 0 && l.startDate
    );
    if (emiLoans.length === 0) return { created: 0 };

    const existing = await getTransactions();
    const existingIds = new Set(existing.map((t) => String(t.id)));

    const genJson = await AsyncStorage.getItem(GENERATED_EMI_KEY);
    const generated = new Set(genJson ? JSON.parse(genJson) : []);

    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    let created = 0;
    const newlyGenerated = [];

    for (const loan of emiLoans) {
      const start = new Date(loan.startDate);
      if (isNaN(start.getTime())) continue;
      const dueDay = start.getDate();

      // Iterate month-by-month from the later of (loan start, 6 months ago) to now.
      const from = start > windowStart ? start : windowStart;
      let y = from.getFullYear();
      let m = from.getMonth();
      let guard = 0;

      while ((y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) && guard < 12) {
        guard++;
        const detId = `emi-${loan.id}-${y}-${m + 1}`;
        const dueDate = new Date(y, m, dueDay, 9, 0, 0);

        const monthOccupiedByManual = existing.some((t) => {
          if ((t.category || '').toLowerCase() !== 'emi') return false;
          if (!t.description || !loan.loanName || !t.description.includes(loan.loanName)) return false;
          const d = new Date(t.date);
          return d.getFullYear() === y && d.getMonth() === m;
        });

        if (dueDate <= now && !existingIds.has(detId) && !generated.has(detId) && !monthOccupiedByManual) {
          try {
            await saveTransaction({
              id: detId,
              amount: loan.emiAmount,
              type: 'debit',
              category: 'EMI',
              mode: 'UPI',
              date: dueDate.toISOString(),
              description: `EMI · ${loan.loanName}`,
              source: 'emi-auto',
            });
            created++;
            existingIds.add(detId);
            generated.add(detId);
            newlyGenerated.push(detId);
          } catch (e) {
            // Likely a duplicate-id conflict; mark generated so we stop retrying.
            generated.add(detId);
            newlyGenerated.push(detId);
          }
        }

        m++;
        if (m > 11) { m = 0; y++; }
      }
    }

    if (newlyGenerated.length > 0) {
      await AsyncStorage.setItem(GENERATED_EMI_KEY, JSON.stringify(Array.from(generated)));
    }
    return { created };
  } catch (e) {
    console.warn('syncEmiTransactions failed:', e);
    return { created: 0 };
  }
};

export const deleteTransaction = async (id) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const cleanUrl = getCleanUrl(url);
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      // return=representation makes Supabase return the rows it actually deleted,
      // so we can detect a "204 OK but nothing matched" (e.g. user_email mismatch).
      'Prefer': 'return=representation',
    };

    // Delete strictly by id only. Scoping by user_email caused rows whose
    // user_email didn't match the current account (SMS/shortcut/anonymous
    // imports) to silently survive the delete.
    const deleteById = async () => {
      const res = await fetch(`${cleanUrl}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Failed to delete transaction from Supabase: ${res.status} - ${errText}`);
      }
      const deleted = await res.json().catch(() => []);
      return Array.isArray(deleted) ? deleted.length : 0;
    };

    const deletedCount = await deleteById();
    if (deletedCount === 0) {
      console.warn(`deleteTransaction: no row matched id=${id} (already gone or RLS-blocked).`);
    }
  } catch (e) {
    console.error('Error deleting transaction:', e);
    throw e;
  }
};

export const getBudgetLimit = async () => {
  try {
    const limit = await AsyncStorage.getItem(BUDGET_LIMIT_KEY);
    return limit ? parseFloat(limit) : 50000;
  } catch (e) {
    return 50000;
  }
};

export const saveBudgetLimit = async (limit) => {
  try {
    await AsyncStorage.setItem(BUDGET_LIMIT_KEY, String(limit));
  } catch (e) {
    console.error('Error saving budget limit:', e);
  }
};

export const getSupabaseConfig = async () => {
  let url = process.env.EXPO_PUBLIC_SUPABASE_URL || await AsyncStorage.getItem(SUPABASE_URL_KEY);
  let key = process.env.EXPO_PUBLIC_SUPABASE_KEY || await AsyncStorage.getItem(SUPABASE_KEY_KEY);
  return { url: url || '', key: key || '' };
};

export const saveSupabaseConfig = async (url, key) => {
  await AsyncStorage.setItem(SUPABASE_URL_KEY, url || '');
  await AsyncStorage.setItem(SUPABASE_KEY_KEY, key || '');
};

export const syncWithSupabase = async () => {
  try {
    const latestTxs = await getTransactions();
    return { success: true, count: latestTxs.length };
  } catch (e) {
    return { success: false, reason: e.message };
  }
};

export const updateTransaction = async (updatedTx) => {
  try {
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    let finalCategory = updatedTx.category || 'Other';
    if (finalCategory === 'Other' && updatedTx.description) {
      finalCategory = await getSmartCategory(updatedTx.description);
    }

    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }
    const cleanUrl = getCleanUrl(url);

    // Match strictly by id (unique). Scoping the PATCH by user_email made edits
    // silently match zero rows when the row's user_email differed from the
    // current account (anonymous / SMS / Gmail imports) — the API returned 200
    // but nothing changed.
    const patchUrl = `${cleanUrl}/rest/v1/transactions?id=eq.${encodeURIComponent(updatedTx.id)}`;

    const buildPayload = (withEmail) => {
      const p = {
        amount: parseFloat(updatedTx.amount || 0),
        type: (updatedTx.type || 'debit').toLowerCase(),
        category: finalCategory,
        date: updatedTx.date,
        description: updatedTx.description,
        mode: normalizeMode(updatedTx.mode),
      };
      // Stamp ownership so the row shows up for this account going forward.
      if (withEmail) p.user_email = userEmail;
      return p;
    };

    const sendPatch = async (withEmail) => {
      const res = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(buildPayload(withEmail)),
      });
      return res;
    };

    let response = await sendPatch(isUserEmailColumnSupported);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (isUserEmailColumnSupported && response.status === 400 && (errText.includes('user_email') || errText.includes('column'))) {
        await markUserEmailMissing();
        response = await sendPatch(false);
        if (!response.ok) {
          throw new Error(`Failed to update transaction on Supabase (retry): ${response.status}`);
        }
      } else {
        throw new Error(`Failed to update transaction on Supabase: ${response.status} - ${errText}`);
      }
    }

    const data = await response.json().catch(() => []);
    if (!Array.isArray(data) || data.length === 0) {
      // 200 OK but no row changed — the id didn't match anything.
      throw new Error('No matching transaction was found to update.');
    }
    return { ...data[0], synced: true };
  } catch (e) {
    console.error('Error updating transaction:', e);
    throw e;
  }
};

export const classifyOtherTransactionsBatch = async () => {
  try {
    const apiKey = await AsyncStorage.getItem('@user_gemini_api_key') || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return { success: false, reason: 'Gemini API Key is missing. Please configure it in Settings.' };
    }

    const txs = await getTransactions();
    if (!txs || txs.length === 0) {
      return { success: true, count: 0, reason: 'No transactions found.' };
    }

    const scannedIdsJson = await AsyncStorage.getItem('@scanned_transactions_list');
    const scannedIds = scannedIdsJson ? JSON.parse(scannedIdsJson) : [];

    const unclassifiedTxs = txs.filter(t => 
      (t.category || '').toLowerCase() === 'other' && 
      t.description && 
      !scannedIds.includes(t.id)
    );

    if (unclassifiedTxs.length === 0) {
      return { success: true, count: 0, reason: 'All transactions are already classified or scanned.' };
    }

    const batch = unclassifiedTxs.slice(0, 20);
    const classifiedBatch = await bulkClassifyCategories(batch);

    let successCount = 0;
    const newScannedIds = [...scannedIds];

    for (const tx of classifiedBatch) {
      newScannedIds.push(tx.id);
      if (tx.category && tx.category.toLowerCase() !== 'other') {
        try {
          await updateTransaction(tx);
          successCount++;
        } catch (updateErr) {
          console.warn(`Failed to update transaction ${tx.id} on Supabase:`, updateErr);
        }
      }
    }

    await AsyncStorage.setItem('@scanned_transactions_list', JSON.stringify(newScannedIds));

    return { 
      success: true, 
      count: successCount, 
      scanned: batch.length,
      reason: `Successfully classified ${successCount} of ${batch.length} transaction(s).` 
    };
  } catch (e) {
    console.error('Batch classification error:', e);
    return { success: false, reason: e.message };
  }
};

export const deleteAllTransactions = async () => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    const cleanUrl = getCleanUrl(url);
    
    let deleteUrl = `${cleanUrl}/rest/v1/transactions`;
    if (isUserEmailColumnSupported) {
      deleteUrl += `?user_email=eq.${encodeURIComponent(userEmail)}`;
    } else {
      deleteUrl += `?id=not.is.null`;
    }

    let response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to delete all transactions: ${response.status} - ${errText}`);
    }
  } catch (e) {
    console.error('Error deleting all transactions:', e);
    throw e;
  }
};

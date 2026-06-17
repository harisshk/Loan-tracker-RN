import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSmartCategory, bulkClassifyCategories } from './classifier';

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

const getAllTransactionsRaw = async () => {
  return [];
};

export const getTransactions = async () => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      console.warn('Supabase not configured, returning empty transactions');
      return [];
    }

    const cleanUrl = getCleanUrl(url);
    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    
    let fetchUrl;
    if (isUserEmailColumnSupported) {
      fetchUrl = `${cleanUrl}/rest/v1/transactions?select=*&user_email=eq.${encodeURIComponent(userEmail)}&order=date.desc`;
    } else {
      fetchUrl = `${cleanUrl}/rest/v1/transactions?select=*&order=date.desc`;
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
        const fallbackUrl = `${cleanUrl}/rest/v1/transactions?select=*&order=date.desc`;
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
      mode: transaction.mode || 'UPI',
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

export const deleteTransaction = async (id) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    const cleanUrl = getCleanUrl(url);
    
    let deleteUrl = `${cleanUrl}/rest/v1/transactions?id=eq.${id}`;
    if (isUserEmailColumnSupported) {
      deleteUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
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
      if (isUserEmailColumnSupported && response.status === 400 && (errText.includes('user_email') || errText.includes('column'))) {
        await markUserEmailMissing();
        const fallbackUrl = `${cleanUrl}/rest/v1/transactions?id=eq.${id}`;
        const fallbackResponse = await fetch(fallbackUrl, {
          method: 'DELETE',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          },
        });
        if (!fallbackResponse.ok) {
          throw new Error(`Failed to delete transaction from Supabase (retry): ${fallbackResponse.status}`);
        }
      } else {
        throw new Error(`Failed to delete transaction from Supabase: ${response.status} - ${errText}`);
      }
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

    let patchUrl = `${cleanUrl}/rest/v1/transactions?id=eq.${updatedTx.id}`;
    if (isUserEmailColumnSupported) {
      patchUrl += `&user_email=eq.${encodeURIComponent(userEmail)}`;
    }

    const patchPayload = {
      amount: parseFloat(updatedTx.amount || 0),
      type: (updatedTx.type || 'debit').toLowerCase(),
      category: finalCategory,
      date: updatedTx.date,
      description: updatedTx.description,
      mode: updatedTx.mode || 'UPI',
    };
    if (isUserEmailColumnSupported) {
      patchPayload.user_email = userEmail;
    }

    let response = await fetch(patchUrl, {
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
      if (isUserEmailColumnSupported && response.status === 400 && (errText.includes('user_email') || errText.includes('column'))) {
        await markUserEmailMissing();
        const fallbackUrl = `${cleanUrl}/rest/v1/transactions?id=eq.${updatedTx.id}`;
        const fallbackPayload = { ...patchPayload };
        delete fallbackPayload.user_email;

        const fallbackResponse = await fetch(fallbackUrl, {
          method: 'PATCH',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(fallbackPayload),
        });
        if (!fallbackResponse.ok) {
          throw new Error(`Failed to update transaction on Supabase (retry): ${fallbackResponse.status}`);
        }
        const data = await fallbackResponse.json();
        return { ...data[0], synced: true };
      } else {
        throw new Error(`Failed to update transaction on Supabase: ${response.status} - ${errText}`);
      }
    }

    const data = await response.json();
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

    const batch = unclassifiedTxs.slice(0, 10);
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

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
  try {
    const jsonValue = await AsyncStorage.getItem(TRANSACTIONS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error reading raw transactions:', e);
    return [];
  }
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

    return data.map((t) => ({
      ...t,
      amount: parseFloat(t.amount || 0),
      type: (t.type || 'debit').toLowerCase(),
      synced: true,
    }));
  } catch (e) {
    console.error('Error fetching transactions from Supabase:', e);
    return [];
  }
};

export const saveTransaction = async (transaction) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    let finalCategory = transaction.category || 'Other';
    if (finalCategory === 'Other' && transaction.description) {
      finalCategory = await getSmartCategory(transaction.description);
    }

    const newTx = {
      id: transaction.id || `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount: transaction.amount,
      type: transaction.type,
      category: finalCategory,
      mode: transaction.mode || 'UPI',
      date: transaction.date || new Date().toISOString(),
      description: transaction.description || `${transaction.type === 'credit' ? 'Inflow' : 'Outflow'} - ${finalCategory}`,
      source: transaction.source || 'manual',
    };
    if (isUserEmailColumnSupported) {
      newTx.user_email = userEmail;
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
      body: JSON.stringify(newTx),
    });

    let data;
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (isUserEmailColumnSupported && response.status === 400 && (errText.includes('user_email') || errText.includes('column'))) {
        console.warn('user_email column is missing in Supabase. Saving transaction without user_email tag.');
        await markUserEmailMissing();
        // Remove user_email field from payload and retry
        const { user_email, ...fallbackTx } = newTx;
        const retryResponse = await fetch(`${cleanUrl}/rest/v1/transactions`, {
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
        data = await retryResponse.json();
      } else {
        throw new Error(`Failed to save transaction to Supabase: ${response.status} - ${errText}`);
      }
    } else {
      data = await response.json();
    }

    const createdTx = data[0] || newTx;
    return {
      ...createdTx,
      amount: parseFloat(createdTx.amount || 0),
      synced: true,
    };
  } catch (e) {
    console.error('Error saving transaction directly to Supabase:', e);
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
    
    let deleteUrl;
    if (isUserEmailColumnSupported) {
      deleteUrl = `${cleanUrl}/rest/v1/transactions?id=eq.${id}&user_email=eq.${encodeURIComponent(userEmail)}`;
    } else {
      deleteUrl = `${cleanUrl}/rest/v1/transactions?id=eq.${id}`;
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
        console.warn('user_email column is missing in Supabase. Deleting transaction without user_email filter.');
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
    console.error('Error deleting transaction from Supabase:', e);
    throw e;
  }
};

export const getBudgetLimit = async () => {
  try {
    const limit = await AsyncStorage.getItem(BUDGET_LIMIT_KEY);
    return limit ? parseFloat(limit) : 50000; // default 50k
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
  let url = await AsyncStorage.getItem(SUPABASE_URL_KEY);
  let key = await AsyncStorage.getItem(SUPABASE_KEY_KEY);
  if (!url) url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!key) key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  return { url: url || '', key: key || '' };
};

export const saveSupabaseConfig = async (url, key) => {
  await AsyncStorage.setItem(SUPABASE_URL_KEY, url || '');
  await AsyncStorage.setItem(SUPABASE_KEY_KEY, key || '');
};

// Deprecated local sync: directly returns remote transaction count as a success message
export const syncWithSupabase = async () => {
  try {
    const txs = await getTransactions();
    return { success: true, count: txs.length };
  } catch (e) {
    return { success: false, reason: e.message };
  }
};

export const updateTransaction = async (updatedTx) => {
  try {
    const { url, key } = await getSupabaseConfig();
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
    let finalCategory = updatedTx.category || 'Other';
    if (finalCategory === 'Other' && updatedTx.description) {
      finalCategory = await getSmartCategory(updatedTx.description);
    }

    const cleanUrl = getCleanUrl(url);
    
    let patchUrl;
    if (isUserEmailColumnSupported) {
      patchUrl = `${cleanUrl}/rest/v1/transactions?id=eq.${updatedTx.id}&user_email=eq.${encodeURIComponent(userEmail)}`;
    } else {
      patchUrl = `${cleanUrl}/rest/v1/transactions?id=eq.${updatedTx.id}`;
    }

    const patchPayload = {
      amount: updatedTx.amount,
      type: updatedTx.type,
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

    let data;
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (isUserEmailColumnSupported && response.status === 400 && (errText.includes('user_email') || errText.includes('column'))) {
        console.warn('user_email column is missing in Supabase. Updating transaction without user_email tag/filter.');
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
        data = await fallbackResponse.json();
      } else {
        throw new Error(`Failed to update transaction on Supabase: ${response.status} - ${errText}`);
      }
    } else {
      data = await response.json();
    }

    const resultTx = data[0] || updatedTx;
    return {
      ...resultTx,
      amount: parseFloat(resultTx.amount || 0),
      synced: true,
    };
  } catch (e) {
    console.error('Error updating transaction on Supabase:', e);
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

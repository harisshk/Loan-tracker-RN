import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSmartCategory } from './classifier';

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

export const getTransactions = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(TRANSACTIONS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error reading transactions:', e);
    return [];
  }
};

export const saveTransaction = async (transaction) => {
  try {
    const transactions = await getTransactions();
    
    let finalCategory = transaction.category || 'Other';
    if (finalCategory === 'Other' && transaction.description) {
      finalCategory = await getSmartCategory(transaction.description);
    }

    const newTx = {
      id: transaction.id || `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...transaction,
      category: finalCategory,
      mode: transaction.mode || 'UPI',
      date: transaction.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      synced: false,
    };
    transactions.push(newTx);
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    
    // Attempt automatic background sync if Supabase is configured
    await syncWithSupabase();
    
    return newTx;
  } catch (e) {
    console.error('Error saving transaction:', e);
    throw e;
  }
};

export const deleteTransaction = async (id) => {
  try {
    const transactions = await getTransactions();
    const filtered = transactions.filter(t => t.id !== id);
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(filtered));
    
    // Delete from Supabase in the background if configured
    const supabaseUrl = await AsyncStorage.getItem(SUPABASE_URL_KEY);
    const supabaseKey = await AsyncStorage.getItem(SUPABASE_KEY_KEY);
    if (supabaseUrl && supabaseKey) {
      const cleanUrl = getCleanUrl(supabaseUrl);
      fetch(`${cleanUrl}/rest/v1/transactions?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }).catch(e => console.warn('Supabase delete background failed:', e));
    }
  } catch (e) {
    console.error('Error deleting transaction:', e);
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
  const url = await AsyncStorage.getItem(SUPABASE_URL_KEY);
  const key = await AsyncStorage.getItem(SUPABASE_KEY_KEY);
  return { url: url || '', key: key || '' };
};

export const saveSupabaseConfig = async (url, key) => {
  await AsyncStorage.setItem(SUPABASE_URL_KEY, url || '');
  await AsyncStorage.setItem(SUPABASE_KEY_KEY, key || '');
};

// Sync local transactions with Supabase
export const syncWithSupabase = async () => {
  try {
    const supabaseUrl = await AsyncStorage.getItem(SUPABASE_URL_KEY);
    const supabaseKey = await AsyncStorage.getItem(SUPABASE_KEY_KEY);
    
    if (!supabaseUrl || !supabaseKey) {
      return { success: false, reason: 'Supabase credentials not configured' };
    }

    const cleanUrl = getCleanUrl(supabaseUrl);
    const localTxs = await getTransactions();

    // 1. Fetch remote transactions
    const response = await fetch(`${cleanUrl}/rest/v1/transactions?select=*`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase API responded with status ${response.status}`);
    }

    const remoteTxs = await response.json();

    // 2. Simple sync logic: Merge local and remote by ID, newer updates wins if any.
    const remoteMap = new Map(remoteTxs.map(tx => [tx.id, tx]));
    const mergedMap = new Map();

    // Add all local transactions
    localTxs.forEach(tx => mergedMap.set(tx.id, tx));

    // Add remote transactions (remote wins in case of additions, e.g., Shortcut)
    remoteTxs.forEach(tx => {
      const mappedTx = {
        id: tx.id,
        amount: parseFloat(tx.amount),
        type: tx.type,
        category: tx.category || 'Other',
        date: tx.date || tx.created_at,
        description: tx.description || '',
        source: tx.source || 'shortcut',
        mode: tx.mode || 'UPI',
        synced: true,
      };
      mergedMap.set(tx.id, mappedTx);
    });

    const finalTxs = Array.from(mergedMap.values());
    
    // Set synced status for transactions that exist in remote Map
    finalTxs.forEach(tx => {
      if (remoteMap.has(tx.id)) {
        tx.synced = true;
      } else {
        tx.synced = tx.synced || false;
      }
    });

    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(finalTxs));

    // 3. Upload missing transactions back to Supabase
    const toUpload = finalTxs.filter(localTx => {
      const match = remoteMap.get(localTx.id);
      return !match; // Not in remote database yet
    });

    if (toUpload.length > 0) {
      const uploadResp = await fetch(`${cleanUrl}/rest/v1/transactions`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(toUpload.map(tx => ({
          id: tx.id,
          amount: tx.amount,
          type: tx.type,
          category: tx.category,
          date: tx.date,
          description: tx.description,
          source: tx.source || 'manual',
          mode: tx.mode || 'UPI',
        }))),
      });

      if (!uploadResp.ok) {
        console.warn('Sync uploading failed:', await uploadResp.text());
      } else {
        // Mark these uploaded transactions as synced!
        const uploadedIds = new Set(toUpload.map(tx => tx.id));
        finalTxs.forEach(tx => {
          if (uploadedIds.has(tx.id)) {
            tx.synced = true;
          }
        });
        await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(finalTxs));
      }
    }

    return { success: true, count: finalTxs.length };
  } catch (e) {
    console.error('Supabase Sync error:', e);
    return { success: false, reason: e.message };
  }
};

export const updateTransaction = async (updatedTx) => {
  try {
    const transactions = await getTransactions();
    const index = transactions.findIndex(t => t.id === updatedTx.id);
    if (index === -1) {
      throw new Error('Transaction not found');
    }
    
    let finalCategory = updatedTx.category || 'Other';
    if (finalCategory === 'Other' && updatedTx.description) {
      finalCategory = await getSmartCategory(updatedTx.description);
    }

    transactions[index] = {
      ...transactions[index],
      ...updatedTx,
      category: finalCategory,
      updatedAt: new Date().toISOString(),
      synced: false,
    };
    
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    
    const supabaseUrl = await AsyncStorage.getItem(SUPABASE_URL_KEY);
    const supabaseKey = await AsyncStorage.getItem(SUPABASE_KEY_KEY);
    if (supabaseUrl && supabaseKey) {
      const cleanUrl = getCleanUrl(supabaseUrl);
      fetch(`${cleanUrl}/rest/v1/transactions?id=eq.${updatedTx.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: updatedTx.amount,
          type: updatedTx.type,
          category: finalCategory,
          date: updatedTx.date,
          description: updatedTx.description,
          mode: updatedTx.mode || 'UPI',
        }),
      }).then(async (res) => {
        if (res.ok) {
          const currentTxs = await getTransactions();
          const curIndex = currentTxs.findIndex(t => t.id === updatedTx.id);
          if (curIndex !== -1) {
            currentTxs[curIndex].synced = true;
            await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(currentTxs));
          }
        }
      }).catch(e => console.warn('Supabase update background failed:', e));
    }
    
    return transactions[index];
  } catch (e) {
    console.error('Error updating transaction:', e);
    throw e;
  }
};

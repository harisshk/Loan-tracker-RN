import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTransactions, syncWithSupabase, getSupabaseConfig, isUserEmailColumnSupported } from './transactions';
import { classifyCategoryOffline, bulkClassifyCategories } from './classifier';

import { NativeModules } from 'react-native';

const isGoogleSigninSupported = !!NativeModules?.RNGoogleSignin;
const GoogleSignin = isGoogleSigninSupported
  ? require('@react-native-google-signin/google-signin').GoogleSignin
  : null;

if (isGoogleSigninSupported && GoogleSignin) {
  GoogleSignin.configure({
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email'],
    webClientId: '198617790134-m5dlqbvfjuol7qh5fjd3egctuokr36kn.apps.googleusercontent.com',
    iosClientId: '198617790134-6ov965e31pv623b7k24qb8g0ai8i397b.apps.googleusercontent.com',
  });
}

const TRANSACTIONS_KEY = '@transactions';
const GMAIL_ACCESS_TOKEN_KEY = '@gmail_access_token';
const GMAIL_REFRESH_TOKEN_KEY = '@gmail_refresh_token';
const GMAIL_EXPIRE_TIME_KEY = '@gmail_expire_time';
const GMAIL_USER_EMAIL_KEY = '@gmail_user_email';
const GMAIL_SEARCH_QUERY_KEY = '@gmail_search_query';

const DEFAULT_QUERY = '(from:alerts@hdfcbank.bank.in OR from:onlinesbicard@sbicard.com) "Rs."';
const GMAIL_LAST_SYNC_TIME_KEY = '@gmail_last_sync_time';

const getCleanUrl = (url) => {
  if (!url) return '';
  let clean = url.trim().replace(/\/$/, '');
  if (clean.endsWith('/rest/v1')) {
    clean = clean.substring(0, clean.length - 8);
  }
  return clean;
};

// Base64 URL Decoder helper for decoding Gmail raw payload
const base64UrlDecode = (str) => {
  if (!str) return '';
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    // Custom robust base64 decoder
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) {
      lookup[chars.charCodeAt(i)] = i;
    }
    let bufferLength = base64.length * 0.75,
      len = base64.length,
      i,
      p = 0,
      encoded1,
      encoded2,
      encoded3,
      encoded4;
    if (base64[base64.length - 1] === '=') {
      bufferLength--;
      if (base64[base64.length - 2] === '=') {
        bufferLength--;
      }
    }
    const bytes = new Uint8Array(bufferLength);
    for (i = 0; i < len; i += 4) {
      encoded1 = lookup[base64.charCodeAt(i)];
      encoded2 = lookup[base64.charCodeAt(i + 1)];
      encoded3 = lookup[base64.charCodeAt(i + 2)];
      encoded4 = lookup[base64.charCodeAt(i + 3)];
      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      if (encoded3 !== undefined) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      if (encoded4 !== undefined) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    let decodedStr = '';
    for (let j = 0; j < bytes.length; j++) {
      decodedStr += String.fromCharCode(bytes[j]);
    }
    // Handle multi-byte UTF-8 characters properly
    return decodeURIComponent(escape(decodedStr));
  } catch (e) {
    console.error('Base64 Url decoding failed:', e);
    return '';
  }
};

// Traverses Gmail body parts to find the plain text body
const getBodyFromPart = (part) => {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body && part.body.data) {
    return base64UrlDecode(part.body.data);
  }
  if (part.mimeType === 'text/html' && part.body && part.body.data) {
    return base64UrlDecode(part.body.data);
  }
  if (part.parts) {
    for (const subPart of part.parts) {
      const body = getBodyFromPart(subPart);
      if (body) return body;
    }
  }
  return '';
};

const getMessageBody = (message) => {
  if (!message || !message.payload) return '';
  if (message.payload.body && message.payload.body.data) {
    return base64UrlDecode(message.payload.body.data);
  }
  return getBodyFromPart(message.payload);
};

// Parses transaction info from email body
const parseGmailMessage = (bodyText, dateStr) => {
  // 1. Amount Match (anchored to Rs. or Rs)
  const amountRegex = /(?:Rs\.\s*|Rs\s*)([0-9]+\.[0-9]{2}|[0-9]+)/i;
  const match = bodyText.match(amountRegex);
  if (!match) return null;
  const amount = parseFloat(match[1].replace(/,/g, ''));

  if (isNaN(amount) || amount <= 0) return null;

  // 2. Type Match (Debit vs Credit)
  const isDebit = /spent|debited|paid|transfer|sent/i.test(bodyText);
  const isCredit = /received|credited|refund|added/i.test(bodyText);
  let type = 'debit';
  if (isCredit && !isDebit) type = 'credit';

  // 3. Mode Match (Credit Card vs UPI)
  const isCard = /card/i.test(bodyText);
  let mode = 'UPI';
  if (isCard) mode = 'Credit Card';

  // 4. Description Match
  let description = '';
  const merchantRegex = /(?:At|To)\s+([A-Za-z0-9\s#@_]+?)(?:\sby|\sOn|\susing|\sref|\sbal)/i;
  const merchMatch = bodyText.match(merchantRegex);
  if (merchMatch) {
    description = merchMatch[1].trim();
  } else {
    description = type === 'credit' ? 'Inflow (Email)' : 'Outflow (Email)';
  }

  // Create a unique, deterministic ID based on the exact email Date ISO string
  const id = `gmail-${dateStr.replace(/[^a-zA-Z0-9]/g, '')}`;

  return {
    id,
    amount,
    type,
    category: classifyCategoryOffline(description),
    description,
    date: dateStr,
    source: 'gmail',
    mode,
  };
};

export const saveGmailTokens = async (accessToken, refreshToken, expiresIn, userEmail) => {
  const expireTime = Date.now() + (expiresIn || 3600) * 1000;
  await AsyncStorage.setItem(GMAIL_ACCESS_TOKEN_KEY, accessToken || '');
  if (refreshToken) {
    await AsyncStorage.setItem(GMAIL_REFRESH_TOKEN_KEY, refreshToken);
  }
  await AsyncStorage.setItem(GMAIL_EXPIRE_TIME_KEY, String(expireTime));
  await AsyncStorage.setItem(GMAIL_USER_EMAIL_KEY, userEmail || '');
};

export const clearGmailTokens = async () => {
  await AsyncStorage.removeItem(GMAIL_ACCESS_TOKEN_KEY);
  await AsyncStorage.removeItem(GMAIL_REFRESH_TOKEN_KEY);
  await AsyncStorage.removeItem(GMAIL_EXPIRE_TIME_KEY);
  await AsyncStorage.removeItem(GMAIL_USER_EMAIL_KEY);
  await AsyncStorage.removeItem(GMAIL_LAST_SYNC_TIME_KEY);
};

export const getGmailConfig = async () => {
  const email = await AsyncStorage.getItem(GMAIL_USER_EMAIL_KEY);
  const query = await AsyncStorage.getItem(GMAIL_SEARCH_QUERY_KEY) || DEFAULT_QUERY;
  const hasRefreshToken = !!(await AsyncStorage.getItem(GMAIL_REFRESH_TOKEN_KEY));
  return { email: email || '', query, isConnected: !!email && hasRefreshToken };
};

export const saveGmailSearchQuery = async (query) => {
  await AsyncStorage.setItem(GMAIL_SEARCH_QUERY_KEY, query || DEFAULT_QUERY);
};

export const getGmailAccessToken = async () => {
  try {
    if (isGoogleSigninSupported && GoogleSignin) {
      const isSignedIn = await GoogleSignin.isSignedIn();
      if (isSignedIn) {
        const tokens = await GoogleSignin.getTokens();
        if (tokens && tokens.accessToken) {
          await AsyncStorage.setItem(GMAIL_ACCESS_TOKEN_KEY, tokens.accessToken);
          return { accessToken: tokens.accessToken };
        }
      }
    }
  } catch (e) {
    console.error('Failed to get Google token from native SDK:', e);
  }

  // Fallback to AsyncStorage if native sign-in is not active or fails
  const accessToken = await AsyncStorage.getItem(GMAIL_ACCESS_TOKEN_KEY);
  const refreshToken = await AsyncStorage.getItem(GMAIL_REFRESH_TOKEN_KEY);
  const expireTimeStr = await AsyncStorage.getItem(GMAIL_EXPIRE_TIME_KEY);
  
  if (!accessToken) {
    return { accessToken: null };
  }

  const expireTime = expireTimeStr ? parseInt(expireTimeStr, 10) : 0;
  
  // If expired or expiring in next 2 minutes, refresh it
  if (Date.now() + 120 * 1000 >= expireTime) {
    if (!refreshToken || refreshToken === 'native-refresh-token') {
      return { accessToken: null };
    }
    console.log('Refreshing Gmail access token using fallback refresh token...');
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: '198617790134-m5dlqbvfjuol7qh5fjd3egctuokr36kn.apps.googleusercontent.com', // active client ID from provider
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });

      if (!response.ok) {
        throw new Error('Refresh token swap failed');
      }

      const data = await response.json();
      const newAccess = data.access_token;
      const newExpire = Date.now() + (data.expires_in || 3600) * 1000;
      
      await AsyncStorage.setItem(GMAIL_ACCESS_TOKEN_KEY, newAccess);
      await AsyncStorage.setItem(GMAIL_EXPIRE_TIME_KEY, String(newExpire));
      return { accessToken: newAccess };
    } catch (e) {
      console.error('Failed to refresh Google token:', e);
      return { accessToken: null };
    }
  }

  return { accessToken };
};

// Checks if a transaction is a duplicate of an existing one (matching amount, type, and within a 60-minute window)
const isDuplicate = (newTx, existingTxs) => {
  const newTime = new Date(newTx.date).getTime();
  return existingTxs.some(exist => {
    if (exist.id === newTx.id) return true;
    
    // Check if amount and type are identical
    if (exist.type !== newTx.type) return false;
    if (Math.abs(exist.amount - newTx.amount) > 0.01) return false;
    
    // Check if the time difference is less than 60 minutes (3,600,000 ms)
    const existTime = new Date(exist.date).getTime();
    return Math.abs(newTime - existTime) <= 60 * 60 * 1000;
  });
};

export const syncGmailTransactions = async () => {
  const syncStartTime = Math.floor(Date.now() / 1000);
  try {
    const { accessToken } = await getGmailAccessToken();
    if (!accessToken) {
      return { success: false, reason: 'Gmail OAuth is not configured or expired.' };
    }

    const query = await AsyncStorage.getItem(GMAIL_SEARCH_QUERY_KEY) || DEFAULT_QUERY;
    
    // Check if we have a last sync time, and construct the date filter
    let finalQuery = query;
    const lastSyncTime = await AsyncStorage.getItem(GMAIL_LAST_SYNC_TIME_KEY);
    if (lastSyncTime) {
      finalQuery = `${query} after:${lastSyncTime}`;
    }
    
    console.log('Syncing Gmail with query:', finalQuery);
    const listUrl = `https://gmail.googleapis.com/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(finalQuery)}`;
    
    const listResp = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listResp.ok) {
      throw new Error(`Gmail API returned status ${listResp.status}`);
    }

    const listData = await listResp.json();
    if (!listData.messages || listData.messages.length === 0) {
      // Even if 0 messages, update the sync timestamp so next search starts from now
      await AsyncStorage.setItem(GMAIL_LAST_SYNC_TIME_KEY, String(syncStartTime));
      return { success: true, count: 0 };
    }

    const parsedTxs = [];
    for (const msgRef of listData.messages) {
      const detailUrl = `https://gmail.googleapis.com/v1/users/me/messages/${msgRef.id}?format=full`;
      const detailResp = await fetch(detailUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (detailResp.ok) {
        const msg = await detailResp.json();
        const body = getMessageBody(msg);
        
        // Get Received Date
        const headers = msg.payload.headers || [];
        const dateHeader = headers.find(h => h.name.toLowerCase() === 'date');
        const dateVal = dateHeader ? dateHeader.value : new Date().toISOString();
        const dateIso = new Date(dateVal).toISOString();

        const tx = parseGmailMessage(body, dateIso);
        if (tx) {
          parsedTxs.push(tx);
        }
      }
    }

    // Save the last successful sync timestamp
    await AsyncStorage.setItem(GMAIL_LAST_SYNC_TIME_KEY, String(syncStartTime));

    if (parsedTxs.length > 0) {
      const classifiedTxs = await bulkClassifyCategories(parsedTxs);

      const currentTxs = await getTransactions();
      const newTxs = classifiedTxs.filter(tx => !isDuplicate(tx, currentTxs));
      
      if (newTxs.length > 0) {
        const { url, key } = await getSupabaseConfig();
        if (url && key) {
          const cleanUrl = getCleanUrl(url);
          const userEmail = await AsyncStorage.getItem('@gmail_user_email') || 'anonymous';
          const uploadResp = await fetch(`${cleanUrl}/rest/v1/transactions`, {
            method: 'POST',
            headers: {
              'apikey': key,
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates',
            },
            body: JSON.stringify(newTxs.map(tx => {
              const payload = {
                id: tx.id,
                amount: tx.amount,
                type: tx.type,
                category: tx.category || 'Other',
                date: tx.date || new Date().toISOString(),
                description: tx.description || '',
                source: tx.source || 'gmail',
                mode: tx.mode || 'UPI',
              };
              if (isUserEmailColumnSupported) {
                payload.user_email = userEmail;
              }
              return payload;
            })),
          });
          
          if (!uploadResp.ok) {
            console.warn('Failed to upload Gmail transactions to Supabase:', await uploadResp.text());
          }
        }
      }
      return { success: true, count: newTxs.length };
    }

    return { success: true, count: 0 };
  } catch (e) {
    console.error('Gmail Sync Error:', e);
    return { success: false, reason: e.message };
  }
};

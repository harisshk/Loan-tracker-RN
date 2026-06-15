import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTransactions, syncWithSupabase } from './transactions';

const TRANSACTIONS_KEY = '@transactions';
const GMAIL_ACCESS_TOKEN_KEY = '@gmail_access_token';
const GMAIL_REFRESH_TOKEN_KEY = '@gmail_refresh_token';
const GMAIL_EXPIRE_TIME_KEY = '@gmail_expire_time';
const GMAIL_USER_EMAIL_KEY = '@gmail_user_email';
const GMAIL_SEARCH_QUERY_KEY = '@gmail_search_query';

const DEFAULT_QUERY = 'subject:(transaction OR spent OR debited OR credited OR received OR alert) "Rs."';

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
    category: type === 'credit' ? 'Salary' : 'Other',
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
  const accessToken = await AsyncStorage.getItem(GMAIL_ACCESS_TOKEN_KEY);
  const refreshToken = await AsyncStorage.getItem(GMAIL_REFRESH_TOKEN_KEY);
  const expireTimeStr = await AsyncStorage.getItem(GMAIL_EXPIRE_TIME_KEY);
  
  if (!accessToken || !refreshToken) {
    return { accessToken: null };
  }

  const expireTime = expireTimeStr ? parseInt(expireTimeStr, 10) : 0;
  
  // If expired or expiring in next 2 minutes, refresh it
  if (Date.now() + 120 * 1000 >= expireTime) {
    console.log('Refreshing Gmail access token...');
    try {
      // Swap refresh token for new access token
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

export const syncGmailTransactions = async () => {
  try {
    const { accessToken } = await getGmailAccessToken();
    if (!accessToken) {
      return { success: false, reason: 'Gmail OAuth is not configured or expired.' };
    }

    const query = await AsyncStorage.getItem(GMAIL_SEARCH_QUERY_KEY) || DEFAULT_QUERY;
    const listUrl = `https://gmail.googleapis.com/v1/users/me/messages?maxResults=15&q=${encodeURIComponent(query)}`;
    
    const listResp = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listResp.ok) {
      throw new Error(`Gmail API returned status ${listResp.status}`);
    }

    const listData = await listResp.json();
    if (!listData.messages || listData.messages.length === 0) {
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

    if (parsedTxs.length > 0) {
      const currentTxs = await getTransactions();
      const currentIds = new Set(currentTxs.map(t => t.id));
      
      const newTxs = parsedTxs.filter(tx => !currentIds.has(tx.id));
      
      if (newTxs.length > 0) {
        const updatedTxs = [...currentTxs, ...newTxs];
        await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(updatedTxs));
        
        // Force remote Supabase synchronization
        await syncWithSupabase();
      }
      return { success: true, count: newTxs.length };
    }

    return { success: true, count: 0 };
  } catch (e) {
    console.error('Gmail Sync Error:', e);
    return { success: false, reason: e.message };
  }
};

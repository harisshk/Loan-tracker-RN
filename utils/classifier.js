import AsyncStorage from '@react-native-async-storage/async-storage';

const CATEGORIES = ['Salary', 'Food', 'Grocery', 'Shopping', 'EMI', 'Bills', 'Investment', 'Entertainment', 'Travel', 'Credit Card Bill', 'Fruits & Vegetables', 'Electronics', 'Milk & Dairy', 'Other'];

const RULES = {
  'Milk & Dairy': ['milk', 'dairy', 'curd', 'paneer', 'butter', 'cheese', 'yogurt', 'amul', 'milkman', 'ghee', 'lassi', 'buttermilk', 'mother dairy'],
  'Fruits & Vegetables': ['fruit', 'vegetable', 'apple', 'banana', 'mango', 'orange', 'grape', 'onion', 'potato', 'tomato', 'veggies', 'sabji', 'sabzi', 'coconut', 'lemon'],
  Electronics: ['electronics', 'gadget', 'phone', 'mobile', 'laptop', 'computer', 'headphone', 'earphone', 'charger', 'macbook', 'ipad', 'tv', 'television', 'monitor', 'keyboard', 'mouse', 'apple store', 'icloud', 'itunes', 'apple.com'],
  Food: ['zomato', 'swiggy', 'starbucks', 'restaurant', 'cafe', 'food', 'dining', 'mcdonald', 'burger', 'pizza', 'bakery', 'eats', 'dosa', 'tea', 'chai', 'coffee', 'hotel', 'sweet', 'kitchen'],
  Grocery: ['grocery', 'supermarket', 'mart', 'dmart', 'grocer', 'instamart', 'blinkit', 'zepto', 'groceries', 'provision', 'bazaar'],
  Shopping: ['amazon', 'flipkart', 'myntra', 'hm', 'zara', 'mall', 'retail', 'reliance', 'clothing', 'ajio', 'meesho', 'nykaa', 'decathlon', 'shoppe', 'retailer', 'trends'],
  EMI: ['loan', 'emi', 'hdfc loan', 'sbi loan', 'mortgage', 'finance', 'credcard', 'cred'],
  Bills: ['electricity', 'water', 'gas', 'recharge', 'jio', 'airtel', 'bill', 'utility', 'insurance', 'broadband', 'wifi', 'bsnl', 'vi ', 'bescom', 'insurance', 'lic', 'tata play', 'dth', 'postpaid'],
  Investment: ['zerodha', 'groww', 'mutual fund', 'sip', 'stock', 'investment', 'etf', 'crypto', 'coin', 'wazirx', 'binance', 'upstox', 'angelone', 'indmoney', 'kuvera'],
  Entertainment: ['netflix', 'spotify', 'prime video', 'hotstar', 'movie', 'cinema', 'theatre', 'booking', 'game', 'arcade', 'bookmyshow', 'disney', 'playstation', 'xbox', 'steam', 'youtube premium', 'sub', 'membership'],
  Travel: ['uber', 'ola', 'rapido', 'metro', 'irctc', 'flight', 'airline', 'fuel', 'petrol', 'diesel', 'cabs', 'taxi', 'makemytrip', 'goibibo', 'easemytrip', 'railways', 'shell fuel', 'hpcl', 'iocl', 'bpcl', 'toll', 'tollbooth', 'fastag'],
  Salary: ['salary', 'salary credited', 'payroll', 'stipend', 'wages', 'dividend', 'interest credited', 'pension'],
  'Credit Card Bill': ['credit card bill', 'cc bill', 'cc payment', 'credit card payment', 'card payment', 'card settlement', 'cc outstanding', 'creditcard bill']
};

export const classifyCategoryOffline = (description) => {
  if (!description) return 'Other';
  const cleanDesc = description.trim().toLowerCase();

  for (const [category, keywords] of Object.entries(RULES)) {
    for (const keyword of keywords) {
      if (cleanDesc.includes(keyword)) {
        return category;
      }
    }
  }

  return 'Other';
};

export const classifyCategoryAI = async (description, apiKey) => {
  if (!apiKey || !description) return 'Other';
  
  try {
    const prompt = `You are a personal finance manager app. Classify the transaction description: "${description}" into exactly one of these categories: Salary, Food, Grocery, Shopping, EMI, Bills, Investment, Entertainment, Travel, Credit Card Bill, Fruits & Vegetables, Electronics, Milk & Dairy, Other. 
Reply with ONLY the category name. Do not include punctuation, quotes, markdown formatting or explanations.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const cleanOutput = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Other';

    if (CATEGORIES.includes(cleanOutput)) {
      return cleanOutput;
    }
    
    // Fuzzy matching check in case it returned category inside extra text
    for (const cat of CATEGORIES) {
      if (cleanOutput.toLowerCase().includes(cat.toLowerCase())) {
        return cat;
      }
    }

    return 'Other';
  } catch (e) {
    console.warn('Gemini Category Auto-Classifier failed:', e);
    return 'Other';
  }
};

export const getSmartCategory = async (description) => {
  if (!description) return 'Other';
  
  // 1. Try offline classification
  const offlineMatch = classifyCategoryOffline(description);
  if (offlineMatch !== 'Other') {
    return offlineMatch;
  }

  // 2. Try online AI classification if API key exists
  try {
    const apiKey = await AsyncStorage.getItem('@user_gemini_api_key');
    if (apiKey) {
      const aiMatch = await classifyCategoryAI(description, apiKey);
      return aiMatch;
    }
  } catch (err) {
    console.warn('Error reading Gemini API key for classification:', err);
  }

  return 'Other';
};

export const bulkClassifyCategories = async (txs) => {
  if (!txs || txs.length === 0) return txs;

  // Find transactions that are 'Other' and have descriptions
  const needsClassify = txs.filter(t => t.category === 'Other' && t.description);
  if (needsClassify.length === 0) return txs;

  try {
    const apiKey = await AsyncStorage.getItem('@user_gemini_api_key');
    if (!apiKey) return txs;

    const listToClassify = needsClassify.map((t, idx) => ({
      index: idx,
      description: t.description
    }));

    const prompt = `You are a personal finance manager. Classify each of the following transaction descriptions into exactly one of these categories: Salary, Food, Grocery, Shopping, EMI, Bills, Investment, Entertainment, Travel, Credit Card Bill, Fruits & Vegetables, Electronics, Milk & Dairy, Other.
Return the result strictly as a JSON array of objects, where each object has "index" (number matching the list) and "category" (string matching one of the categories above). Do not include any markdown quotes or explanations outside the JSON array.

Transactions:
${JSON.stringify(listToClassify)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini Bulk API status ${response.status}`);
    }

    const data = await response.json();
    const cleanOutput = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (cleanOutput) {
      const results = JSON.parse(cleanOutput);
      if (Array.isArray(results)) {
        results.forEach(res => {
          const tx = needsClassify[res.index];
          if (tx && CATEGORIES.includes(res.category)) {
            tx.category = res.category;
          }
        });
      }
    }
  } catch (e) {
    console.warn('Gemini Bulk Auto-Classifier failed, using offline defaults:', e);
  }

  return txs;
};

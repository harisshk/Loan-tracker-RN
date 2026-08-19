import { CATEGORIES } from '../constants/categories';

export { CATEGORIES };

const RULES = {
  Fuel: ['fuel', 'petrol', 'diesel', 'cng', 'shell fuel', 'hpcl', 'iocl', 'bpcl', 'petrol pump', 'gas station', 'ev charging'],
  'Milk & Dairy': ['milk', 'dairy', 'curd', 'paneer', 'butter', 'cheese', 'yogurt', 'amul', 'milkman', 'ghee', 'lassi', 'buttermilk', 'mother dairy'],
  'Fruits & Vegetables': ['fruit', 'vegetable', 'apple', 'banana', 'mango', 'orange', 'grape', 'onion', 'potato', 'tomato', 'veggies', 'sabji', 'sabzi', 'coconut', 'lemon'],
  Electronics: ['electronics', 'gadget', 'phone', 'mobile', 'laptop', 'computer', 'headphone', 'earphone', 'charger', 'macbook', 'ipad', 'tv', 'television', 'monitor', 'keyboard', 'mouse', 'apple store', 'icloud', 'itunes', 'apple.com'],
  Food: ['zomato', 'swiggy', 'starbucks', 'restaurant', 'cafe', 'food', 'dining', 'mcdonald', 'burger', 'pizza', 'bakery', 'eats', 'dosa', 'tea', 'chai', 'coffee', 'hotel', 'sweet', 'kitchen'],
  Grocery: ['grocery', 'supermarket', 'mart', 'dmart', 'grocer', 'instamart', 'blinkit', 'zepto', 'groceries', 'provision', 'bazaar'],
  Shopping: ['amazon', 'flipkart', 'myntra', 'hm', 'zara', 'mall', 'retail', 'reliance', 'clothing', 'ajio', 'meesho', 'nykaa', 'decathlon', 'shoppe', 'retailer', 'trends'],
  Vehicle: ['car', 'bike', 'vehicle', 'auto', 'mechanic', 'service', 'garage', 'servicing', 'repair', 'tyre', 'tire', 'parking', 'car wash', 'wash', 'spare parts', 'automobile', 'puc', 'challan', 'traffic fine', 'fastag', 'motor', 'vehicle spends'],
  EMI: ['loan', 'emi', 'hdfc loan', 'sbi loan', 'mortgage', 'finance', 'credcard', 'cred'],
  Bills: ['electricity', 'water', 'gas', 'recharge', 'jio', 'airtel', 'bill', 'utility', 'broadband', 'wifi', 'bsnl', 'vi ', 'bescom', 'tata play', 'dth', 'postpaid'],
  Investment: ['zerodha', 'groww', 'mutual fund', 'sip', 'stock', 'investment', 'etf', 'crypto', 'coin', 'wazirx', 'binance', 'upstox', 'angelone', 'indmoney', 'kuvera'],
  Entertainment: ['netflix', 'spotify', 'prime video', 'hotstar', 'movie', 'cinema', 'theatre', 'booking', 'game', 'arcade', 'bookmyshow', 'disney', 'playstation', 'xbox', 'steam', 'youtube premium', 'sub', 'membership'],
  Travel: ['uber', 'ola', 'rapido', 'metro', 'irctc', 'flight', 'airline', 'cabs', 'taxi', 'makemytrip', 'goibibo', 'easemytrip', 'railways', 'hotel', 'trip', 'tour', 'train', 'bus', 'booking.com', 'agoda', 'airbnb'],
  Salary: ['salary', 'salary credited', 'payroll', 'stipend', 'wages', 'dividend', 'interest credited', 'pension'],
  'Credit Card Bill': ['credit card bill', 'cc bill', 'cc payment', 'credit card payment', 'card payment', 'card settlement', 'cc outstanding', 'creditcard bill'],
  'Rent & Housing': ['rent', 'pg rent', 'house rent', 'maintenance charges', 'landlord', 'society maintenance', 'flat rent', 'room rent'],
  'Health & Medical': ['pharmacy', 'medicine', 'hospital', 'clinic', 'doctor', 'lab test', 'medical', 'chemist', 'apolo', 'pharmeasy', 'medplus', 'dentist', 'physio', 'vaccine', 'injection'],
  Insurance: ['insurance premium', 'lic', 'star health', 'hdfc life', 'term insurance', 'tata aia', 'general insurance', 'health insurance', 'car insurance', 'bike insurance', 'care health', 'niva bupa', 'icici lombard'],
  Education: ['fees', 'tuition', 'school fee', 'college fee', 'udemy', 'coursera', 'coaching', 'training', 'books', 'stationery', 'school admission', 'exam fee'],
  'Gifts & Donations': ['gift', 'shagun', 'donation', 'charity', 'temple', 'birthday', 'anniversary', 'wedding', 'marriage', 'shadi', 'giftcard']
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

export const getSmartCategory = (description) => {
  if (!description) return 'Other';
  return classifyCategoryOffline(description);
};

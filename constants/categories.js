export const CATEGORIES = [
  'Salary',
  'Food',
  'Grocery',
  'Shopping',
  'Vehicle',
  'Fuel',
  'EMI',
  'Bills',
  'Investment',
  'Entertainment',
  'Travel',
  'Credit Card Bill',
  'Fruits & Vegetables',
  'Electronics',
  'Milk & Dairy',
  'Rent & Housing',
  'Health & Medical',
  'Insurance',
  'Education',
  'Gifts & Donations',
  'Other',
];

export const CATEGORY_ICONS = {
  Salary: { name: 'cash-outline', color: '#10b981' },
  Food: { name: 'restaurant-outline', color: '#f97316' },
  Grocery: { name: 'cart-outline', color: '#84cc16' },
  Shopping: { name: 'bag-handle-outline', color: '#ec4899' },
  Vehicle: { name: 'car-sport-outline', color: '#0284c7' },
  'Vehicle Spends': { name: 'car-sport-outline', color: '#0284c7' },
  Fuel: { name: 'speedometer-outline', color: '#ea580c' },
  EMI: { name: 'wallet-outline', color: '#6366f1' },
  Bills: { name: 'receipt-outline', color: '#3b82f6' },
  Investment: { name: 'trending-up-outline', color: '#8b5cf6' },
  Entertainment: { name: 'film-outline', color: '#f43f5e' },
  Travel: { name: 'airplane-outline', color: '#06b6d4' },
  'Credit Card Bill': { name: 'card-outline', color: '#d946ef' },
  'Fruits & Vegetables': { name: 'leaf-outline', color: '#22c55e' },
  Electronics: { name: 'hardware-chip-outline', color: '#0d9488' },
  'Milk & Dairy': { name: 'water-outline', color: '#38bdf8' },
  'Rent & Housing': { name: 'home-outline', color: '#4f46e5' },
  'Health & Medical': { name: 'medical-outline', color: '#e11d48' },
  Insurance: { name: 'shield-checkmark-outline', color: '#eab308' },
  Education: { name: 'school-outline', color: '#a78bfa' },
  'Gifts & Donations': { name: 'gift-outline', color: '#f472b6' },
  Other: { name: 'cube-outline', color: '#64748b' },
};

export const getCategoryIcon = (categoryName) => {
  if (!categoryName) return CATEGORY_ICONS.Other;
  return CATEGORY_ICONS[categoryName] || CATEGORY_ICONS.Other;
};

const Config = {
  // Pulling from environment for security (EXPO_PUBLIC_ prefix required for Expo)
  GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY || "", 
  
  // Financial Thresholds
  RESILIENCE_SAFE_MONTHS: 6,
  RESILIENCE_WARNING_MONTHS: 2,
  
  // App Defaults
  DEFAULT_CURRENCY: '₹',
  DEFAULT_LOCALE: 'en-IN',
};

export default Config;

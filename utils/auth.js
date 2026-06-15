import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const isGoogleSigninSupported = !!NativeModules?.RNGoogleSignin;
const GoogleSignin = isGoogleSigninSupported
  ? require('@react-native-google-signin/google-signin').GoogleSignin
  : null;

const AUTH_USER_KEY = '@auth_user';

export const getAuthUser = async () => {
  try {
    const userJson = await AsyncStorage.getItem(AUTH_USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  } catch (e) {
    return null;
  }
};

export const saveAuthUser = async (user) => {
  try {
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    if (user && user.email) {
      await AsyncStorage.setItem('@gmail_user_email', user.email);
    }
  } catch (e) {
    console.error('Failed to save auth session:', e);
  }
};

export const clearAuthUser = async () => {
  try {
    if (isGoogleSigninSupported && GoogleSignin) {
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        // Ignore if not signed in or not configured
      }
    }
    await AsyncStorage.removeItem(AUTH_USER_KEY);
    await AsyncStorage.removeItem('@gmail_user_email');
    await AsyncStorage.removeItem('@gmail_access_token');
    await AsyncStorage.removeItem('@gmail_refresh_token');
    await AsyncStorage.removeItem('@gmail_expire_time');
  } catch (e) {
    console.error('Failed to clear auth session:', e);
  }
};

export const signUpWithEmail = async (email, password) => {
  let urlStr = await AsyncStorage.getItem('@supabase_url');
  let key = await AsyncStorage.getItem('@supabase_key');
  
  if (!urlStr) urlStr = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!key) key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

  if (!urlStr || !key) {
    throw new Error('Supabase URL and Anon Key must be configured first.');
  }

  const supabaseUrl = urlStr.trim().replace(/\/$/, '');
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.msg || data.message || 'Failed to sign up.');
  }
  return data;
};

export const signInWithEmail = async (email, password) => {
  let urlStr = await AsyncStorage.getItem('@supabase_url');
  let key = await AsyncStorage.getItem('@supabase_key');

  if (!urlStr) urlStr = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!key) key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

  if (!urlStr || !key) {
    throw new Error('Supabase URL and Anon Key must be configured first.');
  }

  const supabaseUrl = urlStr.trim().replace(/\/$/, '');
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.message || 'Failed to sign in.');
  }
  return data;
};

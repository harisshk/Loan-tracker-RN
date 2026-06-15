import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  NativeModules,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInWithEmail, signUpWithEmail, saveAuthUser } from '../utils/auth';
import { saveGmailTokens } from '../utils/gmail';

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

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  // Supabase config states
  const [showConfig, setShowConfig] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    const loadSupabaseConfig = async () => {
      try {
        const url = await AsyncStorage.getItem('@supabase_url');
        const key = await AsyncStorage.getItem('@supabase_key');
        if (url) setSupabaseUrl(url);
        if (key) setSupabaseKey(key);
      } catch (e) {
        console.warn('Failed to load Supabase config:', e);
      } finally {
        setConfigLoaded(true);
      }
    };
    loadSupabaseConfig();
  }, []);

  const handleSaveConfig = async () => {
    try {
      await AsyncStorage.setItem('@supabase_url', supabaseUrl.trim());
      await AsyncStorage.setItem('@supabase_key', supabaseKey.trim());
      Alert.alert('Config Saved', 'Supabase credentials updated successfully!');
      setShowConfig(false);
    } catch (e) {
      Alert.alert('Save Failed', 'Failed to save configuration.');
    }
  };

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Input Error', 'Please fill in both Email and Password fields.');
      return;
    }
    if (!supabaseUrl || !supabaseKey) {
      Alert.alert(
        'Database Required',
        'Supabase is not configured yet. Please tap "Configure Database" to enter your credentials.',
        [{ text: 'OK', onPress: () => setShowConfig(true) }]
      );
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email.trim(), password);
        Alert.alert(
          'Registration Success',
          'A confirmation email may have been sent. Please log in.',
          [{ text: 'OK', onPress: () => setIsSignUp(false) }]
        );
      } else {
        const authData = await signInWithEmail(email.trim(), password);
        const userEmail = authData.user?.email || email.trim();
        await saveAuthUser({
          email: userEmail,
          id: authData.user?.id || '',
          type: 'email',
        });
        
        // Migrate any local/anonymous transactions
        await migrateLocalDataToUser(userEmail);

        router.replace('/(tabs)');
      }
    } catch (e: any) {
      Alert.alert('Auth Error', e.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!isGoogleSigninSupported || !GoogleSignin) {
      Alert.alert(
        'Google Sign-In Unavailable',
        'Google Sign-In is only supported in custom development builds. Please use Email/Password to log in on Expo Go.'
      );
      return;
    }
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const accessToken = tokens.accessToken;
      
      const anyResponse = response as any;
      const user = anyResponse.data ? anyResponse.data.user : anyResponse.user;
      const email = user.email;

      // Save auth session locally
      await saveAuthUser({
        email,
        name: user.name || user.givenName || '',
        photo: user.photo || '',
        type: 'google',
      });

      // Save Gmail integration tokens
      await saveGmailTokens(accessToken, 'native-refresh-token', 3600, email);

      // Migrate local data
      await migrateLocalDataToUser(email);

      router.replace('/(tabs)');
    } catch (e: any) {
      console.error('Google Sign-in failed:', e);
      Alert.alert('Google Auth Failed', e.message || 'Failed to authenticate via Google.');
    } finally {
      setLoading(false);
    }
  };

  const migrateLocalDataToUser = async (userEmail: string) => {
    try {
      // 1. Transactions migration
      const txsValue = await AsyncStorage.getItem('@transactions');
      if (txsValue) {
        const localTxs = JSON.parse(txsValue);
        let updated = false;
        localTxs.forEach((tx: any) => {
          if (!tx.user_email || tx.user_email === 'anonymous') {
            tx.user_email = userEmail;
            tx.synced = false;
            updated = true;
          }
        });
        if (updated) {
          await AsyncStorage.setItem('@transactions', JSON.stringify(localTxs));
        }
      }

      // 2. Loans migration
      const loansValue = await AsyncStorage.getItem('@loans');
      if (loansValue) {
        const localLoans = JSON.parse(loansValue);
        let updated = false;
        localLoans.forEach((loan: any) => {
          if (!loan.user_email || loan.user_email === 'anonymous') {
            loan.user_email = userEmail;
            updated = true;
          }
        });
        if (updated) {
          await AsyncStorage.setItem('@loans', JSON.stringify(localLoans));
        }
      }

      // 3. Insurances migration
      const insValue = await AsyncStorage.getItem('@insurances');
      if (insValue) {
        const localIns = JSON.parse(insValue);
        let updated = false;
        localIns.forEach((ins: any) => {
          if (!ins.user_email || ins.user_email === 'anonymous') {
            ins.user_email = userEmail;
            updated = true;
          }
        });
        if (updated) {
          await AsyncStorage.setItem('@insurances', JSON.stringify(localIns));
        }
      }

      // 4. Payments migration
      const pmtsValue = await AsyncStorage.getItem('@payments');
      if (pmtsValue) {
        const localPmts = JSON.parse(pmtsValue);
        let updated = false;
        localPmts.forEach((pmt: any) => {
          if (!pmt.user_email || pmt.user_email === 'anonymous') {
            pmt.user_email = userEmail;
            updated = true;
          }
        });
        if (updated) {
          await AsyncStorage.setItem('@payments', JSON.stringify(localPmts));
        }
      }
    } catch (err) {
      console.warn('Data migration failed:', err);
    }
  };

  if (!configLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <LinearGradient colors={['#1e1b4b', '#311042', '#0f172a']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Ionicons name="wallet-outline" size={42} color="#fff" />
            </View>
            <Text style={styles.appName}>Velo Flow</Text>
            <Text style={styles.appSubtitle}>Smart Debt & Spend Tracker</Text>
          </View>

          {showConfig ? (
            <BlurView intensity={25} style={styles.card}>
              <Text style={styles.cardTitle}>Database Config</Text>
              <Text style={styles.cardSubtitle}>Configure your Supabase credentials</Text>

              <View style={styles.inputContainer}>
                <Ionicons name="link-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Supabase URL"
                  placeholderTextColor="#94a3b8"
                  value={supabaseUrl}
                  onChangeText={setSupabaseUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="key-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Anon Key"
                  placeholderTextColor="#94a3b8"
                  value={supabaseKey}
                  onChangeText={setSupabaseKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={handleSaveConfig}>
                <Text style={styles.primaryButtonText}>Save Database Config</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowConfig(false)}>
                <Text style={styles.secondaryButtonText}>Back to Sign In</Text>
              </TouchableOpacity>
            </BlurView>
          ) : (
            <BlurView intensity={25} style={styles.card}>
              <Text style={styles.cardTitle}>{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
              <Text style={styles.cardSubtitle}>
                {isSignUp ? 'Sign up to keep your financial records secure' : 'Sign in to access your data'}
              </Text>

              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={handleAuth} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{isSignUp ? 'Sign Up' : 'Sign In'}</Text>
                )}
              </TouchableOpacity>

              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin} disabled={loading}>
                <Ionicons name="logo-google" size={18} color="#0f172a" style={{ marginRight: 8 }} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => setIsSignUp(!isSignUp)}
                disabled={loading}
              >
                <Text style={styles.switchButtonText}>
                  {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.configLink}
                onPress={() => setShowConfig(true)}
                disabled={loading}
              >
                <Text style={styles.configLinkText}>Configure Database Setup</Text>
              </TouchableOpacity>
            </BlurView>
          )}

          <Text style={styles.footerText}>Securely backed up with Supabase Cloud REST APIs</Text>
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  scrollContent: { paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 80 : 50, flexGrow: 1, justifyContent: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logoIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderHeight: 1, borderColor: 'rgba(255, 255, 255, 0.2)' } as any,
  appName: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  appSubtitle: { fontSize: 13, color: 'rgba(255, 255, 255, 0.6)', marginTop: 4, fontWeight: '500' },
  card: { backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 28, padding: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)', overflow: 'hidden' },
  cardTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  cardSubtitle: { fontSize: 13, color: '#94a3b8', marginTop: 6, marginBottom: 24, textAlign: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.4)', borderRadius: 16, marginBottom: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#fff', fontSize: 15 },
  primaryButton: { backgroundColor: '#6366f1', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: { height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' },
  secondaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  dividerText: { color: '#94a3b8', paddingHorizontal: 12, fontSize: 13, fontWeight: '600' },
  googleButton: { backgroundColor: '#fff', height: 56, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  googleButtonText: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  switchButton: { alignSelf: 'center', marginTop: 24 },
  switchButtonText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  configLink: { alignSelf: 'center', marginTop: 14 },
  configLinkText: { color: '#818cf8', fontSize: 13, fontWeight: '700' },
  footerText: { textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: 11, marginTop: 30 },
});

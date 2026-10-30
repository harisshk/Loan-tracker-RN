import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  ScrollView,
  NativeModules,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signInWithEmail, signUpWithEmail, saveAuthUser } from '../utils/auth';
import { saveGmailTokens } from '../utils/gmail';
import {
  Button,
  Card,
  colors,
  HIT,
  PressableScale,
  radius,
  Segmented,
  space,
  type,
} from '../components/ui/kit';

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

// ── AuthField ───────────────────────────────────────────────────────────────
// Same look as the kit's <Field>, plus the props a credentials form needs
// (secure entry with show/hide, autofill hints, no auto-capitalisation).

interface AuthFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string;
  icon: keyof typeof Ionicons.glyphMap;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: 'email' | 'password' | 'new-password' | 'off';
  textContentType?: 'emailAddress' | 'password' | 'newPassword' | 'URL' | 'none';
  returnKeyType?: 'next' | 'go' | 'done';
  onSubmitEditing?: () => void;
  inputRef?: React.Ref<React.ComponentRef<typeof TextInput>>;
  editable?: boolean;
}

function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  icon,
  secure,
  keyboardType,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  inputRef,
  editable = true,
}: AuthFieldProps) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrap, !!error && styles.inputWrapError]}>
        <Ionicons name={icon} size={18} color={colors.textMuted} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          textContentType={textContentType}
          secureTextEntry={secure && hidden}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          accessibilityLabel={label}
        />
        {secure ? (
          <PressableScale
            onPress={() => setHidden((h) => !h)}
            style={styles.eyeBtn}
            haptic={false}
            accessibilityLabel={hidden ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  // Which action is in flight, so only that button shows a spinner.
  const [pending, setPending] = useState<'email' | 'google' | null>(null);
  const loading = pending !== null;

  // Inline errors
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');

  // Supabase config states
  const [showConfig, setShowConfig] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    const loadSupabaseConfig = async () => {
      try {
        const url = process.env.EXPO_PUBLIC_SUPABASE_URL || await AsyncStorage.getItem('@supabase_url');
        const key = process.env.EXPO_PUBLIC_SUPABASE_KEY || await AsyncStorage.getItem('@supabase_key');
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
    } catch {
      Alert.alert('Save Failed', 'Failed to save configuration.');
    }
  };

  const handleAuth = async () => {
    setFormError('');
    if (!email || !password) {
      setEmailError(email ? '' : 'Enter your email address');
      setPasswordError(password ? '' : 'Enter your password');
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

    setPending('email');
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
      setFormError(e.message || 'Authentication failed.');
    } finally {
      setPending(null);
    }
  };

  const handleGoogleLogin = async () => {
    setFormError('');
    if (!isGoogleSigninSupported || !GoogleSignin) {
      setFormError(
        'Google Sign-In is only supported in custom development builds. Please use Email/Password to log in on Expo Go.'
      );
      return;
    }
    setPending('google');
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
      setFormError(e.message || 'Failed to authenticate via Google.');
    } finally {
      setPending(null);
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
        <ActivityIndicator size="large" color={colors.heroAccent} accessibilityLabel="Loading" />
      </View>
    );
  }

  const onEmailChange = (v: string) => {
    setEmail(v);
    if (emailError) setEmailError('');
    if (formError) setFormError('');
  };
  const onPasswordChange = (v: string) => {
    setPassword(v);
    if (passwordError) setPasswordError('');
    if (formError) setFormError('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        {/* Brand hero */}
        <View style={[styles.hero, { paddingTop: insets.top + space.xxxl + space.lg }]}>
          <View style={styles.brandMark}>
            <Ionicons name="wallet-outline" size={28} color={colors.heroAccent} />
          </View>
          <Text style={styles.appName} accessibilityRole="header">
            Velo Flow
          </Text>
          <Text style={styles.valueProp}>Every EMI, premium and rupee in one place</Text>
        </View>

        {/* Form sheet */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.lg }]}>
          <View style={styles.column}>
            {showConfig ? (
              <>
                <Text style={styles.title} accessibilityRole="header">
                  Database setup
                </Text>
                <Text style={styles.subtitle}>Configure your Supabase credentials</Text>

                <Card style={styles.card}>
                  <AuthField
                    label="Supabase URL"
                    icon="link-outline"
                    placeholder="https://your-project.supabase.co"
                    value={supabaseUrl}
                    onChangeText={setSupabaseUrl}
                    keyboardType="url"
                    textContentType="URL"
                    autoComplete="off"
                  />
                  <AuthField
                    label="Anon key"
                    icon="key-outline"
                    placeholder="Paste your anon key"
                    value={supabaseKey}
                    onChangeText={setSupabaseKey}
                    secure
                    autoComplete="off"
                    textContentType="none"
                  />
                  <Button label="Save database config" onPress={handleSaveConfig} style={styles.primaryBtn} />
                  <Button
                    label="Back to sign in"
                    variant="secondary"
                    onPress={() => setShowConfig(false)}
                    style={styles.secondaryBtn}
                  />
                </Card>
              </>
            ) : (
              <>
                <Text style={styles.title} accessibilityRole="header">
                  {isSignUp ? 'Create your account' : 'Welcome back'}
                </Text>
                <Text style={styles.subtitle}>
                  {isSignUp ? 'Sign up to keep your financial records secure' : 'Sign in to access your data'}
                </Text>

                <Card style={styles.card}>
                  <Segmented
                    options={[
                      { key: 'signin', label: 'Sign in' },
                      { key: 'signup', label: 'Create account' },
                    ]}
                    value={isSignUp ? 'signup' : 'signin'}
                    onChange={(k) => {
                      if (loading) return;
                      setIsSignUp(k === 'signup');
                      setFormError('');
                    }}
                    style={styles.segmented}
                  />

                  <AuthField
                    label="Email"
                    icon="mail-outline"
                    placeholder="you@example.com"
                    value={email}
                    onChangeText={onEmailChange}
                    error={emailError}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    editable={!loading}
                  />
                  <AuthField
                    label="Password"
                    icon="lock-closed-outline"
                    placeholder={isSignUp ? 'Choose a password' : 'Your password'}
                    value={password}
                    onChangeText={onPasswordChange}
                    error={passwordError}
                    secure
                    autoComplete={isSignUp ? 'new-password' : 'password'}
                    textContentType={isSignUp ? 'newPassword' : 'password'}
                    returnKeyType="go"
                    onSubmitEditing={handleAuth}
                    inputRef={passwordRef}
                    editable={!loading}
                  />

                  {formError ? (
                    <View style={styles.formError} accessibilityLiveRegion="polite" accessible>
                      <Ionicons name="alert-circle" size={18} color={colors.danger} />
                      <Text style={styles.formErrorText}>{formError}</Text>
                    </View>
                  ) : null}

                  <Button
                    label={isSignUp ? 'Create account' : 'Sign in'}
                    onPress={handleAuth}
                    loading={pending === 'email'}
                    disabled={loading}
                    style={styles.primaryBtn}
                  />

                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <Button
                    label="Continue with Google"
                    icon="logo-google"
                    variant="secondary"
                    onPress={handleGoogleLogin}
                    loading={pending === 'google'}
                    disabled={loading}
                  />
                </Card>

                <PressableScale
                  onPress={() => setShowConfig(true)}
                  disabled={loading}
                  style={styles.configLink}
                  accessibilityLabel="Configure database setup"
                >
                  <Ionicons name="server-outline" size={16} color={colors.indigo} />
                  <Text style={styles.configLinkText}>Configure database</Text>
                </PressableScale>
              </>
            )}

            <View style={styles.footer}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.footerText}>Securely backed up with Supabase</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.heroGradient[0] },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.heroGradient[0],
  },
  scrollContent: { flexGrow: 1 },
  hero: {
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl + radius.xl,
  },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.heroChip,
    borderWidth: 1,
    borderColor: colors.heroChipBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  appName: {
    ...type.title,
    fontSize: 28,
    lineHeight: 34,
    color: colors.heroText,
  },
  valueProp: {
    ...type.body,
    color: colors.heroTextSecondary,
    marginTop: space.xs + 2,
    textAlign: 'center',
  },
  sheet: {
    flexGrow: 1,
    marginTop: -radius.xl,
    paddingTop: space.xxl + space.xs,
    paddingHorizontal: space.lg,
    backgroundColor: colors.page,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  column: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  title: {
    ...type.title,
    color: colors.text,
  },
  subtitle: {
    ...type.label,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  card: {
    padding: space.xl,
  },
  segmented: {
    marginBottom: space.xl,
  },
  field: {
    marginBottom: space.lg,
  },
  fieldLabel: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.xs + 2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingLeft: space.md + 2,
    paddingRight: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: space.sm,
  },
  inputWrapError: {
    borderColor: colors.dangerFill,
  },
  input: {
    flex: 1,
    ...type.body,
    color: colors.text,
    paddingVertical: space.md,
    paddingRight: space.sm,
  },
  eyeBtn: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldError: {
    ...type.caption,
    color: colors.danger,
    marginTop: space.xs,
  },
  formError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    marginBottom: space.lg,
  },
  formErrorText: {
    ...type.label,
    fontWeight: '500',
    color: colors.danger,
    flex: 1,
  },
  primaryBtn: {
    marginTop: space.xs,
  },
  secondaryBtn: {
    marginTop: space.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: space.lg,
    gap: space.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
  },
  dividerText: {
    ...type.caption,
    color: colors.textMuted,
  },
  configLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    alignSelf: 'center',
    minHeight: HIT,
    paddingHorizontal: space.lg,
    marginTop: space.lg,
  },
  configLinkText: {
    ...type.label,
    color: colors.indigo,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.lg,
  },
  footerText: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});

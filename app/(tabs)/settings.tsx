import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, NativeModules, StyleSheet, Text, TextInput, View } from 'react-native';
import SidePanelDrawer from '../../components/SidePanelDrawer';
import EdgeSwipeOpener from '../../components/ui/EdgeSwipe';
import {
  Button,
  Card,
  colors,
  Gap,
  HeaderAction,
  HIT,
  IconBadge,
  ListRow,
  PressableScale,
  radius,
  Screen,
  ScreenHeader,
  SectionHeader,
  space,
  type,
} from '../../components/ui/kit';
import { clearAuthUser, getAuthUser } from '../../utils/auth';
import { clearGmailTokens, getGmailConfig, saveGmailSearchQuery, saveGmailTokens, syncGmailTransactions } from '../../utils/gmail';
import { getLoans } from '../../utils/storage';

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

type IconName = keyof typeof Ionicons.glyphMap;

interface NavItem {
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
  soft: string;
  route: string;
}

const PLAN_TOOLS: NavItem[] = [
  { title: 'Repayment roadmap', subtitle: 'Your EMIs and balance, month by month', icon: 'map-outline', color: colors.indigo, soft: colors.indigoSoft, route: '/roadmap' },
  { title: 'Debt-free calculator', subtitle: 'See how prepaying shortens your loans', icon: 'flag-outline', color: colors.primary, soft: colors.primarySoft, route: '/debt-free' },
  { title: 'Financial plan', subtitle: 'Net worth and savings targets', icon: 'trending-up-outline', color: colors.info, soft: colors.infoSoft, route: '/financial-plan' },
  { title: 'Compare loans', subtitle: 'Rates, EMIs and tenures side by side', icon: 'git-compare-outline', color: colors.violet, soft: colors.violetSoft, route: '/compare-loans' },
  { title: 'Maturity alerts', subtitle: 'Upcoming policy and loan dates', icon: 'timer-outline', color: colors.warning, soft: colors.warningSoft, route: '/maturity-alerts' },
];

const MONEY: NavItem[] = [
  { title: 'Loans', subtitle: 'Active and closed loans', icon: 'wallet-outline', color: colors.indigo, soft: colors.indigoSoft, route: '/loans' },
  { title: 'Insurance', subtitle: 'Health, term and vehicle policies', icon: 'shield-checkmark-outline', color: colors.info, soft: colors.infoSoft, route: '/insurances' },
  { title: 'Payment history', subtitle: 'Every EMI and prepayment recorded', icon: 'receipt-outline', color: colors.primary, soft: colors.primarySoft, route: '/history' },
  { title: 'Spends', subtitle: 'Expenses, income and budget', icon: 'pie-chart-outline', color: colors.pink, soft: colors.pinkSoft, route: '/spend-tracker' },
];

const appVersion = Constants.expoConfig?.version;

export default function MoreScreen() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showShortcutsGuide, setShowShortcutsGuide] = useState(false);
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const [showGmail, setShowGmail] = useState(false);
  const [authUser, setAuthUser] = useState<{ email?: string; name?: string } | null>(null);

  // Gmail states
  const [gmailConfig, setGmailConfig] = useState({ email: '', query: '', isConnected: false });
  const [gmailQuery, setGmailQuery] = useState('');
  const [isGmailSyncing, setIsGmailSyncing] = useState(false);

  const loadSettings = useCallback(async () => {
    const savedKey = await AsyncStorage.getItem('@user_gemini_api_key');
    const envKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (savedKey) {
      setApiKey(savedKey);
    } else if (envKey) {
      setApiKey(envKey);
    }

    const gConfig = await getGmailConfig();
    setGmailConfig(gConfig);
    setGmailQuery(gConfig.query);

    const user = await getAuthUser();
    setAuthUser(user);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const handleGoogleLogin = async () => {
    if (!isGoogleSigninSupported) {
      Alert.alert(
        'Google Sign-In Unavailable',
        'Google Sign-In is only supported in custom development builds. Please run the app in a development build or configure manually.'
      );
      return;
    }
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const accessToken = tokens.accessToken;

      const anyResponse = response as any;
      const user = anyResponse.data ? anyResponse.data.user : anyResponse.user;
      const email = user.email;

      // Store tokens
      await saveGmailTokens(accessToken, 'native-refresh-token', 3600, email);

      // Migrate local anonymous/untagged transactions to the user's email
      try {
        const txsValue = await AsyncStorage.getItem('@transactions');
        if (txsValue) {
          const localTxs = JSON.parse(txsValue);
          let updatedLocal = false;
          localTxs.forEach((tx: any) => {
            if (!tx.user_email || tx.user_email === 'anonymous') {
              tx.user_email = email;
              tx.synced = false;
              updatedLocal = true;
            }
          });
          if (updatedLocal) {
            await AsyncStorage.setItem('@transactions', JSON.stringify(localTxs));
          }
        }
      } catch (txErr) {
        console.warn('Failed to tag local transactions with user email:', txErr);
      }

      // Sync with Supabase under the newly connected account
      setTimeout(async () => {
        try {
          await syncGmailTransactions();
        } catch (syncErr) {
          console.warn('Initial post-login sync failed:', syncErr);
        }
      }, 500);

      const config = await getGmailConfig();
      setGmailConfig(config);
      setGmailQuery(config.query);
      Alert.alert('Connected', `Successfully connected to Gmail: ${email}`);
    } catch (e) {
      console.error('Google login error:', e);
      Alert.alert('Connection Failed', 'Failed to retrieve email profile from Google.');
    }
  };

  const saveApiKey = async (val: string) => {
    setApiKey(val);
    const trimmed = (val || '').trim();
    if (trimmed) {
      await AsyncStorage.setItem('@user_gemini_api_key', trimmed);
    } else {
      await AsyncStorage.removeItem('@user_gemini_api_key');
    }
  };

  const handleSaveApiKeyExplicit = async () => {
    const trimmed = (apiKey || '').trim();
    if (trimmed) {
      await AsyncStorage.setItem('@user_gemini_api_key', trimmed);
      setApiKey(trimmed);
      Alert.alert('Key Saved', 'Gemini API Key saved successfully!');
    } else {
      await AsyncStorage.removeItem('@user_gemini_api_key');
      Alert.alert('Key Cleared', 'Gemini API Key cleared.');
    }
  };

  const handleExportCSV = async () => {
    try {
      const loans = await getLoans();
      if (loans.length === 0) {
        Alert.alert('Empty', 'No loans found to export.');
        return;
      }
      let csv = 'Loan Name,Type,Principal,Interest,Tenure,Status\n';
      loans.forEach((l: any) => {
        csv += `"${l.loanName}","${l.loanType}","${l.principal}","${l.interest}","${l.tenure}","${l.status}"\n`;
      });
      Alert.alert('CSV Exported (Dev Mode)', csv);
    } catch {
      Alert.alert('Error', 'Failed to generate report.');
    }
  };

  const handleDisconnectGmail = async () => {
    Alert.alert('Disconnect Gmail', 'Are you sure you want to disconnect your Google account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            if (isGoogleSigninSupported) {
              await GoogleSignin.signOut();
            }
          } catch (err) {
            console.warn('Sign out error:', err);
          }
          await clearGmailTokens();
          const config = await getGmailConfig();
          setGmailConfig(config);
          setGmailQuery(config.query);
          Alert.alert('Disconnected', 'Successfully disconnected Gmail account.');
        },
      },
    ]);
  };

  const handleGmailSync = async () => {
    setIsGmailSyncing(true);
    const res = await syncGmailTransactions();
    setIsGmailSyncing(false);
    if (res.success) {
      Alert.alert('Gmail Sync Finished', `Imported ${res.count} new transaction(s) from your emails!`);
      loadSettings();
    } else {
      Alert.alert('Gmail Sync Failed', res.reason || 'Make sure you are logged in.');
    }
  };

  const handleSaveGmailQuery = async (val: string) => {
    setGmailQuery(val);
    await saveGmailSearchQuery(val);
  };

  const handleResetData = () => {
    Alert.alert(
      'Erase all data',
      'This will PERMANENTLY delete all loans, payments, and insurance data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            Alert.alert('Wiped', 'All data has been cleared.');
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await clearAuthUser();
          router.replace('/login');
        },
      },
    ]);
  };

  const go = (route: string) => router.push(route as any);

  const profileEmail = authUser?.email || gmailConfig.email || '';
  const profileName = authUser?.name || (profileEmail ? profileEmail.split('@')[0] : '');
  const signedIn = !!authUser;
  const initial = (profileName || profileEmail || '?').trim().charAt(0).toUpperCase();
  const hasKey = !!apiKey.trim();

  const renderNavCard = (items: NavItem[]) => (
    <Card padded={false}>
      {items.map((item, i) => (
        <ListRow
          key={item.route}
          title={item.title}
          subtitle={item.subtitle}
          leading={<IconBadge name={item.icon} color={item.color} backgroundColor={item.soft} size={36} iconSize={18} />}
          onPress={() => go(item.route)}
          divider={i > 0}
        />
      ))}
    </Card>
  );

  return (
    <>
      <SidePanelDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      <EdgeSwipeOpener onOpen={() => setIsDrawerOpen(true)} />
      <Screen>
        <ScreenHeader
          title="More"
          subtitle="Tools, data and settings"
          actions={<HeaderAction icon="menu-outline" label="Open menu" onPress={() => setIsDrawerOpen(true)} />}
        />

        {/* Profile */}
        <Card>
          <View style={styles.profileRow}>
            <View style={styles.avatar} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {signedIn ? (
                <Text style={styles.avatarText}>{initial}</Text>
              ) : (
                <Ionicons name="person-outline" size={22} color={colors.indigo} />
              )}
            </View>
            <View style={styles.profileText}>
              <Text style={styles.profileName} numberOfLines={1}>
                {signedIn ? profileName || 'Signed in' : 'Not signed in'}
              </Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {signedIn ? profileEmail || 'No email on file' : 'Sign in to sync your data across devices'}
              </Text>
            </View>
          </View>
          <Button
            label={signedIn ? 'Sign out' : 'Sign in'}
            icon={signedIn ? 'log-out-outline' : 'log-in-outline'}
            variant="secondary"
            onPress={signedIn ? handleLogout : () => router.replace('/login')}
            style={styles.profileButton}
          />
        </Card>

        <Gap />
        <SectionHeader title="Plan & tools" />
        {renderNavCard(PLAN_TOOLS)}

        <Gap />
        <SectionHeader title="Money" />
        {renderNavCard(MONEY)}

        {/* AI */}
        <Gap />
        <SectionHeader title="AI" />
        <Card padded={false}>
          <ListRow
            title="AI Advisor"
            subtitle="Ask about payoffs, interest and budgets"
            leading={<IconBadge name="sparkles-outline" color={colors.violet} backgroundColor={colors.violetSoft} size={36} iconSize={18} />}
            onPress={() => go('/ai-advisor')}
          />
          <ExpandRow
            title="Gemini API key"
            subtitle="Powers the advisor and transaction parsing"
            icon="key-outline"
            color={colors.textSecondary}
            soft={colors.surfaceSunken}
            status={hasKey ? 'Saved' : 'Not set'}
            statusColor={hasKey ? colors.primary : colors.warning}
            expanded={showKeyEditor}
            onToggle={() => setShowKeyEditor((v) => !v)}
          />
          {showKeyEditor ? (
            <View style={styles.panel}>
              <Text style={styles.inputLabel}>API key</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Paste your Gemini API key (AIzaSy...)"
                  placeholderTextColor={colors.textMuted}
                  value={apiKey}
                  onChangeText={saveApiKey}
                  secureTextEntry={!showKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Gemini API key"
                />
                <PressableScale
                  onPress={() => setShowKey(!showKey)}
                  style={styles.eyeBtn}
                  accessibilityLabel={showKey ? 'Hide API key' : 'Show API key'}
                >
                  <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                </PressableScale>
              </View>
              <Text style={styles.hint}>
                Stored only on this device. Get a free key at <Text style={styles.hintStrong}>aistudio.google.com</Text>
              </Text>
              <Button label="Save key" icon="checkmark" onPress={handleSaveApiKeyExplicit} style={styles.panelButton} />
            </View>
          ) : null}
        </Card>

        {/* Data */}
        <Gap />
        <SectionHeader title="Data" />
        <Card padded={false}>
          <ListRow
            title="Backup & restore"
            subtitle="Save or restore a JSON backup file"
            leading={<IconBadge name="cloud-upload-outline" color={colors.indigo} backgroundColor={colors.indigoSoft} size={36} iconSize={18} />}
            onPress={() => go('/sync')}
          />
          <ListRow
            title="Export loans as CSV"
            subtitle="Loan list in spreadsheet format"
            leading={<IconBadge name="document-text-outline" color={colors.info} backgroundColor={colors.infoSoft} size={36} iconSize={18} />}
            onPress={handleExportCSV}
            divider
          />
          <ExpandRow
            title="Gmail import"
            subtitle={gmailConfig.isConnected ? gmailConfig.email : 'Import bank debit and EMI alert emails'}
            icon="mail-outline"
            color={colors.danger}
            soft={colors.dangerSoft}
            status={gmailConfig.isConnected ? 'On' : 'Off'}
            statusColor={gmailConfig.isConnected ? colors.primary : colors.textMuted}
            expanded={showGmail}
            onToggle={() => setShowGmail((v) => !v)}
          />
          {showGmail ? (
            <View style={styles.panel}>
              {gmailConfig.isConnected ? (
                <>
                  <View style={styles.connectedRow}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                    <Text style={styles.connectedText} numberOfLines={1}>
                      Connected as <Text style={styles.connectedEmail}>{gmailConfig.email}</Text>
                    </Text>
                  </View>
                  <Text style={styles.inputLabel}>Search query</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.input}
                      placeholder='subject:"transaction" "Rs."'
                      placeholderTextColor={colors.textMuted}
                      value={gmailQuery}
                      onChangeText={handleSaveGmailQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessibilityLabel="Gmail search query"
                    />
                  </View>
                  <Text style={styles.hint}>Only emails matching this Gmail search are imported.</Text>
                  <View style={styles.buttonRow}>
                    <Button
                      label="Sync now"
                      icon="sync-outline"
                      onPress={handleGmailSync}
                      loading={isGmailSyncing}
                      style={styles.flexButton}
                    />
                    <Button
                      label="Disconnect"
                      icon="power-outline"
                      variant="danger"
                      onPress={handleDisconnectGmail}
                      style={styles.flexButton}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.panelText}>
                    Connect your Google account to automatically import and categorise bank debit and EMI alert emails.
                  </Text>
                  <Button
                    label="Connect Google account"
                    icon="logo-google"
                    onPress={handleGoogleLogin}
                    style={styles.panelButton}
                  />
                </>
              )}
            </View>
          ) : null}
          <ExpandRow
            title="SMS via iOS Shortcuts"
            subtitle="Send bank SMS alerts to your account"
            icon="phone-portrait-outline"
            color={colors.info}
            soft={colors.infoSoft}
            expanded={showShortcutsGuide}
            onToggle={() => setShowShortcutsGuide(!showShortcutsGuide)}
          />
          {showShortcutsGuide ? (
            <View style={styles.panel}>
              <Text style={styles.guideText}>
                <Text style={styles.guideBold}>1.</Text> Create an iOS Automation: &quot;When SMS is received&quot;{'\n'}
                <Text style={styles.guideBold}>2.</Text> Filter bank alerts & parse transaction amount/merchant{'\n'}
                <Text style={styles.guideBold}>3.</Text> Add &quot;Get contents of URL&quot; HTTP action{'\n'}
                <Text style={styles.guideBold}>4.</Text> Endpoint: <Text style={styles.code}>[SUPABASE_URL]/rest/v1/transactions</Text>{'\n'}
                <Text style={styles.guideBold}>5.</Text> Method: <Text style={styles.code}>POST</Text>{'\n'}
                <Text style={styles.guideBold}>6.</Text> Headers:{'\n'}
                {'   '}• apikey: [anonKey]{'\n'}
                {'   '}• Authorization: Bearer [anonKey]{'\n'}
                {'   '}• Content-Type: application/json{'\n'}
                <Text style={styles.guideBold}>7.</Text> JSON Payload:{'\n'}
                <Text style={styles.code}>{'{"amount": 500, "type": "debit", "category": "Food"}'}</Text>
              </Text>
            </View>
          ) : null}
        </Card>

        {/* App */}
        <Gap />
        <SectionHeader title="App" />
        <Card padded={false}>
          <ListRow
            title="Velo Flow"
            subtitle="Loans, insurance and spends in one place"
            leading={<IconBadge name="layers-outline" color={colors.primary} backgroundColor={colors.primarySoft} size={36} iconSize={18} />}
            value={appVersion ? `v${appVersion}` : undefined}
            valueColor={colors.textSecondary}
          />
          <ListRow
            title="Erase all data"
            subtitle="Delete every loan, payment and policy on this device"
            leading={<IconBadge name="trash-outline" color={colors.danger} backgroundColor={colors.dangerSoft} size={36} iconSize={18} />}
            onPress={handleResetData}
            accessibilityHint="Asks for confirmation before deleting"
            divider
          />
        </Card>
      </Screen>
    </>
  );
}

interface ExpandRowProps {
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
  soft: string;
  status?: string;
  statusColor?: string;
  expanded: boolean;
  onToggle: () => void;
}

/** List row that shows/hides an inline settings panel below it. */
function ExpandRow({ title, subtitle, icon, color, soft, status, statusColor, expanded, onToggle }: ExpandRowProps) {
  return (
    <PressableScale
      onPress={onToggle}
      style={[styles.expandRow, styles.rowDivider]}
      accessibilityLabel={[title, subtitle, status].filter(Boolean).join(', ')}
      accessibilityState={{ expanded }}
    >
      <IconBadge name={icon} color={color} backgroundColor={soft} size={36} iconSize={18} />
      <View style={styles.expandText}>
        <Text style={styles.expandTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.expandSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {status ? <Text style={[styles.status, statusColor ? { color: statusColor } : null]}>{status}</Text> : null}
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.indigoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...type.headline,
    color: colors.indigo,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    ...type.headline,
    color: colors.text,
  },
  profileEmail: {
    ...type.label,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
  profileButton: {
    marginTop: space.lg,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    minHeight: 60,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  expandText: {
    flex: 1,
    minWidth: 0,
  },
  expandTitle: {
    ...type.body,
    fontWeight: '700',
    color: colors.text,
  },
  expandSubtitle: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
  status: {
    ...type.label,
    color: colors.textMuted,
  },
  panel: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: space.xs,
    backgroundColor: colors.surface,
  },
  panelText: {
    ...type.label,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  panelButton: {
    marginTop: space.md,
  },
  inputLabel: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.xs + 2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingLeft: space.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  input: {
    flex: 1,
    ...type.body,
    color: colors.text,
    paddingVertical: space.md,
    paddingRight: space.md,
  },
  eyeBtn: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: space.xs + 2,
  },
  hintStrong: {
    color: colors.indigo,
    fontWeight: '700',
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    marginBottom: space.md,
  },
  connectedText: {
    ...type.label,
    fontWeight: '500',
    color: colors.textSecondary,
    flex: 1,
  },
  connectedEmail: {
    fontWeight: '700',
    color: colors.text,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  flexButton: {
    flex: 1,
    paddingHorizontal: space.md,
  },
  guideText: {
    ...type.label,
    fontWeight: '500',
    lineHeight: 22,
    color: colors.textSecondary,
  },
  guideBold: {
    fontWeight: '800',
    color: colors.text,
  },
  code: {
    fontFamily: 'Menlo',
    fontSize: 12,
    color: colors.indigo,
    backgroundColor: colors.surfaceSunken,
  },
});

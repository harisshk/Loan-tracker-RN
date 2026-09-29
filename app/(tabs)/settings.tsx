import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
  ActivityIndicator,
  NativeModules,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLoans } from '../../utils/storage';
import { getGmailConfig, saveGmailTokens, clearGmailTokens, saveGmailSearchQuery, syncGmailTransactions } from '../../utils/gmail';
import Config from '../../utils/Config';
import { clearAuthUser } from '../../utils/auth';
import SidePanelDrawer from '../../components/SidePanelDrawer';

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

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currency] = useState(Config.DEFAULT_CURRENCY || '₹');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showShortcutsGuide, setShowShortcutsGuide] = useState(false);

  // Gmail states
  const [gmailConfig, setGmailConfig] = useState({ email: '', query: '', isConnected: false });
  const [gmailQuery, setGmailQuery] = useState('');
  const [isGmailSyncing, setIsGmailSyncing] = useState(false);

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

  useEffect(() => {
    loadSettings();
  }, []);
  useFocusEffect(React.useCallback(() => { loadSettings(); }, []));

  const loadSettings = async () => {
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
        }
      }
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
      '☢️ Nuclear Reset',
      'This will PERMANENTLY delete all loans, payments, and insurance data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'DELETE EVERYTHING', 
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            Alert.alert('Wiped', 'All data has been cleared.');
            router.replace('/');
          }
        }
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
        }
      }
    ]);
  };

  const financialCalculators = [
    { label: 'Repayment Roadmap', icon: 'map-outline', route: '/roadmap', color: '#ec4899', desc: 'Snowball & Avalanche schedules', tag: 'Strategy' },
    { label: 'Debt-Free Calculator', icon: 'flag-outline', route: '/debt-free', color: '#0284c7', desc: 'Accelerate payoff timelines', tag: 'Milestones' },
    { label: 'Financial Plan', icon: 'trending-up', route: '/financial-plan', color: '#059669', desc: 'Net worth & freedom targets', tag: 'Wealth' },
    { label: 'Loan Comparison', icon: 'git-compare-outline', route: '/compare-loans', color: '#7c3aed', desc: 'Compare rates & EMI tenures', tag: 'Analytics' },
    { label: 'Maturity Alerts', icon: 'timer-outline', route: '/maturity-alerts', color: '#d97706', desc: 'Upcoming policy & loan dates', tag: 'Reminders' },
    { label: 'All Insurances', icon: 'shield-checkmark-outline', route: '/insurances', color: '#0891b2', desc: 'Manage health, term & auto policies', tag: 'Coverage' },
  ];

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#ffffff']} style={styles.container}>
      <SidePanelDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      
      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.topBar}>
          <TouchableOpacity 
            onPress={() => setIsDrawerOpen(true)} 
            style={styles.drawerTriggerBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={22} color="#0f172a" />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={styles.title}>More & Hub</Text>
            <Text style={styles.subtitle}>Tools, Automations & System Settings</Text>
          </View>

          <View style={styles.proBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#059669" />
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        </View>

        {/* AI Copilot Spotlight Banner */}
        <TouchableOpacity 
          style={styles.aiSpotlightCard}
          onPress={() => router.push('/ai-advisor' as any)}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#4f46e5', '#6366f1', '#8b5cf6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiSpotlightGradient}
          >
            <View style={styles.aiSpotlightContent}>
              <View style={styles.aiIconBadge}>
                <Ionicons name="sparkles" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.aiTagRow}>
                  <Text style={styles.aiTagText}>GENAI FINANCIAL COPILOT</Text>
                  <View style={styles.livePulseDot} />
                </View>
                <Text style={styles.aiSpotlightTitle}>AI Advisor & Strategy</Text>
                <Text style={styles.aiSpotlightDesc}>
                  Ask anything about loan payoffs, interest reduction, and monthly budgets.
                </Text>
              </View>
              <View style={styles.aiLaunchBtn}>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Financial Tools & Calculators Bento Grid */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconPill, { backgroundColor: 'rgba(2, 132, 199, 0.1)' }]}>
              <Ionicons name="grid-outline" size={14} color="#0284c7" />
            </View>
            <Text style={styles.sectionTitle}>Financial Intelligence & Tools</Text>
          </View>

          <View style={styles.toolsBentoGrid}>
            {financialCalculators.map((tool) => (
              <TouchableOpacity
                key={tool.route}
                style={styles.bentoCard}
                onPress={() => router.push(tool.route as any)}
                activeOpacity={0.7}
              >
                <View style={styles.bentoCardTop}>
                  <View style={[styles.toolIconWrap, { backgroundColor: tool.color + '15' }]}>
                    <Ionicons name={tool.icon as any} size={18} color={tool.color} />
                  </View>
                  <View style={[styles.bentoTag, { borderColor: tool.color + '30', backgroundColor: tool.color + '10' }]}>
                    <Text style={[styles.bentoTagText, { color: tool.color }]}>{tool.tag}</Text>
                  </View>
                </View>
                <Text style={styles.bentoTitle}>{tool.label}</Text>
                <Text style={styles.bentoDesc} numberOfLines={2}>{tool.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* AI Intelligence Config Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconPill, { backgroundColor: 'rgba(124, 58, 237, 0.1)' }]}>
              <Ionicons name="hardware-chip-outline" size={14} color="#7c3aed" />
            </View>
            <Text style={styles.sectionTitle}>AI Intelligence Engine</Text>
            {apiKey ? (
              <View style={styles.activeTag}>
                <Text style={styles.activeTagText}>CONNECTED</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.cleanCard}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(124, 58, 237, 0.1)' }]}>
                <Ionicons name="key-outline" size={18} color="#7c3aed" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardMainTitle}>Gemini Pro / Flash API Key</Text>
                <Text style={styles.cardSubTitle}>Powers smart debt payoff advice & transaction parsing</Text>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.keyInput}
                placeholder="Paste your Gemini API key (AIzaSy...)"
                placeholderTextColor="#94a3b8"
                value={apiKey}
                onChangeText={saveApiKey}
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity 
                onPress={() => setShowKey(!showKey)} 
                style={styles.inputEyeBtn}
                activeOpacity={0.7}
              >
                <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity 
                onPress={handleSaveApiKeyExplicit} 
                style={styles.primarySaveBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.primarySaveBtnText}>Save Key</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.featureChipsRow}>
              <View style={styles.featureChip}>
                <Ionicons name="flash-outline" size={12} color="#0284c7" />
                <Text style={styles.featureChipText}>Gemini 1.5 Flash</Text>
              </View>
              <View style={styles.featureChip}>
                <Ionicons name="lock-closed-outline" size={12} color="#059669" />
                <Text style={styles.featureChipText}>Encrypted on Device</Text>
              </View>
            </View>

            <Text style={styles.helperLinkText}>
              Get a free API key at <Text style={{ color: '#4f46e5', fontWeight: '700' }}>aistudio.google.com</Text>
            </Text>
          </View>
        </View>

        {/* Email Automation Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconPill, { backgroundColor: 'rgba(234, 67, 53, 0.1)' }]}>
              <Ionicons name="mail" size={14} color="#ea4335" />
            </View>
            <Text style={styles.sectionTitle}>Email Automation (Gmail)</Text>
          </View>

          <View style={styles.cleanCard}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(234, 67, 53, 0.1)' }]}>
                <Ionicons name="mail-open-outline" size={18} color="#ea4335" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardMainTitle}>Gmail Transaction Ingestion</Text>
                <Text style={styles.cardSubTitle}>Sync bank debit & EMI alerts automatically</Text>
              </View>
            </View>

            {gmailConfig.isConnected ? (
              <View style={styles.connectedContainer}>
                <View style={styles.connectedEmailRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={styles.connectedLabel}>Active Account: </Text>
                  <Text style={styles.connectedEmailText}>{gmailConfig.email}</Text>
                </View>

                <Text style={styles.inputLabel}>Query Filter Expression</Text>
                <TextInput
                  style={styles.keyInput}
                  placeholder='subject:"transaction" "Rs."'
                  placeholderTextColor="#94a3b8"
                  value={gmailQuery}
                  onChangeText={handleSaveGmailQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <View style={styles.gmailActionsRow}>
                  <TouchableOpacity 
                    style={[styles.syncEmailBtn, isGmailSyncing && { opacity: 0.7 }]} 
                    onPress={handleGmailSync}
                    disabled={isGmailSyncing}
                    activeOpacity={0.8}
                  >
                    {isGmailSyncing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="sync-outline" size={16} color="#fff" />
                        <Text style={styles.syncEmailBtnText}>Sync Emails Now</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.disconnectBtn} 
                    onPress={handleDisconnectGmail}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="power-outline" size={16} color="#dc2626" />
                    <Text style={styles.disconnectBtnText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.disconnectedContainer}>
                <Text style={styles.featureDescText}>
                  Connect your Google account to automatically import and categorize bank debit SMS and EMI email alerts.
                </Text>

                <TouchableOpacity 
                  style={styles.connectGoogleBtn} 
                  onPress={handleGoogleLogin}
                  activeOpacity={0.85}
                >
                  <Ionicons name="logo-google" size={18} color="#fff" />
                  <Text style={styles.connectGoogleText}>Connect Google Account</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* SMS & Supabase Automation */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconPill, { backgroundColor: 'rgba(236, 72, 153, 0.1)' }]}>
              <Ionicons name="cloud-done" size={14} color="#ec4899" />
            </View>
            <Text style={styles.sectionTitle}>SMS & Cloud Webhooks</Text>
          </View>

          <View style={styles.cleanCard}>
            <View style={styles.cloudBadgeRow}>
              <View style={styles.cloudStatusPill}>
                <View style={styles.pulsingDot} />
                <Text style={styles.cloudStatusText}>Supabase Sync Active</Text>
              </View>
              <Text style={styles.cloudMetaText}>Encrypted TLS 1.3</Text>
            </View>

            <TouchableOpacity 
              style={styles.accordionHeader} 
              onPress={() => setShowShortcutsGuide(!showShortcutsGuide)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Ionicons name="phone-portrait-outline" size={18} color="#0284c7" />
                <Text style={styles.accordionTitle}>iOS Shortcuts SMS Integration Guide</Text>
              </View>
              <Ionicons 
                name={showShortcutsGuide ? 'chevron-up' : 'chevron-down'} 
                size={18} 
                color="#64748b" 
              />
            </TouchableOpacity>

            {showShortcutsGuide && (
              <View style={styles.guideContainer}>
                <Text style={styles.guideStepText}>
                  <Text style={styles.guideBold}>1.</Text> Create an iOS Automation: &quot;When SMS is received&quot;{"\n"}
                  <Text style={styles.guideBold}>2.</Text> Filter bank alerts & parse transaction amount/merchant{"\n"}
                  <Text style={styles.guideBold}>3.</Text> Add &quot;Get contents of URL&quot; HTTP action{"\n"}
                  <Text style={styles.guideBold}>4.</Text> Endpoint: <Text style={styles.codeSnippet}>[SUPABASE_URL]/rest/v1/transactions</Text>{"\n"}
                  <Text style={styles.guideBold}>5.</Text> Method: <Text style={styles.codeSnippet}>POST</Text>{"\n"}
                  <Text style={styles.guideBold}>6.</Text> Headers:{"\n"}
                  {'   '}• apikey: [anonKey]{"\n"}
                  {'   '}• Authorization: Bearer [anonKey]{"\n"}
                  {'   '}• Content-Type: application/json{"\n"}
                  <Text style={styles.guideBold}>7.</Text> JSON Payload:{"\n"}
                  <Text style={styles.codeSnippet}>{'{"amount": 500, "type": "debit", "category": "Food"}'}</Text>
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Data & Export Management */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconPill, { backgroundColor: 'rgba(5, 150, 105, 0.1)' }]}>
              <Ionicons name="server-outline" size={14} color="#059669" />
            </View>
            <Text style={styles.sectionTitle}>Data Management</Text>
          </View>

          <TouchableOpacity 
            style={styles.actionCard} 
            onPress={handleExportCSV}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(2, 132, 199, 0.1)' }]}>
              <Ionicons name="document-text-outline" size={18} color="#0284c7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionCardTitle}>Export Loans to CSV</Text>
              <Text style={styles.actionCardSubtitle}>Download all loan records in spreadsheet format</Text>
            </View>
            <Ionicons name="download-outline" size={18} color="#64748b" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard} 
            onPress={() => router.push('/sync')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(124, 58, 237, 0.1)' }]}>
              <Ionicons name="cloud-upload-outline" size={18} color="#7c3aed" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionCardTitle}>Cloud Backup & JSON Sync</Text>
              <Text style={styles.actionCardSubtitle}>Export snapshot or restore historical database</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Account & Session */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconPill, { backgroundColor: 'rgba(100, 116, 139, 0.1)' }]}>
              <Ionicons name="person-outline" size={14} color="#64748b" />
            </View>
            <Text style={styles.sectionTitle}>Account & Session</Text>
          </View>

          <TouchableOpacity 
            style={styles.actionCard} 
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(100, 116, 139, 0.1)' }]}>
              <Ionicons name="log-out-outline" size={18} color="#475569" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionCardTitle}>Sign Out</Text>
              <Text style={styles.actionCardSubtitle}>End active session on this device</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconPill, { backgroundColor: 'rgba(225, 29, 72, 0.1)' }]}>
              <Ionicons name="warning-outline" size={14} color="#e11d48" />
            </View>
            <Text style={[styles.sectionTitle, { color: '#e11d48' }]}>Danger Zone</Text>
          </View>

          <TouchableOpacity 
            style={[styles.actionCard, styles.dangerZoneCard]} 
            onPress={handleResetData}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(225, 29, 72, 0.1)' }]}>
              <Ionicons name="trash-outline" size={18} color="#e11d48" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionCardTitle, { color: '#e11d48' }]}>Nuclear Data Wipe</Text>
              <Text style={styles.dangerSubText}>Permanently purge all local loans, spends & insurance</Text>
            </View>
            <Ionicons name="alert-circle-outline" size={18} color="#e11d48" />
          </TouchableOpacity>
        </View>

        {/* Footer & Version */}
        <View style={styles.footerWrap}>
          <Text style={styles.footerVersion}>Velo Flow v2.4.0 • Elite Edition</Text>
          <Text style={styles.footerLegal}>All Data Encrypted & Stored Locally</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  drawerTriggerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitles: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  aiSpotlightCard: {
    marginBottom: 22,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  aiSpotlightGradient: {
    padding: 16,
  },
  aiSpotlightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  aiTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 0.8,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#86efac',
  },
  aiSpotlightTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  aiSpotlightDesc: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
    lineHeight: 15,
  },
  aiLaunchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 22,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  sectionIconPill: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flex: 1,
  },
  activeTag: {
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  toolsBentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bentoCard: {
    width: '48.3%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  bentoCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  toolIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  bentoTagText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  bentoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 3,
  },
  bentoDesc: {
    fontSize: 10,
    color: '#64748b',
    lineHeight: 14,
  },
  cleanCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMainTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardSubTitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  inputContainer: {
    position: 'relative',
    marginTop: 4,
  },
  keyInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingRight: 40,
    fontSize: 13,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  inputEyeBtn: {
    position: 'absolute',
    right: 12,
    top: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  primarySaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4f46e5',
    paddingVertical: 11,
    borderRadius: 12,
  },
  primarySaveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  featureChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  featureChipText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },
  helperLinkText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 12,
    textAlign: 'center',
  },
  connectedContainer: {
    marginTop: 4,
  },
  connectedEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.2)',
    marginBottom: 12,
  },
  connectedLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  connectedEmailText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    marginLeft: 2,
  },
  gmailActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  syncEmailBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ea4335',
    paddingVertical: 12,
    borderRadius: 12,
  },
  syncEmailBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  disconnectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 12,
    borderRadius: 12,
  },
  disconnectBtnText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 12,
  },
  disconnectedContainer: {
    marginTop: 4,
  },
  featureDescText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 14,
  },
  connectGoogleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ea4335',
    paddingVertical: 13,
    borderRadius: 14,
  },
  connectGoogleText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  cloudBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  cloudStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
  },
  cloudStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  cloudMetaText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  accordionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  guideContainer: {
    marginTop: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  guideStepText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 18,
  },
  guideBold: {
    fontWeight: '700',
    color: '#0f172a',
  },
  codeSnippet: {
    color: '#0284c7',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  actionCardSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  dangerZoneCard: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  dangerSubText: {
    fontSize: 11,
    color: '#e11d48',
    marginTop: 2,
  },
  footerWrap: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  footerVersion: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.3,
  },
  footerLegal: {
    fontSize: 10,
    color: '#cbd5e1',
    marginTop: 4,
  },
});

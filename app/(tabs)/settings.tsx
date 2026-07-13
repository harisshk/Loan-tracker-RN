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
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLoans } from '../../utils/storage';
import { getGmailConfig, saveGmailTokens, clearGmailTokens, saveGmailSearchQuery, syncGmailTransactions } from '../../utils/gmail';
import Config from '../../utils/Config';
import { clearAuthUser } from '../../utils/auth';
import { DEFAULT_BULK_PROMPT } from '../../utils/classifier';

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

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currency, setCurrency] = useState(Config.DEFAULT_CURRENCY || '₹');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [classifierPrompt, setClassifierPrompt] = useState(DEFAULT_BULK_PROMPT);

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
    if (savedKey) setApiKey(savedKey);

    const savedPrompt = await AsyncStorage.getItem('@user_classifier_prompt');
    if (savedPrompt) setClassifierPrompt(savedPrompt);

    const gConfig = await getGmailConfig();
    setGmailConfig(gConfig);
    setGmailQuery(gConfig.query);
  };

  const handleSaveClassifierPrompt = async () => {
    await AsyncStorage.setItem('@user_classifier_prompt', classifierPrompt);
    Alert.alert('Saved', 'AI Classifier Prompt updated successfully!');
  };

  const handleResetClassifierPrompt = async () => {
    Alert.alert('Reset Prompt', 'Are you sure you want to reset the prompt to the default?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          setClassifierPrompt(DEFAULT_BULK_PROMPT);
          await AsyncStorage.setItem('@user_classifier_prompt', DEFAULT_BULK_PROMPT);
          Alert.alert('Reset', 'AI Classifier Prompt reset to default.');
        }
      }
    ]);
  };

  const saveApiKey = async (val: any) => {
    setApiKey(val);
    await AsyncStorage.setItem('@user_gemini_api_key', val);
  };

  const handleExportCSV = async () => {
    try {
      const loans = await getLoans();
      if (loans.length === 0) {
        Alert.alert('Empty', 'No loans found to export.');
        return;
      }
      // Simple log CSV export
      let csv = 'Loan Name,Type,Principal,Interest,Tenure,Status\n';
      loans.forEach((l: any) => {
        csv += `"${l.loanName}","${l.loanType}","${l.principal}","${l.interest}","${l.tenure}","${l.status}"\n`;
      });
      Alert.alert('CSV Exported (Dev Mode)', csv);
    } catch (e) {
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

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 15, paddingBottom: 24 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Intelligence</Text>
          <BlurView intensity={20} style={styles.aiCard}>
             <View style={styles.aiHeader}>
                <View style={[styles.iconWrap, { backgroundColor: '#7c3aed' }]}><Ionicons name="key" size={18} color="#fff" /></View>
                <Text style={styles.cardText}>Gemini API Key</Text>
             </View>
             <TextInput
               style={styles.keyInput}
               placeholder="Paste your API key here..."
               placeholderTextColor="#94a3b8"
               value={apiKey}
               onChangeText={saveApiKey}
               secureTextEntry={!showKey}
               autoCapitalize="none"
               autoCorrect={false}
             />
             <TouchableOpacity onPress={() => setShowKey(!showKey)} style={styles.toggleBtn}>
               <Text style={styles.toggleText}>{showKey ? 'Hide Key' : 'Show Key'}</Text>
             </TouchableOpacity>
             <Text style={styles.helpText}>Get one for free at aistudio.google.com</Text>
          </BlurView>

          <BlurView intensity={20} style={[styles.aiCard, { marginTop: 10 }]}>
             <View style={styles.aiHeader}>
                <View style={[styles.iconWrap, { backgroundColor: '#8b5cf6' }]}><Ionicons name="options-outline" size={18} color="#fff" /></View>
                <Text style={styles.cardText}>Transaction Classifier Prompt</Text>
             </View>
             <TextInput
               style={styles.promptInput}
               placeholder="Enter transaction classification prompt..."
               placeholderTextColor="#94a3b8"
               value={classifierPrompt}
               onChangeText={setClassifierPrompt}
               multiline={true}
               numberOfLines={6}
               autoCapitalize="none"
               autoCorrect={false}
             />
             <View style={styles.promptBtnRow}>
               <TouchableOpacity onPress={handleSaveClassifierPrompt} style={styles.savePromptBtn}>
                 <Text style={styles.savePromptText}>Save Prompt</Text>
               </TouchableOpacity>
               <TouchableOpacity onPress={handleResetClassifierPrompt} style={styles.resetPromptBtn}>
                 <Text style={styles.resetPromptText}>Reset Default</Text>
               </TouchableOpacity>
             </View>
          </BlurView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SMS Automation (Supabase)</Text>
          <BlurView intensity={20} style={styles.aiCard}>
             <View style={styles.aiHeader}>
               <View style={[styles.iconWrap, { backgroundColor: '#ec4899' }]}><Ionicons name="cloud-outline" size={18} color="#fff" /></View>
               <Text style={styles.cardText}>Supabase Sync Config</Text>
             </View>
             
             <View style={styles.envNote}>
               <Ionicons name="lock-closed" size={14} color="#10b981" />
               <Text style={styles.envNoteText}>Connected via secure environment configuration</Text>
             </View>

             <Text style={[styles.helpText, { textAlign: 'left', marginTop: 15, fontWeight: '700', color: '#0f172a' }]}>iOS Shortcuts Integration Guide:</Text>
              <Text style={[styles.helpText, { textAlign: 'left', marginTop: 4, lineHeight: 16, color: '#475569' }]}>
                1. Create iOS Automation &quot;When SMS is received&quot;.{"\n"}
                2. Parse transaction amount/merchant text.{"\n"}
                3. Add &quot;Get contents of URL&quot; HTTP action.{"\n"}
                4. API Endpoint: your-supabase-url + &quot;/rest/v1/transactions&quot;.{"\n"}
                5. HTTP Method: POST{"\n"}
                6. Headers:{"\n"}
                   • apikey: [anonKey]{"\n"}
                   • Authorization: Bearer [anonKey]{"\n"}
                   • Content-Type: application/json{"\n"}
                7. Body (JSON):{"\n"}
                   {"{ \"amount\": amount, \"type\": \"debit\", \"description\": merchant, \"category\": \"Other\" }"}
              </Text>
           </BlurView>
         </View>

         <View style={styles.section}>
           <Text style={styles.sectionTitle}>Email Automation (Gmail)</Text>
           <BlurView intensity={20} style={styles.aiCard}>
             <View style={styles.aiHeader}>
               <View style={[styles.iconWrap, { backgroundColor: '#ea4335' }]}><Ionicons name="mail" size={18} color="#fff" /></View>
               <Text style={styles.cardText}>Gmail Integration</Text>
             </View>
             
             {gmailConfig.isConnected ? (
               <View style={{ marginTop: 8 }}>
                 <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '600', marginBottom: 12 }}>
                   Connected to: <Text style={{ color: '#ea4335', fontWeight: 'bold' }}>{gmailConfig.email}</Text>
                 </Text>
                 
                 <Text style={styles.inputLabel}>Gmail Query Filter</Text>
                 <TextInput
                   style={[styles.keyInput, { marginBottom: 16 }]}
                   placeholder='subject:"transaction" "Rs."'
                   placeholderTextColor="#94a3b8"
                   value={gmailQuery}
                   onChangeText={handleSaveGmailQuery}
                   autoCapitalize="none"
                   autoCorrect={false}
                 />

                 <View style={{ flexDirection: 'row', gap: 10 }}>
                   <TouchableOpacity 
                     style={{ flex: 1, backgroundColor: '#ea4335', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }} 
                     onPress={handleGmailSync}
                     disabled={isGmailSyncing}
                   >
                     {isGmailSyncing ? (
                       <ActivityIndicator size="small" color="#fff" />
                     ) : (
                       <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Sync Emails</Text>
                     )}
                   </TouchableOpacity>

                   <TouchableOpacity 
                     style={{ flex: 1, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }} 
                     onPress={handleDisconnectGmail}
                   >
                     <Text style={{ color: '#e11d48', fontWeight: 'bold', fontSize: 13 }}>Disconnect</Text>
                   </TouchableOpacity>
                 </View>
               </View>
             ) : (
               <View style={{ marginTop: 8 }}>
                 <Text style={[styles.helpText, { textAlign: 'left', marginBottom: 15, fontSize: 12, color: '#475569', lineHeight: 18, marginTop: 0 }]}>
                   Automatically pull, parse, and upload transaction alerts directly from your Gmail account in real-time.
                 </Text>
                 <TouchableOpacity 
                   style={{ backgroundColor: '#ea4335', padding: 14, borderRadius: 14, alignItems: 'center', shadowColor: '#ea4335', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6 }} 
                   onPress={handleGoogleLogin}
                 >
                   <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Connect Gmail Account</Text>
                 </TouchableOpacity>
               </View>
             )}
           </BlurView>
         </View>

         <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          <TouchableOpacity style={styles.card} onPress={handleExportCSV}>
            <View style={[styles.iconWrap, { backgroundColor: '#38bdf8' }]}><Ionicons name="document-text" size={20} color="#fff" /></View>
            <Text style={styles.cardText}>Export Loans to CSV</Text>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.card} onPress={() => router.push('/sync')}>
            <View style={[styles.iconWrap, { backgroundColor: '#a78bfa' }]}><Ionicons name="cloud-upload" size={20} color="#fff" /></View>
            <Text style={styles.cardText}>Backup & Restore (JSON)</Text>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            <View style={[styles.iconWrap, { backgroundColor: '#10b981' }]}><Ionicons name="cash" size={20} color="#fff" /></View>
            <Text style={styles.cardText}>Currency Symbol</Text>
            <Text style={styles.valText}>{currency}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.card} onPress={handleLogout}>
            <View style={[styles.iconWrap, { backgroundColor: '#64748b' }]}><Ionicons name="log-out-outline" size={20} color="#fff" /></View>
            <Text style={styles.cardText}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity style={[styles.card, styles.dangerCard]} onPress={handleResetData}>
            <View style={[styles.iconWrap, { backgroundColor: '#e11d48' }]}><Ionicons name="trash" size={20} color="#fff" /></View>
            <Text style={[styles.cardText, { color: '#e11d48' }]}>Reset All Data</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>Velo Flow v2.0.0 • Elite Edition</Text>
        <View style={{ height: 24 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },
  header: { marginBottom: 30 },
  title: { fontSize: 32, fontWeight: '800', color: '#0f172a' },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 4 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  iconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  cardText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#334155' },
  valText: { fontSize: 16, fontWeight: 'bold', color: '#10b981' },
  aiCard: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 20, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  keyInput: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, fontSize: 13, color: '#0f172a', borderWidth: 1, borderColor: '#e2e8f0', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  toggleBtn: { alignSelf: 'flex-end', marginTop: 8, padding: 4 },
  toggleText: { fontSize: 12, color: '#7c3aed', fontWeight: '700' },
  helpText: { fontSize: 11, color: '#94a3b8', marginTop: 12, textAlign: 'center' },
  dangerCard: { borderColor: 'rgba(225,29,72,0.1)' },
  versionText: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 20, marginBottom: 4 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 4, marginLeft: 2, marginTop: 8 },
  envNote: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  envNoteText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  promptInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 120,
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 8,
  },
  promptBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  savePromptBtn: {
    flex: 1,
    backgroundColor: '#7c3aed',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePromptText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  resetPromptBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetPromptText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
});

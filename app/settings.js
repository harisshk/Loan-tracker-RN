import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  Share,
  TextInput,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLoans, getPayments, getInsurances } from '../utils/storage';
import Config from '../utils/Config';

export default function Settings() {
  const router = useRouter();
  const [currency, setCurrency] = useState(Config.DEFAULT_CURRENCY || '₹');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const savedKey = await AsyncStorage.getItem('@user_gemini_api_key');
    if (savedKey) setApiKey(savedKey);
  };

  const saveApiKey = async (val) => {
    setApiKey(val);
    await AsyncStorage.setItem('@user_gemini_api_key', val);
  };

  const handleExportCSV = async () => {
    try {
      const loans = await getLoans();
      const payments = await getPayments();
      
      if (loans.length === 0) {
        Alert.alert('Empty', 'No loans found to export.');
        return;
      }

      // Build CSV String
      let csv = 'Loan Name,Type,Principal,Interest,Tenure,Status,Remaining\n';
      loans.forEach(l => {
        csv += `"${l.loanName}","${l.loanType}","${l.principal}","${l.interest}","${l.tenure}","${l.status}","${l.remainingAmount || 0}"\n`;
      });

      const filename = `Loan_Report_${new Date().toISOString().split('T')[0]}.csv`;
      await Share.share({
        title: 'Loan Export',
        message: csv,
        url: 'data:text/csv;base64,' + btoa(csv), // Note: sharing raw text works on many platforms
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to generate report.');
    }
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

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity>
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
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity style={[styles.card, styles.dangerCard]} onPress={handleResetData}>
            <View style={[styles.iconWrap, { backgroundColor: '#e11d48' }]}><Ionicons name="trash" size={20} color="#fff" /></View>
            <Text style={[styles.cardText, { color: '#e11d48' }]}>Reset All Data</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>Loan Tracker v1.2.5 • Elite Edition</Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },
  header: { marginBottom: 30 },
  backBtn: { color: '#10b981', fontWeight: '700', marginBottom: 10 },
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
  versionText: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 40, marginBottom: 60 },
});

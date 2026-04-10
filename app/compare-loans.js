import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const fc = (v) =>
  `₹${parseFloat(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function Compare() {
  const router = useRouter();
  
  // Offer A
  const [p1, setP1] = useState('1000000');
  const [i1, setI1] = useState('9');
  const [t1, setT1] = useState('120');

  // Offer B
  const [p2, setP2] = useState('1000000');
  const [i2, setI2] = useState('8.5');
  const [t2, setT2] = useState('120');

  const calc = (p, r, t) => {
    const princ = parseFloat(String(p).replace(/,/g, '')) || 0;
    const rate  = parseFloat(r) || 0;
    const tenure = parseInt(t) || 0;
    if (!princ || !rate || !tenure) return { emi: 0, total: 0, interest: 0 };
    
    const monthlyRate = rate / 12 / 100;
    const emi = (princ * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1);
    const total = emi * tenure;
    return { emi, total, interest: total - princ };
  };

  const a = useMemo(() => calc(p1, i1, t1), [p1, i1, t1]);
  const b = useMemo(() => calc(p2, i2, t2), [p2, i2, t2]);

  const diff = {
    emi: Math.abs(a.emi - b.emi),
    total: Math.abs(a.total - b.total),
    interest: Math.abs(a.interest - b.interest),
    winner: a.total < b.total ? 'A' : 'B'
  };

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.backButton}>← Dashboard</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>Comparison Lab</Text>
          <Text style={styles.headerSubtitle}>Compare two loan offers side-by-side</Text>
        </View>

        <View style={styles.comparisonGrid}>
          {/* Card A */}
          <View style={styles.col}>
            <LinearGradient colors={['#fff', '#f0fdf4']} style={[styles.offerCard, diff.winner === 'A' && styles.winnerCard]}>
              <Text style={styles.offerLabel}>OFFER A</Text>
              <InputField label="Principal" value={p1} onChangeText={setP1} />
              <InputField label="Rate (%)" value={i1} onChangeText={setI1} />
              <InputField label="Tenure (m)" value={t1} onChangeText={setT1} />
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Monthly EMI</Text>
                <Text style={styles.resultValue}>{fc(a.emi)}</Text>
                <Text style={styles.resultLabel}>Total Interest</Text>
                <Text style={styles.resultValue}>{fc(a.interest)}</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Card B */}
          <View style={styles.col}>
            <LinearGradient colors={['#fff', '#f0fdf4']} style={[styles.offerCard, diff.winner === 'B' && styles.winnerCard]}>
              <Text style={styles.offerLabel}>OFFER B</Text>
              <InputField label="Principal" value={p2} onChangeText={setP2} />
              <InputField label="Rate (%)" value={i2} onChangeText={setI2} />
              <InputField label="Tenure (m)" value={t2} onChangeText={setT2} />
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Monthly EMI</Text>
                <Text style={styles.resultValue}>{fc(b.emi)}</Text>
                <Text style={styles.resultLabel}>Total Interest</Text>
                <Text style={styles.resultValue}>{fc(b.interest)}</Text>
              </View>
            </LinearGradient>
          </View>
        </View>

        <BlurView intensity={30} tint="light" style={styles.verdictCard}>
          <View style={styles.verdictHeader}>
            <Ionicons name="trophy" size={24} color="#f59e0b" />
            <Text style={styles.verdictTitle}>The Better Choice: Offer {diff.winner}</Text>
          </View>
          <View style={styles.verdictBody}>
            <Text style={styles.verdictSaving}>
              You save {fc(diff.interest)} in total interest with Offer {diff.winner}!
            </Text>
            <View style={styles.divider} />
            <Text style={styles.verdictDetail}>• EMI Difference: {fc(diff.emi)}/mo</Text>
            <Text style={styles.verdictDetail}>• Total Outflow Diff: {fc(diff.total)}</Text>
          </View>
        </BlurView>
        
        <Text style={styles.footerNote}>💡 Tip: Sometimes a lower EMI means a much higher total interest if the tenure is longer. Use this lab to see the full picture.</Text>
      </ScrollView>
    </LinearGradient>
  );
}

function InputField({ label, value, onChangeText }) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholderTextColor="#94a3b8"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 60 },
  header: { marginBottom: 28 },
  backButton: { fontSize: 15, color: '#10b981', marginBottom: 12 },
  headerTitle: { fontSize: 32, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { fontSize: 14, color: 'rgba(15,23,42,0.5)', marginTop: 4 },
  comparisonGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  col: { flex: 1 },
  offerCard: { borderRadius: 24, padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10 },
  winnerCard: { borderColor: '#10b981', borderWidth: 2, backgroundColor: '#f0fdf4' },
  offerLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(15,23,42,0.4)', marginBottom: 14, letterSpacing: 1 },
  inputWrap: { marginBottom: 12 },
  inputLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(15,23,42,0.5)', marginBottom: 4, textTransform: 'uppercase' },
  input: { height: 44, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 10, fontSize: 15, fontWeight: '700', color: '#0f172a' },
  resultBox: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  resultLabel: { fontSize: 10, color: 'rgba(15,23,42,0.5)', marginBottom: 2 },
  resultValue: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  verdictCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  verdictHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: 'rgba(245,158,11,0.08)', borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.1)' },
  verdictTitle: { fontSize: 16, fontWeight: '700', color: '#b45309' },
  verdictBody: { padding: 18 },
  verdictSaving: { fontSize: 18, fontWeight: '800', color: '#10b981', marginBottom: 12 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 12 },
  verdictDetail: { fontSize: 13, color: 'rgba(15,23,42,0.6)', marginBottom: 4, fontWeight: '500' },
  footerNote: { fontSize: 12, color: 'rgba(15,23,42,0.4)', textAlign: 'center', marginTop: 30, fontStyle: 'italic', lineHeight: 18 },
});

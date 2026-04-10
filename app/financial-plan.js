import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLoans, getInsurances, getPayments } from '../utils/storage';
import { generateFinancialPlan } from '../utils/financialPlanner';

const PLAN_SETTINGS_KEY = '@financial_plan_settings';

const STATUS_META = {
  comfortable: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Comfortable', icon: '✅' },
  tight:       { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Tight',       icon: '💛' },
  critical:    { color: '#e11d48', bg: 'rgba(225,29,72,0.12)',   label: 'Critical',    icon: '⚠️' },
};

const fc = (v) =>
  `₹${parseFloat(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// ── Setup Form ────────────────────────────────────────────────────────────────
function SetupForm({ initial, insuranceMonthly, onSubmit }) {
  const [salary, setSalary]         = useState(initial?.salary     || '');
  const [rent, setRent]             = useState(initial?.rent       || '');
  const [expenses, setExpenses]     = useState(initial?.expenses   || '');
  const [minSave, setMinSave]       = useState(initial?.minSave    || '');
  const [months, setMonths]         = useState(String(initial?.months ?? 12));
  const [incomeEvents, setIncomeEvents] = useState(initial?.incomeEvents || []);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [evMonth, setEvMonth]  = useState('');
  const [evSalary, setEvSalary] = useState('');
  const [evRent, setEvRent]   = useState('');

  const addEvent = () => {
    const mo = parseInt(evMonth);
    if (!mo || mo < 1 || mo > 36) { Alert.alert('Invalid', 'Month must be 1–36.'); return; }
    if (!evSalary && !evRent)     { Alert.alert('Required', 'Enter new salary or rent.'); return; }
    const ev = { fromMonth: mo };
    if (evSalary) ev.salaryMonthly = parseFloat(evSalary);
    if (evRent)   ev.rentMonthly   = parseFloat(evRent);
    setIncomeEvents(prev =>
      [...prev.filter(e => e.fromMonth !== mo), ev].sort((a, b) => a.fromMonth - b.fromMonth)
    );
    setEvMonth(''); setEvSalary(''); setEvRent('');
    setShowAddEvent(false);
  };

  const handleGenerate = () => {
    const parseNum = (v) => parseFloat(String(v || 0).replace(/,/g, ''));
    const s = parseNum(salary);
    const e = parseNum(expenses);
    const ms = parseNum(minSave);
    const mo = parseInt(months);
    if (!s || s <= 0) { Alert.alert('Required', 'Enter salary.'); return; }
    if (!e || e <= 0) { Alert.alert('Required', 'Enter expenses.'); return; }
    if (!ms || ms <= 0) { Alert.alert('Required', 'Enter min savings.'); return; }
    onSubmit({ salary: s, rent: parseNum(rent) || 0, expenses: e, minSave: ms, months: mo, incomeEvents });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BlurView intensity={20} tint="light" style={styles.setupCard}>
        <View style={styles.setupInner}>
          <Text style={styles.setupIcon}>🧮</Text>
          <Text style={styles.setupTitle}>Financial Assumptions</Text>
          <Text style={styles.setupSubtitle}>Fill in your numbers to generate a debt-reduction roadmap.</Text>
          <View style={styles.autoRow}>
            <Text style={styles.autoLabel}>🛡️ Insurance (Auto-fetched)</Text>
            <Text style={styles.autoValue}>{fc(insuranceMonthly)}/mo</Text>
          </View>
          <InputField label="Monthly Salary" value={salary} onChangeText={setSalary} placeholder="e.g. 120000" icon="💼" />
          <InputField label="Rental Income" value={rent} onChangeText={setRent} placeholder="e.g. 15000" icon="🏠" />
          <InputField label="Living Expenses" value={expenses} onChangeText={setExpenses} placeholder="e.g. 40000" icon="🛒" />
          <InputField label="Minimum Savings" value={minSave} onChangeText={setMinSave} placeholder="e.g. 15000" icon="🏦" />

          <View style={styles.durationGroup}>
            <Text style={styles.durationLabel}>⏳ Plan Duration</Text>
            <View style={styles.durationRow}>
              {[6, 12, 18, 24, 36].map((m) => (
                <TouchableOpacity key={m} style={[styles.durationChip, months === String(m) && styles.durationChipActive]} onPress={() => setMonths(String(m))}>
                  <Text style={[styles.durationChipText, months === String(m) && styles.durationChipTextActive]}>{m}mo</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate} activeOpacity={0.85}>
            <LinearGradient colors={['#10b981', '#059669']} style={styles.generateBtnGrad}>
              <Text style={styles.generateBtnText}>📈 Generate Plan</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </BlurView>
    </KeyboardAvoidingView>
  );
}

function InputField({ label, value, onChangeText, placeholder, icon }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{icon}  {label}</Text>
      <View style={styles.inputWrap}>
        <Text style={styles.inputPrefix}>₹</Text>
        <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="rgba(15,23,42,0.3)" keyboardType="numeric" />
      </View>
    </View>
  );
}

// ── Month Card ────────────────────────────────────────────────────────────────
const MonthCard = React.memo(({ data, index }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const meta = STATUS_META[data.status];

  return (
    <BlurView intensity={20} tint="light" style={[styles.monthCard, { borderColor: meta.color + '40' }]}>
      <TouchableOpacity style={styles.monthHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={[styles.monthIndexBadge, { backgroundColor: meta.color }]}><Text style={styles.monthIndexText}>{data.month}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.monthLabel}>{data.monthLabel}</Text>
          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}><Text style={[styles.statusPillText, { color: meta.color }]}>{meta.icon} {meta.label}</Text></View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.monthSavings}>+{fc(data.savings)}</Text>
          <Text style={styles.monthSavingsLabel}>Saved</Text>
        </View>
        <Text style={[styles.chevron, expanded && { transform: [{ rotate: '180deg' }] }]}>›</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.monthBody}>
          <View style={styles.monthSection}>
            <Text style={styles.monthSectionTitle}>Income & Costs</Text>
            <MonthRow label="💼 Salary" value={fc(data.salaryMonthly)} />
            {data.rentMonthly > 0 && <MonthRow label="🏠 Rent" value={`+ ${fc(data.rentMonthly)}`} />}
            <MonthRow label="📊 Total Income" value={fc(data.income)} bold accent="#10b981" />
            <View style={styles.divider} />
            <MonthRow label="📅 EMI Total" value={`- ${fc(data.emiTotal)}`} />
            <MonthRow label="🛡️ Insurance" value={`- ${fc(data.insuranceMonthly)}`} />
            <MonthRow label="🛒 Living Expenses" value={`- ${fc(data.expenses)}`} />
            <MonthRow label="💰 Available" value={fc(data.available)} bold accent={data.available >= 0 ? '#10b981' : '#e11d48'} />
          </View>
          <View style={styles.monthSection}>
            <Text style={styles.monthSectionTitle}>Strategy</Text>
            <MonthRow label="🏦 Saved This Month" value={fc(data.savings)} accent="#10b981" bold />
            <MonthRow label="💳 Extra Loan Budget" value={fc(data.loanBudget)} accent={data.loanBudget > 0 ? '#38bdf8' : 'rgba(15,23,42,0.4)'} />
          </View>
          {data.notes.map((n, i) => <Text key={i} style={styles.noteText}>• {n}</Text>)}
        </View>
      )}
    </BlurView>
  );
});

function MonthRow({ label, value, bold, accent }) {
  return (
    <View style={styles.mRow}>
      <Text style={styles.mRowLabel}>{label}</Text>
      <Text style={[styles.mRowValue, bold && { fontWeight: '700' }, accent && { color: accent }]}>{value}</Text>
    </View>
  );
}

// ── Main Controller ─────────────────────────────────────────────────────────────
export default function FinancialPlan() {
  const router = useRouter();
  const [loading, setLoading]       = useState(true);
  const [showSetup, setShowSetup]   = useState(false);
  const [settings, setSettings]     = useState(null);
  const [loans, setLoans]           = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [payments, setPayments]     = useState([]);

  const loadAll = useCallback(async () => {
    const [l, i, p, s] = await Promise.all([getLoans(), getInsurances(), getPayments(), AsyncStorage.getItem(PLAN_SETTINGS_KEY)]);
    setLoans(l); setInsurances(i); setPayments(p);
    if (s) { setSettings(JSON.parse(s)); setShowSetup(false); } 
    else { setShowSetup(true); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const insuranceMonthly = useMemo(() => {
    let annual = 0;
    insurances.forEach(ins => {
      const p = parseFloat(String(ins.premiumAmount).replace(/,/g, '')) || 0;
      const m = ins.frequency === 'monthly' ? 12 : ins.frequency === 'quarterly' ? 4 : ins.frequency === 'half-yearly' ? 2 : 1;
      annual += p * m;
    });
    return annual / 12;
  }, [insurances]);

  const plan = useMemo(() => {
    if (!settings || loans.length === 0) return null;
    return generateFinancialPlan({
      loans, insurances, payments,
      salaryMonthly: settings.salary,
      rentMonthly: settings.rent,
      livingExpensesMonthly: settings.expenses,
      minimumSavings: settings.minSave,
      months: settings.months ?? 12,
      incomeEvents: settings.incomeEvents ?? [],
    });
  }, [settings, loans, insurances, payments]);

  const planStats = useMemo(() => {
    if (!plan) return null;
    const totalSavings = plan.reduce((s, m) => s + m.savings, 0);
    const totalExtra   = plan.reduce((s, m) => s + m.loanBudget, 0);
    const lastMonth    = plan[plan.length - 1];
    
    // Resilience Score (Current state vs Final state)
    const initialCosts = plan[0].emiTotal + plan[0].insuranceMonthly + plan[0].expenses;
    const runway = lastMonth.emergencyFund / Math.max(1, initialCosts);

    return {
      savingsCap: totalSavings,
      extraPaid: totalExtra,
      interestSaved: lastMonth?.totalInterestSaved || 0,
      finalFund: lastMonth?.emergencyFund || 0,
      clearedPrincipal: plan.reduce((s, m) => s + m.loanPayments.reduce((ps, lp) => ps + lp.payment, 0), 0),
      runway,
    };
  }, [plan]);

  const handleReset = () => {
    Alert.alert('Reset', 'Start fresh?', [{ text: 'Cancel' }, { text: 'Reset', onPress: () => { AsyncStorage.removeItem(PLAN_SETTINGS_KEY); setSettings(null); setShowSetup(true); } }]);
  };

  if (loading) return <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#10b981" /></View>;

  return (
    <LinearGradient colors={['#f0fdf4', '#f8fafc', '#e2e8f0']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.backButton}>← Back</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>Financial Plan</Text>
          {plan && <TouchableOpacity onPress={() => setShowSetup(!showSetup)} style={styles.editBtn}><Text style={styles.editBtnText}>{showSetup ? 'View Plan' : '⚙️ Settings'}</Text></TouchableOpacity>}
        </View>

        {showSetup ? (
          <SetupForm initial={settings} insuranceMonthly={insuranceMonthly} onSubmit={(v) => { AsyncStorage.setItem(PLAN_SETTINGS_KEY, JSON.stringify(v)); setSettings(v); setShowSetup(false); }} />
        ) : plan && (
          <>
            <View style={styles.summaryRow}>
              <SummaryTile label="Resilience Score" value={planStats.runway.toFixed(1)} color={planStats.runway >= 6 ? '#10b981' : planStats.runway < 2 ? '#e11d48' : '#f59e0b'} icon="🛡️" suffix=" mo" />
              <SummaryTile label="Principal Cleared" value={fc(planStats.clearedPrincipal)} color="#38bdf8" icon="📉" />
            </View>
            <View style={styles.summaryRow}>
              <SummaryTile label="Interest Saved" value={fc(planStats.interestSaved)} color="#a78bfa" icon="✨" />
              <SummaryTile label="Emergency Fund" value={fc(planStats.finalFund)} color="#10b981" icon="🏦" />
            </View>

            {/* Resilience Stress Test Section */}
            <BlurView intensity={20} tint="light" style={styles.resilienceCard}>
              <View style={styles.resilienceHeader}>
                <Text style={styles.resilienceTitle}>🛡️ Financial Stress Test</Text>
              </View>
              <View style={styles.resilienceBody}>
                <View style={styles.resilienceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resilienceLabel}>Emergency Runway</Text>
                    <Text style={[styles.resilienceValue, { color: planStats.runway >= 6 ? '#10b981' : planStats.runway < 2 ? '#e11d48' : '#f59e0b' }]}>
                      {planStats.runway.toFixed(1)} Months
                    </Text>
                  </View>
                  <View style={styles.resilienceStatus}>
                    <Text style={[styles.resilienceStatusText, { color: planStats.runway >= 6 ? '#10b981' : planStats.runway < 2 ? '#e11d48' : '#f59e0b' }]}>
                      {planStats.runway >= 6 ? 'STRONG' : planStats.runway < 2 ? 'VULNERABLE' : 'STABLE'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.resilienceInsight}>
                  {planStats.runway >= 6 
                    ? "You have a rock-solid buffer. You can survive 6+ months without income."
                    : planStats.runway < 2 
                    ? "Warning: Your buffer is low. A sudden job loss would be critical within 2 months."
                    : "You're getting there. Aim for 6 months of runway for total financial freedom."}
                </Text>
              </View>
            </BlurView>
            
            <Text style={styles.sectionTitle}>Monthly Roadmap</Text>
            {plan.map((m, i) => <MonthCard key={i} data={m} index={i} />)}
            
            <TouchableOpacity onPress={handleReset} style={styles.resetBtn}><Text style={styles.resetBtnText}>🔄 Reset Plan</Text></TouchableOpacity>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function SummaryTile({ label, value, color, icon }) {
  return (
    <BlurView intensity={20} tint="light" style={styles.summaryTile}>
      <View style={styles.summaryTileInner}>
        <Text style={styles.summaryTileIcon}>{icon}</Text>
        <Text style={styles.summaryTileLabel}>{label}</Text>
        <Text style={[styles.summaryTileValue, { color }]}>{value}</Text>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backButton: { fontSize: 16, color: '#10b981' },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#0f172a' },
  editBtn: { padding: 10, backgroundColor: 'rgba(167,139,250,0.1)', borderRadius: 12 },
  editBtnText: { color: '#a78bfa', fontWeight: '700' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  setupCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  setupInner: { padding: 24 },
  setupIcon: { fontSize: 36, marginBottom: 8 },
  setupTitle: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  setupSubtitle: { fontSize: 13, color: 'rgba(15,23,42,0.5)', marginBottom: 20 },
  autoRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, backgroundColor: 'rgba(16,185,129,0.06)', borderRadius: 14, marginBottom: 16 },
  autoLabel: { fontSize: 13, color: '#0f172a' },
  autoValue: { fontWeight: '700', color: '#10b981' },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, color: 'rgba(15,23,42,0.6)', marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  inputPrefix: { color: 'rgba(15,23,42,0.4)', marginRight: 4 },
  input: { flex: 1, height: 48, fontSize: 16 },
  durationGroup: { marginBottom: 20 },
  durationLabel: { fontSize: 13, color: 'rgba(15,23,42,0.6)', marginBottom: 8 },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationChip: { padding: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  durationChipActive: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: '#10b981' },
  durationChipText: { fontSize: 12, fontWeight: '600' },
  durationChipTextActive: { color: '#10b981' },
  generateBtn: { borderRadius: 16, overflow: 'hidden' },
  generateBtnGrad: { padding: 16, alignItems: 'center' },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryTile: { flex: 1, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  summaryTileInner: { padding: 16, alignItems: 'center' },
  summaryTileIcon: { fontSize: 20, marginBottom: 4 },
  summaryTileLabel: { fontSize: 10, color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase' },
  summaryTileValue: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginVertical: 16 },
  monthCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1.5, marginBottom: 12 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  monthIndexBadge: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  monthIndexText: { color: '#fff', fontWeight: '800' },
  monthLabel: { fontSize: 16, fontWeight: '700' },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  monthSavings: { fontSize: 16, fontWeight: '700', color: '#10b981' },
  monthSavingsLabel: { fontSize: 9, color: 'rgba(15,23,42,0.45)' },
  monthBody: { padding: 16, paddingTop: 0, gap: 12 },
  monthSection: { padding: 12, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 16 },
  monthSectionTitle: { fontSize: 10, fontWeight: '700', color: 'rgba(15,23,42,0.4)', textTransform: 'uppercase', marginBottom: 8 },
  mRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  mRowLabel: { fontSize: 12, color: 'rgba(15,23,42,0.6)' },
  mRowValue: { fontSize: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 6 },
  noteText: { fontSize: 12, color: 'rgba(15,23,42,0.5)', fontStyle: 'italic' },
  resetBtn: { marginTop: 20, alignItems: 'center' },
  resetBtnText: { color: 'rgba(15,23,42,0.3)', fontWeight: '600' },
  chevron: { fontSize: 18, color: 'rgba(15,23,42,0.2)', marginLeft: 4 },
  
  // Resilience Card
  resilienceCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.4)' },
  resilienceHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  resilienceTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  resilienceBody: { padding: 16 },
  resilienceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  resilienceLabel: { fontSize: 12, color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  resilienceValue: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  resilienceStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.03)' },
  resilienceStatusText: { fontSize: 12, fontWeight: '800' },
  resilienceInsight: { fontSize: 13, color: 'rgba(15,23,42,0.6)', lineHeight: 18, fontStyle: 'italic' },
});

import React, { useState, useEffect, useCallback } from 'react';
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
import { getLoans, getInsurances } from '../utils/storage';
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
  // mini-form for adding an event
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [evMonth, setEvMonth]  = useState('');
  const [evSalary, setEvSalary] = useState('');
  const [evRent, setEvRent]   = useState('');

  const addEvent = () => {
    const mo = parseInt(evMonth);
    if (!mo || mo < 1 || mo > 36) { Alert.alert('Invalid', 'Month must be 1–36.'); return; }
    if (!evSalary && !evRent)     { Alert.alert('Required', 'Enter new salary or rent (or both).'); return; }
    const ev = { fromMonth: mo };
    if (evSalary) ev.salaryMonthly = parseFloat(evSalary);
    if (evRent)   ev.rentMonthly   = parseFloat(evRent);
    setIncomeEvents(prev =>
      [...prev.filter(e => e.fromMonth !== mo), ev]
        .sort((a, b) => a.fromMonth - b.fromMonth)
    );
    setEvMonth(''); setEvSalary(''); setEvRent('');
    setShowAddEvent(false);
  };

  const removeEvent = (mo) =>
    setIncomeEvents(prev => prev.filter(e => e.fromMonth !== mo));

  const handleGenerate = () => {
    const s  = parseFloat(salary);
    const e  = parseFloat(expenses);
    const ms = parseFloat(minSave);
    const mo = parseInt(months);
    if (!s || s <= 0)             { Alert.alert('Required', 'Please enter your monthly salary.'); return; }
    if (!e || e <= 0)             { Alert.alert('Required', 'Please enter your monthly living expenses.'); return; }
    if (!ms || ms <= 0)           { Alert.alert('Required', 'Please enter your minimum monthly savings.'); return; }
    if (!mo || mo < 1 || mo > 36) { Alert.alert('Invalid', 'Plan duration must be between 1 and 36 months (3 years).'); return; }
    onSubmit({ salary: s, rent: parseFloat(rent) || 0, expenses: e, minSave: ms, months: mo, incomeEvents });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BlurView intensity={20} tint="light" style={styles.setupCard}>
        <View style={styles.setupInner}>
          <Text style={styles.setupIcon}>🧮</Text>
          <Text style={styles.setupTitle}>Financial Assumptions</Text>
          <Text style={styles.setupSubtitle}>
            Fill in your monthly numbers to generate a 12-month debt-reduction plan.
          </Text>

          {/* Insurance auto-info */}
          <View style={styles.autoRow}>
            <Text style={styles.autoLabel}>🛡️  Insurance (auto-fetched)</Text>
            <Text style={styles.autoValue}>{fc(insuranceMonthly)}/mo</Text>
          </View>

          <InputField label="Monthly Salary" value={salary} onChangeText={setSalary}
            placeholder="e.g. 120000" icon="💼" />
          <InputField label="Rental Income (optional)" value={rent} onChangeText={setRent}
            placeholder="e.g. 15000  (0 if none)" icon="🏠" />
          <InputField label="Monthly Living Expenses" value={expenses} onChangeText={setExpenses}
            placeholder="e.g. 40000" icon="🛒" />
          <InputField label="Minimum Monthly Savings" value={minSave} onChangeText={setMinSave}
            placeholder="e.g. 15000" icon="🏦" />

          {/* Duration picker */}
          <View style={styles.durationGroup}>
            <Text style={styles.durationLabel}>⏳  Plan Duration</Text>
            <View style={styles.durationRow}>
              {[6, 12, 18, 24, 36].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.durationChip, months === String(m) && styles.durationChipActive]}
                  onPress={() => setMonths(String(m))}
                >
                  <Text style={[styles.durationChipText, months === String(m) && styles.durationChipTextActive]}>
                    {m}mo
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.durationInputWrap}>
              <TextInput
                style={styles.durationInput}
                value={months}
                onChangeText={(v) => setMonths(v.replace(/[^0-9]/g, ''))}
                placeholder="Or type 1–36"
                placeholderTextColor="rgba(15,23,42,0.3)"
                keyboardType="numeric"
                maxLength={2}
              />
              <Text style={styles.durationSuffix}>months  (max 36)</Text>
            </View>
          </View>

          {/* ── Income Forecast Events ── */}
          <View style={styles.eventsGroup}>
            <View style={styles.eventsHeader}>
              <Text style={styles.eventsTitle}>📈  Income Forecast</Text>
              <Text style={styles.eventsSub}>Optional: define salary/rent changes at specific months</Text>
            </View>

            {/* Existing events */}
            {incomeEvents.map(ev => (
              <View key={ev.fromMonth} style={styles.eventChip}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventChipTitle}>Month {ev.fromMonth}</Text>
                  {ev.salaryMonthly != null && (
                    <Text style={styles.eventChipDetail}>💼 Salary → {fc(ev.salaryMonthly)}</Text>
                  )}
                  {ev.rentMonthly != null && (
                    <Text style={styles.eventChipDetail}>🏠 Rent → {fc(ev.rentMonthly)}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => removeEvent(ev.fromMonth)} style={styles.eventDeleteBtn}>
                  <Text style={styles.eventDeleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Add new event */}
            {showAddEvent ? (
              <View style={styles.addEventForm}>
                <Text style={styles.addEventFormTitle}>New Income Change</Text>
                <View style={styles.addEventRow}>
                  <View style={[styles.addEventInputWrap, { flex: 0.5 }]}>
                    <Text style={styles.addEventInputLabel}>At Month #</Text>
                    <TextInput
                      style={styles.addEventInput}
                      value={evMonth}
                      onChangeText={v => setEvMonth(v.replace(/[^0-9]/g,''))}
                      placeholder="e.g. 6"
                      placeholderTextColor="rgba(15,23,42,0.3)"
                      keyboardType="numeric"
                      maxLength={2}
                    />
                  </View>
                  <View style={[styles.addEventInputWrap, { flex: 1 }]}>
                    <Text style={styles.addEventInputLabel}>New Salary (₹)</Text>
                    <TextInput
                      style={styles.addEventInput}
                      value={evSalary}
                      onChangeText={v => setEvSalary(v.replace(/[^0-9]/g,''))}
                      placeholder="leave blank to keep"
                      placeholderTextColor="rgba(15,23,42,0.3)"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.addEventInputWrap, { flex: 1 }]}>
                    <Text style={styles.addEventInputLabel}>New Rent (₹)</Text>
                    <TextInput
                      style={styles.addEventInput}
                      value={evRent}
                      onChangeText={v => setEvRent(v.replace(/[^0-9]/g,''))}
                      placeholder="leave blank to keep"
                      placeholderTextColor="rgba(15,23,42,0.3)"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <TouchableOpacity style={styles.addEventSaveBtn} onPress={addEvent}>
                    <Text style={styles.addEventSaveBtnText}>✓ Add</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addEventCancelBtn} onPress={() => setShowAddEvent(false)}>
                    <Text style={styles.addEventCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addEventBtn} onPress={() => setShowAddEvent(true)}>
                <Text style={styles.addEventBtnText}>+ Add Income Change</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate} activeOpacity={0.85}>
            <LinearGradient colors={['#10b981', '#059669']} style={styles.generateBtnGrad}>
              <Text style={styles.generateBtnText}>📈  Generate Plan</Text>
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
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(15,23,42,0.3)"
          keyboardType="numeric"
        />
      </View>
    </View>
  );
}

// ── Month Card ────────────────────────────────────────────────────────────────
function MonthCard({ data, index }) {
  const [expanded, setExpanded] = useState(index === 0);
  const meta = STATUS_META[data.status];

  return (
    <BlurView intensity={20} tint="light" style={[styles.monthCard, { borderColor: meta.color + '40' }]}>
      {/* Header row — always visible */}
      <TouchableOpacity style={styles.monthHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={[styles.monthIndexBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.monthIndexText}>{data.month}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.monthLabel}>{data.monthLabel}</Text>
            {data.incomeChanged && (
              <View style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#10b981' }}>📈 NEW INCOME</Text>
              </View>
            )}
          </View>
          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.icon} {meta.label}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.monthSavings}>+{fc(data.savings)}</Text>
          <Text style={styles.monthSavingsLabel}>Saved</Text>
        </View>
        <Text style={[styles.chevron, expanded && { transform: [{ rotate: '180deg' }] }]}>›</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.monthBody}>
          {/* Income vs Fixed */}
          <View style={styles.monthSection}>
            <Text style={styles.monthSectionTitle}>Income & Costs</Text>
            <MonthRow label="💼 Salary" value={fc(data.salaryMonthly)} />
            {data.rentMonthly > 0 && <MonthRow label="🏠 Rent" value={`+ ${fc(data.rentMonthly)}`} />}
            <MonthRow label="📊 Total Income" value={fc(data.income)} bold accent="#10b981" />
            <View style={styles.divider} />
            <MonthRow label="📅 EMI Total" value={`- ${fc(data.emiTotal)}`} />
            <MonthRow label="🛡️ Insurance" value={`- ${fc(data.insuranceMonthly)}`} />
            <MonthRow label="🛒 Living Expenses" value={`- ${fc(data.expenses)}`} />
            <MonthRow label="💰 Available" value={fc(data.available)}
              bold accent={data.available >= 0 ? '#10b981' : '#e11d48'} />
          </View>

          {/* Savings */}
          <View style={styles.monthSection}>
            <Text style={styles.monthSectionTitle}>Savings & Loan Budget</Text>
            <MonthRow label="🏦 Saved This Month" value={fc(data.savings)} accent="#10b981" bold />
            <MonthRow label="🪙 Emergency Fund (Total)" value={fc(data.emergencyFund)} />
            <MonthRow label="💳 Extra Loan Budget" value={fc(data.loanBudget)}
              accent={data.loanBudget > 0 ? '#38bdf8' : 'rgba(15,23,42,0.4)'} bold={data.loanBudget > 0} />
          </View>

          {/* Loan payments */}
          {data.loanPayments.length > 0 && (
            <View style={styles.monthSection}>
              <Text style={styles.monthSectionTitle}>Extra Payments Applied</Text>
              {data.loanPayments.map((lp, i) => (
                <View key={i} style={styles.loanPayRow}>
                  <View style={styles.loanPayDot} />
                  <Text style={styles.loanPayName} numberOfLines={1}>{lp.name}</Text>
                  <View style={[styles.loanTypePill,
                    { backgroundColor: lp.type === 'bullet' ? 'rgba(245,158,11,0.15)' : 'rgba(56,189,248,0.15)' }]}>
                    <Text style={[styles.loanTypePillText,
                      { color: lp.type === 'bullet' ? '#f59e0b' : '#38bdf8' }]}>
                      {lp.type === 'bullet' ? 'GOLD' : 'EMI'}
                    </Text>
                  </View>
                  <Text style={[styles.loanPayAmt, lp.closed && { color: '#10b981' }]}>
                    {fc(lp.payment)}{lp.closed ? ' ✓ CLOSED' : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Loan snapshot */}
          <View style={styles.monthSection}>
            <Text style={styles.monthSectionTitle}>Remaining Principal Snapshot</Text>
            {data.loanSnapshot.filter(l => !l.closed).map((ls, i) => (
              <View key={i} style={styles.snapshotRow}>
                <Text style={styles.snapshotName} numberOfLines={1}>{ls.name}</Text>
                <Text style={[styles.snapshotAmt,
                  { color: ls.loanType === 'bullet' ? '#f59e0b' : '#0f172a' }]}>
                  {fc(ls.remainingPrincipal)}
                </Text>
              </View>
            ))}
            {data.loanSnapshot.filter(l => !l.closed).length === 0 && (
              <Text style={styles.allPaidText}>🎉 All loans settled!</Text>
            )}
          </View>

          {/* Notes / Insights */}
          {data.notes.length > 0 && (
            <View style={styles.notesBox}>
              {data.notes.map((n, i) => (
                <Text key={i} style={styles.noteText}>{n}</Text>
              ))}
            </View>
          )}
        </View>
      )}
    </BlurView>
  );
}

function MonthRow({ label, value, bold, accent }) {
  return (
    <View style={styles.mRow}>
      <Text style={styles.mRowLabel}>{label}</Text>
      <Text style={[styles.mRowValue, bold && { fontWeight: '700' }, accent && { color: accent }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function FinancialPlan() {
  const router = useRouter();
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showSetup, setShowSetup]   = useState(false);
  const [settings, setSettings]     = useState(null);
  const [plan, setPlan]             = useState(null);
  const [loans, setLoans]           = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [insuranceMonthly, setInsMonthly] = useState(0);

  const loadAll = useCallback(async () => {
    const [storedLoans, storedIns, savedSettings] = await Promise.all([
      getLoans(),
      getInsurances(),
      AsyncStorage.getItem(PLAN_SETTINGS_KEY),
    ]);
    setLoans(storedLoans);
    setInsurances(storedIns);

    // Compute insurance monthly
    let annual = 0;
    storedIns.forEach((ins) => {
      const p = parseFloat(ins.premiumAmount) || 0;
      const mult =
        ins.frequency === 'monthly' ? 12 :
        ins.frequency === 'quarterly' ? 4 :
        ins.frequency === 'half-yearly' ? 2 : 1;
      annual += p * mult;
    });
    setInsMonthly(annual / 12);

    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(parsed);
      const p = generateFinancialPlan({
        loans: storedLoans,
        insurances: storedIns,
        salaryMonthly: parsed.salary,
        rentMonthly: parsed.rent,
        livingExpensesMonthly: parsed.expenses,
        minimumSavings: parsed.minSave,
        months: parsed.months ?? 12,
        incomeEvents: parsed.incomeEvents ?? [],
      });
      setPlan(p);
    } else {
      setShowSetup(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, []);
  useFocusEffect(React.useCallback(() => { loadAll(); }, []));

  const handleSubmitSettings = async (vals) => {
    setGenerating(true);
    try {
      await AsyncStorage.setItem(PLAN_SETTINGS_KEY, JSON.stringify(vals));
      setSettings(vals);
      const p = generateFinancialPlan({
        loans,
        insurances,
        salaryMonthly: vals.salary,
        rentMonthly: vals.rent,
        livingExpensesMonthly: vals.expenses,
        minimumSavings: vals.minSave,
        months: vals.months ?? 12,
        incomeEvents: vals.incomeEvents ?? [],
      });
      setPlan(p);
      setShowSetup(false);
    } finally {
      setGenerating(false);
    }
  };

  const handleReset = () => {
    Alert.alert('Reset Plan', 'Clear settings and start fresh?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(PLAN_SETTINGS_KEY);
          setPlan(null);
          setSettings(null);
          setShowSetup(true);
        },
      },
    ]);
  };

  // ── Summary stats across plan ─────────────────────────────────────────────
  const totalSavings    = plan ? plan.reduce((s, m) => s + m.savings, 0) : 0;
  const totalBudgetUsed = plan ? plan.reduce((s, m) => s + m.loanBudget, 0) : 0;
  const loansClosedCount = plan
    ? new Set(plan.flatMap(m => m.closedThisMonth)).size
    : 0;
  const finalFund    = plan ? plan[plan.length - 1]?.emergencyFund : 0;
  const planDuration = settings?.months ?? 12;

  return (
    <LinearGradient colors={['#f0fdf4', '#f8fafc', '#e2e8f0']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Financial Plan</Text>
            <Text style={styles.headerSubtitle}>12-Month Debt Reduction Roadmap</Text>
          </View>
          {plan && (
            <TouchableOpacity onPress={() => setShowSetup(s => !s)} style={styles.editBtn}>
              <Text style={styles.editBtnText}>{showSetup ? 'View Plan' : '⚙️ Edit'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.loadingText}>Loading your data…</Text>
          </View>
        ) : generating ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.loadingText}>Generating your plan…</Text>
          </View>
        ) : (
          <>
            {/* Setup or Edit form */}
            {showSetup && (
              <SetupForm
                initial={settings}
                insuranceMonthly={insuranceMonthly}
                onSubmit={handleSubmitSettings}
              />
            )}

            {/* Plan Summary Tiles */}
            {plan && !showSetup && (
              <>
                {/* Settings Summary */}
                <BlurView intensity={15} tint="light" style={styles.settingsSummary}>
                  <View style={styles.settingsSummaryInner}>
                    <View style={styles.settingTile}>
                      <Text style={styles.settingTileLabel}>Salary</Text>
                      <Text style={styles.settingTileValue}>{fc(settings?.salary)}</Text>
                    </View>
                    <View style={styles.settingTile}>
                      <Text style={styles.settingTileLabel}>Rent</Text>
                      <Text style={styles.settingTileValue}>{fc(settings?.rent)}</Text>
                    </View>
                    <View style={styles.settingTile}>
                      <Text style={styles.settingTileLabel}>Expenses</Text>
                      <Text style={styles.settingTileValue}>{fc(settings?.expenses)}</Text>
                    </View>
                    <View style={styles.settingTile}>
                      <Text style={styles.settingTileLabel}>Min Savings</Text>
                      <Text style={styles.settingTileValue}>{fc(settings?.minSave)}</Text>
                    </View>
                  </View>
                </BlurView>

                {/* Plan-level summary */}
                <View style={styles.summaryRow}>
                  <SummaryTile label={`${planDuration}-mo Savings`} value={fc(totalSavings)} color="#10b981" icon="🏦" />
                  <SummaryTile label="Emergency Fund" value={fc(finalFund)} color="#38bdf8" icon="🛡️" />
                </View>
                <View style={styles.summaryRow}>
                  <SummaryTile label="Extra to Loans" value={fc(totalBudgetUsed)} color="#a78bfa" icon="💳" />
                  <SummaryTile label="Loans Closed" value={`${loansClosedCount}`} color="#f59e0b" icon="🎉" suffix=" loans" />
                </View>

                {/* Month Cards */}
                <Text style={styles.sectionTitle}>Month-by-Month Breakdown  <Text style={{ fontSize: 14, fontWeight: '500', color: 'rgba(15,23,42,0.4)' }}>({planDuration} months)</Text></Text>
                {plan.map((m, i) => (
                  <MonthCard key={i} data={m} index={i} />
                ))}

                {/* Reset */}
                <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
                  <Text style={styles.resetBtnText}>🔄 Reset & Reconfigure</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function SummaryTile({ label, value, color, icon, suffix }) {
  return (
    <BlurView intensity={20} tint="light" style={styles.summaryTile}>
      <View style={styles.summaryTileInner}>
        <Text style={styles.summaryTileIcon}>{icon}</Text>
        <Text style={styles.summaryTileLabel}>{label}</Text>
        <Text style={[styles.summaryTileValue, { color }]}>{value}{suffix || ''}</Text>
      </View>
    </BlurView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 60 },

  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, gap: 12 },
  backButton: { fontSize: 16, fontWeight: '600', color: '#10b981', marginTop: 4 },
  headerTitle: { fontSize: 30, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: 'rgba(15,23,42,0.5)', marginTop: 2 },
  editBtn: { backgroundColor: 'rgba(167,139,250,0.15)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 14, borderWidth: 1, borderColor: '#a78bfa', marginTop: 4 },
  editBtnText: { fontSize: 13, fontWeight: '700', color: '#a78bfa' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16 },
  loadingText: { fontSize: 15, color: 'rgba(15,23,42,0.5)' },

  // Setup form
  setupCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', marginBottom: 20 },
  setupInner: { padding: 24 },
  setupIcon: { fontSize: 36, marginBottom: 8 },
  setupTitle: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  setupSubtitle: { fontSize: 13, color: 'rgba(15,23,42,0.5)', marginBottom: 20, lineHeight: 18 },

  // Duration picker
  durationGroup:        { marginBottom: 16 },
  durationLabel:        { fontSize: 13, fontWeight: '600', color: 'rgba(15,23,42,0.6)', marginBottom: 8 },
  durationRow:          { flexDirection: 'row', gap: 8, marginBottom: 10 },
  durationChip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: '#fff' },
  durationChipActive:   { backgroundColor: 'rgba(16,185,129,0.13)', borderColor: '#10b981' },
  durationChipText:     { fontSize: 13, fontWeight: '600', color: 'rgba(15,23,42,0.55)' },
  durationChipTextActive: { color: '#10b981' },
  durationInputWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 14, height: 46 },
  durationInput:        { width: 48, fontSize: 16, color: '#0f172a', fontWeight: '700' },
  durationSuffix:       { fontSize: 13, color: 'rgba(15,23,42,0.45)', marginLeft: 4 },
  autoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 14, padding: 14, marginBottom: 20 },
  autoLabel: { fontSize: 13, color: '#0f172a', fontWeight: '600' },
  autoValue: { fontSize: 15, fontWeight: '700', color: '#10b981' },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(15,23,42,0.6)', marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 14 },
  inputPrefix: { fontSize: 16, color: 'rgba(15,23,42,0.5)', marginRight: 4 },
  input: { flex: 1, height: 50, fontSize: 16, color: '#0f172a' },
  generateBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 8 },
  generateBtnGrad: { paddingVertical: 18, alignItems: 'center' },
  generateBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Settings summary
  settingsSummary: { borderRadius: 20, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)', marginBottom: 16 },
  settingsSummaryInner: { flexDirection: 'row', padding: 16, gap: 4 },
  settingTile: { flex: 1, alignItems: 'center' },
  settingTileLabel: { fontSize: 10, color: 'rgba(15,23,42,0.45)', textTransform: 'uppercase', letterSpacing: 0.3 },
  settingTileValue: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginTop: 2 },

  // Summary tiles
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryTile: { flex: 1, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  summaryTileInner: { padding: 18, alignItems: 'center' },
  summaryTileIcon: { fontSize: 22, marginBottom: 4 },
  summaryTileLabel: { fontSize: 11, color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryTileValue: { fontSize: 20, fontWeight: '700', marginTop: 4 },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 14, marginTop: 4 },

  // Month cards
  monthCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1.5, marginBottom: 14 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  monthIndexBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  monthIndexText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  monthLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  monthSavings: { fontSize: 18, fontWeight: '700', color: '#10b981' },
  monthSavingsLabel: { fontSize: 10, color: 'rgba(15,23,42,0.45)', textAlign: 'right' },
  chevron: { fontSize: 22, color: 'rgba(15,23,42,0.35)', marginLeft: 4, fontWeight: '300' },

  // Month body
  monthBody: { paddingHorizontal: 18, paddingBottom: 18, gap: 0 },
  monthSection: { backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 16, padding: 14, marginBottom: 10 },
  monthSectionTitle: { fontSize: 11, fontWeight: '700', color: 'rgba(15,23,42,0.4)',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  mRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mRowLabel: { fontSize: 13, color: 'rgba(15,23,42,0.6)' },
  mRowValue: { fontSize: 13, fontWeight: '500', color: '#0f172a' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 8 },

  // Loan pay rows
  loanPayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  loanPayDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#a78bfa', flexShrink: 0 },
  loanPayName: { flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '600' },
  loanTypePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  loanTypePillText: { fontSize: 9, fontWeight: '700' },
  loanPayAmt: { fontSize: 13, fontWeight: '700', color: '#a78bfa', flexShrink: 0 },

  // Loan snapshot
  snapshotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  snapshotName: { flex: 1, fontSize: 12, color: 'rgba(15,23,42,0.6)', marginRight: 8 },
  snapshotAmt: { fontSize: 13, fontWeight: '700' },
  allPaidText: { fontSize: 14, fontWeight: '700', color: '#10b981', textAlign: 'center', paddingVertical: 4 },

  // Notes
  notesBox: { backgroundColor: 'rgba(16,185,129,0.07)', borderRadius: 14, padding: 14, gap: 6 },
  noteText: { fontSize: 13, color: '#0f172a', lineHeight: 18 },

  // Reset
  resetBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 14 },
  resetBtnText: { fontSize: 14, color: 'rgba(15,23,42,0.4)', fontWeight: '600' },

  // Income events
  eventsGroup:       { marginBottom: 16 },
  eventsHeader:      { marginBottom: 10 },
  eventsTitle:       { fontSize: 13, fontWeight: '700', color: 'rgba(15,23,42,0.65)', marginBottom: 2 },
  eventsSub:         { fontSize: 11, color: 'rgba(15,23,42,0.4)', lineHeight: 15 },
  eventChip:         { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  eventChipTitle:    { fontSize: 12, fontWeight: '700', color: '#10b981', marginBottom: 2 },
  eventChipDetail:   { fontSize: 12, color: 'rgba(15,23,42,0.6)' },
  eventDeleteBtn:    { padding: 6 },
  eventDeleteBtnText:{ fontSize: 16, color: '#e11d48' },
  addEventBtn:       { borderStyle: 'dashed', borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.4)',
    borderRadius: 14, padding: 12, alignItems: 'center' },
  addEventBtnText:   { fontSize: 13, fontWeight: '700', color: '#10b981' },
  addEventForm:      { backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  addEventFormTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  addEventRow:       { flexDirection: 'row', gap: 8 },
  addEventInputWrap: {},
  addEventInputLabel:{ fontSize: 10, color: 'rgba(15,23,42,0.5)', marginBottom: 4, fontWeight: '600' },
  addEventInput:     { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 10, height: 42, fontSize: 14, color: '#0f172a' },
  addEventSaveBtn:   { flex: 1, backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#10b981' },
  addEventSaveBtnText: { fontSize: 13, fontWeight: '700', color: '#10b981' },
  addEventCancelBtn: { flex: 1, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: 10, alignItems: 'center' },
  addEventCancelBtnText: { fontSize: 13, fontWeight: '600', color: 'rgba(15,23,42,0.5)' },
});

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { getLoans, getPayments } from '../utils/storage';
import { calculateEMIBreakdown } from '../utils/emiCalculator';

const fc  = (v) => `₹${parseFloat(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const fd  = (d) => new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const fmo = (d) => new Date(d).toLocaleDateString('en-IN',{month:'long',year:'numeric'});

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

// ── Core simulation engine ───────────────────────────────────────────────────
function simulateDebtFree(loanStates, extraMonthlyBudget = 0) {
  // Deep copy
  const states = loanStates.map(l => ({ ...l }));
  const closures = [];
  let month = 0;
  const MAX_MONTHS = 600; // 50-year safety cap

  while (states.some(l => !l.closed) && month < MAX_MONTHS) {
    month++;
    const date = new Date(TODAY.getFullYear(), TODAY.getMonth() + month - 1, 1);

    // Step 1: Aging Logic
    states.forEach(l => {
      if (l.closed) return;
      
      if (l.loanType === 'emi') {
        const r = l.interest / 12 / 100;
        const interestPortion = l.remainingPrincipal * r;
        const principalPortion = Math.max(0, l.emiAmount - interestPortion);
        l.remainingPrincipal = Math.max(0, l.remainingPrincipal - principalPortion);
        l.interestPaid = (l.interestPaid || 0) + interestPortion;
        l.tenureRemaining -= 1;
        if (l.remainingPrincipal < 5 || l.tenureRemaining <= 0) {
          l.remainingPrincipal = 0;
          l.closed = true;
          closures.push({ id: l.id, name: l.name, loanType: l.loanType, month, date: new Date(date) });
        }
      } else if (l.loanType === 'bullet') {
        l.tenureRemaining -= 1;
        if (l.tenureRemaining <= 0) {
          // Mandatory payoff at maturity
          l.remainingPrincipal = 0;
          l.closed = true;
          closures.push({ 
            id: l.id, 
            name: l.name, 
            loanType: l.loanType, 
            month, 
            date: new Date(date),
            isMaturityClosure: true // Distinguish from manual prepayments
          });
        }
      }
    });

    // Step 2: Apply extra budget to highest-priority open loan
    let budget = extraMonthlyBudget;
    const open = states
      .filter(l => !l.closed)
      .sort((a, b) => {
        // Highest interest rate first
        if (b.interest !== a.interest) return b.interest - a.interest;
        return a.remainingPrincipal - b.remainingPrincipal;
      });

    for (const loan of open) {
      if (budget <= 0) break;
      const pay = Math.min(budget, loan.remainingPrincipal);
      loan.remainingPrincipal = Math.max(0, loan.remainingPrincipal - pay);
      budget -= pay;
      if (loan.remainingPrincipal < 1) {
        loan.remainingPrincipal = 0;
        if (!loan.closed) {
          loan.closed = true;
          if (!closures.find(c => c.id === loan.id)) {
            closures.push({ id: loan.id, name: loan.name, loanType: loan.loanType, month, date: new Date(date) });
          }
        }
      }
    }
  }

  const debtFreeDate = month < MAX_MONTHS
    ? new Date(TODAY.getFullYear(), TODAY.getMonth() + month - 1, 1)
    : null;

  return { closures, debtFreeMonth: month, debtFreeDate };
}

// ── Prep loan states from raw data ────────────────────────────────────────────
function buildLoanStates(loans, payments) {
  const parseSafe = (val) => parseFloat(String(val || '0').replace(/,/g, ''));
  return loans.filter(l => l.status !== 'closed').map(loan => {
    const principal  = parseSafe(loan.principal);
    const interest   = parseFloat(loan.interest)   || 0;
    const tenure     = parseInt(String(loan.tenure).replace(/,/g, '')) || 0;
    const emiAmount  = parseSafe(loan.emiAmount);
    const loanType   = loan.loanType || 'emi';
    const start      = new Date(loan.startDate);

    let monthsElapsed = (TODAY.getFullYear() - start.getFullYear()) * 12 +
      (TODAY.getMonth() - start.getMonth());
    if (TODAY.getDate() >= start.getDate()) monthsElapsed++;
    monthsElapsed = Math.max(0, monthsElapsed);

    const extraPayments = payments.filter(p => p.loanId === loan.id);
    const bd = calculateEMIBreakdown(
      principal, interest, tenure, monthsElapsed, emiAmount, loanType, extraPayments
    );

    // For bullet loans — fixed maturity date regardless of extra payments
    let bulletMaturity = null;
    if (loanType === 'bullet') {
      bulletMaturity = new Date(start.getFullYear(), start.getMonth() + tenure, start.getDate());
    }

    return {
      id: loan.id,
      name: loan.loanName,
      loanType,
      interest,
      emiAmount,
      remainingPrincipal: bd.remainingPrincipalAmount,
      totalInterestRemaining: bd.remainingInterestAmount,
      tenureRemaining: Math.max(0, tenure - monthsElapsed),
      closed: bd.remainingAmount <= 5,
      interestPaid: 0,
      bulletMaturity, // bullet loans have a fixed date
    };
  });
}

// ── Timeline Bar ──────────────────────────────────────────────────────────────
function TimelineItem({ name, loanType, date, month, isLast, accentColor, daysFromNow, isMaturityClosure }) {
  return (
    <View style={tl.row}>
      {/* Line + dot */}
      <View style={tl.lineCol}>
        <View style={[tl.dot, { backgroundColor: accentColor }]} />
        {!isLast && <View style={tl.line} />}
      </View>
      {/* Content */}
      <View style={[tl.content, isLast && { marginBottom: 0 }]}>
        <View style={tl.contentTop}>
          <Text style={tl.loanName} numberOfLines={1}>{name}</Text>
          <View style={[tl.typePill, { backgroundColor: loanType === 'bullet' ? 'rgba(245,158,11,0.15)' : 'rgba(56,189,248,0.15)' }]}>
            <Text style={[tl.typePillText, { color: loanType === 'bullet' ? '#f59e0b' : '#38bdf8' }]}>
              {loanType === 'bullet' ? 'GOLD' : 'EMI'}
            </Text>
          </View>
        </View>
        <Text style={[tl.date, { color: accentColor }]}>{fmo(date)} {isMaturityClosure && "⚠️"}</Text>
        <Text style={tl.sub}>
          {isMaturityClosure 
            ? `Fixed Maturity Payoff`
            : (daysFromNow > 0 ? `${Math.round(daysFromNow / 30)} months from now` : 'Already done')}
        </Text>
      </View>
    </View>
  );
}

const TIMELINE_COLORS = ['#10b981','#38bdf8','#a78bfa','#f59e0b','#e11d48','#fb923c'];

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function DebtFree() {
  const router = useRouter();
  const [loanStates, setLoanStates]     = useState([]);
  const [extraInput, setExtraInput]     = useState('');
  const hasSuggested = useRef(false);
  const [baseline, setBaseline]         = useState(null);
  const [accelerated, setAccelerated]   = useState(null);
  const [refreshing, setRefreshing]     = useState(false);
  const [totalEMI, setTotalEMI]         = useState(0);
  const [totalRemaining, setTotalRemaining] = useState(0);

  const loadData = useCallback(async () => {
    const loans    = await getLoans();
    const payments = await getPayments();
    const states   = buildLoanStates(loans, payments);

    setLoanStates(states);
    setTotalEMI(states.filter(l => l.loanType === 'emi').reduce((s, l) => s + l.emiAmount, 0));
    setTotalRemaining(states.reduce((s, l) => s + l.remainingPrincipal, 0));

    const base = simulateDebtFree(states.map(l => ({ ...l })), 0);
    setBaseline(base);

    // Smart suggestion for Gold loans
    if (!hasSuggested.current && states.some(l => l.loanType === 'bullet')) {
      const gold = states.find(l => l.loanType === 'bullet');
      // Suggest closing in roughly half the remaining time or at least 10k
      const suggested = Math.max(1000, Math.ceil(gold.remainingPrincipal / Math.max(1, gold.tenureRemaining / 2)));
      setExtraInput(String(suggested));
      setAccelerated(simulateDebtFree(states.map(l => ({ ...l })), suggested));
      hasSuggested.current = true;
    } else {
      const extra = parseFloat(extraInput) || 0;
      if (extra > 0) {
        setAccelerated(simulateDebtFree(states.map(l => ({ ...l })), extra));
      } else {
        setAccelerated(null);
      }
    }
  }, [extraInput]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const handleExtraChange = (val) => {
    setExtraInput(val.replace(/[^0-9]/g, ''));
  };

  const applyExtra = () => {
    const extra = parseFloat(extraInput) || 0;
    if (extra > 0 && loanStates.length > 0) {
      setAccelerated(simulateDebtFree(loanStates.map(l => ({ ...l })), extra));
    } else {
      setAccelerated(null);
    }
  };

  // Derived
  const noLoans    = loanStates.length === 0;
  const baseDate   = baseline?.debtFreeDate;
  const accDate    = accelerated?.debtFreeDate;
  const monthsSaved = accelerated && baseline
    ? Math.max(0, baseline.debtFreeMonth - accelerated.debtFreeMonth)
    : 0;
  const extraAmt   = parseFloat(extraInput) || 0;

  const daysToFree = baseDate
    ? Math.ceil((baseDate - TODAY) / 86400000)
    : null;

  // Merge + sort closures for timeline
  const timelineItems = (accelerated || baseline)?.closures
    ?.slice()
    .sort((a, b) => a.month - b.month) || [];

  return (
    <LinearGradient colors={['#f0f9ff','#f8fafc','#e2e8f0']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backBtn}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>🏁 Debt-Free Date</Text>
            <Text style={styles.headerSub}>Your path to zero debt</Text>
          </View>

          {noLoans ? (
            <BlurView intensity={15} tint="light" style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyText}>You're already debt-free!</Text>
              <Text style={styles.emptySub}>No active loans found</Text>
            </BlurView>
          ) : (
            <>
              {/* Hero: Debt-Free Date */}
              <BlurView intensity={20} tint="light" style={styles.heroCard}>
                <View style={styles.heroInner}>
                  <Text style={styles.heroLabel}>
                    {accelerated ? '🚀  With Extra Payments' : '📅  At Current Pace'}
                  </Text>
                  <Text style={styles.heroDate}>
                    {(accelerated ? accDate : baseDate)
                      ? fmo(accelerated ? accDate : baseDate)
                      : 'N/A'}
                  </Text>
                  <Text style={styles.heroDays}>
                    {daysToFree != null
                      ? `${Math.round((accelerated ? accelerated.debtFreeMonth : (baseline?.debtFreeMonth || 0)))} months · ${Math.round((accelerated ? accelerated.debtFreeMonth : (baseline?.debtFreeMonth || 0)) / 12 * 10) / 10} years`
                      : ''}
                  </Text>

                  {/* Comparison row */}
                  {accelerated && monthsSaved > 0 && (
                    <View style={styles.savedRow}>
                      <View style={styles.savedBadge}>
                        <Text style={styles.savedBadgeText}>
                          🎉 {monthsSaved} months earlier than current pace!
                        </Text>
                      </View>
                      <View style={styles.compRow}>
                        <View style={styles.compItem}>
                          <Text style={styles.compLabel}>Without extra</Text>
                          <Text style={styles.compDate}>{baseDate ? fmo(baseDate) : '—'}</Text>
                        </View>
                        <Text style={styles.compArrow}>→</Text>
                        <View style={styles.compItem}>
                          <Text style={styles.compLabel}>With ₹{fc(extraAmt)}/mo</Text>
                          <Text style={[styles.compDate, { color: '#10b981' }]}>
                            {accDate ? fmo(accDate) : '—'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              </BlurView>

              {/* Summary tiles */}
              <View style={styles.tilesRow}>
                <BlurView intensity={20} tint="light" style={styles.tile}>
                  <View style={styles.tileInner}>
                    <Text style={styles.tileIcon}>💸</Text>
                    <Text style={styles.tileLabel}>Total Remaining</Text>
                    <Text style={[styles.tileValue, { color: '#e11d48' }]}>{fc(totalRemaining)}</Text>
                  </View>
                </BlurView>
                <BlurView intensity={20} tint="light" style={styles.tile}>
                  <View style={styles.tileInner}>
                    <Text style={styles.tileIcon}>📅</Text>
                    <Text style={styles.tileLabel}>Monthly EMIs</Text>
                    <Text style={[styles.tileValue, { color: '#38bdf8' }]}>{fc(totalEMI)}/mo</Text>
                  </View>
                </BlurView>
              </View>

              {/* Extra payment simulator */}
              <BlurView intensity={20} tint="light" style={[styles.simCard, extraAmt > 0 && styles.simCardActive]}>
                <View style={styles.simInner}>
                  <Text style={styles.simTitle}>⚡ {extraAmt > 0 ? 'Shredding Mode Active!' : 'Accelerate! Pay Extra Each Month'}</Text>
                  <Text style={styles.simSub}>
                    {hasSuggested.current && extraAmt > 0 && !extraInput.includes('manual')
                      ? "💡 Suggested an amount to clear your Gold loan early. Adjust as you like!"
                      : "Enter an extra monthly amount to see how much sooner you'll be free"}
                  </Text>
                  <View style={styles.simInputRow}>
                    <View style={styles.simInputWrap}>
                      <Text style={styles.simPrefix}>₹</Text>
                      <TextInput
                        style={styles.simInput}
                        value={extraInput}
                        onChangeText={handleExtraChange}
                        placeholder="e.g. 10000"
                        placeholderTextColor="rgba(15,23,42,0.3)"
                        keyboardType="numeric"
                      />
                    </View>
                    <TouchableOpacity style={styles.simBtn} onPress={applyExtra} activeOpacity={0.8}>
                      <LinearGradient colors={['#10b981','#059669']} style={styles.simBtnGrad}>
                        <Text style={styles.simBtnText}>Update</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              </BlurView>

              {/* Payoff timeline */}
              {timelineItems.length > 0 && (
                <BlurView intensity={20} tint="light" style={styles.timelineCard}>
                  <View style={styles.timelineInner}>
                    <Text style={styles.timelineTitle}>Payoff Timeline</Text>
                    <Text style={styles.timelineSub}>
                      {accelerated ? 'With your extra payments applied' : 'At your current payment pace'}
                    </Text>
                    <View style={{ marginTop: 16 }}>
                      {timelineItems.map((item, i) => (
                        <TimelineItem
                          key={item.id}
                          name={item.name}
                          loanType={item.loanType}
                          date={item.date}
                          month={item.month}
                          isLast={i === timelineItems.length - 1}
                          accentColor={TIMELINE_COLORS[i % TIMELINE_COLORS.length]}
                          daysFromNow={Math.ceil((item.date - TODAY) / 86400000)}
                          isMaturityClosure={item.isMaturityClosure}
                        />
                      ))}
                    </View>
                  </View>
                </BlurView>
              )}

              {/* Per-loan remaining table */}
              <BlurView intensity={20} tint="light" style={styles.tableCard}>
                <View style={styles.tableInner}>
                  <Text style={styles.tableTitle}>Current Snapshot</Text>
                  {loanStates.map((l, i) => (
                    <View key={l.id} style={[styles.tableRow, i === loanStates.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tableLoanName} numberOfLines={1}>{l.name}</Text>
                        <View style={[styles.typeChip, { backgroundColor: l.loanType === 'bullet' ? 'rgba(245,158,11,0.12)' : 'rgba(56,189,248,0.12)' }]}>
                          <Text style={[styles.typeChipText, { color: l.loanType === 'bullet' ? '#f59e0b' : '#38bdf8' }]}>
                            {l.loanType === 'bullet' ? 'GOLD/BULLET' : `EMI ${fc(l.emiAmount)}/mo`}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.tableAmt}>{fc(l.remainingPrincipal)}</Text>
                        <Text style={styles.tableRate}>{l.interest}% p.a.</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </BlurView>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ── Timeline styles ───────────────────────────────────────────────────────────
const tl = StyleSheet.create({
  row:        { flexDirection: 'row', marginBottom: 0 },
  lineCol:    { width: 24, alignItems: 'center' },
  dot:        { width: 14, height: 14, borderRadius: 7, marginTop: 4, zIndex: 1 },
  line:       { flex: 1, width: 2, backgroundColor: 'rgba(0,0,0,0.08)', marginTop: 2, marginBottom: 0, minHeight: 36 },
  content:    { flex: 1, paddingLeft: 12, paddingBottom: 20 },
  contentTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  loanName:   { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1 },
  typePill:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typePillText:{ fontSize: 9, fontWeight: '700' },
  date:       { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  sub:        { fontSize: 12, color: 'rgba(15,23,42,0.4)' },
});

const styles = StyleSheet.create({
  container:     { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 60 },

  header:       { marginBottom: 24 },
  backBtn:      { fontSize: 16, fontWeight: '600', color: '#38bdf8', marginBottom: 12 },
  headerTitle:  { fontSize: 30, fontWeight: '700', color: '#0f172a' },
  headerSub:    { fontSize: 13, color: 'rgba(15,23,42,0.5)', marginTop: 2 },

  // Hero card
  heroCard:  { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', marginBottom: 16 },
  heroInner: { padding: 24, backgroundColor: 'rgba(16,185,129,0.04)' },
  heroLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  heroDate:  { fontSize: 36, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  heroDays:  { fontSize: 14, color: 'rgba(15,23,42,0.5)' },

  savedRow:       { marginTop: 16, gap: 12 },
  savedBadge:     { backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 14, padding: 12 },
  savedBadgeText: { fontSize: 14, fontWeight: '700', color: '#10b981', textAlign: 'center' },
  compRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compItem:       { flex: 1 },
  compLabel:      { fontSize: 11, color: 'rgba(15,23,42,0.45)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  compDate:       { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  compArrow:      { fontSize: 22, color: 'rgba(15,23,42,0.25)', paddingHorizontal: 8 },

  // Tiles
  tilesRow:  { flexDirection: 'row', gap: 12, marginBottom: 16 },
  tile:      { flex: 1, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  tileInner: { padding: 18, alignItems: 'center' },
  tileIcon:  { fontSize: 20, marginBottom: 4 },
  tileLabel: { fontSize: 11, color: 'rgba(15,23,42,0.45)', textTransform: 'uppercase', letterSpacing: 0.3 },
  tileValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },

  // Simulator
  simCard:  { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', marginBottom: 24, backgroundColor: 'rgba(255,255,255,0.4)' },
  simCardActive: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.05)' },
  simInner: { padding: 20 },
  simTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  simSub:   { fontSize: 13, color: 'rgba(15,23,42,0.5)', marginBottom: 16, lineHeight: 18 },
  simInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  simInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 12 },
  simPrefix: { fontSize: 16, color: 'rgba(15,23,42,0.4)', marginRight: 4 },
  simInput:  { flex: 1, height: 50, fontSize: 16, color: '#0f172a' },
  simBtn:    { borderRadius: 16, overflow: 'hidden' },
  simBtnGrad:{ paddingHorizontal: 18, paddingVertical: 14 },
  simBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
  interestSavedRow: { marginTop: 14, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 14, padding: 14 },
  interestSavedText:{ fontSize: 13, color: '#0f172a', lineHeight: 19 },

  // Timeline
  timelineCard:  { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 16 },
  timelineInner: { padding: 22 },
  timelineTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  timelineSub:   { fontSize: 12, color: 'rgba(15,23,42,0.45)', marginBottom: 4 },

  // Table
  tableCard:  { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 16 },
  tableInner: { padding: 20 },
  tableTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  tableRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', gap: 8 },
  tableLoanName: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  typeChip:      { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeChipText:  { fontSize: 10, fontWeight: '700' },
  tableAmt:  { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  tableRate: { fontSize: 12, color: 'rgba(15,23,42,0.45)', marginTop: 2 },

  // Empty
  emptyCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)',
    padding: 48, alignItems: 'center', marginTop: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  emptySub:  { fontSize: 14, color: 'rgba(15,23,42,0.45)', textAlign: 'center' },
});

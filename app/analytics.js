import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { getLoans, getPayments, getInsurances } from '../utils/storage';
import { calculateEMIBreakdown } from '../utils/emiCalculator';

const LOAN_FILTERS = [
  { id: 'all',    label: 'All Loans' },
  { id: 'emi',    label: '📅 EMI' },
  { id: 'bullet', label: '🥇 Gold/Bullet' },
];

const INS_TYPE_META = {
  life:     { label: 'Life',     emoji: '❤️',  color: '#e11d48' },
  health:   { label: 'Health',   emoji: '🏥',  color: '#10b981' },
  vehicle:  { label: 'Vehicle',  emoji: '🚗',  color: '#38bdf8' },
  property: { label: 'Property', emoji: '🏠',  color: '#f59e0b' },
  other:    { label: 'Other',    emoji: '📋',  color: '#a78bfa' },
};

const COLORS = ['#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#e11d48', '#fb923c'];

export default function Analytics() {
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loanFilter, setLoanFilter] = useState('all');

  const loadData = async () => {
    const l = await getLoans();
    const p = await getPayments();
    const i = await getInsurances();
    setLoans(l);
    setPayments(p);
    setInsurances(i);
  };

  useEffect(() => { loadData(); }, []);
  useFocusEffect(React.useCallback(() => { loadData(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const fc = (amount) =>
    `₹${parseFloat(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Per-loan breakdowns (all loans) ──────────────────────────────────────
  const allBreakdowns = loans.map(loan => {
    const principal   = parseFloat(loan.principal)  || 0;
    const interest    = parseFloat(loan.interest)   || 0;
    const tenure      = parseInt(loan.tenure)        || 0;
    const emiAmount   = parseFloat(loan.emiAmount)  || 0;
    const loanType    = loan.loanType || 'emi';
    const extraPayments = payments.filter(p => p.loanId === loan.id);

    let monthsElapsed = 0;
    if (loan.startDate) {
      const sd = new Date(loan.startDate);
      monthsElapsed = (today.getFullYear() - sd.getFullYear()) * 12 +
                      (today.getMonth() - sd.getMonth());
      if (today.getDate() >= sd.getDate()) monthsElapsed++;
      monthsElapsed = Math.max(0, monthsElapsed);
    }

    const bd = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount, loanType, extraPayments);
    const sd = new Date(loan.startDate);
    const maturityDate = new Date(sd.getFullYear(), sd.getMonth() + tenure, sd.getDate());
    return { loan, bd, monthsElapsed, loanType, principal, tenure, emiAmount, maturityDate };
  });

  // ── Filtered breakdowns ───────────────────────────────────────────────────
  const filtered = loanFilter === 'all'
    ? allBreakdowns
    : allBreakdowns.filter(x => x.loanType === loanFilter);

  // ── Aggregates (filtered) ─────────────────────────────────────────────────
  const totalPrincipal     = filtered.reduce((s, x) => s + x.principal, 0);
  const totalInterestAll   = filtered.reduce((s, x) => s + x.bd.totalInterest, 0);
  const totalOutstanding   = filtered.reduce((s, x) => s + x.bd.remainingAmount, 0);
  const totalPaidAll       = filtered.reduce((s, x) => s + x.bd.totalPaid, 0);
  const totalPrincipalPaid = filtered.reduce((s, x) => s + x.bd.principalPaid, 0);
  const totalInterestPaid  = filtered.reduce((s, x) => s + x.bd.interestPaid, 0);
  const overallProgress    = totalPrincipal > 0 ? totalPrincipalPaid / totalPrincipal : 0;

  const weightedRate = totalPrincipal > 0
    ? filtered.reduce((s, x) => s + x.principal * (parseFloat(x.loan.interest) || 0), 0) / totalPrincipal
    : 0;

  // ── 6-month forecast (always all loans + insurances for full picture) ─────
  const monthlyForecast = [];
  for (let m = 0; m < 6; m++) {
    const fd = new Date(today.getFullYear(), today.getMonth() + m, 1);
    let monthTotal = 0;

    allBreakdowns.forEach(({ loan, bd, loanType, tenure, emiAmount, maturityDate }) => {
      if (loanType === 'emi') {
        const sd = new Date(loan.startDate);
        const mfs = (fd.getFullYear() - sd.getFullYear()) * 12 + (fd.getMonth() - sd.getMonth()) + 1;
        if (mfs > 0 && mfs <= tenure) monthTotal += emiAmount;
      } else if (loanType === 'bullet') {
        if (
          maturityDate.getMonth() === fd.getMonth() &&
          maturityDate.getFullYear() === fd.getFullYear() &&
          bd.remainingAmount > 0
        ) monthTotal += bd.remainingAmount;
      }
    });

    insurances.forEach(ins => {
      const sd = new Date(ins.startDate);
      const premium = parseFloat(ins.premiumAmount) || 0;
      let step = 12;
      if (ins.frequency === 'monthly') step = 1;
      else if (ins.frequency === 'quarterly') step = 3;
      else if (ins.frequency === 'half-yearly') step = 6;

      let check = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
      while (check < today) check.setMonth(check.getMonth() + step);
      while (check.getFullYear() <= today.getFullYear() + 1) {
        if (check.getMonth() === fd.getMonth() && check.getFullYear() === fd.getFullYear()) {
          monthTotal += premium; break;
        }
        check.setMonth(check.getMonth() + step);
      }
    });

    monthlyForecast.push({
      label: fd.toLocaleDateString('en-IN', { month: 'short' }),
      amount: monthTotal,
    });
  }
  const maxForecast = Math.max(...monthlyForecast.map(x => x.amount), 1);

  // ── Loan-wise outstanding share ───────────────────────────────────────────
  const loanShares = filtered
    .filter(x => x.bd.remainingAmount > 0)
    .map(x => ({
      name: x.loan.loanName,
      remaining: x.bd.remainingAmount,
      loanType: x.loanType,
      share: totalOutstanding > 0 ? x.bd.remainingAmount / totalOutstanding : 0,
    }))
    .sort((a, b) => b.remaining - a.remaining);

  // ── Insurance type breakdown ──────────────────────────────────────────────
  const insTypeMap = {};
  insurances.forEach(ins => {
    const t = ins.insuranceType || 'other';
    const annual = ins.frequency === 'yearly'      ? 1 :
                   ins.frequency === 'half-yearly'  ? 2 :
                   ins.frequency === 'quarterly'    ? 4 : 12;
    const annualCost = (parseFloat(ins.premiumAmount) || 0) * annual;
    if (!insTypeMap[t]) insTypeMap[t] = { count: 0, annual: 0 };
    insTypeMap[t].count++;
    insTypeMap[t].annual += annualCost;
  });
  const totalAnnualIns = Object.values(insTypeMap).reduce((s, v) => s + v.annual, 0);
  const insTypeBreakdown = Object.entries(insTypeMap)
    .map(([type, val]) => ({ type, ...val, share: totalAnnualIns > 0 ? val.annual / totalAnnualIns : 0 }))
    .sort((a, b) => b.annual - a.annual);

  // ── Smart Insights ────────────────────────────────────────────────────────
  const insights = [];

  if (overallProgress > 0) {
    insights.push({ icon: '🎯', color: '#10b981',
      text: `You've cleared ${Math.round(overallProgress * 100)}% of${loanFilter !== 'all' ? ` ${loanFilter === 'bullet' ? 'Gold/Bullet' : 'EMI'}` : ''} principal` });
  }

  allBreakdowns.forEach(({ loan, loanType, maturityDate, bd }) => {
    if (loanType === 'bullet' && bd.remainingAmount > 0) {
      const days = Math.ceil((maturityDate - today) / 86400000);
      if (days <= 90 && days >= 0)
        insights.push({ icon: '⚠️', color: '#e11d48',
          text: `"${loan.loanName}" matures in ${days} day${days !== 1 ? 's' : ''} — ${fc(bd.remainingAmount)} due` });
    }
  });

  let latestDate = null;
  allBreakdowns.forEach(({ loan, loanType, tenure, bd }) => {
    if (loanType === 'emi' && bd.remainingAmount > 0) {
      const sd = new Date(loan.startDate);
      const end = new Date(sd.getFullYear(), sd.getMonth() + tenure, sd.getDate());
      if (!latestDate || end > latestDate) latestDate = end;
    }
  });
  if (latestDate)
    insights.push({ icon: '🏁', color: '#38bdf8',
      text: `Last EMI loan ends ${latestDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}` });

  if (totalInterestAll > 0 && totalPrincipal > 0)
    insights.push({ icon: '💸', color: '#f59e0b',
      text: `You're paying ${((totalInterestAll / totalPrincipal) * 100).toFixed(1)}% extra as interest on your borrowing` });

  if (monthlyForecast[0]?.amount > 0)
    insights.push({ icon: '📆', color: '#a78bfa',
      text: `This month's total obligation is ${fc(monthlyForecast[0].amount)} (loans + insurances)` });

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSubtitle}>Your financial snapshot</Text>
        </View>

        {/* ── Loan Type Filter ── */}
        <BlurView intensity={20} tint="light" style={styles.filterCard}>
          <View style={styles.filterInner}>
            <Text style={styles.filterLabel}>Loan View</Text>
            <View style={styles.filterRow}>
              {LOAN_FILTERS.map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.filterBtn, loanFilter === f.id && styles.filterBtnActive]}
                  onPress={() => setLoanFilter(f.id)}
                >
                  <Text style={[styles.filterBtnText, loanFilter === f.id && styles.filterBtnTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </BlurView>

        {/* ── Summary Row ── */}
        <View style={styles.summaryRow}>
          <BlurView intensity={20} tint="light" style={styles.summaryCard}>
            <View style={styles.summaryCardInner}>
              <Text style={styles.summaryLabel}>Total Borrowed</Text>
              <Text style={styles.summaryValue}>{fc(totalPrincipal)}</Text>
            </View>
          </BlurView>
          <BlurView intensity={20} tint="light" style={styles.summaryCard}>
            <View style={styles.summaryCardInner}>
              <Text style={styles.summaryLabel}>Outstanding</Text>
              <Text style={[styles.summaryValue, { color: '#e11d48' }]}>{fc(totalOutstanding)}</Text>
            </View>
          </BlurView>
        </View>
        <View style={styles.summaryRow}>
          <BlurView intensity={20} tint="light" style={styles.summaryCard}>
            <View style={styles.summaryCardInner}>
              <Text style={styles.summaryLabel}>Total Paid</Text>
              <Text style={[styles.summaryValue, { color: '#10b981' }]}>{fc(totalPaidAll)}</Text>
            </View>
          </BlurView>
          <BlurView intensity={20} tint="light" style={styles.summaryCard}>
            <View style={styles.summaryCardInner}>
              <Text style={styles.summaryLabel}>Avg. Rate</Text>
              <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>{weightedRate.toFixed(1)}% p.a.</Text>
            </View>
          </BlurView>
        </View>

        {filtered.length === 0 ? (
          <BlurView intensity={15} tint="light" style={styles.emptyCard}>
            <Text style={styles.emptyText}>No {loanFilter === 'bullet' ? 'Gold/Bullet' : loanFilter === 'emi' ? 'EMI' : ''} loans found</Text>
          </BlurView>
        ) : (
          <>
            {/* ── Overall Progress ── */}
            <BlurView intensity={20} tint="light" style={styles.card}>
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>Overall Debt Cleared</Text>
                <Text style={styles.cardSubtitle}>Principal paid across filtered loans</Text>
                <View style={styles.progressBarWrap}>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${Math.round(overallProgress * 100)}%` }]} />
                  </View>
                  <Text style={styles.progressLabel}>{Math.round(overallProgress * 100)}%</Text>
                </View>
                <View style={styles.progressLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                    <Text style={styles.legendText}>Paid  {fc(totalPrincipalPaid)}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: '#e2e8f0' }]} />
                    <Text style={styles.legendText}>Remaining  {fc(totalPrincipal - totalPrincipalPaid)}</Text>
                  </View>
                </View>
              </View>
            </BlurView>

            {/* ── Payment Composition ── */}
            <BlurView intensity={20} tint="light" style={styles.card}>
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>What You've Paid</Text>
                <Text style={styles.cardSubtitle}>Principal vs Interest</Text>
                {totalPaidAll > 0 ? (
                  <>
                    <View style={styles.stackedBar}>
                      {totalPrincipalPaid > 0 && (
                        <View style={[styles.stackSeg, { flex: totalPrincipalPaid, backgroundColor: '#10b981', borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }]} />
                      )}
                      {totalInterestPaid > 0 && (
                        <View style={[styles.stackSeg, { flex: totalInterestPaid, backgroundColor: '#f59e0b', borderTopRightRadius: 6, borderBottomRightRadius: 6 }]} />
                      )}
                    </View>
                    <View style={styles.compositionGrid}>
                      <View style={styles.compositionItem}>
                        <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                        <Text style={styles.compositionLabel}>Principal</Text>
                        <Text style={styles.compositionValue}>{fc(totalPrincipalPaid)}</Text>
                      </View>
                      <View style={styles.compositionItem}>
                        <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
                        <Text style={styles.compositionLabel}>Interest</Text>
                        <Text style={styles.compositionValue}>{fc(totalInterestPaid)}</Text>
                      </View>
                      <View style={styles.compositionItem}>
                        <View style={[styles.dot, { backgroundColor: '#e2e8f0' }]} />
                        <Text style={styles.compositionLabel}>Int. Pending</Text>
                        <Text style={styles.compositionValue}>{fc(totalInterestAll - totalInterestPaid)}</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <Text style={styles.emptyText}>No payments recorded yet.</Text>
                )}
              </View>
            </BlurView>

            {/* ── Loan-wise Outstanding ── */}
            {loanShares.length > 0 && (
              <BlurView intensity={20} tint="light" style={styles.card}>
                <View style={styles.cardInner}>
                  <Text style={styles.cardTitle}>Loan-wise Outstanding</Text>
                  <Text style={styles.cardSubtitle}>Share of remaining debt</Text>
                  {loanShares.map((ls, i) => (
                    <View key={i} style={styles.shareRow}>
                      <View style={styles.shareMeta}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[styles.dot, { backgroundColor: COLORS[i % COLORS.length] }]} />
                          <Text style={styles.shareName} numberOfLines={1}>{ls.name}</Text>
                          {ls.loanType === 'bullet' && (
                            <View style={styles.bulletBadge}><Text style={styles.bulletBadgeText}>GOLD</Text></View>
                          )}
                        </View>
                        <Text style={styles.shareAmount}>{fc(ls.remaining)}</Text>
                      </View>
                      <View style={styles.shareBarBg}>
                        <View style={[styles.shareBarFill, { width: `${ls.share * 100}%`, backgroundColor: COLORS[i % COLORS.length] }]} />
                      </View>
                      <Text style={styles.sharePct}>{Math.round(ls.share * 100)}%</Text>
                    </View>
                  ))}
                </View>
              </BlurView>
            )}

            {/* ── Interest Cost ── */}
            <BlurView intensity={20} tint="light" style={styles.card}>
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>Total Interest Cost</Text>
                <Text style={styles.cardSubtitle}>On filtered loans</Text>
                <Text style={styles.bigNumber}>{fc(totalInterestAll)}</Text>
                <View style={styles.intDetailRow}>
                  <Text style={styles.intDetailLabel}>Already Paid</Text>
                  <Text style={[styles.intDetailValue, { color: '#10b981' }]}>{fc(totalInterestPaid)}</Text>
                </View>
                <View style={styles.intDetailRow}>
                  <Text style={styles.intDetailLabel}>Still Pending</Text>
                  <Text style={[styles.intDetailValue, { color: '#f59e0b' }]}>{fc(totalInterestAll - totalInterestPaid)}</Text>
                </View>
              </View>
            </BlurView>
          </>
        )}

        {/* ── 6-Month Cash Outflow (always shown, all loans) ── */}
        <BlurView intensity={20} tint="light" style={styles.card}>
          <View style={styles.cardInner}>
            <Text style={styles.cardTitle}>6-Month Outflow</Text>
            <Text style={styles.cardSubtitle}>All EMIs + maturities + insurance (full picture)</Text>
            <View style={styles.barChart}>
              {monthlyForecast.map((m, i) => {
                const barH = (m.amount / maxForecast) * 110;
                const isCurrent = i === 0;
                return (
                  <View key={i} style={styles.barCol}>
                    <Text style={styles.barAmt}>{m.amount > 0 ? `₹${Math.round(m.amount / 1000)}k` : '-'}</Text>
                    <View style={styles.barWrap}>
                      <View style={[styles.bar, {
                        height: Math.max(barH, m.amount > 0 ? 6 : 0),
                        backgroundColor: isCurrent ? '#10b981' : '#38bdf8',
                        opacity: isCurrent ? 1 : 0.75,
                      }]} />
                    </View>
                    <Text style={[styles.barLbl, isCurrent && { color: '#10b981', fontWeight: '700' }]}>{m.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </BlurView>

        {/* ── Insurance Type Breakdown ── */}
        {insTypeBreakdown.length > 0 && (
          <BlurView intensity={20} tint="light" style={styles.card}>
            <View style={styles.cardInner}>
              <Text style={styles.cardTitle}>Insurance by Type</Text>
              <Text style={styles.cardSubtitle}>Annual premium across categories</Text>
              {insTypeBreakdown.map((item, i) => {
                const meta = INS_TYPE_META[item.type] || INS_TYPE_META.other;
                return (
                  <View key={i} style={styles.shareRow}>
                    <View style={styles.shareMeta}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 16 }}>{meta.emoji}</Text>
                        <Text style={styles.shareName}>{meta.label}</Text>
                        <View style={[styles.bulletBadge, { backgroundColor: meta.color + '22' }]}>
                          <Text style={[styles.bulletBadgeText, { color: meta.color }]}>{item.count} polic{item.count === 1 ? 'y' : 'ies'}</Text>
                        </View>
                      </View>
                      <Text style={styles.shareAmount}>{fc(item.annual)}/yr</Text>
                    </View>
                    <View style={styles.shareBarBg}>
                      <View style={[styles.shareBarFill, { width: `${item.share * 100}%`, backgroundColor: meta.color }]} />
                    </View>
                    <Text style={styles.sharePct}>{Math.round(item.share * 100)}%</Text>
                  </View>
                );
              })}
              <View style={[styles.intDetailRow, { marginTop: 8 }]}>
                <Text style={styles.intDetailLabel}>Total Annual Premium</Text>
                <Text style={[styles.intDetailValue, { color: '#2563eb' }]}>{fc(totalAnnualIns)}</Text>
              </View>
            </View>
          </BlurView>
        )}

        {/* ── Smart Insights ── */}
        {insights.length > 0 && (
          <BlurView intensity={20} tint="light" style={[styles.card, { marginBottom: 40 }]}>
            <View style={styles.cardInner}>
              <Text style={styles.cardTitle}>Smart Insights</Text>
              <Text style={styles.cardSubtitle}>Key things to know</Text>
              <View style={{ gap: 12, marginTop: 4 }}>
                {insights.map((ins, i) => (
                  <View key={i} style={[styles.insightRow, { borderLeftColor: ins.color }]}>
                    <Text style={styles.insightIcon}>{ins.icon}</Text>
                    <Text style={styles.insightText}>{ins.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </BlurView>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },

  header: { marginBottom: 24 },
  backButton: { fontSize: 16, fontWeight: '600', color: '#2563eb', marginBottom: 12 },
  headerTitle: { fontSize: 34, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 14, color: 'rgba(15,23,42,0.6)', marginTop: 4 },

  // Filter
  filterCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 16 },
  filterInner: { padding: 16 },
  filterLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', backgroundColor: '#ffffff' },
  filterBtnActive: { backgroundColor: 'rgba(167,139,250,0.15)', borderColor: '#a78bfa' },
  filterBtnText: { fontSize: 12, fontWeight: '600', color: 'rgba(15,23,42,0.6)' },
  filterBtnTextActive: { color: '#a78bfa' },

  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  summaryCardInner: { padding: 16 },
  summaryLabel: { fontSize: 11, color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: '700', color: '#0f172a' },

  card: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 16 },
  cardInner: { padding: 20 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: 'rgba(15,23,42,0.5)', marginBottom: 16 },

  emptyCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 32, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14, color: 'rgba(15,23,42,0.4)', textAlign: 'center' },

  // Progress
  progressBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  progressBg: { flex: 1, height: 14, backgroundColor: '#e2e8f0', borderRadius: 7, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10b981', borderRadius: 7 },
  progressLabel: { fontSize: 16, fontWeight: '700', color: '#10b981', width: 44, textAlign: 'right' },
  progressLegend: { gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, color: 'rgba(15,23,42,0.7)' },

  // Stacked
  stackedBar: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 16, backgroundColor: '#e2e8f0' },
  stackSeg: { minWidth: 4 },
  compositionGrid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 12 },
  compositionItem: { flex: 1, alignItems: 'center', gap: 4 },
  compositionLabel: { fontSize: 11, color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase', letterSpacing: 0.3 },
  compositionValue: { fontSize: 14, fontWeight: '700', color: '#0f172a' },

  // Loan shares
  shareRow: { marginBottom: 14 },
  shareMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  shareName: { fontSize: 14, fontWeight: '600', color: '#0f172a', flex: 1 },
  shareAmount: { fontSize: 13, fontWeight: '600', color: 'rgba(15,23,42,0.7)' },
  shareBarBg: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 2 },
  shareBarFill: { height: '100%', borderRadius: 4 },
  sharePct: { fontSize: 11, color: 'rgba(15,23,42,0.4)', textAlign: 'right' },
  bulletBadge: { backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bulletBadgeText: { fontSize: 9, fontWeight: '700', color: '#f59e0b' },

  // Interest
  bigNumber: { fontSize: 36, fontWeight: '700', color: '#e11d48', marginBottom: 16 },
  intDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  intDetailLabel: { fontSize: 14, color: 'rgba(15,23,42,0.6)' },
  intDetailValue: { fontSize: 14, fontWeight: '700' },

  // Bar chart
  barChart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barAmt: { fontSize: 9, color: 'rgba(15,23,42,0.5)', textAlign: 'center' },
  barWrap: { width: '100%', alignItems: 'center', height: 110, justifyContent: 'flex-end' },
  bar: { width: '60%', borderRadius: 4 },
  barLbl: { fontSize: 11, color: 'rgba(15,23,42,0.6)', fontWeight: '500' },

  // Insights
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 4 },
  insightIcon: { fontSize: 18 },
  insightText: { flex: 1, fontSize: 13, color: '#0f172a', lineHeight: 19 },
});

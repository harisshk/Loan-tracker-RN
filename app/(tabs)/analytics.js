import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLoans, getPayments } from '../../utils/storage';
import { calculateEMIBreakdown } from '../../utils/emiCalculator';


const fc = (amount) =>
  `₹${parseFloat(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const fd = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const daysFromNow = (date) => {
  if (!date) return null;
  const diff = Math.ceil((new Date(date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return diff;
};

export default function EMIPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [l, p] = await Promise.all([getLoans(), getPayments()]);
    setLoans(l);
    setPayments(p);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // ── Per-loan breakdowns ──────────────────────────────────────────
  const allBreakdowns = useMemo(() => {
    return loans
      .filter((l) => l.status !== 'closed')
      .map((loan) => {
        const principal = parseFloat(String(loan.principal).replace(/,/g, '')) || 0;
        const interest = parseFloat(loan.interest) || 0;
        const tenure = parseInt(String(loan.tenure).replace(/,/g, '')) || 0;
        const emiAmount = parseFloat(String(loan.emiAmount).replace(/,/g, '')) || 0;
        const loanType = loan.loanType || 'emi';
        const extraPayments = payments.filter((p) => p.loanId === loan.id);

        let monthsElapsed = 0;
        if (loan.startDate) {
          const sd = new Date(loan.startDate);
          monthsElapsed =
            (today.getFullYear() - sd.getFullYear()) * 12 +
            (today.getMonth() - sd.getMonth());
          if (today.getDate() >= sd.getDate()) monthsElapsed++;
          monthsElapsed = Math.max(0, monthsElapsed);
        }

        const bd = calculateEMIBreakdown(
          principal, interest, tenure, monthsElapsed, emiAmount, loanType, extraPayments
        );

        // Next due date: same day-of-month as start date, upcoming month
        let nextDueDate = null;
        if (loan.startDate && loanType === 'emi') {
          const sd = new Date(loan.startDate);
          const dueDay = sd.getDate();
          const candidate = new Date(today.getFullYear(), today.getMonth(), dueDay);
          nextDueDate = candidate < today
            ? new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
            : candidate;
        } else if (loanType === 'bullet' && loan.startDate) {
          const sd = new Date(loan.startDate);
          nextDueDate = new Date(sd.getFullYear(), sd.getMonth() + tenure, sd.getDate());
        }

        return { loan, bd, loanType, principal, tenure, emiAmount, nextDueDate };
      });
  }, [loans, payments, today]);

  // ── Upcoming EMIs list (sorted by next due) ──────────────────────
  const upcomingEMIs = useMemo(() => {
    return allBreakdowns
      .filter((x) => x.bd.remainingAmount > 0 && x.nextDueDate)
      .map((x) => ({
        ...x,
        days: daysFromNow(x.nextDueDate),
      }))
      .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  }, [allBreakdowns]);

  // ── This Month stats ─────────────────────────────────────────────
  const thisMonthStats = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const todayMidnight = new Date(y, m, now.getDate());

    // EMI paid = schedule-based: sum EMI amounts for loans whose due date this month has passed
    // (same logic as calculateLoanStats in storage.js)
    let emiPaid = 0;
    let dueAmount = 0;

    loans.filter((l) => l.status !== 'closed').forEach((loan) => {
      if ((loan.loanType || 'emi') !== 'emi') return;
      const emiAmount = parseFloat(String(loan.emiAmount || '0').replace(/,/g, '')) || 0;
      const tenure = parseInt(String(loan.tenure || '0').replace(/,/g, '')) || 0;
      if (!loan.startDate || emiAmount === 0) return;

      const sd = new Date(loan.startDate);
      const emiDueThisMonth = new Date(y, m, sd.getDate());
      const monthsFromStart = (y - sd.getFullYear()) * 12 + (m - sd.getMonth());

      // Due this month
      dueAmount += emiAmount;

      // Auto-paid: the scheduled EMI for this month whose due date has already passed
      if (emiDueThisMonth <= todayMidnight && monthsFromStart >= 1 && monthsFromStart <= tenure) {
        emiPaid += emiAmount;
      }
    });

    // Extra payments manually logged this month
    let extraPaid = 0;
    payments.forEach((p) => {
      const d = new Date(p.paidAt || p.date);
      if (isNaN(d) || d.getMonth() !== m || d.getFullYear() !== y) return;
      extraPaid += parseFloat(p.amount || 0);
    });

    const totalPaid = emiPaid + extraPaid;
    const pending = Math.max(0, dueAmount - emiPaid);
    const progress = dueAmount > 0 ? Math.min(1, emiPaid / dueAmount) : 0;
    return { emiPaid, extraPaid, totalPaid, dueAmount, pending, progress };
  }, [loans, payments]);

  // ── Payment History (recent 15) ───────────────────────────────────
  const recentPayments = useMemo(() => {
    const loanMap = {};
    loans.forEach((l) => { loanMap[l.id] = l.loanName; });
    return [...payments]
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
      .slice(0, 15)
      .map((p) => ({
        ...p,
        loanName: loanMap[p.loanId] || 'Unknown Loan',
        displayDate: fd(p.date || p.createdAt),
        isExtra: p.type === 'extra',
      }));
  }, [payments, loans]);

  const urgencyColor = (days) => {
    if (days === null) return '#64748b';
    if (days <= 3) return '#e11d48';
    if (days <= 7) return '#f59e0b';
    return '#10b981';
  };

  const urgencyLabel = (days) => {
    if (days === null) return '';
    if (days === 0) return 'Due Today';
    if (days < 0) return `Overdue ${Math.abs(days)}d`;
    return `${days}d left`;
  };

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16, paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>EMI Tracker</Text>
            <Text style={styles.headerSubtitle}>Upcoming payments & history</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtnWrap}
            onPress={() => router.push('/add-loan')}
            activeOpacity={0.8}
          >
            <LinearGradient colors={['#10b981', '#059669']} style={styles.addBtnInside}>
              <Ionicons name="add" size={26} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── This Month Section ────────────────────────────── */}
        <Text style={styles.sectionTitle}>This Month</Text>
        <BlurView intensity={30} tint="light" style={styles.card}>
          <View style={styles.trackTop}>
            <View style={styles.trackCol}>
              <View style={[styles.trackDot, { backgroundColor: '#10b981' }]} />
              <Text style={styles.trackLabel}>EMI Paid</Text>
              <Text style={styles.trackValue}>{fc(thisMonthStats.emiPaid)}</Text>
            </View>
            <View style={styles.trackCol}>
              <View style={[styles.trackDot, { backgroundColor: '#8b5cf6' }]} />
              <Text style={styles.trackLabel}>Extra Paid</Text>
              <Text style={styles.trackValue}>{fc(thisMonthStats.extraPaid)}</Text>
            </View>
            <View style={styles.trackCol}>
              <View style={[styles.trackDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={styles.trackLabel}>Pending</Text>
              <Text style={styles.trackValue}>{fc(thisMonthStats.pending)}</Text>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, thisMonthStats.progress * 100)}%`,
                  backgroundColor: '#10b981',
                },
              ]}
            />
          </View>

          <View style={styles.trackFooter}>
            <Text style={styles.footerLabel}>
              Cleared:{' '}
              <Text style={{ color: '#10b981', fontWeight: 'bold' }}>
                {fc(thisMonthStats.totalPaid)}
              </Text>
            </Text>
            <Text style={styles.footerLabel}>
              Target:{' '}
              <Text style={{ color: '#0f172a', fontWeight: 'bold' }}>
                {fc(thisMonthStats.dueAmount)}
              </Text>
            </Text>
          </View>
        </BlurView>

        {/* ── Upcoming EMIs Section ────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Upcoming EMIs</Text>

        {upcomingEMIs.length === 0 ? (
          <BlurView intensity={30} tint="light" style={[styles.card, styles.emptyCard]}>
            <Ionicons name="checkmark-circle-outline" size={36} color="#10b981" />
            <Text style={styles.emptyText}>All caught up! No active EMIs.</Text>
          </BlurView>
        ) : (
          upcomingEMIs.map((item) => {
            const color = urgencyColor(item.days);
            return (
              <TouchableOpacity
                key={item.loan.id}
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: '/loan-detail', params: { id: item.loan.id } })}
              >
                <BlurView intensity={30} tint="light" style={styles.emiCard}>
                  {/* Left accent bar */}
                  <View style={[styles.emiAccent, { backgroundColor: color }]} />

                  <View style={styles.emiBody}>
                    <View style={styles.emiTopRow}>
                      <Text style={styles.emiLoanName} numberOfLines={1}>
                        {item.loan.loanName}
                      </Text>
                      <View style={[styles.urgencyBadge, { backgroundColor: color + '20', borderColor: color }]}>
                        <Text style={[styles.urgencyText, { color }]}>
                          {urgencyLabel(item.days)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.emiMetaRow}>
                      <View style={styles.emiMetaCol}>
                        <Text style={styles.emiMetaLabel}>EMI Amount</Text>
                        <Text style={styles.emiMetaValue}>{fc(item.emiAmount)}</Text>
                      </View>
                      <View style={styles.emiMetaCol}>
                        <Text style={styles.emiMetaLabel}>Due Date</Text>
                        <Text style={styles.emiMetaValue}>{fd(item.nextDueDate)}</Text>
                      </View>
                      <View style={styles.emiMetaCol}>
                        <Text style={styles.emiMetaLabel}>Outstanding</Text>
                        <Text style={[styles.emiMetaValue, { color: '#e11d48' }]}>
                          {fc(item.bd.remainingPrincipalAmount)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={16} color="#cbd5e1" style={{ alignSelf: 'center' }} />
                </BlurView>
              </TouchableOpacity>
            );
          })
        )}

        {/* ── Payment History Section ───────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Payment History</Text>
          <TouchableOpacity onPress={() => router.push('/history')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {recentPayments.length === 0 ? (
          <BlurView intensity={30} tint="light" style={[styles.card, styles.emptyCard]}>
            <Ionicons name="receipt-outline" size={36} color="#94a3b8" />
            <Text style={styles.emptyText}>No payment records yet.</Text>
          </BlurView>
        ) : (
          <BlurView intensity={30} tint="light" style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
            {recentPayments.map((p, i) => (
              <View
                key={p.id || i}
                style={[
                  styles.historyRow,
                  i !== recentPayments.length - 1 && styles.historyRowBorder,
                ]}
              >
                <View style={[styles.historyIconWrap, { backgroundColor: p.isExtra ? 'rgba(139,92,246,0.12)' : 'rgba(16,185,129,0.12)' }]}>
                  <Ionicons
                    name={p.isExtra ? 'flash-outline' : 'checkmark-circle-outline'}
                    size={18}
                    color={p.isExtra ? '#8b5cf6' : '#10b981'}
                  />
                </View>
                <View style={styles.historyMeta}>
                  <Text style={styles.historyLoanName} numberOfLines={1}>{p.loanName}</Text>
                  <Text style={styles.historyDate}>{p.displayDate} · {p.isExtra ? 'Extra' : 'EMI'}</Text>
                </View>
                <Text style={[styles.historyAmount, { color: p.isExtra ? '#8b5cf6' : '#10b981' }]}>
                  {fc(p.amount)}
                </Text>
              </View>
            ))}
          </BlurView>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  headerTitle: { fontSize: 32, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, color: '#64748b', fontWeight: '500', marginTop: 2 },
  addBtnWrap: {
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  addBtnInside: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  seeAllText: { fontSize: 13, fontWeight: '600', color: '#10b981' },
  card: {
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 32,
  },
  emptyText: { fontSize: 14, color: '#94a3b8', fontWeight: '500' },
  // This Month
  trackTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  trackCol: { alignItems: 'flex-start' },
  trackDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  trackLabel: { fontSize: 11, color: '#64748b', marginBottom: 2, fontWeight: '500' },
  trackValue: { fontSize: 16, color: '#0f172a', fontWeight: '700' },
  progressContainer: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: { height: '100%', borderRadius: 4 },
  trackFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
    paddingTop: 12,
  },
  footerLabel: { fontSize: 12, color: '#64748b' },
  // EMI cards
  emiCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    overflow: 'hidden',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingRight: 14,
  },
  emiAccent: { width: 4, borderRadius: 2, marginRight: 14 },
  emiBody: { flex: 1, paddingVertical: 14 },
  emiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  emiLoanName: { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1, marginRight: 8 },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  urgencyText: { fontSize: 11, fontWeight: '700' },
  emiMetaRow: { flexDirection: 'row', gap: 16 },
  emiMetaCol: {},
  emiMetaLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '500', marginBottom: 2, textTransform: 'uppercase' },
  emiMetaValue: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  // History
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingHorizontal: 16,
  },
  historyRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  historyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyMeta: { flex: 1 },
  historyLoanName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  historyDate: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '700' },
});

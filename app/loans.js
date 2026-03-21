import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { getLoans, getPayments, deleteLoan } from '../utils/storage';
import { calculateEMIBreakdown } from '../utils/emiCalculator';

// ── Sort option definitions ───────────────────────────────────────────────────
const SORT_OPTIONS = [
  { id: 'nextDue',       label: '📅 Due Date',    desc: false },
  { id: 'interestDesc',  label: '📈 Rate ↓',      desc: true  },
  { id: 'interestAsc',   label: '📉 Rate ↑',      desc: false },
  { id: 'principalDesc', label: '💰 Principal ↓', desc: true  },
  { id: 'principalAsc',  label: '💰 Principal ↑', desc: false },
];

export default function Loans() {
  const router = useRouter();
  const [loans, setLoans]       = useState([]);
  const [payments, setPayments] = useState([]);
  const [sortId, setSortId]     = useState('nextDue');
  const [refreshing, setRefreshing] = useState(false);

  const loadLoans = async () => {
    const loansData    = await getLoans();
    const paymentsData = await getPayments();
    setLoans(loansData);
    setPayments(paymentsData);
  };

  useEffect(() => { loadLoans(); }, []);

  useFocusEffect(
    React.useCallback(() => { loadLoans(); }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLoans();
    setRefreshing(false);
  };

  const handleDeleteLoan = (loanId, loanName) => {
    Alert.alert(
      'Delete Loan',
      `Are you sure you want to delete "${loanName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteLoan(loanId);
            await loadLoans();
          },
        },
      ]
    );
  };

  const formatCurrency = (amount) =>
    `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getNextDueDate = (loan) => {
    if (!loan.startDate) return new Date(9999, 0);
    const start  = new Date(loan.startDate);
    const today  = new Date();
    const tenure = parseInt(loan.tenure) || 0;

    if (loan.loanType === 'bullet') {
      const mat = new Date(start.getFullYear(), start.getMonth() + tenure, start.getDate());
      return mat;
    }

    const monthsDiff =
      (today.getFullYear() - start.getFullYear()) * 12 +
      (today.getMonth() - start.getMonth());
    if (monthsDiff >= tenure) return new Date(9999, 0); // completed

    const nextDue = new Date(start);
    nextDue.setMonth(nextDue.getMonth() + monthsDiff + 1);
    return nextDue;
  };

  const getRemainingBreakdown = (loan) => {
    const principal  = parseFloat(loan.principal)  || 0;
    const interest   = parseFloat(loan.interest)   || 0;
    const tenure     = parseInt(loan.tenure)        || 0;
    const emiAmount  = parseFloat(loan.emiAmount)   || 0;
    const loanType   = loan.loanType || 'emi';

    if (!loan.startDate) return { displayAmount: principal, breakdown: null };

    const startDate = new Date(loan.startDate);
    const today     = new Date();
    let monthsElapsed =
      (today.getFullYear() - startDate.getFullYear()) * 12 +
      (today.getMonth() - startDate.getMonth());
    if (today.getDate() >= startDate.getDate()) monthsElapsed++;
    monthsElapsed = Math.max(0, monthsElapsed);

    const extraPayments = payments.filter((p) => p.loanId === loan.id);
    const breakdown = calculateEMIBreakdown(
      principal, interest, tenure, monthsElapsed, emiAmount, loanType, extraPayments
    );

    return { displayAmount: breakdown.remainingPrincipalAmount, breakdown };
  };

  // ── Sorting ──────────────────────────────────────────────────────────────────
  const sorted = [...loans].sort((a, b) => {
    switch (sortId) {
      case 'nextDue':
        return getNextDueDate(a) - getNextDueDate(b);
      case 'interestDesc':
        return (parseFloat(b.interest) || 0) - (parseFloat(a.interest) || 0);
      case 'interestAsc':
        return (parseFloat(a.interest) || 0) - (parseFloat(b.interest) || 0);
      case 'principalDesc':
        return (parseFloat(b.principal) || 0) - (parseFloat(a.principal) || 0);
      case 'principalAsc':
        return (parseFloat(a.principal) || 0) - (parseFloat(b.principal) || 0);
      default:
        return 0;
    }
  });

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>All Loans</Text>
          <TouchableOpacity onPress={() => router.push('/add-loan')}>
            <Text style={styles.addButton}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* ── Sort Bar ── */}
        {loans.length > 0 && (
          <BlurView intensity={18} tint="light" style={styles.sortCard}>
            <View style={styles.sortCardInner}>
              <Text style={styles.sortLabel}>SORT BY</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sortRow}
              >
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.sortBtn, sortId === opt.id && styles.sortBtnActive]}
                    onPress={() => setSortId(opt.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.sortBtnText, sortId === opt.id && styles.sortBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </BlurView>
        )}

        {/* Loans List */}
        {sorted.length === 0 ? (
          <BlurView intensity={15} tint="light" style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Text style={styles.emptyText}>No loans yet</Text>
              <Text style={styles.emptySubtext}>
                Tap the + button to add your first loan
              </Text>
            </View>
          </BlurView>
        ) : (
          sorted.map((loan) => {
            const nextDue = getNextDueDate(loan);
            const nextDueStr =
              nextDue.getFullYear() === 9999
                ? 'Completed'
                : formatDate(nextDue);

            const { displayAmount: remaining, breakdown } = getRemainingBreakdown(loan);

            const startDate = new Date(loan.startDate);
            const today     = new Date();
            let monthsElapsed =
              (today.getFullYear() - startDate.getFullYear()) * 12 +
              (today.getMonth() - startDate.getMonth());
            if (today.getDate() >= startDate.getDate()) monthsElapsed++;
            monthsElapsed = Math.max(0, monthsElapsed);
            const paymentsMade = Math.min(monthsElapsed, parseInt(loan.tenure));

            const bulletTotalDue   = breakdown?.totalAmount   ?? parseFloat(loan.principal) ?? 0;
            const bulletInterestDue = breakdown?.totalInterest ?? 0;

            // Days until next due (for urgency indicator)
            const daysUntil = Math.ceil((nextDue - new Date()) / 86400000);
            const isUrgent  = daysUntil <= 7  && nextDue.getFullYear() !== 9999;
            const isWarning = daysUntil <= 30 && !isUrgent && nextDue.getFullYear() !== 9999;
            const dueBorderColor = isUrgent ? '#e11d48' : isWarning ? '#f59e0b' : 'rgba(0,0,0,0.08)';

            return (
              <BlurView
                key={loan.id}
                intensity={20}
                tint="light"
                style={[
                  styles.loanCard,
                  loan.status === 'closed' && { opacity: 0.6 },
                  (isUrgent || isWarning) && { borderColor: dueBorderColor, borderWidth: 1.5 },
                ]}
              >
                <TouchableOpacity
                  style={styles.cardContent}
                  onPress={() =>
                    router.push({
                      pathname: '/loan-detail',
                      params: {
                        id: loan.id,
                        loanName: loan.loanName,
                        principal: loan.principal,
                        interest: loan.interest,
                        emiAmount: loan.emiAmount,
                        tenure: loan.tenure,
                        startDate: loan.startDate,
                        loanType: loan.loanType || 'emi',
                      },
                    })
                  }
                  onLongPress={() => handleDeleteLoan(loan.id, loan.loanName)}
                  activeOpacity={0.7}
                >
                  {/* Loan header */}
                  <View style={styles.loanHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Text style={styles.loanName}>{loan.loanName}</Text>
                      {loan.loanType === 'bullet' && (
                        <View style={styles.bulletBadge}>
                          <Text style={styles.bulletBadgeText}>BULLET</Text>
                        </View>
                      )}
                      {loan.status === 'closed' && (
                        <View style={styles.closedBadge}>
                          <Text style={styles.closedBadgeText}>CLOSED</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.loanAmount}>{formatCurrency(remaining)}</Text>
                    <Text style={styles.loanAmountLabel}>
                      {loan.loanType === 'bullet' ? 'Principal Outstanding' : 'Remaining Principal'}
                    </Text>
                  </View>

                  {/* Due date urgency strip */}
                  {nextDue.getFullYear() !== 9999 && (
                    <View style={[styles.duePill, { backgroundColor: isUrgent ? 'rgba(225,29,72,0.1)' : isWarning ? 'rgba(245,158,11,0.1)' : 'rgba(56,189,248,0.1)' }]}>
                      <Text style={[styles.duePillText, { color: isUrgent ? '#e11d48' : isWarning ? '#f59e0b' : '#38bdf8' }]}>
                        {isUrgent ? '🔴' : isWarning ? '🟡' : '📅'}{'  '}
                        {loan.loanType === 'bullet' ? 'Matures' : 'Next Due'}:{' '}
                        <Text style={{ fontWeight: '700' }}>{nextDueStr}</Text>
                        {nextDue.getFullYear() !== 9999 && (
                          <Text style={{ fontWeight: '400', opacity: 0.7 }}>
                            {'  '}({daysUntil > 0 ? `${daysUntil}d away` : 'Today!'})
                          </Text>
                        )}
                      </Text>
                    </View>
                  )}

                  {/* Detail rows */}
                  <View style={styles.loanDetails}>
                    {loan.loanType === 'bullet' ? (
                      <>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Principal</Text>
                          <Text style={styles.detailValue}>{formatCurrency(loan.principal)}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Interest ({loan.interest}%)</Text>
                          <Text style={[styles.detailValue, { color: '#f59e0b' }]}>
                            {formatCurrency(bulletInterestDue)}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Total Due at Maturity</Text>
                          <Text style={[styles.detailValue, { color: '#e11d48', fontWeight: '700' }]}>
                            {formatCurrency(bulletTotalDue)}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>EMI Amount</Text>
                          <Text style={styles.detailValue}>{formatCurrency(loan.emiAmount)}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Interest Rate</Text>
                          <Text style={styles.detailValue}>{loan.interest}%</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Progress</Text>
                          <Text style={styles.detailValue}>{paymentsMade} / {loan.tenure} EMIs</Text>
                        </View>
                      </>
                    )}
                  </View>

                  <View style={styles.startDateContainer}>
                    <Text style={styles.startDateLabel}>Started: {formatDate(loan.startDate)}</Text>
                  </View>
                </TouchableOpacity>
              </BlurView>
            );
          })
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  headerTitle: { fontSize: 34, fontWeight: '700', color: '#0f172a' },
  addButton:   { fontSize: 18, fontWeight: '600', color: '#10b981' },

  // Sort bar
  sortCard:      { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 18 },
  sortCardInner: { padding: 14 },
  sortLabel:     { fontSize: 10, fontWeight: '700', color: 'rgba(15,23,42,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  sortRow:       { flexDirection: 'row', gap: 8 },
  sortBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', backgroundColor: '#fff',
  },
  sortBtnActive:     { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10b981' },
  sortBtnText:       { fontSize: 12, fontWeight: '600', color: 'rgba(15,23,42,0.55)' },
  sortBtnTextActive: { color: '#10b981' },

  loanCard: {
    borderRadius: 30, overflow: 'hidden', marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  cardContent: { padding: 24 },

  loanHeader:      { marginBottom: 12 },
  loanName:        { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  loanAmount:      { fontSize: 32, fontWeight: '700', color: '#10b981', marginTop: 2 },
  loanAmountLabel: { fontSize: 11, color: 'rgba(15,23,42,0.45)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2, marginBottom: 10 },

  bulletBadge:     { backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  bulletBadgeText: { fontSize: 10, fontWeight: '700', color: '#f59e0b' },
  closedBadge:     { backgroundColor: 'rgba(100,116,139,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  closedBadgeText: { fontSize: 10, fontWeight: '700', color: '#64748b' },

  duePill:     { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  duePillText: { fontSize: 13, lineHeight: 18 },

  loanDetails: { gap: 10, marginBottom: 16 },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 14, color: 'rgba(15,23,42,0.6)' },
  detailValue: { fontSize: 16, fontWeight: '600', color: '#0f172a' },

  startDateContainer: { paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  startDateLabel:     { fontSize: 12, color: 'rgba(15,23,42,0.4)' },

  emptyCard:    { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  emptyContent: { padding: 48, alignItems: 'center' },
  emptyText:    { fontSize: 20, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: 'rgba(15,23,42,0.6)', textAlign: 'center' },
});

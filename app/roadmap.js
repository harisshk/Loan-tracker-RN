import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Share,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLoans, getPayments, calculateLoanStats } from '../utils/storage';
import { calculateEMIBreakdown } from '../utils/emiCalculator';

const parseSafe = (val) => parseFloat(String(val || '0').replace(/,/g, ''));
const fc = (v) => `₹${Math.round(parseSafe(v)).toLocaleString('en-IN')}`;

export default function RepaymentRoadmap() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState('all');

  const loadData = useCallback(async () => {
    try {
      const loansData = await getLoans();
      const paymentsData = await getPayments();
      setLoans(loansData.filter((l) => l.status !== 'closed'));
      setPayments(paymentsData);
    } catch (e) {
      console.error('Error loading roadmap data:', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Dashboard-synced loan statistics (100% exact match)
  const stats = useMemo(() => {
    return calculateLoanStats(loans, payments);
  }, [loans, payments]);

  // Generate Month-by-Month Projection Schedule starting from 10th of each month
  const roadmapData = useMemo(() => {
    if (!loans || loans.length === 0) return { months: [], totalInterest: 0, debtFreeDate: 'N/A' };

    const targetLoans = selectedLoanId === 'all' 
      ? loans 
      : loans.filter((l) => l.id === selectedLoanId);

    if (targetLoans.length === 0) return { months: [], totalInterest: 0, debtFreeDate: 'N/A' };

    const today = new Date();
    const startYear = today.getFullYear();
    const startMonth = today.getMonth(); // 0-indexed (e.g. August = 7)

    // Calculate current remaining principal for each active loan RIGHT NOW
    const activeLoans = targetLoans.map((l) => {
      const principal = parseSafe(l.principal);
      const interest = parseSafe(l.interest);
      const emiAmount = parseSafe(l.emiAmount);
      const tenure = parseInt(String(l.tenure || '0').replace(/,/g, '')) || 0;
      const loanType = l.loanType || 'emi';
      const startDate = l.startDate ? new Date(l.startDate) : new Date();

      let elapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
      if (today.getDate() >= startDate.getDate()) {
        elapsed += 1;
      }
      elapsed = Math.max(0, elapsed);

      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const breakdown = calculateEMIBreakdown(principal, interest, tenure, elapsed, emiAmount, loanType, loanPayments);

      const remainingPrincipal = breakdown.remainingPrincipalAmount;
      const remainingTenure = Math.max(1, tenure - Math.min(elapsed, tenure));
      const monthlyRate = interest / 12 / 100;

      return {
        id: l.id,
        loanName: l.loanName || 'Loan',
        loanType,
        monthlyRate,
        annualInterest: interest,
        emiAmount: breakdown.emi > 0 ? breakdown.emi : emiAmount,
        remainingPrincipal,
        tenureRemaining: remainingTenure,
        closed: remainingPrincipal <= 0.01,
      };
    });

    const months = [];
    let cumulativeInterest = 0;
    let monthIdx = 0;
    const MAX_MONTHS = 240; // 20-year max projection limit

    const emiLoansCount = activeLoans.filter((l) => l.loanType === 'emi').length;

    // Month-by-Month loop: Project future 10th EMI payments for EMI loans
    while (
      (emiLoansCount > 0 ? activeLoans.some((l) => l.loanType === 'emi' && !l.closed) : monthIdx < 12) &&
      monthIdx < MAX_MONTHS
    ) {
      const currentProjDate = new Date(startYear, startMonth + monthIdx, 1);
      const monthLabel = currentProjDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      const fullMonthLabel = currentProjDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

      // Always calculate for the 10th of each month (EMIs paid date)
      const dueDateObj = new Date(startYear, startMonth + monthIdx, 10);
      const formattedDueDate = dueDateObj.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      let emiPrincipal = 0;
      let emiInterest = 0;

      // Deduct 10th EMI payments for active EMI loans
      activeLoans.forEach((l) => {
        if (l.closed || l.loanType === 'bullet') return; // Ignore bullet loan principal

        const iPaid = l.remainingPrincipal * l.monthlyRate;
        const emi = l.emiAmount;
        const pPaid = Math.min(l.remainingPrincipal, Math.max(0, emi - iPaid));

        l.remainingPrincipal = Math.max(0, l.remainingPrincipal - pPaid);
        l.tenureRemaining -= 1;

        if (l.remainingPrincipal <= 0.01 || l.tenureRemaining <= 0) {
          l.remainingPrincipal = 0;
          l.closed = true;
        }

        emiPrincipal += pPaid;
        emiInterest += iPaid;
      });

      cumulativeInterest += emiInterest;
      const endingOutstanding = activeLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);

      months.push({
        monthIndex: monthIdx + 1,
        monthLabel,
        fullMonthLabel,
        formattedDueDate,
        totalPrincipal: emiPrincipal,
        totalInterest: emiInterest,
        totalEMIPaid: emiPrincipal + emiInterest,
        endingOutstanding,
      });

      monthIdx++;
    }

    const debtFreeMonth = months.length > 0 ? months[months.length - 1].fullMonthLabel : 'N/A';

    return {
      months,
      totalInterest: cumulativeInterest,
      debtFreeDate: debtFreeMonth,
    };
  }, [loans, payments, selectedLoanId]);

  const handleShareRoadmap = async () => {
    try {
      let report = `📊 REPAYMENT ROADMAP & PROJECTION REPORT\n`;
      report += `----------------------------------------\n`;
      report += `Outstanding Principal: ${fc(stats.totalPrincipalPending)}\n`;
      report += `Projected EMI Payoff Target: ${roadmapData.debtFreeDate}\n\n`;
      report += `MONTHLY PROJECTION SCHEDULE (10TH OF EVERY MONTH):\n`;

      roadmapData.months.slice(0, 36).forEach((m) => {
        report += `M${m.monthIndex} (${m.formattedDueDate}) | EMI: ${fc(m.totalEMIPaid)} (Prin: ${fc(m.totalPrincipal)}, Int: ${fc(m.totalInterest)}) | Pending Bal: ${fc(m.endingOutstanding)}\n`;
      });

      if (roadmapData.months.length > 36) {
        report += `... and ${roadmapData.months.length - 36} more months to full EMI payoff.\n`;
      }

      await Share.share({
        title: 'Repayment Roadmap Projection',
        message: report,
      });
    } catch (_err) {
      Alert.alert('Error', 'Failed to share roadmap.');
    }
  };

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Repayment Roadmap</Text>
          <Text style={styles.headerSub}>Monthly Projections & Debt Payoff Schedule</Text>
        </View>
        <TouchableOpacity onPress={handleShareRoadmap} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={20} color="#6366f1" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Metric Overview Card - 100% Synced with Dashboard */}
        <BlurView intensity={40} tint="light" style={styles.metricsCard}>
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>OUTSTANDING PRINCIPAL</Text>
              <Text style={styles.metricValPrimary}>
                {selectedLoanId === 'all' 
                  ? fc(stats.totalPrincipalPending) 
                  : fc(roadmapData.months.length > 0 ? (roadmapData.months[0].endingOutstanding + roadmapData.months[0].totalPrincipal) : 0)}
              </Text>
              <Text style={styles.metricSub}>Matches Dashboard Total</Text>
            </View>

            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>EMI PAYOFF TARGET</Text>
              <Text style={[styles.metricValPrimary, { color: '#10b981' }]}>
                {roadmapData.debtFreeDate || 'N/A'}
              </Text>
              <Text style={styles.metricSub}>{roadmapData.months.length} months remaining</Text>
            </View>
          </View>
        </BlurView>

        {/* Loan Selection Bar */}
        {loans.length > 1 && (
          <View style={styles.filterCard}>
            <Text style={styles.inputLabel}>SELECT LOAN / VIEW ALL</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, selectedLoanId === 'all' && styles.chipActive]}
                onPress={() => setSelectedLoanId('all')}
              >
                <Text style={[styles.chipText, selectedLoanId === 'all' && styles.chipTextActive]}>
                  All Loans ({loans.length})
                </Text>
              </TouchableOpacity>

              {loans.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.chip, selectedLoanId === l.id && styles.chipActive]}
                  onPress={() => setSelectedLoanId(l.id)}
                >
                  <Text style={[styles.chipText, selectedLoanId === l.id && styles.chipTextActive]}>
                    {l.loanName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Monthly Projection List */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>MONTHLY PROJECTION LIST (EVERY 10TH)</Text>
          <Text style={styles.sectionHeaderCount}>{roadmapData.months.length} Months Projected</Text>
        </View>

        {roadmapData.months.length === 0 ? (
          <BlurView intensity={30} tint="light" style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#10b981" />
            <Text style={styles.emptyTitle}>No Active Loans Found</Text>
            <Text style={styles.emptySub}>You are currently debt-free or have no active loans to project.</Text>
          </BlurView>
        ) : (
          roadmapData.months.map((item) => (
            <BlurView
              key={item.monthIndex}
              intensity={35}
              tint="light"
              style={styles.monthCard}
            >
              <View style={styles.monthHeaderRow}>
                {/* Month Badge */}
                <View style={styles.monthDateBadge}>
                  <Text style={styles.monthIdxText}>M{item.monthIndex}</Text>
                  <Text style={styles.monthDateText}>{item.monthLabel}</Text>
                </View>

                {/* 10th Payment Date & Breakdown */}
                <View style={styles.monthSummaryCol}>
                  <Text style={styles.dueDateText}>Date: {item.formattedDueDate}</Text>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.emiTotalText}>EMI: {fc(item.totalEMIPaid)}</Text>
                    <Text style={styles.dotSep}>•</Text>
                    <Text style={styles.prinText}>Prin: {fc(item.totalPrincipal)}</Text>
                    <Text style={styles.dotSep}>•</Text>
                    <Text style={styles.intText}>Int: {fc(item.totalInterest)}</Text>
                  </View>
                </View>

                {/* Ending Outstanding Balance */}
                <View style={styles.monthEndingCol}>
                  <Text style={styles.endingLabel}>OUTSTANDING PENDING</Text>
                  <Text style={styles.endingVal}>{fc(item.endingOutstanding)}</Text>
                </View>
              </View>
            </BlurView>
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  shareBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  metricsCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  metricValPrimary: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  metricSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  filterCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1,
  },
  sectionHeaderCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  emptyCard: {
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  monthCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 10,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthDateBadge: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginRight: 12,
  },
  monthIdxText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6366f1',
  },
  monthDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  monthSummaryCol: {
    flex: 1,
  },
  dueDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  paidStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10b981',
    marginTop: 2,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  emiTotalText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366f1',
  },
  prinText: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  intText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  dotSep: {
    marginHorizontal: 3,
    color: '#94a3b8',
    fontSize: 10,
  },
  monthEndingCol: {
    alignItems: 'flex-end',
  },
  endingLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  endingVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
});

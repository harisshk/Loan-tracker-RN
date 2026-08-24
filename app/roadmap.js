import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Share,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLoans, getPayments } from '../utils/storage';

const fc = (v) => `₹${Math.round(parseFloat(v || 0)).toLocaleString('en-IN')}`;

export default function RepaymentRoadmap() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState('all');
  const [extraPrepayment, setExtraPrepayment] = useState('0');
  const [expandedMonth, setExpandedMonth] = useState(null);

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

  // Generate Month-by-Month Projection List starting from THIS MONTH
  const roadmapData = useMemo(() => {
    if (!loans || loans.length === 0) return { months: [], totalInterest: 0, debtFreeDate: null, totalEMI: 0 };

    const extraMonthly = Math.max(0, parseFloat(extraPrepayment) || 0);

    // Filter loans if user selected a specific loan
    const targetLoans = selectedLoanId === 'all' 
      ? loans 
      : loans.filter((l) => l.id === selectedLoanId);

    if (targetLoans.length === 0) return { months: [], totalInterest: 0, debtFreeDate: null, totalEMI: 0 };

    // Deep clone active loan states for simulation
    const today = new Date();
    const startYear = today.getFullYear();
    const startMonth = today.getMonth(); // 0-indexed

    const activeLoans = targetLoans.map((l) => {
      const principal = parseFloat(l.principal || 0);
      const interest = parseFloat(l.interest || 0);
      const emiAmount = parseFloat(l.emiAmount || 0);
      const tenure = parseInt(l.tenure || 0);
      const startDate = l.startDate ? new Date(l.startDate) : new Date();

      // Calculate months elapsed since loan start
      let elapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
      if (today.getDate() >= startDate.getDate()) elapsed += 1;
      elapsed = Math.max(0, elapsed);

      // Estimate current principal remaining based on elapsed months
      let remainingPrincipal = principal;
      const monthlyRate = interest / 12 / 100;

      if (l.loanType === 'bullet') {
        remainingPrincipal = principal;
      } else {
        for (let m = 0; m < Math.min(elapsed, tenure); m++) {
          const interestMonth = remainingPrincipal * monthlyRate;
          const principalMonth = Math.max(0, emiAmount - interestMonth);
          remainingPrincipal = Math.max(0, remainingPrincipal - principalMonth);
        }
      }

      // Deduct recorded extra payments from principal
      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const extraPaid = loanPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      remainingPrincipal = Math.max(0, remainingPrincipal - extraPaid);

      const remainingTenure = Math.max(1, tenure - elapsed);

      return {
        id: l.id,
        loanName: l.loanName || 'Loan',
        loanType: l.loanType || 'emi',
        monthlyRate,
        annualInterest: interest,
        emiAmount: emiAmount > 0 ? emiAmount : (monthlyRate > 0 ? (remainingPrincipal * monthlyRate) : remainingPrincipal / remainingTenure),
        remainingPrincipal,
        tenureRemaining: remainingTenure,
        closed: remainingPrincipal <= 0,
      };
    });

    const months = [];
    let cumulativeInterest = 0;
    let monthIdx = 0;
    const MAX_MONTHS = 360; // 30-year max simulation limit

    while (activeLoans.some((l) => !l.closed) && monthIdx < MAX_MONTHS) {
      const currentProjDate = new Date(startYear, startMonth + monthIdx, 1);
      const monthLabel = currentProjDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      const fullMonthLabel = currentProjDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

      let monthTotalDue = 0;
      let monthTotalPrincipal = 0;
      let monthTotalInterest = 0;
      const loanBreakdown = [];
      const closedThisMonth = [];

      // 1. Process regular monthly payments
      activeLoans.forEach((l) => {
        if (l.closed) return;

        let pPaid = 0;
        let iPaid = 0;
        let emi = 0;

        if (l.loanType === 'bullet') {
          // Bullet interest monthly, principal due at end of tenure
          iPaid = l.remainingPrincipal * l.monthlyRate;
          l.tenureRemaining -= 1;

          if (l.tenureRemaining <= 0) {
            pPaid = l.remainingPrincipal;
            l.remainingPrincipal = 0;
            l.closed = true;
            closedThisMonth.push(l.loanName);
          }
          emi = iPaid + pPaid;
        } else {
          // EMI loan reducing balance
          iPaid = l.remainingPrincipal * l.monthlyRate;
          emi = l.emiAmount;
          pPaid = Math.min(l.remainingPrincipal, Math.max(0, emi - iPaid));

          l.remainingPrincipal = Math.max(0, l.remainingPrincipal - pPaid);
          l.tenureRemaining -= 1;

          if (l.remainingPrincipal <= 0.01 || l.tenureRemaining <= 0) {
            l.remainingPrincipal = 0;
            l.closed = true;
            closedThisMonth.push(l.loanName);
          }
        }

        monthTotalDue += emi;
        monthTotalPrincipal += pPaid;
        monthTotalInterest += iPaid;

        loanBreakdown.push({
          id: l.id,
          name: l.loanName,
          type: l.loanType,
          due: emi,
          principalPaid: pPaid,
          interestPaid: iPaid,
          remaining: l.remainingPrincipal,
        });
      });

      // 2. Apply extra monthly budget to highest interest open loan
      if (extraMonthly > 0) {
        let extraBudget = extraMonthly;
        const openLoansSorted = activeLoans
          .filter((l) => !l.closed)
          .sort((a, b) => b.annualInterest - a.annualInterest);

        for (const l of openLoansSorted) {
          if (extraBudget <= 0) break;
          const extraPay = Math.min(extraBudget, l.remainingPrincipal);
          l.remainingPrincipal = Math.max(0, l.remainingPrincipal - extraPay);
          extraBudget -= extraPay;
          monthTotalPrincipal += extraPay;
          monthTotalDue += extraPay;

          // Update breakdown entry for extra payment
          const breakdownItem = loanBreakdown.find((b) => b.id === l.id);
          if (breakdownItem) {
            breakdownItem.principalPaid += extraPay;
            breakdownItem.due += extraPay;
            breakdownItem.remaining = l.remainingPrincipal;
          }

          if (l.remainingPrincipal <= 0.01) {
            l.remainingPrincipal = 0;
            l.closed = true;
            if (!closedThisMonth.includes(l.loanName)) {
              closedThisMonth.push(l.loanName);
            }
          }
        }
      }

      cumulativeInterest += monthTotalInterest;
      const endingOutstanding = activeLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);

      months.push({
        monthIndex: monthIdx + 1,
        monthLabel,
        fullMonthLabel,
        date: currentProjDate,
        totalDue: monthTotalDue,
        totalPrincipal: monthTotalPrincipal,
        totalInterest: monthTotalInterest,
        endingOutstanding,
        loanBreakdown,
        closedThisMonth,
      });

      monthIdx++;
    }

    const initialTotalEMIs = targetLoans.reduce((sum, l) => sum + parseFloat(l.emiAmount || 0), 0);
    const debtFreeMonth = months.length > 0 ? months[months.length - 1].fullMonthLabel : 'N/A';

    return {
      months,
      totalInterest: cumulativeInterest,
      debtFreeDate: debtFreeMonth,
      totalEMI: initialTotalEMIs,
    };
  }, [loans, payments, selectedLoanId, extraPrepayment]);

  const currentOutstandingTotal = useMemo(() => {
    return loans.reduce((sum, l) => {
      const p = parseFloat(l.principal || 0);
      const loanPayments = payments.filter((pay) => pay.loanId === l.id);
      const paid = loanPayments.reduce((s, pay) => s + (parseFloat(pay.amount) || 0), 0);
      return sum + Math.max(0, p - paid);
    }, 0);
  }, [loans, payments]);

  const handleShareRoadmap = async () => {
    try {
      let report = `📊 REPAYMENT ROADMAP & PROJECTION REPORT\n`;
      report += `----------------------------------------\n`;
      report += `Current Total Debt: ${fc(currentOutstandingTotal)}\n`;
      report += `Monthly EMI Commitment: ${fc(roadmapData.totalEMI)}/mo\n`;
      report += `Projected Debt-Free Month: ${roadmapData.debtFreeDate}\n`;
      report += `Projected Total Interest: ${fc(roadmapData.totalInterest)}\n\n`;
      report += `MONTH-BY-MONTH PROJECTION SCHEDULE:\n`;

      roadmapData.months.slice(0, 36).forEach((m) => {
        report += `${m.monthLabel}: Due ${fc(m.totalDue)} | Prin ${fc(m.totalPrincipal)} | Int ${fc(m.totalInterest)} | Ending Bal: ${fc(m.endingOutstanding)}`;
        if (m.closedThisMonth.length > 0) {
          report += ` 🎉 Paid Off: ${m.closedThisMonth.join(', ')}`;
        }
        report += `\n`;
      });

      if (roadmapData.months.length > 36) {
        report += `... and ${roadmapData.months.length - 36} more months to total payoff.\n`;
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
      {/* Header */}
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
        {/* Metric Overview Card */}
        <BlurView intensity={40} tint="light" style={styles.metricsCard}>
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>OUTSTANDING DEBT</Text>
              <Text style={styles.metricValPrimary}>{fc(currentOutstandingTotal)}</Text>
              <Text style={styles.metricSub}>Current principal</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>MONTHLY EMI</Text>
              <Text style={styles.metricValSecondary}>{fc(roadmapData.totalEMI)}</Text>
              <Text style={styles.metricSub}>Monthly obligation</Text>
            </View>
          </View>

          <View style={styles.metricsDivider} />

          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>DEBT-FREE TARGET</Text>
              <Text style={[styles.metricValPrimary, { color: '#10b981' }]}>
                {roadmapData.debtFreeDate || 'N/A'}
              </Text>
              <Text style={styles.metricSub}>{roadmapData.months.length} months remaining</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>PROJECTED INTEREST</Text>
              <Text style={[styles.metricValSecondary, { color: '#ef4444' }]}>
                {fc(roadmapData.totalInterest)}
              </Text>
              <Text style={styles.metricSub}>Future interest cost</Text>
            </View>
          </View>
        </BlurView>

        {/* Filter & Simulator Bar */}
        <BlurView intensity={30} tint="light" style={styles.filterCard}>
          <Text style={styles.filterSectionTitle}>SIMULATOR & FILTER</Text>

          {/* Select Loan Selector */}
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

          {/* Extra Monthly Prepayment Input */}
          <Text style={[styles.inputLabel, { marginTop: 14 }]}>
            EXTRA MONTHLY PREPAYMENT (ACCELERATOR)
          </Text>
          <View style={styles.extraInputRow}>
            <Text style={styles.currencyPrefix}>₹</Text>
            <TextInput
              style={styles.extraInput}
              keyboardType="numeric"
              placeholder="0 (e.g. 5000)"
              placeholderTextColor="#94a3b8"
              value={extraPrepayment}
              onChangeText={setExtraPrepayment}
            />
            {parseFloat(extraPrepayment) > 0 && (
              <TouchableOpacity onPress={() => setExtraPrepayment('0')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        </BlurView>

        {/* Month-by-Month Projection List Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>MONTHLY PROJECTION LIST</Text>
          <Text style={styles.sectionHeaderCount}>{roadmapData.months.length} Months Projected</Text>
        </View>

        {roadmapData.months.length === 0 ? (
          <BlurView intensity={30} tint="light" style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#10b981" />
            <Text style={styles.emptyTitle}>No Active Loans Found</Text>
            <Text style={styles.emptySub}>You are currently debt-free or have no active loans to project.</Text>
          </BlurView>
        ) : (
          roadmapData.months.map((item) => {
            const isExpanded = expandedMonth === item.monthIndex;
            const hasMilestone = item.closedThisMonth.length > 0;

            return (
              <BlurView
                key={item.monthIndex}
                intensity={30}
                tint="light"
                style={[styles.monthCard, hasMilestone && styles.monthCardMilestone]}
              >
                <TouchableOpacity
                  onPress={() => setExpandedMonth(isExpanded ? null : item.monthIndex)}
                  activeOpacity={0.8}
                >
                  <View style={styles.monthHeaderRow}>
                    <View style={styles.monthDateBadge}>
                      <Text style={styles.monthIdxText}>M{item.monthIndex}</Text>
                      <Text style={styles.monthDateText}>{item.monthLabel}</Text>
                    </View>

                    <View style={styles.monthSummaryCol}>
                      <View style={styles.dueRow}>
                        <Text style={styles.dueLabel}>Due: </Text>
                        <Text style={styles.dueVal}>{fc(item.totalDue)}</Text>
                      </View>

                      <View style={styles.breakdownRow}>
                        <Text style={styles.prinText}>Prin: {fc(item.totalPrincipal)}</Text>
                        <Text style={styles.dotSep}>•</Text>
                        <Text style={styles.intText}>Int: {fc(item.totalInterest)}</Text>
                      </View>
                    </View>

                    <View style={styles.monthEndingCol}>
                      <Text style={styles.endingLabel}>OUTSTANDING</Text>
                      <Text style={styles.endingVal}>{fc(item.endingOutstanding)}</Text>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#64748b"
                        style={{ marginTop: 2 }}
                      />
                    </View>
                  </View>

                  {/* Celebrating Milestone Banner */}
                  {hasMilestone && (
                    <View style={styles.milestoneBanner}>
                      <Ionicons name="trophy" size={14} color="#10b981" />
                      <Text style={styles.milestoneText}>
                        🎉 Paid Off: {item.closedThisMonth.join(', ')}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Expanded Loan-by-Loan Breakdown for this Month */}
                {isExpanded && (
                  <View style={styles.expandedDetails}>
                    <View style={styles.expandedDivider} />
                    <Text style={styles.expandedTitle}>Loan Breakdown for {item.fullMonthLabel}:</Text>

                    {item.loanBreakdown.map((l) => (
                      <View key={l.id} style={styles.loanBreakdownRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.loanNameText}>{l.name}</Text>
                          <Text style={styles.loanTypeText}>
                            {l.type === 'bullet' ? 'Bullet Repayment' : 'Monthly EMI'}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.loanDueText}>Due: {fc(l.due)}</Text>
                          <Text style={styles.loanSubText}>
                            P: {fc(l.principalPaid)} | I: {fc(l.interestPaid)}
                          </Text>
                          <Text style={styles.loanRemText}>Remaining: {fc(l.remaining)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </BlurView>
            );
          })
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
  metricValSecondary: {
    fontSize: 18,
    fontWeight: '800',
    color: '#6366f1',
  },
  metricSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  metricsDivider: {
    height: 1,
    backgroundColor: 'rgba(226, 232, 240, 0.8)',
    marginVertical: 12,
  },
  filterCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 20,
  },
  filterSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    marginBottom: 4,
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
  extraInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    height: 44,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748b',
    marginRight: 6,
  },
  extraInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  clearBtn: {
    padding: 4,
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
  monthCardMilestone: {
    borderColor: '#10b981',
    borderWidth: 1.5,
    backgroundColor: 'rgba(240, 253, 244, 0.85)',
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
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dueLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  dueVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
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
    marginHorizontal: 4,
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
  milestoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  milestoneText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  expandedDetails: {
    marginTop: 8,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 8,
  },
  expandedTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  loanBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  loanNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  loanTypeText: {
    fontSize: 10,
    color: '#64748b',
  },
  loanDueText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  loanSubText: {
    fontSize: 10,
    color: '#64748b',
  },
  loanRemText: {
    fontSize: 10,
    color: '#6366f1',
    fontWeight: '600',
  },
});

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
import { getLoans, calculateLoanStats, getPayments, getInsurances } from '../utils/storage';
import { calculateEMIBreakdown } from '../utils/emiCalculator';

export default function Dashboard() {
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [stats, setStats] = useState({
    totalOutstanding: 0,
    totalOutstandingPr: 0,
    upcomingEMI: 0,
    totalPaid: 0,
    totalPrincipalPaid: 0,
    totalInterestPaid: 0,
    totalPrincipalPending: 0,
    totalInterestPending: 0,
    pendingLoans: 0,
    nextDueDate: null,
    nextPaymentAmount: 0,
    nextPaymentLoanName: '',
  });
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const loansData = await getLoans();
    const paymentsData = await getPayments();
    const insurancesData = await getInsurances();
    setLoans(loansData);
    setPayments(paymentsData);
    setInsurances(insurancesData);
    const calculatedStats = calculateLoanStats(loansData, paymentsData, insurancesData);
    setStats(calculatedStats);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Reload data when screen comes into focus (after adding/editing loan)
  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const calculateLoanProgress = (loan) => {
    const principal = parseFloat(loan.principal) || 0;
    const interest = parseFloat(loan.interest) || 0;
    const tenure = parseInt(loan.tenure) || 0;
    const emiAmount = parseFloat(loan.emiAmount) || 0;
    
    if (!loan.startDate) return { principalPaid: 0, principalPending: principal, progress: 0 };
    
    const startDate = new Date(loan.startDate);
    const today = new Date();
    
    // Calculate base months difference
    let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                        (today.getMonth() - startDate.getMonth());
    
    // If current day >= start day, we've completed this month's payment
    if (today.getDate() >= startDate.getDate()) {
      monthsElapsed += 1;
    }
    
    monthsElapsed = Math.max(0, monthsElapsed);
    
    const extraPayments = payments.filter(p => p.loanId === loan.id);
    const breakdown = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount, loan.loanType || 'emi', extraPayments);
    const progress = principal > 0 ? breakdown.principalPaid / principal : 0;
    
    return {
      loanType: loan.loanType || 'emi',
      principalPaid: breakdown.principalPaid,
      principalPending: breakdown.remainingPrincipalAmount,
      progress: progress,
      totalPaid: breakdown.totalPaid,
      remaining: breakdown.remainingAmount,
    };
  };

  const calculateInsuranceNextDueDate = (startDate, frequency) => {
    if (!startDate) return null;
    const start = new Date(startDate);
    const today = new Date();
    
    let stepMonths = 12;
    if (frequency === 'yearly') stepMonths = 12;
    else if (frequency === 'half-yearly') stepMonths = 6;
    else if (frequency === 'quarterly') stepMonths = 3;
    else if (frequency === 'monthly') stepMonths = 1;
    
    let nextDue = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (nextDue < today) {
      nextDue.setMonth(nextDue.getMonth() + stepMonths);
    }
    return nextDue;
  };

  return (
    <LinearGradient
      colors={['#f8fafc', '#f1f5f9', '#e2e8f0']}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Loan Tracker</Text>
            <Text style={styles.headerSubtitle}>Manage your finances</Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-loan')}
          >
            <BlurView intensity={30} tint="light" style={styles.addButtonBlur}>
              <Text style={styles.addButtonText}>+</Text>
            </BlurView>
          </TouchableOpacity>
        </View>

        {/* Loan Cards Carousel */}
        {loans.length > 0 && (
          <View style={styles.carouselContainer}>
            <Text style={styles.carouselTitle}>Your Loans</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContent}
            >
              {loans.filter(l => l.status !== 'closed').map((loan) => {
                const loanProgress = calculateLoanProgress(loan);
                
                return (
                  <TouchableOpacity
                    key={loan.id}
                    onPress={() => router.push({
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
                        status: loan.status || 'active',
                      },
                    })}
                  >
                    <BlurView intensity={20} tint="light" style={styles.loanCarouselCard}>
                      <View style={styles.loanCardContent}>
                        <Text style={styles.loanCardName}>
                          {loan.loanName} {loanProgress.loanType === 'bullet' && <Text style={{fontSize: 12, color: '#f59e0b'}}>(Bullet)</Text>}
                        </Text>
                        <Text style={styles.loanCardAmount}>
                          {formatCurrency(loanProgress.principalPending)}
                        </Text>
                        <Text style={styles.loanCardLabel}>
                          {loanProgress.loanType === 'bullet' ? 'Lump Sum Remaining' : 'Remaining'}
                        </Text>
                        
                        {/* Progress Bar */}
                        <View style={styles.loanProgressContainer}>
                          <View style={styles.loanProgressBar}>
                            <View
                              style={[
                                styles.loanProgressFill,
                                { width: `${loanProgress.progress * 100}%` },
                              ]}
                            />
                          </View>
                        </View>
                        
                        {loanProgress.loanType === 'bullet' ? (
                          <Text style={[styles.loanCardProgress, {color: '#f59e0b'}]}>
                            Matures: {(() => {
                              const m = new Date(loan.startDate);
                              m.setMonth(m.getMonth() + parseInt(loan.tenure));
                              return formatDate(m);
                            })()}
                          </Text>
                        ) : (
                          <Text style={styles.loanCardProgress}>
                            {Math.round(loanProgress.progress * 100)}% Principal Paid
                          </Text>
                        )}
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Insurances Cards Carousel */}
        {insurances.length > 0 && (
          <View style={styles.carouselContainer}>
            <Text style={styles.carouselTitle}>Your Insurances</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContent}
            >
              {insurances
                .map(ins => ({ ...ins, nextDue: calculateInsuranceNextDueDate(ins.startDate, ins.frequency) }))
                .sort((a, b) => {
                  if (!a.nextDue && !b.nextDue) return 0;
                  if (!a.nextDue) return 1;
                  if (!b.nextDue) return -1;
                  return a.nextDue.getTime() - b.nextDue.getTime();
                })
                .map((ins) => {
                const nextDue = ins.nextDue;
                
                return (
                  <TouchableOpacity
                    key={ins.id}
                    onPress={() => router.push('/insurances')}
                  >
                    <BlurView intensity={20} tint="light" style={styles.loanCarouselCard}>
                      <View style={styles.loanCardContent}>
                        <Text style={styles.loanCardName}>{ins.name}</Text>
                        <Text style={styles.loanCardAmount}>
                          {formatCurrency(ins.premiumAmount)}
                        </Text>
                        <Text style={styles.loanCardLabel}>
                          {ins.frequency.charAt(0).toUpperCase() + ins.frequency.slice(1)} Premium
                        </Text>
                        
                        <View style={[styles.dividerSmall, {backgroundColor: 'rgba(0,0,0,0.1)'}]} />
                        
                        <Text style={styles.loanCardProgress}>
                          Next Due: {nextDue ? formatDate(nextDue) : 'N/A'}
                        </Text>
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Total Outstanding Card */}
        <BlurView intensity={20} tint="light" style={styles.mainCard}>
          <View style={styles.cardContent}>
            <Text style={styles.mainCardLabel}>Total Outstanding Principal</Text>
            <Text style={styles.mainCardAmount}>
              {formatCurrency(stats.totalPrincipalPending)}
            </Text>
            <View style={styles.dividerSmall} />
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabelMini}>Total Int. Pending</Text>
                <Text style={styles.statValueMini}>{formatCurrency(stats.totalInterestPending)}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabelMini}>Total Payable</Text>
                <Text style={styles.statValueMini}>{formatCurrency(stats.totalOutstanding)}</Text>
              </View>
            </View>
            <View style={styles.emiRow}>
              <View>
                <Text style={styles.emiLabel}>This Month EMI Total</Text>
                <Text style={{ fontSize: 12, color: 'rgba(15, 23, 42, 0.4)' }}>Loan payments only</Text>
              </View>
              <Text style={[styles.emiAmount, { color: '#f59e0b' }]}>
                {formatCurrency(stats.thisMonthEMIAmount || 0)}
              </Text>
            </View>
            <View style={styles.emiRow}>
              <View>
                <Text style={styles.emiLabel}>Total Due This Month</Text>
                <Text style={{ fontSize: 12, color: 'rgba(15, 23, 42, 0.4)' }}>{stats.thisMonthDueCount || 0} Payments (inc. Insurances)</Text>
              </View>
              <Text style={styles.emiAmount}>
                {formatCurrency(stats.thisMonthDueAmount || 0)}
              </Text>
            </View>
          </View>
        </BlurView>

        {/* Next Upcoming Payment Card */}
        {stats.nextDueDate && (
          <BlurView intensity={20} tint="light" style={[styles.mainCard, { borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
            <View style={styles.cardContent}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                <Text style={styles.mainCardLabel}>Next Upcoming Payment</Text>
                <Text style={[styles.loanCardLabel, {marginBottom: 8, color: '#10b981'}]}>
                  {formatDate(stats.nextDueDate)}
                </Text>
              </View>
              <Text style={styles.mainCardAmount}>
                {formatCurrency(stats.nextPaymentAmount)}
              </Text>
              <Text style={styles.statLabelMini}>
                For: {stats.nextPaymentLoanName}
              </Text>
            </View>
          </BlurView>
        )}

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/analytics')}
          >
            <BlurView intensity={20} tint="light" style={styles.actionBlur}>
              <Text style={[styles.actionButtonText, { color: '#a78bfa' }]}>📊 Analytics</Text>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/calendar')}
          >
            <BlurView intensity={20} tint="light" style={styles.actionBlur}>
              <Text style={[styles.actionButtonText, { color: '#38bdf8' }]}>📅 Calendar View</Text>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/loans')}
          >
            <BlurView intensity={20} tint="light" style={styles.actionBlur}>
              <Text style={styles.actionButtonText}>💰 View All Loans</Text>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/insurances')}
          >
            <BlurView intensity={20} tint="light" style={styles.actionBlur}>
              <Text style={[styles.actionButtonText, { color: '#f59e0b' }]}>🛡️ View Insurances</Text>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/history')}
          >
            <BlurView intensity={20} tint="light" style={styles.actionBlur}>
              <Text style={[styles.actionButtonText, { color: '#f59e0b' }]}>📖 Extra Payments Log</Text>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/add-insurance')}
          >
            <BlurView intensity={20} tint="light" style={styles.actionBlur}>
              <Text style={[styles.actionButtonText, { color: '#10b981' }]}>🛡️ Add Insurance</Text>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/sync')}
          >
            <BlurView intensity={20} tint="light" style={styles.actionBlur}>
              <Text style={[styles.actionButtonText, { color: '#10b981' }]}>💾 Export & Import</Text>
            </BlurView>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  addButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  addButtonBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  addButtonText: {
    fontSize: 32,
    fontWeight: '300',
    color: '#10b981',
    lineHeight: 32,
  },
  mainCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  cardContent: {
    padding: 24,
  },
  mainCardLabel: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mainCardAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 20,
  },
  emiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  emiLabel: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  emiAmount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10b981',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  summaryLabel: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  summarySubLabel: {
    fontSize: 11,
    color: 'rgba(15, 23, 42, 0.4)',
    marginTop: 4,
  },
  summarySubLabelActive: {
    fontSize: 11,
    color: '#10b981',
    marginTop: 2,
    fontWeight: '600',
  },
  dividerSmall: {
    height: 1,
    backgroundColor: '#ffffff',
    marginVertical: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
  },
  statLabelMini: {
    fontSize: 11,
    color: 'rgba(15, 23, 42, 0.5)',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValueMini: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    width: '48%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  actionBlur: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
  },
  carouselContainer: {
    marginBottom: 24,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
  },
  carouselContent: {
    gap: 12,
    paddingRight: 20,
  },
  loanCarouselCard: {
    width: 280,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  loanCardContent: {
    padding: 20,
  },
  loanCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  loanCardAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 4,
  },
  loanCardLabel: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loanProgressContainer: {
    marginBottom: 12,
  },
  loanProgressBar: {
    height: 8,
    backgroundColor: 'rgba(225, 29, 72, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  loanProgressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  loanProgressLabels: {
    gap: 8,
  },
  progressLabelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  progressLabelText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  loanCardProgress: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
    textAlign: 'center',
    marginTop: 8,
  },
});

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
import { getLoans, calculateLoanStats } from '../utils/storage';
import { calculateEMIBreakdown } from '../utils/emiCalculator';

export default function Dashboard() {
  const router = useRouter();
  const [loans, setLoans] = useState([]);
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
  });
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const loansData = await getLoans();
    setLoans(loansData);
    const calculatedStats = calculateLoanStats(loansData);
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
    
    const breakdown = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount);
    const progress = principal > 0 ? breakdown.principalPaid / principal : 0;
    
    return {
      principalPaid: breakdown.principalPaid,
      principalPending: breakdown.remainingPrincipalAmount,
      progress: progress,
      totalPaid: breakdown.totalPaid,
      remaining: breakdown.remainingAmount,
    };
  };

  return (
    <LinearGradient
      colors={['#0a0a0a', '#1a1a2e', '#16213e']}
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
            <BlurView intensity={30} tint="dark" style={styles.addButtonBlur}>
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
              {loans.map((loan) => {
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
                      },
                    })}
                  >
                    <BlurView intensity={20} tint="dark" style={styles.loanCarouselCard}>
                      <View style={styles.loanCardContent}>
                        <Text style={styles.loanCardName}>{loan.loanName}</Text>
                        <Text style={styles.loanCardAmount}>
                          {formatCurrency(loanProgress.principalPending)}
                        </Text>
                        <Text style={styles.loanCardLabel}>Remaining</Text>
                        
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
                          <View style={styles.loanProgressLabels}>
                            <View style={styles.progressLabelItem}>
                              <View style={[styles.progressDot, { backgroundColor: '#4ade80' }]} />
                              <Text style={styles.progressLabelText}>
                                Paid Principal: {formatCurrency(loanProgress.principalPaid)}
                              </Text>
                            </View>
                            <View style={styles.progressLabelItem}>
                              <View style={[styles.progressDot, { backgroundColor: '#4ade80' }]} />
                              <Text style={styles.progressLabelText}>
                                Total Paid: {formatCurrency(loanProgress.totalPaid)}
                              </Text>
                            </View>
                            <View style={styles.progressLabelItem}>
                              <View style={[styles.progressDot, { backgroundColor: '#ef4444' }]} />
                              <Text style={styles.progressLabelText}>
                                Pending: {formatCurrency(loanProgress.principalPending)}
                              </Text>
                            </View>
                            <View style={styles.progressLabelItem}>
                              <View style={[styles.progressDot, { backgroundColor: '#ef4444' }]} />
                              <Text style={styles.progressLabelText}>
                                Pending Total: {formatCurrency(loanProgress.remaining)}
                              </Text>
                            </View>
                          </View>
                        </View>
                        
                        <Text style={styles.loanCardProgress}>
                          {Math.round(loanProgress.progress * 100)}% Principal Paid
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
        <BlurView intensity={20} tint="dark" style={styles.mainCard}>
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
              <Text style={styles.emiLabel}>Upcoming EMI</Text>
              <Text style={styles.emiAmount}>
                {formatCurrency(stats.upcomingEMI)}
              </Text>
            </View>
          </View>
        </BlurView>

        {/* Global Statistics Breakdown */}
        <View style={styles.summaryRow}>
          <BlurView intensity={15} tint="dark" style={styles.summaryCard}>
            <View style={styles.cardContent}>
              <Text style={styles.summaryLabel}>Principal Paid</Text>
              <Text style={styles.summaryAmount}>
                {formatCurrency(stats.totalPrincipalPaid)}
              </Text>
              <Text style={styles.summarySubLabel}>
                Int: {formatCurrency(stats.totalInterestPaid)}
              </Text>
              <Text style={styles.summarySubLabelActive}>
                Total: {formatCurrency(stats.totalPaid)}
              </Text>
            </View>
          </BlurView>

          <BlurView intensity={15} tint="dark" style={styles.summaryCard}>
            <View style={styles.cardContent}>
              <Text style={styles.summaryLabel}>Active Loans</Text>
              <Text style={styles.summaryAmount}>{stats.pendingLoans}</Text>
              <Text style={styles.summarySubLabel}>
                In progress
              </Text>
            </View>
          </BlurView>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/loans')}
          >
            <BlurView intensity={20} tint="dark" style={styles.actionBlur}>
              <Text style={styles.actionButtonText}>View All Loans</Text>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/sync')}
          >
            <BlurView intensity={20} tint="dark" style={styles.actionBlur}>
              <Text style={[styles.actionButtonText, { color: '#4ade80' }]}>☁️ Cloud Backup & Sync</Text>
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
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  addButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  addButtonBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
  },
  addButtonText: {
    fontSize: 32,
    fontWeight: '300',
    color: '#4ade80',
    lineHeight: 32,
  },
  mainCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardContent: {
    padding: 24,
  },
  mainCardLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mainCardAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: '#ffffff',
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
    color: 'rgba(255, 255, 255, 0.6)',
  },
  emiAmount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4ade80',
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  summaryLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  summarySubLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 4,
  },
  summarySubLabelActive: {
    fontSize: 11,
    color: '#4ade80',
    marginTop: 2,
    fontWeight: '600',
  },
  dividerSmall: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValueMini: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionBlur: {
    padding: 18,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  carouselContainer: {
    marginBottom: 24,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  loanCardContent: {
    padding: 20,
  },
  loanCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  loanCardAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4ade80',
    marginBottom: 4,
  },
  loanCardLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loanProgressContainer: {
    marginBottom: 12,
  },
  loanProgressBar: {
    height: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  loanProgressFill: {
    height: '100%',
    backgroundColor: '#4ade80',
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
    color: '#4ade80',
    textAlign: 'center',
    marginTop: 8,
  },
});

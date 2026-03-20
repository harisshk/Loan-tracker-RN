import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BarChart, ProgressChart } from 'react-native-chart-kit';
import { calculateEMIBreakdown } from '../utils/emiCalculator';
import { getPayments, updateLoan, saveLoan, addPayment } from '../utils/storage';

const { width } = Dimensions.get('window');

export default function LoanDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const [extraPayments, setExtraPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  React.useEffect(() => {
    loadPayments();
  }, [params.id]);

  const loadPayments = async () => {
    const allP = await getPayments();
    setExtraPayments(allP.filter(p => p.loanId === params.id));
    setLoading(false);
  };

  // Parse loan data from params
  const loanType = params.loanType || 'emi';
  const loan = {
    loanName: params.loanName,
    principal: parseFloat(params.principal) || 0,
    interest: parseFloat(params.interest) || 0,
    emiAmount: parseFloat(params.emiAmount) || 0,
    tenure: parseInt(params.tenure) || 0,
    startDate: params.startDate,
    loanType,
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  // Calculate months elapsed
  const startDate = new Date(loan.startDate);
  const today = new Date();
  
  // Calculate base months difference
  let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                      (today.getMonth() - startDate.getMonth());
  
  // If current day is >= start day, we've completed this month's payment
  if (today.getDate() >= startDate.getDate()) {
    monthsElapsed += 1;
  }
  
  monthsElapsed = Math.max(0, monthsElapsed);

  // Calculate EMI breakdown using proper amortization
  // Use the user-provided EMI amount for accurate calculation
  const breakdown = calculateEMIBreakdown(
    loan.principal,
    loan.interest,
    loan.tenure,
    monthsElapsed,
    loan.emiAmount,
    params.loanType || 'emi',
    extraPayments
  );

  // Log calculation details for verification
  const currentMonth = today.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const paymentDueDay = startDate.getDate();
  const isCurrentMonthPaid = today.getDate() >= paymentDueDay;
  
  console.log('=== EMI Calculation Details ===');
  console.log('Principal:', loan.principal);
  console.log('Interest Rate:', loan.interest + '%');
  console.log('Tenure:', loan.tenure, 'months');
  console.log('User EMI Amount:', loan.emiAmount, '(using this for calculation)');
  console.log('---');
  console.log('Start Date:', startDate.toLocaleDateString('en-IN'));
  console.log('Today:', today.toLocaleDateString('en-IN'));
  console.log('Payment Due Day:', paymentDueDay + 'th of each month');
  console.log('Current Month (' + currentMonth + '):', isCurrentMonthPaid ? '✓ PAID (counted)' : '✗ NOT YET PAID');
  console.log('Months Elapsed:', monthsElapsed, '(payments counted)');
  console.log('---');
  console.log('Principal Paid:', breakdown.principalPaid.toFixed(2));
  console.log('Interest Paid:', breakdown.interestPaid.toFixed(2));
  console.log('Total Paid:', breakdown.totalPaid.toFixed(2));
  console.log('---');
  console.log('Remaining Principal:', breakdown.remainingPrincipalAmount.toFixed(2), '← This is AFTER', monthsElapsed, 'payments');
  console.log('Remaining Interest:', breakdown.remainingInterestAmount.toFixed(2));
  console.log('Total Remaining:', breakdown.remainingAmount.toFixed(2));
  console.log('---');
  console.log('Total Interest (Full Tenure):', breakdown.totalInterest.toFixed(2));
  console.log('Total Amount (Full Tenure):', breakdown.totalAmount.toFixed(2));
  console.log('===============================');

  const progress = loan.tenure > 0 ? breakdown.paymentsMade / loan.tenure : 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPayments();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      </LinearGradient>
    );
  }

  const handleCloseLoan = () => {
    // Only pay the remaining balance to completely close the loan
    router.push({
      pathname: '/renew-loan',
      params: {
        id: params.id,
        action: 'close',
        loanName: loan.loanName,
        remainingAmount: breakdown.remainingAmount, // Full P + I
      }
    });
  };

  const handleRenewLoan = () => {
    // Pay interest, set new principal, set new interest
    router.push({
      pathname: '/renew-loan',
      params: {
        id: params.id,
        action: 'renew',
        loanName: loan.loanName,
        remainingInterest: breakdown.remainingInterestAmount,
        oldPrincipal: loan.principal,
        oldInterestRate: loan.interest,
        oldMaturity: (() => {
          const m = new Date(loan.startDate);
          m.setMonth(m.getMonth() + parseInt(loan.tenure));
          return m.toISOString().split('T')[0];
        })(),
      }
    });
  };


  // Progress chart data
  const progressData = {
    labels: ['Paid', 'Remaining'],
    data: [progress, 1 - progress],
    colors: ['#10b981', '#e11d48'],
  };

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: 'rgba(255, 255, 255, 0.05)',
    backgroundGradientTo: 'rgba(255, 255, 255, 0.05)',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.8})`,
    style: {
      borderRadius: 30,
    },
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: 'rgba(0, 0, 0, 0.05)',
      strokeWidth: 1,
    },
    propsForLabels: {
      fontSize: 12,
      fontWeight: '600',
    },
  };

  const progressChartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: 'rgba(255, 255, 255, 0.05)',
    backgroundGradientTo: 'rgba(255, 255, 255, 0.05)',
    color: (opacity = 1, index) => {
      const colors = ['rgba(16, 185, 129, 1)', 'rgba(225, 29, 72, 1)'];
      return colors[index] || colors[0];
    },
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.8})`,
    strokeWidth: 2,
    style: {
      borderRadius: 30,
    },
  };

  return (
    <LinearGradient
      colors={['#f8fafc', '#f1f5f9', '#e2e8f0']}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#10b981"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => router.push({
                pathname: '/edit-loan',
                params: {
                  id: params.id,
                  loanName: loan.loanName,
                  principal: loan.principal,
                  interest: loan.interest,
                  emiAmount: loan.emiAmount,
                  tenure: loan.tenure,
                  startDate: loan.startDate,
                },
              })}
            >
              <Text style={styles.editButton}>Edit</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>{loan.loanName}</Text>
        </View>

        {/* Loan Summary Card */}
        <BlurView intensity={20} tint="light" style={styles.summaryCard}>
          <View style={styles.cardContent}>
            <Text style={styles.summaryLabel}>Total Loan Amount</Text>
            <Text style={styles.summaryAmount}>
              {formatCurrency(breakdown.totalAmount)}
            </Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>Principal</Text>
                <Text style={styles.summaryItemValue}>
                  {formatCurrency(loan.principal)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>Interest</Text>
                <Text style={[styles.summaryItemValue, styles.interestValue]}>
                  {formatCurrency(breakdown.totalInterest)}
                </Text>
              </View>
            </View>
          </View>
        </BlurView>

        {/* Amount Paid Breakdown */}
        <BlurView intensity={20} tint="light" style={styles.summaryCard}>
          <View style={styles.cardContent}>
            <Text style={styles.summaryLabel}>Total Paid Till Now</Text>
            <Text style={[styles.summaryAmount, { color: '#10b981' }]}>
              {formatCurrency(breakdown.totalPaid)}
            </Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>Principal Paid</Text>
                <Text style={styles.summaryItemValue}>
                  {formatCurrency(breakdown.principalPaid)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>Interest Paid</Text>
                <Text style={[styles.summaryItemValue, styles.interestValue]}>
                  {formatCurrency(breakdown.interestPaid)}
                </Text>
              </View>
            </View>
          </View>
        </BlurView>


        {/* Payment Progress — EMI loans only */}
        {loanType !== 'bullet' && (
          <BlurView intensity={20} tint="light" style={styles.chartCard}>
            <View style={styles.cardContent}>
              <Text style={styles.chartTitle}>Payment Progress</Text>
              <Text style={styles.chartSubtitle}>
                {breakdown.paymentsMade} of {loan.tenure} EMIs completed
              </Text>
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${progress * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {Math.round(progress * 100)}% Complete
                </Text>
              </View>
              <View style={styles.progressStats}>
                <View style={styles.progressStatItem}>
                  <View style={[styles.statDot, { backgroundColor: '#10b981' }]} />
                  <Text style={styles.statLabel}>Paid</Text>
                  <Text style={styles.statValue}>{breakdown.paymentsMade} EMIs</Text>
                </View>
                <View style={styles.progressStatItem}>
                  <View style={[styles.statDot, { backgroundColor: '#e11d48' }]} />
                  <Text style={styles.statLabel}>Remaining</Text>
                  <Text style={styles.statValue}>
                    {loan.tenure - breakdown.paymentsMade} EMIs
                  </Text>
                </View>
              </View>
            </View>
          </BlurView>
        )}

        {/* Loan Details */}
        <BlurView intensity={20} tint="light" style={styles.detailsCard}>
          <View style={styles.cardContent}>
            <Text style={styles.chartTitle}>{loanType === 'bullet' ? 'Bullet Loan Details' : 'EMI Details'}</Text>
            <View style={styles.detailsGrid}>
              {loanType === 'bullet' ? (
                <>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Loan Type</Text>
                    <Text style={[styles.detailValue, { color: '#f59e0b' }]}>Bullet / Gold</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Interest Rate</Text>
                    <Text style={styles.detailValue}>{loan.interest}% p.a.</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Tenure</Text>
                    <Text style={styles.detailValue}>{loan.tenure} months</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Lump Sum Due at Maturity</Text>
                    <Text style={[styles.detailValue, { color: '#e11d48' }]}>
                      {formatCurrency(breakdown.totalAmount)}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Extra Payments Made</Text>
                    <Text style={[styles.detailValue, { color: '#10b981' }]}>
                      {formatCurrency(breakdown.principalPaid)}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Remaining Balance</Text>
                    <Text style={[styles.detailValue, { color: '#e11d48' }]}>
                      {formatCurrency(breakdown.remainingAmount)}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Monthly EMI</Text>
                    <Text style={styles.detailValue}>
                      {formatCurrency(loan.emiAmount)}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Interest Rate</Text>
                    <Text style={styles.detailValue}>{loan.interest}% p.a.</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Tenure</Text>
                    <Text style={styles.detailValue}>{loan.tenure} months</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Total Paid</Text>
                    <Text style={[styles.detailValue, { color: '#10b981' }]}>
                      {formatCurrency(breakdown.totalPaid)}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Remaining Balance</Text>
                    <Text style={[styles.detailValue, { color: '#e11d48' }]}>
                      {formatCurrency(breakdown.remainingAmount)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </BlurView>

        {/* ── Bullet Loan Action Buttons ── */}
        {loanType === 'bullet' && params.status !== 'closed' && (
          <View style={styles.bulletActions}>
            <TouchableOpacity style={styles.actionBtnRenew} onPress={handleRenewLoan}>
              <Text style={styles.actionBtnText}>🔄 Renew / Roll Over</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnClose} onPress={handleCloseLoan}>
              <Text style={styles.actionBtnText}>✅ Close Loan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* View Schedule Button — EMI loans only */}
        {loanType !== 'bullet' && (
          <TouchableOpacity
            style={styles.scheduleButton}
            onPress={() => router.push({
              pathname: '/amortization',
              params: {
                loanName: loan.loanName,
                principal: loan.principal,
                interest: loan.interest,
                emiAmount: loan.emiAmount,
                tenure: loan.tenure,
                startDate: loan.startDate,
              },
            })}
          >
            <BlurView intensity={25} tint="light" style={styles.scheduleBlur}>
              <Text style={styles.scheduleButtonText}>
                📊 View Payment Schedule
              </Text>
              <Text style={styles.scheduleButtonSubtext}>
                See month-by-month breakdown
              </Text>
            </BlurView>
          </TouchableOpacity>
        )}
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
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  editButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#0f172a',
  },
  summaryCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  cardContent: {
    padding: 24,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  summaryItemLabel: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
    marginBottom: 6,
  },
  summaryItemValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10b981',
  },
  interestValue: {
    color: '#f59e0b',
  },
  chartCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  chartTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.6)',
    marginBottom: 20,
  },
  chartContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  chart: {
    borderRadius: 16,
  },
  progressContainer: {
    marginTop: 10,
  },
  progressBar: {
    height: 12,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
    textAlign: 'center',
    marginTop: 12,
  },
  progressStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  progressStatItem: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  detailsCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  detailsGrid: {
    gap: 12,
    marginTop: 16,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  detailLabel: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  scheduleButton: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    marginTop: 8,
  },
  scheduleBlur: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  scheduleButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 4,
  },
  scheduleButtonSubtext: {
    fontSize: 13,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  bulletActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionBtnRenew: {
    flex: 1,
    backgroundColor: '#38bdf8',
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  actionBtnClose: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});

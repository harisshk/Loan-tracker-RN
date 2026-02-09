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

const { width } = Dimensions.get('window');

export default function LoanDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  
  // Parse loan data from params
  const loan = {
    loanName: params.loanName,
    principal: parseFloat(params.principal) || 0,
    interest: parseFloat(params.interest) || 0,
    emiAmount: parseFloat(params.emiAmount) || 0,
    tenure: parseInt(params.tenure) || 0,
    startDate: params.startDate,
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
    loan.emiAmount  // Use user's EMI amount instead of recalculating
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

  const onRefresh = () => {
    setRefreshing(true);
    // Simulate recalculation (data is already recalculated on each render)
    setTimeout(() => {
      setRefreshing(false);
    }, 500);
  };

  // Chart data for Total Loan Breakdown
  const totalBreakdownData = {
    labels: ['Principal', 'Interest'],
    datasets: [
      {
        data: [loan.principal, breakdown.totalInterest],
      },
    ],
  };

  // Progress chart data
  const progressData = {
    labels: ['Paid', 'Remaining'],
    data: [progress, 1 - progress],
    colors: ['#4ade80', '#ef4444'],
  };

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: 'rgba(255, 255, 255, 0.05)',
    backgroundGradientTo: 'rgba(255, 255, 255, 0.05)',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(74, 222, 128, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.8})`,
    style: {
      borderRadius: 30,
    },
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: 'rgba(255, 255, 255, 0.1)',
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
      const colors = ['rgba(74, 222, 128, 1)', 'rgba(239, 68, 68, 1)'];
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
      colors={['#0a0a0a', '#1a1a2e', '#16213e']}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#4ade80"
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
        <BlurView intensity={20} tint="dark" style={styles.summaryCard}>
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
        <BlurView intensity={20} tint="dark" style={styles.summaryCard}>
          <View style={styles.cardContent}>
            <Text style={styles.summaryLabel}>Total Paid Till Now</Text>
            <Text style={[styles.summaryAmount, { color: '#4ade80' }]}>
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

        {/* Total Loan Breakdown Chart */}
        <BlurView intensity={20} tint="dark" style={styles.chartCard}>
          <View style={styles.cardContent}>
            <Text style={styles.chartTitle}>Total Loan Breakdown</Text>
            <Text style={styles.chartSubtitle}>
              Principal vs Interest in total loan
            </Text>
            <View style={styles.chartContainer}>
              <BarChart
                data={totalBreakdownData}
                width={width - 88}
                height={220}
                chartConfig={chartConfig}
                style={styles.chart}
                showValuesOnTopOfBars
                fromZero
                yAxisLabel="₹"
                yAxisSuffix=""
              />
            </View>
          </View>
        </BlurView>

        {/* Paid Amount Breakdown Chart */}
        <BlurView intensity={20} tint="dark" style={styles.chartCard}>
          <View style={styles.cardContent}>
            <Text style={styles.chartTitle}>Amount Paid Breakdown</Text>
            <Text style={styles.chartSubtitle}>
              How your {breakdown.paymentsMade} EMI payments were split
            </Text>
            <View style={styles.chartContainer}>
              <BarChart
                data={{
                  labels: ['Principal', 'Interest', 'Total'],
                  datasets: [{
                    data: [
                      breakdown.principalPaid,
                      breakdown.interestPaid,
                      breakdown.totalPaid
                    ],
                  }],
                }}
                width={width - 88}
                height={220}
                chartConfig={{
                  ...chartConfig,
                  color: (opacity = 1) => `rgba(74, 222, 128, ${opacity})`,
                }}
                style={styles.chart}
                showValuesOnTopOfBars
                fromZero
                yAxisLabel="₹"
                yAxisSuffix=""
              />
            </View>
          </View>
        </BlurView>

        {/* Payment Progress */}
        <BlurView intensity={20} tint="dark" style={styles.chartCard}>
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
                <View style={[styles.statDot, { backgroundColor: '#4ade80' }]} />
                <Text style={styles.statLabel}>Paid</Text>
                <Text style={styles.statValue}>{breakdown.paymentsMade} EMIs</Text>
              </View>
              <View style={styles.progressStatItem}>
                <View style={[styles.statDot, { backgroundColor: '#ef4444' }]} />
                <Text style={styles.statLabel}>Remaining</Text>
                <Text style={styles.statValue}>
                  {loan.tenure - breakdown.paymentsMade} EMIs
                </Text>
              </View>
            </View>
          </View>
        </BlurView>

        {/* EMI Details */}
        <BlurView intensity={20} tint="dark" style={styles.detailsCard}>
          <View style={styles.cardContent}>
            <Text style={styles.chartTitle}>EMI Details</Text>
            <View style={styles.detailsGrid}>
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
                <Text style={[styles.detailValue, { color: '#4ade80' }]}>
                  {formatCurrency(breakdown.totalPaid)}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Remaining Balance</Text>
                <Text style={[styles.detailValue, { color: '#ef4444' }]}>
                  {formatCurrency(breakdown.remainingAmount)}
                </Text>
              </View>
            </View>
          </View>
        </BlurView>

        {/* View Schedule Button */}
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
          <BlurView intensity={25} tint="dark" style={styles.scheduleBlur}>
            <Text style={styles.scheduleButtonText}>
              📊 View Payment Schedule
            </Text>
            <Text style={styles.scheduleButtonSubtext}>
              See month-by-month breakdown
            </Text>
          </BlurView>
        </TouchableOpacity>
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
    color: '#4ade80',
  },
  editButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ade80',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#ffffff',
  },
  summaryCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardContent: {
    padding: 24,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  summaryItemLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 6,
  },
  summaryItemValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4ade80',
  },
  interestValue: {
    color: '#fbbf24',
  },
  chartCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  chartTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ade80',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ade80',
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  detailsCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    color: 'rgba(255, 255, 255, 0.6)',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  scheduleButton: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 8,
  },
  scheduleBlur: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
  },
  scheduleButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4ade80',
    marginBottom: 4,
  },
  scheduleButtonSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
});

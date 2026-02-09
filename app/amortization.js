import React, { useState } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function AmortizationSchedule() {
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric',
    });
  };

  // Calculate months elapsed
  const startDate = new Date(loan.startDate);
  const today = new Date();
  
  let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                      (today.getMonth() - startDate.getMonth());
  
  if (today.getDate() >= startDate.getDate()) {
    monthsElapsed += 1;
  }
  
  monthsElapsed = Math.max(0, monthsElapsed);

  // Generate amortization schedule
  const generateSchedule = () => {
    const monthlyRate = loan.interest / 12 / 100;
    const schedule = [];
    let remainingPrincipal = loan.principal;

    for (let month = 1; month <= loan.tenure; month++) {
      const interestForMonth = remainingPrincipal * monthlyRate;
      const principalForMonth = loan.emiAmount - interestForMonth;
      
      const paymentDate = new Date(startDate);
      paymentDate.setMonth(paymentDate.getMonth() + month - 1);
      
      schedule.push({
        month,
        date: paymentDate,
        emi: loan.emiAmount,
        interest: interestForMonth,
        principal: principalForMonth,
        remainingPrincipal: remainingPrincipal - principalForMonth,
        isPaid: month <= monthsElapsed,
      });
      
      remainingPrincipal -= principalForMonth;
    }

    return schedule;
  };

  const schedule = generateSchedule();
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
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
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment Schedule</Text>
          <Text style={styles.headerSubtitle}>{loan.loanName}</Text>
        </View>

        {/* Summary Card */}
        <BlurView intensity={20} tint="dark" style={styles.summaryCard}>
          <View style={styles.cardContent}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Monthly EMI</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(loan.emiAmount)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Payments Made</Text>
                <Text style={[styles.summaryValue, { color: '#4ade80' }]}>
                  {monthsElapsed} / {loan.tenure}
                </Text>
              </View>
            </View>
          </View>
        </BlurView>

        {/* Schedule Table Header */}
        <BlurView intensity={25} tint="dark" style={styles.tableHeader}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableHeaderText, styles.colMonth]}>Month</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>Principal</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>Interest</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>EMI</Text>
            <Text style={[styles.tableHeaderText, styles.colBalance]}>Balance</Text>
          </View>
        </BlurView>

        {/* Schedule Table Rows */}
        {schedule.map((row, index) => (
          <BlurView
            key={row.month}
            intensity={row.isPaid ? 18 : 12}
            tint="dark"
            style={[
              styles.tableRowContainer,
              row.isPaid && styles.paidRow,
              index === schedule.length - 1 && styles.lastRow,
            ]}
          >
            <View style={styles.tableRow}>
              <View style={styles.colMonth}>
                <Text style={styles.monthText}>{row.month}</Text>
                {row.isPaid && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={[styles.tableText, styles.colAmount, styles.principalText]}>
                {formatCurrency(row.principal)}
              </Text>
              <Text style={[styles.tableText, styles.colAmount, styles.interestText]}>
                {formatCurrency(row.interest)}
              </Text>
              <Text style={[styles.tableText, styles.colAmount]}>
                {formatCurrency(row.emi)}
              </Text>
              <Text style={[styles.tableText, styles.colBalance, styles.balanceText]}>
                {formatCurrency(row.remainingPrincipal)}
              </Text>
            </View>
          </BlurView>
        ))}
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
  backButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ade80',
    marginBottom: 12,
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
  summaryCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardContent: {
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  tableHeader: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tableRowContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  paidRow: {
    borderColor: 'rgba(74, 222, 128, 0.15)',
    backgroundColor: 'rgba(74, 222, 128, 0.02)',
  },
  lastRow: {
    marginBottom: 20,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '500',
  },
  colMonth: {
    width: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  colAmount: {
    flex: 1,
    textAlign: 'right',
  },
  colBalance: {
    flex: 1.2,
    textAlign: 'right',
  },
  monthText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  checkMark: {
    fontSize: 10,
    color: '#4ade80',
  },
  principalText: {
    color: '#4ade80',
  },
  interestText: {
    color: '#fbbf24',
  },
  balanceText: {
    color: '#ef4444',
    fontWeight: '600',
  },
});

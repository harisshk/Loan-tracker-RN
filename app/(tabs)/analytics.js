import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { getLoans, getPayments, getInsurances } from '../../utils/storage';
import { calculateEMIBreakdown } from '../../utils/emiCalculator';
import { getTransactions, getBudgetLimit } from '../../utils/transactions';

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
  
  // Spend Analytics States
  const [activeTab, setActiveTab] = useState('loans'); // 'loans' | 'spends'
  const [spends, setSpends] = useState([]);
  const [budgetLimit, setBudgetLimit] = useState(50000);

  const loadData = useCallback(async () => {
    const [l, p, i, txs, limit] = await Promise.all([
      getLoans(),
      getPayments(),
      getInsurances(),
      getTransactions(),
      getBudgetLimit()
    ]);
    setLoans(l);
    setPayments(p);
    setInsurances(i);
    setSpends(txs);
    setBudgetLimit(limit);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const fc = (amount) =>
    `₹${parseFloat(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // 1. Memoized per-loan breakdowns
  const allBreakdowns = useMemo(() => {
    return loans.filter(l => l.status !== 'closed').map(loan => {
      const principal   = parseFloat(String(loan.principal).replace(/,/g, '')) || 0;
      const interest    = parseFloat(loan.interest)   || 0;
      const tenure      = parseInt(String(loan.tenure).replace(/,/g, '')) || 0;
      const emiAmount   = parseFloat(String(loan.emiAmount).replace(/,/g, '')) || 0;
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
  }, [loans, payments, today]);

  // 2. Filtered list
  const filtered = useMemo(() => {
    return loanFilter === 'all'
      ? allBreakdowns
      : allBreakdowns.filter(x => x.loanType === loanFilter);
  }, [allBreakdowns, loanFilter]);

  // 3. Aggregated Aggregates
  const stats = useMemo(() => {
    const totalPrincipal     = filtered.reduce((s, x) => s + x.principal, 0);
    const totalInterestAll   = filtered.reduce((s, x) => s + x.bd.totalInterest, 0);
    const totalOutstanding   = filtered.reduce((s, x) => s + x.bd.remainingPrincipalAmount, 0);
    const totalPaidAll       = filtered.reduce((s, x) => s + x.bd.totalPaid, 0);
    const totalPrincipalPaid = filtered.reduce((s, x) => s + x.bd.principalPaid, 0);
    const totalInterestPaid  = filtered.reduce((s, x) => s + x.bd.interestPaid, 0);
    const overallProgress    = totalPrincipal > 0 ? Math.min(1, totalPrincipalPaid / totalPrincipal) : 0;
    
    return {
      totalPrincipal,
      totalInterestAll,
      totalOutstanding,
      totalPaidAll,
      totalPrincipalPaid,
      totalInterestPaid,
      overallProgress
    };
  }, [filtered]);

  // 4. Monthly Forecast
  const monthlyForecast = useMemo(() => {
    const forecast = [];
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
        const premium = parseFloat(String(ins.premiumAmount).replace(/,/g, '')) || 0;
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

      forecast.push({
        label: fd.toLocaleDateString('en-IN', { month: 'short' }),
        amount: monthTotal,
      });
    }
    return forecast;
  }, [allBreakdowns, insurances, today]);

  const maxForecast = useMemo(() => Math.max(...monthlyForecast.map(x => x.amount), 1), [monthlyForecast]);

  // 5. Loan Shares
  const loanShares = useMemo(() => {
    return filtered
      .filter(x => x.bd.remainingPrincipalAmount > 0)
      .map(x => ({
        name: x.loan.loanName,
        remaining: x.bd.remainingPrincipalAmount,
        loanType: x.loanType,
        share: stats.totalOutstanding > 0 ? x.bd.remainingPrincipalAmount / stats.totalOutstanding : 0,
      }))
      .sort((a, b) => b.remaining - a.remaining);
  }, [filtered, stats.totalOutstanding]);

  // 6. Insurance Breakdown
  const insTypeBreakdown = useMemo(() => {
    const typeMap = {};
    insurances.forEach(ins => {
      const t = ins.insuranceType || 'other';
      const annual = ins.frequency === 'yearly'      ? 1 :
                     ins.frequency === 'half-yearly'  ? 2 :
                     ins.frequency === 'quarterly'    ? 4 : 12;
      const annualCost = (parseFloat(String(ins.premiumAmount).replace(/,/g, '')) || 0) * annual;
      if (!typeMap[t]) typeMap[t] = { count: 0, annual: 0 };
      typeMap[t].count++;
      typeMap[t].annual += annualCost;
    });
    const totalAnnual = Object.values(typeMap).reduce((s, v) => s + v.annual, 0);
    return Object.entries(typeMap)
      .map(([type, val]) => ({ type, ...val, totalAnnual, share: totalAnnual > 0 ? val.annual / totalAnnual : 0 }))
      .sort((a, b) => b.annual - a.annual);
  }, [insurances]);

  // 7. Smart Insights
  const insights = useMemo(() => {
    const list = [];
    if (stats.overallProgress > 0) {
      list.push({ icon: '🎯', color: '#10b981',
        text: `You've cleared ${Math.round(stats.overallProgress * 100)}% of${loanFilter !== 'all' ? ` ${loanFilter === 'bullet' ? 'Gold/Bullet' : 'EMI'}` : ''} principal` });
    }

    allBreakdowns.forEach(({ loan, loanType, maturityDate, bd }) => {
      if (loanType === 'bullet' && bd.remainingAmount > 0) {
        const days = Math.ceil((maturityDate - today) / 86400000);
        if (days <= 90 && days >= 0)
          list.push({ icon: '⚠️', color: '#e11d48',
            text: `"${loan.loanName}" matures in ${days} day${days !== 1 ? 's' : ''} — ${fc(bd.remainingAmount)} due` });
      }
    });

    let lastEMIDate = null;
    allBreakdowns.forEach(({ loan, loanType, tenure, bd }) => {
      if (loanType === 'emi' && bd.remainingAmount > 0) {
        const sd = new Date(loan.startDate);
        const end = new Date(sd.getFullYear(), sd.getMonth() + tenure, sd.getDate());
        if (!lastEMIDate || end > lastEMIDate) lastEMIDate = end;
      }
    });

    if (lastEMIDate)
      list.push({ icon: '🏁', color: '#38bdf8',
        text: `Last EMI loan ends ${lastEMIDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}` });

    if (stats.totalInterestAll > 0 && stats.totalPrincipal > 0)
      list.push({ icon: '💸', color: '#f59e0b',
        text: `You're paying ${((stats.totalInterestAll / stats.totalPrincipal) * 100).toFixed(1)}% extra as interest` });

    if (monthlyForecast[0]?.amount > 0)
      list.push({ icon: '📆', color: '#a78bfa',
        text: `This month's total obligation is ${fc(monthlyForecast[0].amount)}` });

    return list;
  }, [stats, loanFilter, allBreakdowns, today, monthlyForecast]);

  // 8. Spends Calculations & Cash Flow Projections
  const spendStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const todayDay = now.getDate();

    let inflow = 0;
    let outflow = 0;
    
    // Group categories
    const categoryTotals = {
      Salary: 0, Food: 0, Shopping: 0, EMI: 0, Bills: 0,
      Investment: 0, Entertainment: 0, Travel: 0, Other: 0
    };

    // Group modes
    const modeTotals = { UPI: 0, 'Credit Card': 0 };

    // Filter current month transactions
    const monthlyTxs = spends.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    monthlyTxs.forEach(t => {
      const amt = parseFloat(t.amount || 0);
      const isCredit = (t.type || '').toLowerCase() === 'credit';
      if (isCredit) {
        inflow += amt;
      } else {
        outflow += amt;
        const cat = t.category || 'Other';
        if (categoryTotals[cat] !== undefined) {
          categoryTotals[cat] += amt;
        } else {
          categoryTotals.Other += amt;
        }
        
        const m = t.mode === 'Credit Card' ? 'Credit Card' : 'UPI';
        modeTotals[m] += amt;
      }
    });

    const averageDailySpend = todayDay > 0 ? outflow / todayDay : 0;
    const projectedMonthEnd = averageDailySpend * daysInMonth;

    // Compile Pie Chart Data
    const categoryColors = {
      Salary: '#10b981', Food: '#fb923c', Shopping: '#ec4899',
      EMI: '#6366f1', Bills: '#3b82f6', Investment: '#8b5cf6',
      Entertainment: '#f43f5e', Travel: '#06b6d4', Other: '#64748b'
    };

    const pieData = Object.entries(categoryTotals)
      .filter(([name, total]) => total > 0 && name !== 'Salary')
      .map(([name, total]) => ({
        name: name,
        population: total,
        color: categoryColors[name] || '#64748b',
        legendFontColor: '#64748b',
        legendFontSize: 11,
      }))
      .sort((a, b) => b.population - a.population);

    // Calculate Cumulative Daily Actual & Projected curve
    const actualSpendsByDay = Array(daysInMonth + 1).fill(0);
    monthlyTxs.forEach(t => {
      if ((t.type || '').toLowerCase() !== 'credit') {
        const d = new Date(t.date);
        const day = d.getDate();
        if (day <= daysInMonth) {
          actualSpendsByDay[day] += parseFloat(t.amount || 0);
        }
      }
    });

    const cumulativeActual = [];
    let runningSum = 0;
    for (let d = 1; d <= todayDay; d++) {
      runningSum += actualSpendsByDay[d];
      cumulativeActual.push(runningSum);
    }

    const cumulativeProjected = [...cumulativeActual];
    let projectedRunningSum = runningSum;

    // Collect upcoming EMIs and their due dates
    const upcomingEMIsByDay = Array(daysInMonth + 1).fill(0);
    allBreakdowns.forEach(({ loan, loanType, emiAmount }) => {
      if (loanType === 'emi' && loan.startDate) {
        const dueDay = new Date(loan.startDate).getDate();
        if (dueDay <= daysInMonth) {
          upcomingEMIsByDay[dueDay] += emiAmount;
        }
      }
    });

    // Collect upcoming insurances due dates
    const upcomingInsurancesByDay = Array(daysInMonth + 1).fill(0);
    insurances.forEach(ins => {
      if (ins.startDate) {
        const dueDay = new Date(ins.startDate).getDate();
        const premium = parseFloat(String(ins.premiumAmount).replace(/,/g, '')) || 0;
        if (dueDay <= daysInMonth) {
          upcomingInsurancesByDay[dueDay] += premium;
        }
      }
    });

    for (let d = todayDay + 1; d <= daysInMonth; d++) {
      projectedRunningSum += averageDailySpend + upcomingEMIsByDay[d] + upcomingInsurancesByDay[d];
      cumulativeProjected.push(projectedRunningSum);
    }

    // For charts, select specific day intervals (e.g. Day 1, 5, 10, 15, 20, 25, 30)
    const sampleDays = [1, 5, 10, 15, 20, 25, daysInMonth];
    const chartLabels = sampleDays.map(d => `d${d}`);
    
    const chartActual = sampleDays.map(d => {
      if (d <= todayDay) return cumulativeActual[d - 1] || 0;
      return 0; // return 0 instead of null to prevent chartkit crash
    });

    const chartProjected = sampleDays.map(d => {
      if (d <= todayDay) return cumulativeActual[d - 1] || 0;
      const index = d - 1;
      return cumulativeProjected[index] || 0;
    });

    return {
      inflow,
      outflow,
      averageDailySpend,
      projectedMonthEnd,
      pieData,
      modeTotals,
      chartLabels,
      chartActual,
      chartProjected,
      daysInMonth,
      todayDay
    };
  }, [spends, allBreakdowns, insurances]);

  const screenWidth = Dimensions.get('window').width;

  const chartConfig = {
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.6,
    useShadowColorFromDataset: false,
    decimalPlaces: 0,
    labelColor: (opacity = 1) => `rgba(15, 23, 42, 0.6)`,
    propsForDots: {
      r: '4',
      strokeWidth: '1.5',
      stroke: '#ffffff',
    }
  };

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSubtitle}>Your financial snapshot</Text>
        </View>

        <View style={styles.segmentContainer}>
          <TouchableOpacity 
            style={[styles.segmentBtn, activeTab === 'loans' && styles.segmentBtnActive]} 
            onPress={() => setActiveTab('loans')}
          >
            <Ionicons name="cash-outline" size={16} color={activeTab === 'loans' ? '#fff' : '#64748b'} />
            <Text style={[styles.segmentBtnText, activeTab === 'loans' && styles.segmentBtnTextActive]}>
              Loans & Debt
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.segmentBtn, activeTab === 'spends' && styles.segmentBtnActive]} 
            onPress={() => setActiveTab('spends')}
          >
            <Ionicons name="pie-chart-outline" size={16} color={activeTab === 'spends' ? '#fff' : '#64748b'} />
            <Text style={[styles.segmentBtnText, activeTab === 'spends' && styles.segmentBtnTextActive]}>
              Spends & Forecast
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'loans' ? (
          <>
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

            <View style={styles.summaryRow}>
              <BlurView intensity={20} tint="light" style={styles.summaryCard}>
                <View style={styles.summaryCardInner}>
                  <Text style={styles.summaryLabel}>Outstanding (P)</Text>
                  <Text style={[styles.summaryValue, { color: '#e11d48' }]}>{fc(stats.totalOutstanding)}</Text>
                </View>
              </BlurView>
              <BlurView intensity={20} tint="light" style={styles.summaryCard}>
                <View style={styles.summaryCardInner}>
                  <Text style={styles.summaryLabel}>Outstanding (I)</Text>
                  <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>{fc(stats.totalInterestAll - stats.totalInterestPaid)}</Text>
                </View>
              </BlurView>
            </View>

            <View style={styles.summaryRow}>
              <BlurView intensity={20} tint="light" style={styles.summaryCard}>
                <View style={styles.summaryCardInner}>
                  <Text style={styles.summaryLabel}>Total Borrowed</Text>
                  <Text style={styles.summaryValue}>{fc(stats.totalPrincipal)}</Text>
                </View>
              </BlurView>
              <BlurView intensity={20} tint="light" style={styles.summaryCard}>
                <View style={styles.summaryCardInner}>
                  <Text style={styles.summaryLabel}>Total Paid</Text>
                  <Text style={[styles.summaryValue, { color: '#10b981' }]}>{fc(stats.totalPaidAll)}</Text>
                </View>
              </BlurView>
            </View>

            {filtered.length === 0 ? (
              <BlurView intensity={15} tint="light" style={styles.emptyCard}>
                <Text style={styles.emptyText}>No {loanFilter === 'bullet' ? 'Gold/Bullet' : loanFilter === 'emi' ? 'EMI' : ''} loans found</Text>
              </BlurView>
            ) : (
              <>
                <BlurView intensity={20} tint="light" style={styles.card}>
                  <View style={styles.cardInner}>
                    <Text style={styles.cardTitle}>Overall Debt Cleared</Text>
                    <Text style={styles.cardSubtitle}>Principal paid across filtered loans</Text>
                    <View style={styles.progressBarWrap}>
                      <View style={styles.progressBg}>
                        <View style={[styles.progressFill, { width: `${Math.round(stats.overallProgress * 100)}%` }]} />
                      </View>
                      <Text style={styles.progressLabel}>{Math.round(stats.overallProgress * 100)}%</Text>
                    </View>
                    <View style={styles.progressLegend}>
                      <View style={styles.legendItem}>
                        <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                        <Text style={styles.legendText}>Paid  {fc(stats.totalPrincipalPaid)}</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.dot, { backgroundColor: '#e2e8f0' }]} />
                        <Text style={styles.legendText}>Remaining  {fc(stats.totalPrincipal - stats.totalPrincipalPaid)}</Text>
                      </View>
                    </View>
                  </View>
                </BlurView>

                <BlurView intensity={20} tint="light" style={styles.card}>
                  <View style={styles.cardInner}>
                    <Text style={styles.cardTitle}>What You've Paid</Text>
                    <Text style={styles.cardSubtitle}>Principal vs Interest</Text>
                    {stats.totalPaidAll > 0 ? (
                      <>
                        <View style={styles.stackedBar}>
                          <View style={[styles.stackSeg, { flex: stats.totalPrincipalPaid || 1, backgroundColor: '#10b981' }]} />
                          <View style={[styles.stackSeg, { flex: stats.totalInterestPaid || 1, backgroundColor: '#f59e0b' }]} />
                        </View>
                        <View style={styles.compositionGrid}>
                          <View style={styles.compositionItem}>
                            <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                            <Text style={styles.compositionLabel}>Principal</Text>
                            <Text style={styles.compositionValue}>{fc(stats.totalPrincipalPaid)}</Text>
                          </View>
                          <View style={styles.compositionItem}>
                            <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
                            <Text style={styles.compositionLabel}>Interest</Text>
                            <Text style={styles.compositionValue}>{fc(stats.totalInterestPaid)}</Text>
                          </View>
                        </View>
                      </>
                    ) : <Text style={styles.emptyText}>No payment data yet.</Text>}
                  </View>
                </BlurView>

                {loanShares.length > 0 && (
                  <BlurView intensity={20} tint="light" style={styles.card}>
                    <View style={styles.cardInner}>
                      <Text style={styles.cardTitle}>Loan-wise Outstanding</Text>
                      <Text style={styles.cardSubtitle}>Share of remaining debt</Text>
                      {loanShares.map((ls, i) => (
                        <View key={i} style={styles.shareRow}>
                          <View style={styles.shareMeta}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <View style={[styles.dot, { backgroundColor: COLORS[i % COLORS.length] }]} />
                              <Text style={styles.shareName} numberOfLines={1}>{ls.name}</Text>
                            </View>
                            <Text style={styles.shareAmount}>{fc(ls.remaining)}</Text>
                          </View>
                          <View style={styles.shareBarBg}>
                            <View style={[styles.shareBarFill, { width: `${ls.share * 100}%`, backgroundColor: COLORS[i % COLORS.length] }]} />
                          </View>
                        </View>
                      ))}
                    </View>
                  </BlurView>
                )}

                {insTypeBreakdown.length > 0 && (
                  <BlurView intensity={20} tint="light" style={styles.card}>
                    <View style={styles.cardInner}>
                      <Text style={styles.cardTitle}>Insurance Distribution</Text>
                      <Text style={styles.cardSubtitle}>Annual premium breakdown by type</Text>
                      {insTypeBreakdown.map((item, i) => (
                        <View key={i} style={styles.shareRow}>
                          <View style={styles.shareMeta}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <View style={[styles.dot, { backgroundColor: item.color || COLORS[i % COLORS.length] }]} />
                              <Text style={styles.shareName} numberOfLines={1}>
                                {INS_TYPE_META[item.type]?.emoji} {INS_TYPE_META[item.type]?.label || item.type}
                              </Text>
                            </View>
                            <Text style={styles.shareAmount}>{fc(item.annual)}/yr</Text>
                          </View>
                          <View style={styles.shareBarBg}>
                            <View style={[styles.shareBarFill, { width: `${item.share * 100}%`, backgroundColor: item.color || COLORS[i % COLORS.length] }]} />
                          </View>
                        </View>
                      ))}
                      <View style={styles.totalInsRow}>
                        <Text style={styles.totalInsLabel}>Total Annual Premium</Text>
                        <Text style={styles.totalInsValue}>{fc(insTypeBreakdown[0].totalAnnual)}</Text>
                      </View>
                    </View>
                  </BlurView>
                )}
              </>
            )}

            {/* Forecast and Insights */}
            <BlurView intensity={20} tint="light" style={styles.card}>
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>6-Month Outflow</Text>
                <View style={styles.barChart}>
                  {monthlyForecast.map((m, i) => (
                    <View key={i} style={styles.barCol}>
                      <Text style={styles.barAmt}>₹{Math.round(m.amount / 1000)}k</Text>
                      <View style={styles.barWrap}><View style={[styles.bar, { height: (m.amount / maxForecast) * 110 || 4, backgroundColor: i === 0 ? '#10b981' : '#38bdf8' }]} /></View>
                      <Text style={styles.barLbl}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </BlurView>

            {insights.length > 0 && (
              <BlurView intensity={20} tint="light" style={[styles.card, { marginBottom: 40 }]}>
                <View style={styles.cardInner}>
                  <Text style={styles.cardTitle}>Smart Insights</Text>
                  <View style={{ gap: 12, marginTop: 10 }}>
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
          </>
        ) : (
          <>
            {spendStats.projectedMonthEnd > budgetLimit && (
              <View style={styles.warningAlert}>
                <Ionicons name="warning-outline" size={20} color="#e11d48" />
                <Text style={styles.warningAlertText}>
                  Warning: Projected spend ({fc(spendStats.projectedMonthEnd)}) is on track to exceed your monthly budget ({fc(budgetLimit)})!
                </Text>
              </View>
            )}

            <View style={styles.summaryRow}>
              <BlurView intensity={20} tint="light" style={styles.summaryCard}>
                <View style={styles.summaryCardInner}>
                  <Text style={styles.summaryLabel}>Total Inflow</Text>
                  <Text style={[styles.summaryValue, { color: '#10b981' }]}>{fc(spendStats.inflow)}</Text>
                </View>
              </BlurView>
              <BlurView intensity={20} tint="light" style={styles.summaryCard}>
                <View style={styles.summaryCardInner}>
                  <Text style={styles.summaryLabel}>Total Outflow</Text>
                  <Text style={[styles.summaryValue, { color: '#e11d48' }]}>{fc(spendStats.outflow)}</Text>
                </View>
              </BlurView>
            </View>

            <View style={styles.summaryRow}>
              <BlurView intensity={20} tint="light" style={styles.summaryCard}>
                <View style={styles.summaryCardInner}>
                  <Text style={styles.summaryLabel}>Daily Average</Text>
                  <Text style={styles.summaryValue}>{fc(spendStats.averageDailySpend)}</Text>
                </View>
              </BlurView>
              <BlurView intensity={20} tint="light" style={styles.summaryCard}>
                <View style={styles.summaryCardInner}>
                  <Text style={styles.summaryLabel}>Projected Outflow</Text>
                  <Text style={[styles.summaryValue, { color: spendStats.projectedMonthEnd > budgetLimit ? '#e11d48' : '#0f172a' }]}>
                    {fc(spendStats.projectedMonthEnd)}
                  </Text>
                </View>
              </BlurView>
            </View>

            {/* Cash Flow Forecast Chart */}
            <BlurView intensity={20} tint="light" style={styles.card}>
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>Cash Flow Forecast</Text>
                <Text style={styles.cardSubtitle}>Actual vs Projected Spends vs Budget</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <LineChart
                    data={{
                      labels: spendStats.chartLabels,
                      datasets: [
                        {
                          data: spendStats.chartActual,
                          color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                          strokeWidth: 3,
                        },
                        {
                          data: spendStats.chartProjected,
                          color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
                          strokeWidth: 2,
                          strokeDashArray: [5, 5],
                        },
                        {
                          data: Array(spendStats.chartLabels.length).fill(budgetLimit),
                          color: (opacity = 1) => `rgba(225, 29, 72, ${opacity})`,
                          strokeWidth: 1.5,
                          strokeDashArray: [3, 3],
                        }
                      ],
                      legend: ['Actual', 'Projected', 'Budget']
                    }}
                    width={Math.max(screenWidth - 80, 320)}
                    height={200}
                    chartConfig={chartConfig}
                    bezier
                    style={{
                      marginVertical: 8,
                      borderRadius: 16
                    }}
                  />
                </ScrollView>
              </View>
            </BlurView>

            {/* Category Spend Distribution */}
            {spendStats.pieData.length > 0 ? (
              <BlurView intensity={20} tint="light" style={styles.card}>
                <View style={styles.cardInner}>
                  <Text style={styles.cardTitle}>Category Breakdowns</Text>
                  <Text style={styles.cardSubtitle}>Distribution of monthly expenses</Text>
                  <PieChart
                    data={spendStats.pieData}
                    width={screenWidth - 80}
                    height={180}
                    chartConfig={chartConfig}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft="10"
                    absolute
                  />
                </View>
              </BlurView>
            ) : (
              <BlurView intensity={15} tint="light" style={styles.emptyCard}>
                <Text style={styles.emptyText}>No category expenses recorded this month</Text>
              </BlurView>
            )}

            {/* Payment Mode Splits */}
            {(spendStats.modeTotals.UPI > 0 || spendStats.modeTotals['Credit Card'] > 0) ? (
              <BlurView intensity={20} tint="light" style={[styles.card, { marginBottom: 40 }]}>
                <View style={styles.cardInner}>
                  <Text style={styles.cardTitle}>Payment Methods</Text>
                  <Text style={styles.cardSubtitle}>UPI vs Credit Card usage</Text>
                  <BarChart
                    data={{
                      labels: ['UPI', 'Credit Card'],
                      datasets: [{
                        data: [spendStats.modeTotals.UPI, spendStats.modeTotals['Credit Card']]
                      }]
                    }}
                    width={screenWidth - 80}
                    height={180}
                    chartConfig={{
                      ...chartConfig,
                      color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`
                    }}
                    yAxisLabel="₹"
                    yAxisSuffix=""
                    fromZero
                    style={{
                      marginVertical: 8,
                      borderRadius: 16
                    }}
                  />
                </View>
              </BlurView>
            ) : null}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },
  header: { marginBottom: 24 },
  backButton: { fontSize: 16, fontWeight: '600', color: '#10b981', marginBottom: 12 },
  headerTitle: { fontSize: 34, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 14, color: 'rgba(15,23,42,0.6)', marginTop: 4 },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  segmentBtnActive: {
    backgroundColor: '#10b981',
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  segmentBtnTextActive: {
    color: '#ffffff',
  },
  filterCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 16 },
  filterInner: { padding: 16 },
  filterLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase', marginBottom: 10 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', backgroundColor: '#ffffff' },
  filterBtnActive: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: '#10b981' },
  filterBtnText: { fontSize: 12, fontWeight: '600', color: 'rgba(15,23,42,0.6)' },
  filterBtnTextActive: { color: '#10b981' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  summaryCardInner: { padding: 16 },
  summaryLabel: { fontSize: 11, color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase', marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  card: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 16 },
  cardInner: { padding: 20 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: 'rgba(15,23,42,0.5)', marginBottom: 16 },
  emptyCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 32, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14, color: 'rgba(15,23,42,0.4)', textAlign: 'center' },
  progressBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  progressBg: { flex: 1, height: 14, backgroundColor: '#e2e8f0', borderRadius: 7, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10b981', borderRadius: 7 },
  progressLabel: { fontSize: 16, fontWeight: '700', color: '#10b981' },
  progressLegend: { gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, color: 'rgba(15,23,42,0.7)' },
  stackedBar: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 16, backgroundColor: '#e2e8f0' },
  stackSeg: { minWidth: 4 },
  compositionGrid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 12 },
  compositionItem: { flex: 1, alignItems: 'center', gap: 4 },
  compositionLabel: { fontSize: 11, color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase' },
  compositionValue: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  shareRow: { marginBottom: 14 },
  shareMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  shareName: { fontSize: 14, fontWeight: '600', color: '#0f172a', flex: 1 },
  shareAmount: { fontSize: 13, fontWeight: '600', color: 'rgba(15,23,42,0.7)' },
  shareBarBg: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  shareBarFill: { height: '100%', borderRadius: 4 },
  barChart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barAmt: { fontSize: 9, color: 'rgba(15,23,42,0.5)' },
  barWrap: { width: '100%', alignItems: 'center', height: 110, justifyContent: 'flex-end' },
  bar: { width: '60%', borderRadius: 4 },
  barLbl: { fontSize: 11, color: 'rgba(15,23,42,0.6)' },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 4 },
  insightIcon: { fontSize: 18 },
  insightText: { flex: 1, fontSize: 13, color: '#0f172a', lineHeight: 19 },
  totalInsRow: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', flexDirection: 'row', justifyContent: 'space-between' },
  totalInsLabel: { fontSize: 12, color: 'rgba(15,23,42,0.5)', fontWeight: '600' },
  totalInsValue: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  warningAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(225,29,72,0.1)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(225,29,72,0.2)',
  },
  warningAlertText: {
    color: '#e11d48',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});

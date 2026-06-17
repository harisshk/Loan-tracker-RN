import React, { useState, useEffect, useMemo } from 'react';
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
import { PieChart } from 'react-native-chart-kit';
import { getLoans, calculateLoanStats, getPayments, getInsurances } from '../../utils/storage';
import { getTransactions, getBudgetLimit, syncWithSupabase } from '../../utils/transactions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PulseSkeleton } from '../../components/ui/skeleton';

const { width } = Dimensions.get('window');

const fc = (amount: any) => {
  return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
};

const fd = (date: any) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
};

export default function DashboardView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loans, setLoans] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [insurances, setInsurances] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalOutstanding: 0,
    totalPrincipalPending: 0,
    totalInterestPending: 0,
    thisMonthEMIPaid: 0,
    thisMonthExtraPaid: 0,
    thisMonthTotalPaid: 0,
    thisMonthDueAmount: 0,
    thisMonthDueCount: 0,
    nextDueDate: null,
    nextPaymentAmount: 0,
    nextPaymentLoanName: '',
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spentThisMonth, setSpentThisMonth] = useState(0);
  const [budgetLimit, setBudgetLimit] = useState(50000);
  const [spends, setSpends] = useState<any[]>([]);

  const bulletUrgentCount = loans.filter((l: any) => {
    if (l.status === 'closed' || l.loanType !== 'bullet') return false;
    const start   = new Date(l.startDate);
    const tenure  = parseInt(l.tenure) || 0;
    const maturity = new Date(start.getFullYear(), start.getMonth() + tenure, start.getDate());
    const days = Math.ceil((maturity.getTime() - new Date().getTime()) / 86400000);
    return days >= 0 && days <= 90;
  }).length;

  const loadData = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const loansData = await getLoans();
      const paymentsData = await getPayments();
      const insurancesData = await getInsurances();
      setLoans(loansData);
      setPayments(paymentsData);
      setInsurances(insurancesData);
      
      const calculatedStats = calculateLoanStats(loansData, paymentsData, insurancesData);
      setStats(calculatedStats);

      // Load Spend Data
      const txs = await getTransactions();
      const limit = await getBudgetLimit();
      setBudgetLimit(limit);
      setSpends(txs);

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const currentMonthDebits = txs.filter((t: any) => {
        const d = new Date(t.date);
        return (t.type || '').toLowerCase() !== 'credit' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }).reduce((sum: number, t: any) => sum + parseFloat(t.amount || 0), 0);
      setSpentThisMonth(currentMonthDebits);

      // Silent sync
      syncWithSupabase().catch(e => console.warn('Silent sync failed:', e));
    } catch (e) {
      console.error('Error loading data on home:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        if (active) {
          await loadData(true);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  };

  // ─── Proactive Insights Logic ─────────────────
  const insights = useMemo(() => {
    const list = [];
    if (!loans.length) return ["✨ Add your first loan to see smart insights!"];
    
    let maxDate: any = null;
    loans.forEach((l: any) => {
      if (l.status === 'closed') return;
      const sd = new Date(l.startDate);
      const ed = new Date(sd.getFullYear(), sd.getMonth() + (parseInt(l.tenure) || 0), sd.getDate());
      if (!maxDate || ed > maxDate) maxDate = ed;
    });
    if (maxDate) {
      const diff = Math.ceil((maxDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      list.push(`🏁 Target: You will be debt-free in approx. ${diff} months!`);
    }

    const burn = stats.thisMonthDueAmount + (stats.totalOutstanding / 120);
    if (burn > 0) {
      const rw = (stats.totalOutstanding * 0.1) / burn; // Mock run
      if (rw > 0) list.push(`🛡️ Resilience: Your current runway is ${rw.toFixed(1)} months.`);
    }

    const highInt: any = [...loans].sort((a: any, b: any) => parseFloat(b.interest) - parseFloat(a.interest))[0];
    if (highInt && highInt.status !== 'closed') {
      list.push(`💡 Tip: Prepaying ₹5,000 extra on "${highInt.loanName}" saves high interest!`);
    }

    if (stats.thisMonthTotalPaid > 0) {
      list.push(`🔥 Great job! You've cleared ${fc(stats.thisMonthTotalPaid)} this month.`);
    }

    return list.length > 0 ? list : ["📊 Keep tracking to see personalized AI insights!"];
  }, [loans, stats]);

  const [activeInsight, setActiveInsight] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveInsight((prev) => (prev + 1) % insights.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [insights]);

  // ─── Analytics Section Data ───────────────────
  const ANALYTICS_COLORS = ['#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#e11d48', '#fb923c'];

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Loan share bars — use raw principal minus total extra payments as a quick estimate
  const loanSharesData = useMemo(() => {
    const activeLoans = loans.filter((l: any) => l.status !== 'closed');
    const items = activeLoans.map((loan: any, i: number) => {
      const principal = parseFloat(String(loan.principal).replace(/,/g, '')) || 0;
      const extraPaid = payments
        .filter((p: any) => p.loanId === loan.id)
        .reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0);
      const emiPaid = (() => {
        if (!loan.startDate) return 0;
        const sd = new Date(loan.startDate);
        const months = Math.max(0,
          (today.getFullYear() - sd.getFullYear()) * 12 + (today.getMonth() - sd.getMonth())
        );
        const emi = parseFloat(String(loan.emiAmount).replace(/,/g, '')) || 0;
        return emi * months;
      })();
      const remaining = Math.max(0, principal - extraPaid - emiPaid * 0.3);
      return { name: loan.loanName, remaining, color: ANALYTICS_COLORS[i % ANALYTICS_COLORS.length] };
    }).filter((x: any) => x.remaining > 0);

    const total = items.reduce((s: number, x: any) => s + x.remaining, 0);
    return items
      .map((x: any) => ({ ...x, share: total > 0 ? x.remaining / total : 0 }))
      .sort((a: any, b: any) => b.remaining - a.remaining)
      .slice(0, 5);
  }, [loans, payments, today]);

  // Spend category pie data for current month
  const spendPieData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const categoryColors: Record<string, string> = {
      Food: '#fb923c', Shopping: '#ec4899', EMI: '#6366f1',
      Bills: '#3b82f6', Investment: '#8b5cf6', Entertainment: '#f43f5e',
      Travel: '#06b6d4', Other: '#64748b',
    };
    const totals: Record<string, number> = {};
    spends.filter((t: any) => {
      const d = new Date(t.date);
      return (t.type || '').toLowerCase() !== 'credit' &&
        d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).forEach((t: any) => {
      const cat = t.category || 'Other';
      totals[cat] = (totals[cat] || 0) + parseFloat(t.amount || 0);
    });
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([name, population]) => ({
        name,
        population,
        color: categoryColors[name] || '#64748b',
        legendFontColor: '#64748b',
        legendFontSize: 11,
      }))
      .sort((a, b) => b.population - a.population)
      .slice(0, 6);
  }, [spends]);

  // Quick Action Array for Grid
  const QUICK_ACTIONS = [
    { id: 'spend', title: 'Spend\nTracker', icon: 'card-outline', color: '#ec4899', route: '/spend-tracker' },
    { id: 'ai', title: 'AI\nAdvisor', icon: 'sparkles-outline', color: '#7c3aed', route: '/ai-advisor' },
    { id: 'plan', title: 'Financial\nPlan', icon: 'trending-up', color: '#10b981', route: '/financial-plan' },
    { id: 'maturity', title: 'Maturity\nAlerts', icon: 'timer-outline', color: bulletUrgentCount > 0 ? '#e11d48' : '#f59e0b', route: '/maturity-alerts', badge: bulletUrgentCount },
    { id: 'compare', title: 'Loan\nLab', icon: 'git-compare-outline', color: '#10b981', route: '/compare-loans' },
    { id: 'debtfree', title: 'Debt-Free\nDate', icon: 'flag-outline', color: '#38bdf8', route: '/debt-free' },
    { id: 'analytics', title: 'Analytics\nHub', icon: 'pie-chart-outline', color: '#a78bfa', route: '/analytics' },
    { id: 'calendar', title: 'Payment\nCalendar', icon: 'calendar-outline', color: '#fb923c', route: '/calendar' },
    { id: 'loans', title: 'All\nLoans', icon: 'wallet-outline', color: '#64748b', route: '/loans' },
  ];

  const SECONDARY_ACTIONS = [
    { title: 'Add Insurance', icon: 'shield-checkmark', route: '/add-insurance' },
    { title: 'Extra Payments Log', icon: 'receipt-outline', route: '/history' },
  ];

  if (loading) {
    return (
      <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top, paddingHorizontal: 20 }]}>
          {/* Header */}
          <View style={[styles.headerRow, { paddingHorizontal: 0, marginTop: 10, marginBottom: 20, justifyContent: 'center' }]}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <PulseSkeleton width={120} height={32} borderRadius={8} style={{ marginBottom: 8 }} />
              <PulseSkeleton width={180} height={16} borderRadius={6} />
            </View>
          </View>

          {/* Insight Banner */}
          <View style={{ marginBottom: 20 }}>
            <PulseSkeleton height={48} borderRadius={16} />
          </View>

          {/* Hero Card */}
          <View style={{ backgroundColor: '#fff', borderRadius: 28, padding: 24, marginBottom: 26, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
            <PulseSkeleton width={120} height={14} borderRadius={4} style={{ marginBottom: 8 }} />
            <PulseSkeleton width={200} height={38} borderRadius={8} style={{ marginBottom: 20 }} />
            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 14 }} />
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <View style={{ flex: 1 }}>
                <PulseSkeleton width={80} height={12} borderRadius={4} style={{ marginBottom: 6 }} />
                <PulseSkeleton width={100} height={18} borderRadius={6} />
              </View>
              <View style={{ flex: 1 }}>
                <PulseSkeleton width={80} height={12} borderRadius={4} style={{ marginBottom: 6 }} />
                <PulseSkeleton width={100} height={18} borderRadius={6} />
              </View>
            </View>
          </View>

          {/* Activity Section */}
          <View style={{ marginBottom: 28 }}>
            <PulseSkeleton width={150} height={20} borderRadius={6} style={{ marginBottom: 14 }} />
            <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <View>
                  <PulseSkeleton width={60} height={12} borderRadius={4} style={{ marginBottom: 6 }} />
                  <PulseSkeleton width={80} height={18} borderRadius={6} />
                </View>
                <View>
                  <PulseSkeleton width={60} height={12} borderRadius={4} style={{ marginBottom: 6 }} />
                  <PulseSkeleton width={80} height={18} borderRadius={6} />
                </View>
                <View>
                  <PulseSkeleton width={60} height={12} borderRadius={4} style={{ marginBottom: 6 }} />
                  <PulseSkeleton width={80} height={18} borderRadius={6} />
                </View>
              </View>
              <PulseSkeleton height={8} borderRadius={4} style={{ marginBottom: 16 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <PulseSkeleton width={100} height={14} borderRadius={4} />
                <PulseSkeleton width={100} height={14} borderRadius={4} />
              </View>
            </View>
          </View>

          {/* Quick Access */}
          <View style={{ marginBottom: 28 }}>
            <PulseSkeleton width={120} height={20} borderRadius={6} style={{ marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <View key={i} style={{ width: '31.3%', height: 90, backgroundColor: '#fff', borderRadius: 20, padding: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
                  <PulseSkeleton width={32} height={32} borderRadius={10} style={{ marginBottom: 8 }} />
                  <PulseSkeleton width={50} height={10} borderRadius={3} />
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top, paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        {/* Header Section */}
        <View style={styles.headerRow}>
          <View style={{ width: 48 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.greeting}>Overview</Text>
            <Text style={styles.dateLabel}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
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

        {/* Intelligence Banner */}
        <TouchableOpacity style={styles.insightBanner} onPress={() => router.push('/ai-advisor')}>
          <BlurView intensity={25} tint="light" style={styles.insightBlur}>
            <View style={styles.insightIconWrap}>
              <Ionicons name="sparkles" size={14} color="#7c3aed" />
            </View>
            <Text style={styles.insightText} numberOfLines={1}>{insights[activeInsight]}</Text>
            <Ionicons name="chevron-forward" size={12} color="rgba(15,23,42,0.3)" />
          </BlurView>
        </TouchableOpacity>

        {/* Hero Card (Outstanding & Next Due) */}
        <LinearGradient
          colors={['#0f172a', '#1e293b']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroGlow1} />
          <View style={styles.heroGlow2} />
          
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroSubtitle}>Total Outstanding</Text>
              <Text style={styles.heroTitle}>{fc(stats.totalPrincipalPending)}</Text>
            </View>

            {/* Next Due Floating Box */}
            {stats.nextDueDate && (
              <View style={styles.heroNextDueBox}>
                <Text style={styles.nextDueLabel}>NEXT EMI • {fd(stats.nextDueDate)}</Text>
                <Text style={styles.nextDueAmount}>{fc(stats.nextPaymentAmount)}</Text>
              </View>
            )}
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroBottomRow}>
            <View style={styles.heroStatCol}>
              <Text style={styles.heroStatLabel}>Int. Pending</Text>
              <Text style={styles.heroStatValue}>{fc(stats.totalInterestPending)}</Text>
            </View>
            <View style={styles.heroStatCol}>
              <Text style={styles.heroStatLabel}>Total Payable</Text>
              <Text style={styles.heroStatValue}>{fc(stats.totalOutstanding)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Interest Savings Highlight Card */}
        {(stats as any).totalInterestSaved > 0 && (
          <View style={styles.savingsCardContainer}>
            <LinearGradient
              colors={['#065f46', '#047857']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.savingsCard}
            >
              <View style={styles.savingsContent}>
                <View style={styles.savingsIconWrap}>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.savingsLabel}>Total Interest Saved</Text>
                  <Text style={styles.savingsValue}>🎉 You saved {fc((stats as any).totalInterestSaved)} in interest!</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* This Month Spending (Segmented view) */}
        <View style={styles.monthSection}>
          <Text style={styles.sectionTitle}>This Month&apos;s Activity</Text>
          <BlurView intensity={30} tint="light" style={styles.monthCard}>
            
            {/* Payment Track */}
            <View style={styles.trackTop}>
              <View style={styles.trackCol}>
                <View style={[styles.trackDot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.trackLabel}>EMI Paid</Text>
                <Text style={styles.trackValue}>{fc(stats.thisMonthEMIPaid)}</Text>
              </View>
              <View style={styles.trackCol}>
                <View style={[styles.trackDot, { backgroundColor: '#8b5cf6' }]} />
                <Text style={styles.trackLabel}>Extra Paid</Text>
                <Text style={styles.trackValue}>{fc(stats.thisMonthExtraPaid)}</Text>
              </View>
              <View style={styles.trackCol}>
                <View style={[styles.trackDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.trackLabel}>Pending</Text>
                <Text style={styles.trackValue}>{fc(Math.max(0, stats.thisMonthDueAmount - stats.thisMonthTotalPaid))}</Text>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={[styles.progressFill, { width: stats.thisMonthDueAmount > 0 ? `${Math.min(100, (stats.thisMonthEMIPaid / stats.thisMonthDueAmount) * 100)}%` : '0%', backgroundColor: '#10b981' }]} />
              <View style={[styles.progressFill, { width: stats.thisMonthDueAmount > 0 ? `${Math.min(100, (stats.thisMonthExtraPaid / Math.max(1, stats.thisMonthDueAmount)) * 100)}%` : '0%', backgroundColor: '#8b5cf6' }]} />
            </View>

            <View style={styles.trackFooter}>
              <Text style={styles.footerLabel}>Total Cleared: <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{fc(stats.thisMonthTotalPaid)}</Text></Text>
              <Text style={styles.footerLabel}>Target: <Text style={{ color: '#0f172a', fontWeight: 'bold' }}>{fc(stats.thisMonthDueAmount)}</Text></Text>
            </View>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 14 }} />

            {/* Spend Budget Track */}
            <View style={styles.trackTop}>
              <View style={styles.trackCol}>
                <View style={[styles.trackDot, { backgroundColor: '#ec4899' }]} />
                <Text style={styles.trackLabel}>Spent This Month</Text>
                <Text style={styles.trackValue}>{fc(spentThisMonth)}</Text>
              </View>
              <View style={styles.trackCol}>
                <View style={[styles.trackDot, { backgroundColor: '#94a3b8' }]} />
                <Text style={styles.trackLabel}>Budget Limit</Text>
                <Text style={styles.trackValue}>{fc(budgetLimit)}</Text>
              </View>
              <View style={styles.trackCol}>
                <View style={[styles.trackDot, { backgroundColor: spentThisMonth > budgetLimit ? '#e11d48' : '#10b981' }]} />
                <Text style={styles.trackLabel}>Remaining</Text>
                <Text style={[styles.trackValue, { color: spentThisMonth > budgetLimit ? '#e11d48' : '#10b981' }]}>
                  {spentThisMonth > budgetLimit ? `Over by ${fc(spentThisMonth - budgetLimit)}` : fc(budgetLimit - spentThisMonth)}
                </Text>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={[styles.progressFill, { width: `${Math.min(100, (spentThisMonth / Math.max(1, budgetLimit)) * 100)}%`, backgroundColor: spentThisMonth > budgetLimit ? '#e11d48' : '#ec4899' }]} />
            </View>
          </BlurView>
        </View>

        {/* Quick Actions Grid */}
        <View style={styles.gridSection}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
          <View style={styles.gridContainer}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.gridBtnWrap}
                onPress={() => router.push(action.route as any)}
                activeOpacity={0.7}
              >
                <BlurView intensity={30} tint="light" style={styles.gridBtnFrame}>
                  <View style={[styles.iconCircle, { backgroundColor: action.color + '18' }]}>
                    <Ionicons name={action.icon as any} size={28} color={action.color} />
                    {action.badge !== undefined && action.badge > 0 && (
                      <View style={styles.badgeWrap}>
                        <Text style={styles.badgeText}>{action.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.gridBtnText}>{action.title}</Text>
                </BlurView>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Insurances Carousel */}
        {insurances.length > 0 && (
          <View style={styles.insurancesSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Active Insurances</Text>
              <TouchableOpacity onPress={() => router.push('/insurances')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.insurancesScroll}>
              {insurances.map(ins => (
                <BlurView key={ins.id} intensity={40} tint="light" style={styles.insCard}>
                  <View style={styles.insIconWrap}>
                    <Ionicons name="shield-checkmark" size={20} color="#f59e0b" />
                  </View>
                  <Text style={styles.insName} numberOfLines={1}>{ins.name}</Text>
                  <Text style={styles.insAmt}>{fc(ins.premiumAmount)}</Text>
                  <View style={styles.insDueBox}>
                    <Text style={styles.insDueLabel}>Due: {ins.nextDue ? fd(ins.nextDue) : 'N/A'}</Text>
                  </View>
                </BlurView>
              ))}
            </ScrollView>
          </View>
        )}

        {/* More Options / Secondary Actions */}
        <View style={styles.secondarySection}>
          <Text style={styles.sectionTitle}>More Tools</Text>
          <BlurView intensity={30} tint="light" style={styles.secondaryCard}>
            {SECONDARY_ACTIONS.map((act, i) => (
              <TouchableOpacity
                key={act.title}
                style={[styles.secRow, i !== SECONDARY_ACTIONS.length - 1 && styles.secRowBorder]}
                onPress={() => router.push(act.route as any)}
                activeOpacity={0.7}
              >
                <View style={styles.secIconWrap}>
                  <Ionicons name={act.icon as any} size={20} color="#64748b" />
                </View>
                <Text style={styles.secTitle}>{act.title}</Text>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>
            ))}
          </BlurView>
        </View>
        
        {/* Analytics Section */}
        <View style={styles.analyticsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Analytics</Text>
            <TouchableOpacity onPress={() => router.push('/analytics' as any)}>
              <Text style={styles.seeAllText}>Full View</Text>
            </TouchableOpacity>
          </View>

          {/* Loan Overview — outstanding share bars */}
          {loanSharesData.length > 0 && (
            <BlurView intensity={30} tint="light" style={styles.analyticsCard}>
              <Text style={styles.analyticsCardTitle}>Loan-wise Outstanding</Text>
              <Text style={styles.analyticsCardSubtitle}>Share of remaining principal</Text>
              {loanSharesData.map((ls: any, i: number) => (
                <View key={i} style={styles.analyticsShareRow}>
                  <View style={styles.analyticsShareMeta}>
                    <View style={[styles.analyticsDot, { backgroundColor: ls.color }]} />
                    <Text style={styles.analyticsShareName} numberOfLines={1}>{ls.name}</Text>
                    <Text style={styles.analyticsShareAmt}>
                      ₹{parseFloat(ls.remaining).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <View style={styles.analyticsBarBg}>
                    <View style={[styles.analyticsBarFill, { width: `${ls.share * 100}%`, backgroundColor: ls.color }]} />
                  </View>
                </View>
              ))}
            </BlurView>
          )}

          {/* Spend Category Pie */}
          {spendPieData.length > 0 ? (
            <BlurView intensity={30} tint="light" style={styles.analyticsCard}>
              <Text style={styles.analyticsCardTitle}>Spend Categories</Text>
              <Text style={styles.analyticsCardSubtitle}>This month&apos;s expense breakdown</Text>
              <PieChart
                data={spendPieData}
                width={width - 80}
                height={160}
                chartConfig={{
                  backgroundGradientFrom: '#ffffff',
                  backgroundGradientTo: '#ffffff',
                  backgroundGradientFromOpacity: 0,
                  backgroundGradientToOpacity: 0,
                  color: (opacity = 1) => `rgba(99,102,241,${opacity})`,
                  decimalPlaces: 0,
                  labelColor: (opacity = 1) => `rgba(15,23,42,${opacity})`,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="10"
                absolute
              />
            </BlurView>
          ) : (
            <BlurView intensity={30} tint="light" style={styles.analyticsCard}>
              <Text style={styles.analyticsCardTitle}>Spend Categories</Text>
              <Text style={[styles.analyticsCardSubtitle, { marginBottom: 0 }]}>
                No expense data recorded this month. Add transactions in Spend Tracker.
              </Text>
            </BlurView>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {},
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 24, marginTop: -10 },
  greeting: { fontSize: 32, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  dateLabel: { fontSize: 13, color: '#64748b', fontWeight: '500', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  addBtnWrap: { shadowColor: '#10b981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 10 },
  addBtnInside: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  heroCard: { marginHorizontal: 20, borderRadius: 28, padding: 24, overflow: 'hidden', marginBottom: 26, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 14 },
  heroGlow1: { position: 'absolute', top: -50, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(56,189,248,0.2)' },
  heroGlow2: { position: 'absolute', bottom: -50, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(16,185,129,0.15)' },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  heroTitle: { fontSize: 38, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  heroNextDueBox: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, alignItems: 'flex-end', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  nextDueLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '700', marginBottom: 2 },
  nextDueAmount: { fontSize: 18, fontWeight: '700', color: '#10b981' },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 20 },
  heroBottomRow: { flexDirection: 'row', gap: 24 },
  heroStatCol: { flex: 1 },
  heroStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  heroStatValue: { fontSize: 16, color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 14, paddingHorizontal: 20 },
  monthSection: { marginBottom: 28 },
  monthCard: { marginHorizontal: 20, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', overflow: 'hidden' },
  trackTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  trackCol: { alignItems: 'flex-start' },
  trackDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  trackLabel: { fontSize: 11, color: '#64748b', marginBottom: 2, fontWeight: '500' },
  trackValue: { fontSize: 16, color: '#0f172a', fontWeight: '700' },
  progressContainer: { height: 8, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 4, flexDirection: 'row', overflow: 'hidden', marginBottom: 14 },
  progressFill: { height: '100%' },
  trackFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', paddingTop: 12 },
  footerLabel: { fontSize: 12, color: '#64748b' },
  gridSection: { marginBottom: 28 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 15 },
  gridBtnWrap: { width: '33.33%', padding: 5 },
  gridBtnFrame: { paddingVertical: 18, paddingHorizontal: 10, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' },
  iconCircle: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  gridBtnText: { fontSize: 12, color: '#334155', fontWeight: '600', textAlign: 'center', lineHeight: 16 },
  badgeWrap: { position: 'absolute', top: -4, right: -4, backgroundColor: '#e11d48', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 4 },
  insurancesSection: { marginBottom: 28 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20, marginBottom: 14 },
  seeAllText: { fontSize: 13, fontWeight: '600', color: '#10b981' },
  insurancesScroll: { paddingHorizontal: 20, gap: 12 },
  insCard: { width: 140, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.5)' },
  insIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(245,158,11,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  insName: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  insAmt: { fontSize: 16, fontWeight: '700', color: '#f59e0b', marginBottom: 12 },
  insDueBox: { backgroundColor: 'rgba(0,0,0,0.04)', paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  insDueLabel: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  secondarySection: { paddingHorizontal: 20, marginBottom: 20 },
  secondaryCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  secRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  secRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  secIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  secTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#334155' },
  insightBanner: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(124,58,237,0.15)' },
  insightBlur: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'rgba(124,58,237,0.05)' },
  insightIconWrap: { width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.12)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  insightText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
  // Analytics section
  analyticsSection: { marginBottom: 28 },
  analyticsCard: { marginHorizontal: 20, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: 14 },
  analyticsCardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  analyticsCardSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 14 },
  analyticsShareRow: { marginBottom: 12 },
  analyticsShareMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  analyticsDot: { width: 8, height: 8, borderRadius: 4 },
  analyticsShareName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0f172a' },
  analyticsShareAmt: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  analyticsBarBg: { height: 6, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' },
  analyticsBarFill: { height: '100%', borderRadius: 3 },
  savingsCardContainer: { marginHorizontal: 20, marginBottom: 20, borderRadius: 20, overflow: 'hidden', shadowColor: '#10b981', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 8 },
  savingsCard: { padding: 14 },
  savingsContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  savingsIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  savingsLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.5 },
  savingsValue: { fontSize: 15, color: '#fff', fontWeight: '700', marginTop: 1 },
});

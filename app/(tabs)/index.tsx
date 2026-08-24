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
import { getLoans, calculateLoanStats, getPayments, getInsurances } from '../../utils/storage';
import { getTransactions, getBudgetLimit } from '../../utils/transactions';
import { getCategoryIcon } from '../../constants/categories';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PulseSkeleton } from '../../components/ui/skeleton';
import SidePanelDrawer from '../../components/SidePanelDrawer';

const { width } = Dimensions.get('window');

const fc = (amount: any) => {
  return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
};

const fd = (date: any) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    weekday: 'short',
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
  const [showAlerts, setShowAlerts] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const nextInsurance = useMemo(() => {
    if (!insurances || insurances.length === 0) return null;
    const sorted = [...insurances]
      .filter(ins => ins.nextDue)
      .sort((a, b) => new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime());
    return sorted[0] || null;
  }, [insurances]);

  const upcomingDues15Days = (stats as any).upcomingDuesList || [];
  const hasUpcomingAlerts = upcomingDues15Days.length > 0 || !!(stats.nextDueDate || nextInsurance);

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

      // Map nextDue date for dashboard display
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const mappedInsurances = insurancesData.map((ins: any) => {
        if (!ins.startDate) return { ...ins, nextDue: null };
        const start = new Date(ins.startDate);
        let step = 12;
        if (ins.frequency === 'monthly')     step = 1;
        if (ins.frequency === 'quarterly')   step = 3;
        if (ins.frequency === 'half-yearly') step = 6;

        let next = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        while (next < todayDate) {
          next.setMonth(next.getMonth() + step);
        }
        return { ...ins, nextDue: next };
      });
      setInsurances(mappedInsurances);
      
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
        return (t.type || '').toLowerCase() !== 'credit' &&
          t.category !== 'Credit Card Bill' &&
          t.calculate_budget !== false &&
          d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }).reduce((sum: number, t: any) => sum + parseFloat(t.amount || 0), 0);
      setSpentThisMonth(currentMonthDebits);

      // Transactions synced via getTransactions call above
    } catch (e) {
      console.error('Error loading data on home:', e);
    } finally {
      setLoading(false);
    }
  };
  const hasLoadedOnce = React.useRef(false);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        if (active) {
          await loadData(!hasLoadedOnce.current);
          hasLoadedOnce.current = true;
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
      <SidePanelDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top, paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        {/* Header Section */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.menuBtnWrap}
            onPress={() => setIsDrawerOpen(true)}
            activeOpacity={0.8}
          >
            <BlurView intensity={25} tint="light" style={styles.menuBtnInside}>
              <Ionicons name="menu-outline" size={22} color="#0f172a" />
            </BlurView>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.greeting}>Overview</Text>
            <Text style={styles.dateLabel}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.bellBtnWrap}
              onPress={() => setShowAlerts(prev => !prev)}
              activeOpacity={0.8}
            >
              <BlurView intensity={25} tint="light" style={styles.bellBtnInside}>
                <Ionicons name={showAlerts ? "notifications" : "notifications-outline"} size={20} color="#4f46e5" />
                {hasUpcomingAlerts && <View style={styles.bellBadge} />}
              </BlurView>
            </TouchableOpacity>
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
        </View>

        {/* Alerts Dropdown */}
        {showAlerts && (
          <BlurView intensity={40} tint="light" style={styles.alertsDropdown}>
            <View style={styles.alertsDropdownHeader}>
              <Text style={styles.alertsDropdownTitle}>📅 Dues Next 15 Days ({upcomingDues15Days.length})</Text>
              <TouchableOpacity onPress={() => setShowAlerts(false)}>
                <Text style={styles.alertsCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            
            {upcomingDues15Days.length > 0 ? (
              upcomingDues15Days.map((due: any, idx: number) => {
                const isIns = due.type === 'insurance';
                return (
                  <React.Fragment key={`${due.id}-${idx}`}>
                    {idx > 0 && <View style={styles.alertDivider} />}
                    <View style={styles.alertItem}>
                      <View style={[styles.alertIconBg, { backgroundColor: isIns ? 'rgba(245, 158, 11, 0.1)' : 'rgba(79, 70, 229, 0.1)' }]}>
                        <Ionicons name={isIns ? "shield-checkmark" : "analytics"} size={18} color={isIns ? "#f59e0b" : "#4f46e5"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.alertItemTitle}>{due.name}</Text>
                        <Text style={styles.alertItemSubtitle}>
                          Due: {fd(due.date)} ({due.daysLeft === 0 ? 'Today!' : due.daysLeft === 1 ? 'Tomorrow' : `${due.daysLeft} days away`})
                        </Text>
                      </View>
                      <Text style={[styles.alertItemAmount, { color: isIns ? '#f59e0b' : '#4f46e5' }]}>{fc(due.amount)}</Text>
                    </View>
                  </React.Fragment>
                );
              })
            ) : (
              <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: '#64748b' }}>No upcoming dues in the next 15 days 👍</Text>
              </View>
            )}
          </BlurView>
        )}

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
                <Text style={styles.nextDueLabel}>NEXT DUE • {fd(stats.nextDueDate)}</Text>
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



        
        {/* Repayment Roadmap Shortcut Banner */}
        <TouchableOpacity
          style={styles.roadmapBanner}
          onPress={() => router.push('/roadmap' as any)}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#4f46e5', '#6366f1', '#8b5cf6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.roadmapBannerGradient}
          >
            <View style={styles.roadmapBannerIconWrap}>
              <Ionicons name="map" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.roadmapBannerTitle}>Monthly Repayment Roadmap</Text>
              <Text style={styles.roadmapBannerSub}>View month-by-month total outstanding & payoff projection list</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

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
  alertsDropdown: {
    marginHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(79, 70, 229, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    overflow: 'hidden',
    marginBottom: 20,
    padding: 16,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  alertsDropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  alertsDropdownTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  alertsCloseBtn: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  alertIconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  alertItemSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  alertItemAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  alertPlaceholder: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 10,
    fontWeight: '500',
  },
  alertDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: 4,
  },
  bellBtnWrap: {
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  bellBtnInside: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.15)',
    overflow: 'hidden',
  },
  bellBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e11d48',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  menuBtnWrap: {
    width: 98,
    alignItems: 'flex-start',
  },
  menuBtnInside: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 98,
    justifyContent: 'flex-end',
  },
  roadmapBanner: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  roadmapBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  roadmapBannerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roadmapBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  roadmapBannerSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    marginTop: 2,
  },
});

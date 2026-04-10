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
import Config from '../utils/Config';
import { Ionicons } from '@expo/vector-icons';
import { getLoans, calculateLoanStats, getPayments, getInsurances } from '../utils/storage';
import { useNavigation } from 'expo-router';

const { width } = Dimensions.get('window');

const fc = (amount) => {
  return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
};

const fd = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
};

export default function Dashboard() {
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [insurances, setInsurances] = useState([]);
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
  const [refreshing, setRefreshing] = useState(false);

  const bulletUrgentCount = loans.filter(l => {
    if (l.status === 'closed' || l.loanType !== 'bullet') return false;
    const start   = new Date(l.startDate);
    const tenure  = parseInt(l.tenure) || 0;
    const maturity = new Date(start.getFullYear(), start.getMonth() + tenure, start.getDate());
    const days = Math.ceil((maturity - new Date()) / 86400000);
    return days >= 0 && days <= 90;
  }).length;

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

  useEffect(() => { loadData(); }, []);
  useFocusEffect(React.useCallback(() => { loadData(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // ─── Proactive Insights Logic ─────────────────
  const insights = useMemo(() => {
    const list = [];
    if (!loans.length) return ["✨ Add your first loan to see smart insights!"];
    
    // 1. Debt Free Target
    let maxDate = null;
    loans.forEach(l => {
      if (l.status === 'closed') return;
      const sd = new Date(l.startDate);
      const ed = new Date(sd.getFullYear(), sd.getMonth() + (parseInt(l.tenure) || 0), sd.getDate());
      if (!maxDate || ed > maxDate) maxDate = ed;
    });
    if (maxDate) {
      const diff = Math.ceil((maxDate - new Date()) / (1000 * 60 * 60 * 24 * 30.44));
      list.push(`🏁 Target: You will be debt-free in approx. ${diff} months!`);
    }

    // 2. Resilience Runway
    const burn = stats.thisMonthDueAmount + (stats.totalOutstanding / 120); // Rough burn estimate
    if (burn > 0) {
      // Simplified runway logic for dashboard
      const rw = (stats.totalPaidAll * 0.1) / burn; // Mock runway if no actual fund tracked yet
      if (rw > 0) list.push(`🛡️ Resilience: Your current runway is ${rw.toFixed(1)} months.`);
    }

    // 3. Saving Tip
    const highInt = [...loans].sort((a,b) => parseFloat(b.interest) - parseFloat(a.interest))[0];
    if (highInt && highInt.status !== 'closed') {
      list.push(`💡 Tip: Prepaying ₹5,000 extra on "${highInt.loanName}" saves high interest!`);
    }

    // 4. Encouragement
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

  // Quick Action Array for Grid
  const QUICK_ACTIONS = [
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
  // ──────────────────────────────────────────────

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        {/* Header Section */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={24} color="#64748b" />
          </TouchableOpacity>
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

        {/* This Month Spending (Segmented view) */}
        <View style={styles.monthSection}>
          <Text style={styles.sectionTitle}>This Month's Activity</Text>
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
                onPress={() => router.push(action.route)}
                activeOpacity={0.7}
              >
                <BlurView intensity={30} tint="light" style={styles.gridBtnFrame}>
                  <View style={[styles.iconCircle, { backgroundColor: action.color + '18' }]}>
                    <Ionicons name={action.icon} size={28} color={action.color} />
                    {action.badge > 0 && (
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
                onPress={() => router.push(act.route)}
                activeOpacity={0.7}
              >
                <View style={styles.secIconWrap}>
                  <Ionicons name={act.icon} size={20} color="#64748b" />
                </View>
                <Text style={styles.secTitle}>{act.title}</Text>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>
            ))}
          </BlurView>
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingTop: 60, paddingBottom: 40 },
  
  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 24 },
  greeting: { fontSize: 32, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  dateLabel: { fontSize: 13, color: '#64748b', fontWeight: '500', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  addBtnWrap: { shadowColor: '#10b981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 10 },
  addBtnInside: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },

  // Hero Card
  heroCard: { marginHorizontal: 20, borderRadius: 28, padding: 24, overflow: 'hidden', marginBottom: 26, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 14 },
  heroGlow1: { position: 'absolute', top: -50, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(56,189,248,0.2)', blurRadius: 40 },
  heroGlow2: { position: 'absolute', bottom: -50, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(16,185,129,0.15)', blurRadius: 40 },
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

  // Sections
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 14, paddingHorizontal: 20 },

  // Month summary
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

  // Grid
  gridSection: { marginBottom: 28 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 15 },
  gridBtnWrap: { width: '33.33%', padding: 5 },
  gridBtnFrame: { paddingVertical: 18, paddingHorizontal: 10, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' },
  iconCircle: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  gridBtnText: { fontSize: 12, color: '#334155', fontWeight: '600', textAlign: 'center', lineHeight: 16 },
  badgeWrap: { position: 'absolute', top: -4, right: -4, backgroundColor: '#e11d48', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 4 },

  // Insurances Carousel
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

  // Secondary Tools
  secondarySection: { paddingHorizontal: 20, marginBottom: 20 },
  secondaryCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  secRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  secRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  secIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  secTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#334155' },
  
  // Intelligence Banner
  insightBanner: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(124,58,237,0.15)' },
  insightBlur: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'rgba(124,58,237,0.05)' },
  insightIconWrap: { width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.12)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  insightText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
});

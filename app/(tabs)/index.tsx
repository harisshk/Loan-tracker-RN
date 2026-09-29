import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SidePanelDrawer from "../../components/SidePanelDrawer";
import { PulseSkeleton } from "../../components/ui/skeleton";
import { getBulletMaturityDate } from "../../utils/emiCalculator";
import {
  FinancialQuote,
  getCategoryTheme,
  getDailyQuote,
  getNextQuote,
} from "../../utils/quotes";
import {
  calculateLoanStats,
  getInsurances,
  getLoans,
  getPayments,
} from "../../utils/storage";
import { getBudgetLimit, getTransactions } from "../../utils/transactions";

const { width } = Dimensions.get("window");

// Formatting helpers
const fc = (amount: any) => {
  return `₹${parseFloat(amount || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
};

const fd = (date: any) => {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const getAuthorInitials = (name: string) => {
  if (!name) return "✨";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const LOAN_TYPE_META: Record<
  string,
  { icon: any; color: string; bg: string; label: string }
> = {
  bullet: {
    icon: "flash-outline",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.14)",
    label: "Bullet Loan",
  },
  home: {
    icon: "home-outline",
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.14)",
    label: "Home Loan",
  },
  car: {
    icon: "car-outline",
    color: "#ec4899",
    bg: "rgba(236, 72, 153, 0.14)",
    label: "Auto Loan",
  },
  personal: {
    icon: "person-outline",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.14)",
    label: "Personal Loan",
  },
  gold: {
    icon: "sparkles-outline",
    color: "#eab308",
    bg: "rgba(234, 179, 8, 0.14)",
    label: "Gold Loan",
  },
  education: {
    icon: "school-outline",
    color: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.14)",
    label: "Education Loan",
  },
  business: {
    icon: "briefcase-outline",
    color: "#06b6d4",
    bg: "rgba(6, 182, 212, 0.14)",
    label: "Business Loan",
  },
  other: {
    icon: "wallet-outline",
    color: "#64748b",
    bg: "rgba(100, 116, 139, 0.14)",
    label: "Loan",
  },
};

export default function DashboardView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Core Data States
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
    nextPaymentLoanName: "",
    totalInterestSaved: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spentThisMonth, setSpentThisMonth] = useState(0);
  const [budgetLimit, setBudgetLimit] = useState(50000);
  const [, setSpends] = useState<any[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [quote, setQuote] = useState<FinancialQuote>(() => getDailyQuote());

  // Quote interactions
  const handleNextQuote = (e?: any) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setQuote((prev) => getNextQuote(prev?.id));
  };

  // Insurance calculation
  const nextInsurance = useMemo(() => {
    if (!insurances || insurances.length === 0) return null;
    const sorted = [...insurances]
      .filter((ins) => ins.nextDue)
      .sort(
        (a, b) => new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime(),
      );
    return sorted[0] || null;
  }, [insurances]);

  const upcomingDues15Days = (stats as any).upcomingDuesList || [];
  const hasUpcomingAlerts =
    upcomingDues15Days.length > 0 || !!(stats.nextDueDate || nextInsurance);

  // Active loans list
  const activeLoans = useMemo(() => {
    return loans.filter((l) => l.status !== "closed");
  }, [loans]);

  // Load Data
  const loadData = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const [loansData, paymentsData, insurancesData, txs, limit] =
        await Promise.all([
          getLoans(),
          getPayments(),
          getInsurances(),
          getTransactions(),
          getBudgetLimit(),
        ]);

      setLoans(loansData);
      setPayments(paymentsData);
      setBudgetLimit(limit);
      setSpends(txs);

      // Map nextDue date for dashboard display
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const mappedInsurances = insurancesData.map((ins: any) => {
        if (!ins.startDate) return { ...ins, nextDue: null };
        const start = new Date(ins.startDate);
        let step = 12;
        if (ins.frequency === "monthly") step = 1;
        if (ins.frequency === "quarterly") step = 3;
        if (ins.frequency === "half-yearly") step = 6;

        let next = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate(),
        );
        while (next < todayDate) {
          next.setMonth(next.getMonth() + step);
        }
        return { ...ins, nextDue: next };
      });
      setInsurances(mappedInsurances);

      const calculatedStats = calculateLoanStats(
        loansData,
        paymentsData,
        insurancesData,
      );
      setStats(calculatedStats);

      // Calculate spends for current month
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const currentMonthDebits = txs
        .filter((t: any) => {
          const d = new Date(t.date);
          return (
            (t.type || "").toLowerCase() !== "credit" &&
            t.category !== "Credit Card Bill" &&
            t.calculate_budget !== false &&
            d.getMonth() === currentMonth &&
            d.getFullYear() === currentYear
          );
        })
        .reduce((sum: number, t: any) => sum + parseFloat(t.amount || 0), 0);
      setSpentThisMonth(currentMonthDebits);
    } catch (e) {
      console.error("Error loading dashboard data:", e);
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
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  };

  // Proactive Insights Logic
  const insights = useMemo(() => {
    const list = [];
    if (!loans.length)
      return ["✨ Add your first loan to see personalized insights!"];

    let maxDate: any = null;
    loans.forEach((l: any) => {
      if (l.status === "closed") return;
      const tenure = parseInt(l.tenure) || 0;
      const sd = new Date(l.startDate);
      const ed =
        l.loanType === "bullet"
          ? getBulletMaturityDate(l.startDate, tenure)
          : new Date(sd.getFullYear(), sd.getMonth() + tenure, sd.getDate());
      if (!maxDate || ed > maxDate) maxDate = ed;
    });

    if (maxDate) {
      const diff = Math.ceil(
        (maxDate.getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24 * 30.44),
      );
      if (diff > 0) {
        list.push(
          `🏁 Target: You will be debt-free in approx. ${diff} months!`,
        );
      }
    }

    const burn = stats.thisMonthDueAmount + stats.totalOutstanding / 120;
    if (burn > 0) {
      const rw = (stats.totalOutstanding * 0.1) / burn;
      if (rw > 0) {
        list.push(
          `🛡️ Resilience: Your estimated safety runway is ${rw.toFixed(1)} months.`,
        );
      }
    }

    const highInt: any = [...loans].sort(
      (a: any, b: any) => parseFloat(b.interest) - parseFloat(a.interest),
    )[0];
    if (highInt && highInt.status !== "closed") {
      list.push(
        `💡 Prepaying ₹5,000 extra on "${highInt.loanName}" saves the highest interest!`,
      );
    }

    if (stats.thisMonthTotalPaid > 0) {
      list.push(
        `🔥 Great work! You cleared ${fc(stats.thisMonthTotalPaid)} in repayments this month.`,
      );
    }

    return list.length > 0
      ? list
      : ["📊 Keep tracking payments to unlock personalized insights!"];
  }, [loans, stats]);

  // Insights auto-rotate
  const [activeInsight, setActiveInsight] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveInsight((prev) => (prev + 1) % insights.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [insights]);

  // Quote auto-rotate
  useEffect(() => {
    const quoteTimer = setInterval(() => {
      setQuote((prev) => getNextQuote(prev?.id));
    }, 12000);
    return () => clearInterval(quoteTimer);
  }, []);

  // Loan calculation helper
  const getLoanRemainingPrincipal = (loan: any) => {
    const principal = parseFloat(String(loan.principal).replace(/,/g, "")) || 0;
    const extraPaid = payments
      .filter((p) => p.loanId === loan.id)
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0);

    const sd = loan.startDate ? new Date(loan.startDate) : new Date();
    const today = new Date();
    const months = Math.max(
      0,
      (today.getFullYear() - sd.getFullYear()) * 12 +
        (today.getMonth() - sd.getMonth()),
    );
    const emi = parseFloat(String(loan.emiAmount).replace(/,/g, "")) || 0;
    const emiPaidEstimate = emi * months * 0.3;
    return Math.max(0, principal - extraPaid - emiPaidEstimate);
  };

  // ── SKELETON PLACEHOLDER ──────────────────────────────────────────────
  if (loading) {
    return (
      <LinearGradient
        colors={["#f8fafc", "#f1f5f9", "#e2e8f0"]}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 10, paddingHorizontal: 20 },
          ]}
        >
          {/* Header Skeleton */}
          <View
            style={[
              styles.headerRow,
              { paddingHorizontal: 0, marginBottom: 20 },
            ]}
          >
            <PulseSkeleton width={42} height={42} borderRadius={21} />
            <View style={{ alignItems: "center" }}>
              <PulseSkeleton
                width={130}
                height={24}
                borderRadius={6}
                style={{ marginBottom: 6 }}
              />
              <PulseSkeleton width={90} height={14} borderRadius={4} />
            </View>
            <PulseSkeleton width={42} height={42} borderRadius={21} />
          </View>

          {/* Insight Pill Skeleton */}
          <PulseSkeleton
            height={46}
            borderRadius={16}
            style={{ marginBottom: 20 }}
          />

          {/* Hero Card Skeleton */}
          <View style={styles.heroSkeletonCard}>
            <PulseSkeleton
              width={130}
              height={14}
              borderRadius={4}
              style={{ marginBottom: 10 }}
            />
            <PulseSkeleton
              width={220}
              height={40}
              borderRadius={8}
              style={{ marginBottom: 20 }}
            />
            <View
              style={{
                height: 1,
                backgroundColor: "rgba(0,0,0,0.05)",
                marginVertical: 14,
              }}
            />
            <View style={{ flexDirection: "row", gap: 20 }}>
              <PulseSkeleton width={100} height={32} borderRadius={6} />
              <PulseSkeleton width={100} height={32} borderRadius={6} />
            </View>
          </View>

          {/* Activity Skeleton */}
          <PulseSkeleton
            height={160}
            borderRadius={24}
            style={{ marginBottom: 24 }}
          />

          {/* Loans Carousel Skeleton */}
          <PulseSkeleton
            width={140}
            height={18}
            borderRadius={6}
            style={{ marginBottom: 14 }}
          />
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
            <PulseSkeleton
              width={width * 0.65}
              height={140}
              borderRadius={22}
            />
            <PulseSkeleton
              width={width * 0.25}
              height={140}
              borderRadius={22}
            />
          </View>

          {/* Quote Skeleton */}
          <PulseSkeleton
            height={130}
            borderRadius={24}
            style={{ marginBottom: 24 }}
          />
        </ScrollView>
      </LinearGradient>
    );
  }

  // ── MAIN RENDER ───────────────────────────────────────────────────────
  return (
    <LinearGradient
      colors={["#f8fafc", "#f1f5f9", "#e2e8f0"]}
      style={styles.container}
    >
      <SidePanelDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      {/* Quick Add Bottom Sheet Modal */}
      <Modal
        visible={isAddMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddMenuOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIsAddMenuOpen(false)}
        >
          <BlurView
            intensity={35}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            style={styles.modalCardWrap}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalCardHeader}>
              <View>
                <Text style={styles.modalTitle}>Quick Add</Text>
                <Text style={styles.modalSubtitle}>
                  Choose an action to proceed
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsAddMenuOpen(false)}
                style={styles.modalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalOptionsContainer}>
              {/* Option 1: Add Loan */}
              <TouchableOpacity
                style={styles.modalOptionItem}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch {}
                  setIsAddMenuOpen(false);
                  router.push("/add-loan");
                }}
                activeOpacity={0.75}
              >
                <LinearGradient
                  colors={["#10b981", "#059669"]}
                  style={styles.modalOptionIcon}
                >
                  <Ionicons name="wallet-outline" size={22} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalOptionTitle}>Add New Loan</Text>
                  <Text style={styles.modalOptionSub}>
                    Personal, EMI, Gold, Home, or Bullet loan
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </TouchableOpacity>

              {/* Option 2: Add Insurance */}
              <TouchableOpacity
                style={styles.modalOptionItem}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch {}
                  setIsAddMenuOpen(false);
                  router.push("/add-insurance");
                }}
                activeOpacity={0.75}
              >
                <LinearGradient
                  colors={["#f59e0b", "#d97706"]}
                  style={styles.modalOptionIcon}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={22}
                    color="#fff"
                  />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalOptionTitle}>Add Insurance</Text>
                  <Text style={styles.modalOptionSub}>
                    Life, Health, Term, Vehicle, or Property
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </TouchableOpacity>

              {/* Option 3: Add Expense */}
              <TouchableOpacity
                style={styles.modalOptionItem}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch {}
                  setIsAddMenuOpen(false);
                  router.push("/add-transaction");
                }}
                activeOpacity={0.75}
              >
                <LinearGradient
                  colors={["#8b5cf6", "#6d28d9"]}
                  style={styles.modalOptionIcon}
                >
                  <Ionicons name="receipt-outline" size={22} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalOptionTitle}>
                    Add Expense / Income
                  </Text>
                  <Text style={styles.modalOptionSub}>
                    Daily spending, repayment, or credit entry
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 6, paddingBottom: 40 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#10b981"
          />
        }
      >
        {/* ── 1. HEADER ROW ─────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setIsDrawerOpen(true)}
            activeOpacity={0.8}
          >
            <BlurView intensity={30} tint="light" style={styles.headerIconBlur}>
              <Ionicons name="menu-outline" size={22} color="#0f172a" />
            </BlurView>
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.headerTitle}>Financial Overview</Text>
            <Text style={styles.headerSubtitle}>
              {new Date().toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => setShowAlerts((prev) => !prev)}
              activeOpacity={0.8}
            >
              <BlurView
                intensity={30}
                tint="light"
                style={styles.headerIconBlur}
              >
                <Ionicons
                  name={showAlerts ? "notifications" : "notifications-outline"}
                  size={20}
                  color="#4f46e5"
                />
                {hasUpcomingAlerts && <View style={styles.bellBadge} />}
              </BlurView>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addBtnWrap}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch {}
                setIsAddMenuOpen(true);
              }}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#10b981", "#059669"]}
                style={styles.addBtnInside}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 2. UPCOMING DUES DROPDOWN ────────────────────────── */}
        {showAlerts && (
          <BlurView intensity={40} tint="light" style={styles.alertsDropdown}>
            <View style={styles.alertsDropdownHeader}>
              <Text style={styles.alertsDropdownTitle}>
                📅 Dues Next 15 Days ({upcomingDues15Days.length})
              </Text>
              <TouchableOpacity onPress={() => setShowAlerts(false)}>
                <Text style={styles.alertsCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>

            {upcomingDues15Days.length > 0 ? (
              upcomingDues15Days.map((due: any, idx: number) => {
                const isIns = due.type === "insurance";
                return (
                  <React.Fragment key={`${due.id}-${idx}`}>
                    {idx > 0 && <View style={styles.alertDivider} />}
                    <View style={styles.alertItem}>
                      <View
                        style={[
                          styles.alertIconBg,
                          {
                            backgroundColor: isIns
                              ? "rgba(245, 158, 11, 0.12)"
                              : "rgba(79, 70, 229, 0.12)",
                          },
                        ]}
                      >
                        <Ionicons
                          name={isIns ? "shield-checkmark" : "wallet"}
                          size={18}
                          color={isIns ? "#f59e0b" : "#4f46e5"}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.alertItemTitle}>{due.name}</Text>
                        <Text style={styles.alertItemSubtitle}>
                          Due: {fd(due.date)} •{" "}
                          <Text
                            style={{
                              fontWeight: "700",
                              color: due.daysLeft === 0 ? "#e11d48" : "#64748b",
                            }}
                          >
                            {due.daysLeft === 0
                              ? "Today!"
                              : due.daysLeft === 1
                                ? "Tomorrow"
                                : `in ${due.daysLeft} days`}
                          </Text>
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.alertItemAmount,
                          { color: isIns ? "#f59e0b" : "#4f46e5" },
                        ]}
                      >
                        {fc(due.amount)}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })
            ) : (
              <View style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: "#64748b" }}>
                  🎉 No upcoming dues in the next 15 days!
                </Text>
              </View>
            )}
          </BlurView>
        )}

        {/* ── 3. AI ADVISOR INSIGHT BANNER ────────────────────── */}
        <TouchableOpacity
          style={styles.insightBanner}
          onPress={() => router.push("/ai-advisor")}
          activeOpacity={0.85}
        >
          <BlurView intensity={30} tint="light" style={styles.insightBlur}>
            <View style={styles.insightIconWrap}>
              <Ionicons name="sparkles" size={14} color="#7c3aed" />
            </View>
            <Text style={styles.insightText} numberOfLines={1}>
              {insights[activeInsight]}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color="rgba(15,23,42,0.3)"
            />
          </BlurView>
        </TouchableOpacity>

        {/* ── 4. PRIMARY HERO CARD (PORTFOLIO NET OUTSTANDING) ─── */}
        <LinearGradient
          colors={["#0b0f19", "#161f30"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          {/* Ambient Diffuse Glows */}
          <View style={styles.heroGlow1} />
          <View style={styles.heroGlow2} />

          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroSubtitle}>Net Outstanding Debt</Text>
              <Text style={styles.heroTitle}>
                {fc(stats.totalPrincipalPending)}
              </Text>
            </View>

            {/* Next Due Floating Box */}
            {stats.nextDueDate ? (
              <View style={styles.heroNextDueBox}>
                <Text style={styles.nextDueLabel}>
                  NEXT DUE • {fd(stats.nextDueDate)}
                </Text>
                <Text style={styles.nextDueAmount}>
                  {fc(stats.nextPaymentAmount)}
                </Text>
              </View>
            ) : (
              <View style={styles.heroAllClearBox}>
                <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                <Text style={styles.heroAllClearText}>All Clear</Text>
              </View>
            )}
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroBottomRow}>
            <View style={styles.heroStatCol}>
              <Text style={styles.heroStatLabel}>Int. Pending</Text>
              <Text style={styles.heroStatValue}>
                {fc(stats.totalInterestPending)}
              </Text>
            </View>
            <View style={styles.heroStatCol}>
              <Text style={styles.heroStatLabel}>Total Payable</Text>
              <Text style={styles.heroStatValue}>
                {fc(stats.totalOutstanding)}
              </Text>
            </View>
            {(stats as any).totalInterestSaved > 0 && (
              <View style={styles.heroStatCol}>
                <Text style={styles.heroStatLabel}>Interest Saved</Text>
                <Text style={[styles.heroStatValue, { color: "#10b981" }]}>
                  {fc((stats as any).totalInterestSaved)}
                </Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* ── 5. QUICK SHORTCUTS HUB ───────────────────────────── */}
        <View style={styles.shortcutsRow}>
          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => router.push("/roadmap" as any)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#4f46e5", "#6366f1"]}
              style={styles.shortcutIconBox}
            >
              <Ionicons name="map" size={18} color="#fff" />
            </LinearGradient>
            <Text style={styles.shortcutLabel}>Roadmap</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => router.push("/spend-tracker" as any)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#ec4899", "#db2777"]}
              style={styles.shortcutIconBox}
            >
              <Ionicons name="pie-chart" size={18} color="#fff" />
            </LinearGradient>
            <Text style={styles.shortcutLabel}>Spends</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => router.push("/ai-advisor" as any)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#7c3aed", "#9333ea"]}
              style={styles.shortcutIconBox}
            >
              <Ionicons name="sparkles" size={18} color="#fff" />
            </LinearGradient>
            <Text style={styles.shortcutLabel}>AI Advisor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => router.push("/compare-loans" as any)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#0ea5e9", "#0284c7"]}
              style={styles.shortcutIconBox}
            >
              <Ionicons name="git-compare-outline" size={18} color="#fff" />
            </LinearGradient>
            <Text style={styles.shortcutLabel}>Compare</Text>
          </TouchableOpacity>
        </View>

        {/* ── 6. CASHFLOW & BUDGET BENTO BOX ───────────────────── */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Monthly Cashflow</Text>
          <BlurView intensity={35} tint="light" style={styles.bentoCard}>
            {/* Repayment Tracker */}
            <View style={styles.trackHeaderRow}>
              <View style={styles.trackCol}>
                <View
                  style={[styles.trackDot, { backgroundColor: "#10b981" }]}
                />
                <Text style={styles.trackLabel}>EMI Paid</Text>
                <Text style={styles.trackValue}>
                  {fc(stats.thisMonthEMIPaid)}
                </Text>
              </View>
              <View style={styles.trackCol}>
                <View
                  style={[styles.trackDot, { backgroundColor: "#8b5cf6" }]}
                />
                <Text style={styles.trackLabel}>Prepayments</Text>
                <Text style={styles.trackValue}>
                  {fc(stats.thisMonthExtraPaid)}
                </Text>
              </View>
              <View style={styles.trackCol}>
                <View
                  style={[
                    styles.trackDot,
                    {
                      backgroundColor:
                        stats.thisMonthDueAmount - stats.thisMonthTotalPaid > 0
                          ? "#f59e0b"
                          : "#10b981",
                    },
                  ]}
                />
                <Text style={styles.trackLabel}>Remaining</Text>
                <Text style={styles.trackValue}>
                  {fc(
                    Math.max(
                      0,
                      stats.thisMonthDueAmount - stats.thisMonthTotalPaid,
                    ),
                  )}
                </Text>
              </View>
            </View>

            {/* Repayment Dual Progress Bar */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width:
                      stats.thisMonthDueAmount > 0
                        ? `${Math.min(100, (stats.thisMonthEMIPaid / stats.thisMonthDueAmount) * 100)}%`
                        : "0%",
                    backgroundColor: "#10b981",
                  },
                ]}
              />
              <View
                style={[
                  styles.progressFill,
                  {
                    width:
                      stats.thisMonthDueAmount > 0
                        ? `${Math.min(100, (stats.thisMonthExtraPaid / Math.max(1, stats.thisMonthDueAmount)) * 100)}%`
                        : "0%",
                    backgroundColor: "#8b5cf6",
                  },
                ]}
              />
            </View>

            <View style={styles.trackFooterRow}>
              <Text style={styles.trackFooterText}>
                Total Cleared:{" "}
                <Text style={{ color: "#10b981", fontWeight: "700" }}>
                  {fc(stats.thisMonthTotalPaid)}
                </Text>
              </Text>
              <Text style={styles.trackFooterText}>
                Obligation:{" "}
                <Text style={{ color: "#0f172a", fontWeight: "700" }}>
                  {fc(stats.thisMonthDueAmount)}
                </Text>
              </Text>
            </View>

            <View style={styles.trackDivider} />

            {/* Monthly Spends & Budget */}
            <View style={styles.trackHeaderRow}>
              <View style={styles.trackCol}>
                <View
                  style={[styles.trackDot, { backgroundColor: "#ec4899" }]}
                />
                <Text style={styles.trackLabel}>Spent This Month</Text>
                <Text style={styles.trackValue}>{fc(spentThisMonth)}</Text>
              </View>
              <View style={styles.trackCol}>
                <View
                  style={[styles.trackDot, { backgroundColor: "#94a3b8" }]}
                />
                <Text style={styles.trackLabel}>Monthly Budget</Text>
                <Text style={styles.trackValue}>{fc(budgetLimit)}</Text>
              </View>
              <View style={styles.trackCol}>
                <View
                  style={[
                    styles.trackDot,
                    {
                      backgroundColor:
                        spentThisMonth > budgetLimit ? "#e11d48" : "#10b981",
                    },
                  ]}
                />
                <Text style={styles.trackLabel}>Available</Text>
                <Text
                  style={[
                    styles.trackValue,
                    {
                      color:
                        spentThisMonth > budgetLimit ? "#e11d48" : "#10b981",
                    },
                  ]}
                >
                  {spentThisMonth > budgetLimit
                    ? `Over ${fc(spentThisMonth - budgetLimit)}`
                    : fc(budgetLimit - spentThisMonth)}
                </Text>
              </View>
            </View>

            {/* Spend Progress Bar */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, (spentThisMonth / Math.max(1, budgetLimit)) * 100)}%`,
                    backgroundColor:
                      spentThisMonth > budgetLimit ? "#e11d48" : "#ec4899",
                  },
                ]}
              />
            </View>

            <TouchableOpacity
              style={styles.spendLinkRow}
              onPress={() => router.push("/spend-tracker" as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.spendLinkText}>Manage Budget & Spends</Text>
              <Ionicons name="arrow-forward" size={14} color="#ec4899" />
            </TouchableOpacity>
          </BlurView>
        </View>

        {/* ── 7. ACTIVE LOANS CAROUSEL ─────────────────────────── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              Active Loans ({activeLoans.length})
            </Text>
            <TouchableOpacity onPress={() => router.push("/loans" as any)}>
              <Text style={styles.seeAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          {activeLoans.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScroll}
            >
              {activeLoans.map((loan) => {
                const remaining = getLoanRemainingPrincipal(loan);
                const typeMeta =
                  LOAN_TYPE_META[loan.loanType || "other"] ||
                  LOAN_TYPE_META.other;

                return (
                  <TouchableOpacity
                    key={loan.id}
                    style={styles.loanCardItem}
                    onPress={() =>
                      router.push({
                        pathname: "/loan-detail",
                        params: { id: loan.id },
                      })
                    }
                    activeOpacity={0.88}
                  >
                    <BlurView
                      intensity={35}
                      tint="light"
                      style={styles.loanCardBlur}
                    >
                      <View style={styles.loanCardTop}>
                        <View
                          style={[
                            styles.loanTypeIconBox,
                            { backgroundColor: typeMeta.bg },
                          ]}
                        >
                          <Ionicons
                            name={typeMeta.icon}
                            size={18}
                            color={typeMeta.color}
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.loanCardName} numberOfLines={1}>
                            {loan.loanName}
                          </Text>
                          <Text style={styles.loanCardBank} numberOfLines={1}>
                            {loan.bankName || "Personal"} • {loan.interest}%
                          </Text>
                        </View>
                      </View>

                      <View style={styles.loanCardMiddle}>
                        <Text style={styles.loanCardAmtLabel}>
                          Remaining Principal
                        </Text>
                        <Text style={styles.loanCardAmt}>{fc(remaining)}</Text>
                      </View>

                      <View style={styles.loanCardFooter}>
                        <Text style={styles.loanCardDue}>
                          {loan.loanType === "bullet"
                            ? `Matures: ${fd(
                                getBulletMaturityDate(
                                  loan.startDate,
                                  parseInt(loan.tenure) || 0,
                                ),
                              )}`
                            : `EMI: ${fc(loan.emiAmount)}`}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={14}
                          color="#94a3b8"
                        />
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <BlurView intensity={25} tint="light" style={styles.emptyCard}>
              <Ionicons name="wallet-outline" size={32} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No active loans</Text>
              <Text style={styles.emptySub}>
                Track your EMIs and bullet loans in one place.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push("/add-loan")}
              >
                <Text style={styles.emptyBtnText}>+ Add Loan</Text>
              </TouchableOpacity>
            </BlurView>
          )}
        </View>

        {/* ── 8. INSURANCE POLICIES SNAPSHOT ───────────────────── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              Insurance ({insurances.length})
            </Text>
            <TouchableOpacity onPress={() => router.push("/insurances" as any)}>
              <Text style={styles.seeAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          {insurances.length > 0 ? (
            <TouchableOpacity
              onPress={() => router.push("/insurances" as any)}
              activeOpacity={0.88}
              style={styles.insuranceCardWrap}
            >
              <BlurView
                intensity={35}
                tint="light"
                style={styles.insuranceCard}
              >
                <View style={styles.insHeaderRow}>
                  <View style={styles.insIconWrap}>
                    <Ionicons
                      name="shield-checkmark"
                      size={22}
                      color="#f59e0b"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.insTitle}>
                      {insurances.length} Active Policies
                    </Text>
                    <Text style={styles.insSubtitle}>
                      {nextInsurance
                        ? `Next Premium: ${fd(nextInsurance.nextDue)} (${fc(
                            nextInsurance.premiumAmount,
                          )})`
                        : "All coverage up to date"}
                    </Text>
                  </View>
                  <View style={styles.insViewBtn}>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#f59e0b"
                    />
                  </View>
                </View>
              </BlurView>
            </TouchableOpacity>
          ) : (
            <BlurView intensity={25} tint="light" style={styles.emptyCard}>
              <Ionicons name="shield-outline" size={32} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No insurance added</Text>
              <Text style={styles.emptySub}>
                Keep track of renewal dates and premiums.
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: "#f59e0b" }]}
                onPress={() => router.push("/add-insurance")}
              >
                <Text style={styles.emptyBtnText}>+ Add Insurance</Text>
              </TouchableOpacity>
            </BlurView>
          )}
        </View>

        {/* ── 9. DAILY FINANCIAL WISDOM (EDITORIAL DESIGN) ──────── */}
        {quote &&
          (() => {
            const categoryTheme = getCategoryTheme(quote.category);
            return (
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={handleNextQuote}
                style={[
                  styles.quoteCardWrap,
                  {
                    borderColor: categoryTheme.border,
                    shadowColor: categoryTheme.text,
                  },
                ]}
              >
                <LinearGradient
                  colors={[
                    "#ffffff",
                    "rgba(248, 250, 252, 0.95)",
                    categoryTheme.glow,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <BlurView
                  intensity={25}
                  tint="light"
                  style={styles.quoteCardBlur}
                >
                  {/* Decorative Background Watermark Quotation Mark */}
                  <Text
                    style={[
                      styles.quoteWatermark,
                      { color: categoryTheme.text },
                    ]}
                    pointerEvents="none"
                  >
                    “
                  </Text>

                  {/* Header Row */}
                  <View style={styles.quoteCardHeader}>
                    <View style={styles.quoteBadge}>
                      <Ionicons name="sparkles" size={11} color="#4f46e5" />
                      <Text style={styles.quoteBadgeText}>Daily Wisdom</Text>
                    </View>

                    <View
                      style={[
                        styles.quoteCategoryTag,
                        {
                          backgroundColor: categoryTheme.bg,
                          borderColor: categoryTheme.border,
                        },
                      ]}
                    >
                      <Text style={styles.quoteCategoryEmoji}>
                        {categoryTheme.emoji}
                      </Text>
                      <Text
                        style={[
                          styles.quoteCategoryText,
                          { color: categoryTheme.text },
                        ]}
                      >
                        {quote.category}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }} />

                    <TouchableOpacity
                      style={[
                        styles.quoteShuffleBtn,
                        { borderColor: categoryTheme.border },
                      ]}
                      onPress={handleNextQuote}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name="shuffle"
                        size={12}
                        color={categoryTheme.text}
                      />
                      <Text
                        style={[
                          styles.quoteShuffleText,
                          { color: categoryTheme.text },
                        ]}
                      >
                        Shuffle
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Quote Body */}
                  <View style={styles.quoteBodyRow}>
                    <Text style={styles.quoteText}>
                      &ldquo;{quote.quote}&rdquo;
                    </Text>
                  </View>

                  {/* Author Signature & Attribution Footer */}
                  <View style={styles.quoteFooterRow}>
                    <View
                      style={[
                        styles.authorAvatarCircle,
                        {
                          backgroundColor: categoryTheme.bg,
                          borderColor: categoryTheme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.authorAvatarText,
                          { color: categoryTheme.text },
                        ]}
                      >
                        {getAuthorInitials(quote.author)}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.quoteAuthorName}>{quote.author}</Text>
                      <Text style={styles.quoteAuthorRole}>
                        Mindset & Financial Principle
                      </Text>
                    </View>

                    <View style={styles.quoteTapHint}>
                      <Ionicons
                        name="repeat-outline"
                        size={12}
                        color="#94a3b8"
                      />
                      <Text style={styles.quoteTapHintText}>Tap to cycle</Text>
                    </View>
                  </View>
                </BlurView>
              </TouchableOpacity>
            );
          })()}

        <View style={{ height: 20 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {},

  // Header Styles
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  headerIconBlur: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bellBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e11d48",
  },
  addBtnWrap: {
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addBtnInside: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },

  // Alerts Dropdown
  alertsDropdown: {
    marginHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.2)",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    overflow: "hidden",
    marginBottom: 20,
    padding: 16,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  alertsDropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  alertsDropdownTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  alertsCloseBtn: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  alertItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  alertIconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  alertItemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
  },
  alertItemSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  alertItemAmount: {
    fontSize: 15,
    fontWeight: "800",
  },
  alertDivider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.04)",
    marginVertical: 4,
  },

  // Insight Banner
  insightBanner: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.15)",
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  insightBlur: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(124, 58, 237, 0.05)",
  },
  insightIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "rgba(124, 58, 237, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },

  // Primary Hero Card
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 26,
    padding: 22,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6,
  },
  heroSkeletonCard: {
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 22,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  heroGlow1: {
    position: "absolute",
    top: -50,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(56, 189, 248, 0.18)",
  },
  heroGlow2: {
    position: "absolute",
    bottom: -50,
    left: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(16, 185, 129, 0.14)",
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroSubtitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "600",
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -1,
  },
  heroNextDueBox: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: "flex-end",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  heroAllClearBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  heroAllClearText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10b981",
  },
  nextDueLabel: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.65)",
    fontWeight: "700",
    marginBottom: 2,
  },
  nextDueAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#10b981",
  },
  heroDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 18,
  },
  heroBottomRow: {
    flexDirection: "row",
    gap: 16,
  },
  heroStatCol: {
    flex: 1,
  },
  heroStatLabel: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.5)",
    marginBottom: 4,
    fontWeight: "500",
  },
  heroStatValue: {
    fontSize: 15,
    color: "#ffffff",
    fontWeight: "700",
  },

  // Shortcuts Hub
  shortcutsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  shortcutBtn: {
    alignItems: "center",
    width: "22%",
  },
  shortcutIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  shortcutLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    letterSpacing: -0.2,
  },

  // Section Containers
  sectionWrap: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
    paddingHorizontal: 20,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4f46e5",
  },

  // Bento Card (Repayment & Spends)
  bentoCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  trackHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  trackCol: {
    alignItems: "flex-start",
  },
  trackDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginBottom: 4,
  },
  trackLabel: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 2,
    fontWeight: "500",
  },
  trackValue: {
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "700",
  },
  progressTrack: {
    height: 7,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
  },
  trackFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  trackFooterText: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "500",
  },
  trackDivider: {
    height: 1,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    marginVertical: 14,
  },
  spendLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 10,
    gap: 4,
  },
  spendLinkText: {
    fontSize: 12,
    color: "#ec4899",
    fontWeight: "700",
  },

  // Active Loans Horizontal Scroll
  horizontalScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  loanCardItem: {
    width: width * 0.62,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  loanCardBlur: {
    padding: 16,
  },
  loanCardTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  loanTypeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  loanCardName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  loanCardBank: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "500",
    marginTop: 1,
  },
  loanCardMiddle: {
    marginBottom: 12,
  },
  loanCardAmtLabel: {
    fontSize: 10,
    color: "#64748b",
    textTransform: "uppercase",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  loanCardAmt: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 2,
  },
  loanCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.04)",
    paddingTop: 8,
  },
  loanCardDue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4f46e5",
  },

  // Insurance Card
  insuranceCardWrap: {
    marginHorizontal: 20,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  insuranceCard: {
    padding: 16,
  },
  insHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  insIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  insTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  insSubtitle: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
    marginTop: 2,
  },
  insViewBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Empty Card
  emptyCard: {
    marginHorizontal: 20,
    borderRadius: 22,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    overflow: "hidden",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
    textAlign: "center",
  },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: "#10b981",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },

  // Daily Financial Wisdom (Editorial Design)
  quoteCardWrap: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1.5,
    backgroundColor: "#ffffff",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    position: "relative",
  },
  quoteCardBlur: {
    padding: 20,
    position: "relative",
  },
  quoteWatermark: {
    position: "absolute",
    right: 14,
    top: -12,
    fontSize: 120,
    fontWeight: "900",
    fontFamily: "System",
    opacity: 0.07,
    lineHeight: 120,
  },
  quoteCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 8,
  },
  quoteBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(79, 70, 229, 0.08)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  quoteBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4f46e5",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  quoteCategoryTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  quoteCategoryEmoji: {
    fontSize: 11,
  },
  quoteCategoryText: {
    fontSize: 11,
    fontWeight: "700",
  },
  quoteShuffleBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  quoteShuffleText: {
    fontSize: 11,
    fontWeight: "700",
  },
  quoteBodyRow: {
    marginVertical: 4,
    paddingRight: 10,
  },
  quoteText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  quoteFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.05)",
    gap: 10,
  },
  authorAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  authorAvatarText: {
    fontSize: 11,
    fontWeight: "800",
  },
  quoteAuthorName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  quoteAuthorRole: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "500",
    marginTop: 1,
  },
  quoteTapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  quoteTapHintText: {
    fontSize: 10,
    color: "#94a3b8",
    fontWeight: "500",
  },

  // Quick Add Modal Bottom Sheet
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  modalCardWrap: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 38,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  modalCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "500",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  modalOptionsContainer: {
    gap: 12,
  },
  modalOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.8)",
    gap: 14,
  },
  modalOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 2,
  },
  modalOptionSub: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
});

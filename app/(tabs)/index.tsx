import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SidePanelDrawer from "../../components/SidePanelDrawer";
import EdgeSwipeOpener from "../../components/ui/EdgeSwipe";
import AttentionBanner from "../../components/dashboard/AttentionBanner";
import DashboardHeader, { StickyHeader } from "../../components/dashboard/DashboardHeader";
import DashboardSkeleton from "../../components/dashboard/DashboardSkeleton";
import DebtCard, { InsightsCard } from "../../components/dashboard/DebtCard";
import InsuranceSection from "../../components/dashboard/InsuranceSection";
import LoansSection from "../../components/dashboard/LoansSection";
import MonthCard from "../../components/dashboard/MonthCard";
import { PressableScale } from "../../components/dashboard/primitives";
import { PrivacyProvider, useMoney, usePrivacy } from "../../components/dashboard/privacy";
import QuickAddSheet from "../../components/dashboard/QuickAddSheet";
import QuoteCard from "../../components/dashboard/QuoteCard";
import ToolsRow from "../../components/dashboard/ToolsRow";
import UpNextCard from "../../components/dashboard/UpNextCard";
import WelcomeCard from "../../components/dashboard/WelcomeCard";
import { TAB_BAR_CLEARANCE } from "../../components/ui/kit";
import { colors, space, type } from "../../constants/dashboardTheme";
import { DUE_WINDOW_DAYS, useDashboardData, type DueItem } from "../../hooks/use-dashboard-data";

export default function DashboardScreen() {
  return (
    <PrivacyProvider>
      <Dashboard />
    </PrivacyProvider>
  );
}

function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const data = useDashboardData();
  const privacy = usePrivacy();
  const money = useMoney();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [upNextY, setUpNextY] = useState(0);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const go = (pathname: string, params?: Record<string, string>) =>
    router.push((params ? { pathname, params } : pathname) as any);

  const openDue = (item: DueItem) =>
    item.kind === "insurance" ? go("/insurances") : go("/loan-detail", { id: item.id });

  // Sections fade up once, on the first render after data arrives.
  const enter = (i: number) => FadeInDown.delay(80 + i * 60).duration(380);

  return (
    <View style={styles.screen}>
      <SidePanelDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <EdgeSwipeOpener onOpen={() => setDrawerOpen(true)} />
      <QuickAddSheet visible={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      {!data.loading ? (
        <StickyHeader
          scrollY={scrollY}
          showAt={upNextY + 110}
          topInset={insets.top}
          title={
            data.isNewUser
              ? "Velo Flow"
              : data.duesTotal > 0
                ? `${money.compact(data.duesTotal)} due · next ${DUE_WINDOW_DAYS} days`
                : `All clear · next ${DUE_WINDOW_DAYS} days`
          }
          subtitle={data.status.text}
          tone={data.status.tone}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          onQuickAdd={() => setQuickAddOpen(true)}
        />
      ) : null}

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE },
        ]}
        refreshControl={
          <RefreshControl refreshing={data.refreshing} onRefresh={data.refresh} tintColor={colors.primaryFill} />
        }
      >
        {data.loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <DashboardHeader
              greeting={data.greeting}
              todayLabel={data.todayLabel}
              status={data.status}
              privacyHidden={privacy.hidden}
              onMenu={() => setDrawerOpen(true)}
              onQuickAdd={() => setQuickAddOpen(true)}
              onTogglePrivacy={privacy.toggle}
              onStatusPress={
                data.dues.length > 0 || data.maturedLoans.length > 0
                  ? () => scrollRef.current?.scrollTo({ y: Math.max(0, upNextY - space.md), animated: true })
                  : undefined
              }
            />

            {data.error && data.hasData ? (
              <View style={[styles.notice, styles.noticeError]} accessibilityRole="alert">
                <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
                <Text style={styles.noticeText}>
                  {data.lastUpdated
                    ? `Couldn't refresh. Showing data from ${data.lastUpdated.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.`
                    : data.error}
                </Text>
                <PressableScale onPress={data.refresh} style={styles.noticeAction} accessibilityLabel="Retry loading">
                  <Text style={styles.noticeActionText}>Retry</Text>
                </PressableScale>
              </View>
            ) : null}

            {data.notConfigured ? (
              <View style={styles.notice} accessibilityRole="alert">
                <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
                <Text style={styles.noticeText}>
                  Cloud data isn&apos;t connected, so loans and spends can&apos;t load.
                </Text>
              </View>
            ) : null}

            <AttentionBanner
              maturedLoans={data.maturedLoans}
              onResolve={() =>
                data.maturedLoans.length === 1
                  ? go("/loan-detail", { id: data.maturedLoans[0].id })
                  : go("/maturity-alerts")
              }
            />

            <Animated.View entering={enter(0)} onLayout={(e) => setUpNextY(e.nativeEvent.layout.y)}>
              {!data.hasData ? (
                <View style={styles.errorCard}>
                  <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.errorTitle}>Your data couldn&apos;t load</Text>
                  <Text style={styles.errorSub}>Check your internet connection, then try again.</Text>
                  <PressableScale onPress={data.refresh} style={styles.errorBtn} accessibilityLabel="Try again">
                    <Ionicons name="refresh" size={16} color={colors.textOnAccent} />
                    <Text style={styles.errorBtnText}>Try again</Text>
                  </PressableScale>
                </View>
              ) : data.isNewUser ? (
                <WelcomeCard
                  budgetIsDefault={data.month.budgetIsDefault}
                  onAddLoan={() => go("/add-loan")}
                  onAddInsurance={() => go("/add-insurance")}
                  onSetBudget={() => go("/spend-tracker")}
                />
              ) : (
                <UpNextCard
                  dues={data.dues}
                  duesTotal={data.duesTotal}
                  overdueTotal={data.overdueTotal}
                  nextBeyondWindow={data.nextBeyondWindow}
                  windowEnd={data.windowEnd}
                  onOpenCalendar={() => go("/calendar")}
                  onOpenItem={openDue}
                />
              )}
            </Animated.View>

            {data.hasData && !data.isNewUser ? (
              <Animated.View entering={enter(1)} style={styles.section}>
                <MonthCard
                  month={data.month}
                  onOpenCalendar={() => go("/calendar")}
                  onOpenSpends={() => go("/spend-tracker")}
                  onOpenPayments={() => go("/history")}
                  onOpenMaturity={(id) => go("/loan-detail", { id })}
                />
              </Animated.View>
            ) : null}

            {data.hasLoans || data.closedLoanCount > 0 ? (
              <Animated.View entering={enter(2)} style={styles.section}>
                <DebtCard
                  totals={data.totals}
                  hasLoans={data.hasLoans}
                  closedLoanCount={data.closedLoanCount}
                  onOpenRoadmap={() => go("/roadmap")}
                  onOpenDebtFree={() => go("/debt-free")}
                />
              </Animated.View>
            ) : null}

            {data.insights.length > 0 ? (
              <Animated.View entering={enter(3)} style={styles.section}>
                <InsightsCard
                  insights={data.insights}
                  onInsight={(i) => go(i.route, i.params)}
                  onAskAI={() => go("/ai-advisor")}
                />
              </Animated.View>
            ) : null}

            {data.hasData ? (
              <>
                <Animated.View entering={enter(4)} style={styles.section}>
                  <LoansSection
                    loans={data.loans}
                    closedCount={data.closedLoanCount}
                    onOpenLoan={(id) => go("/loan-detail", { id })}
                    onViewAll={() => go("/loans")}
                    onAddLoan={() => go("/add-loan")}
                  />
                </Animated.View>

                <Animated.View entering={enter(5)} style={styles.section}>
                  <InsuranceSection
                    insurances={data.insurances}
                    annualTotal={data.insuranceAnnualTotal}
                    onOpen={() => go("/insurances")}
                    onAdd={() => go("/add-insurance")}
                  />
                </Animated.View>
              </>
            ) : null}

            <Animated.View entering={enter(6)} style={styles.section}>
              <ToolsRow onOpen={(route) => go(route)} />
            </Animated.View>

            <Animated.View entering={enter(7)} style={styles.section}>
              <QuoteCard />
            </Animated.View>

            <DataFooter lastUpdated={data.lastUpdated} refreshing={data.refreshing} onRefresh={data.refresh} />
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

function DataFooter({
  lastUpdated,
  refreshing,
  onRefresh,
}: {
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const time = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <PressableScale
      onPress={onRefresh}
      style={styles.footer}
      accessibilityLabel={time ? `Updated at ${time}. Refresh` : "Refresh"}
      haptic={false}
    >
      {refreshing ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
      <Text style={styles.footerText}>
        {refreshing ? "Updating…" : time ? `Updated ${time} · Tap or pull down to refresh` : "Tap to refresh"}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl + space.sm,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  section: {
    marginTop: space.xxl + space.xs,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: 12,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    marginBottom: space.lg,
  },
  noticeError: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  noticeAction: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeActionText: {
    ...type.label,
    fontWeight: "700",
    color: colors.danger,
  },
  errorCard: {
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  errorTitle: {
    ...type.headline,
    color: colors.text,
    marginTop: space.xs,
  },
  errorSub: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    textAlign: "center",
  },
  errorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: space.sm,
    minHeight: 44,
    paddingHorizontal: space.xl,
    borderRadius: 999,
    backgroundColor: colors.indigo,
  },
  errorBtnText: {
    ...type.body,
    fontWeight: "700",
    color: colors.textOnAccent,
  },
  noticeText: {
    ...type.label,
    fontWeight: "500",
    color: colors.text,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: 44,
    marginTop: space.xl,
  },
  footerText: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
  },
});

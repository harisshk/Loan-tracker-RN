import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import ProgressRing from "../../components/dashboard/ProgressRing";
import {
  AnimatedAmount,
  Card,
  colors,
  EmptyState,
  Gap,
  HeaderAction,
  IconBadge,
  kindColors,
  ListRow,
  Pill,
  ProgressBar,
  radius,
  Screen,
  ScreenHeader,
  SectionHeader,
  Segmented,
  shadow,
  space,
  type,
} from "../../components/ui/kit";
import {
  calculateEMIBreakdown,
  countsTowardBalance,
  getBulletMaturityDate,
  getInstalmentDate,
  getMonthsElapsed,
  getNextInstalment,
  getPaymentDate,
  parseLocalDate,
} from "../../utils/emiCalculator";
import {
  formatDateWithDay,
  formatINR,
  formatINRCompact,
  formatMonthYear,
  formatPercent,
  formatRelativeDays,
} from "../../utils/format";
import { getLoans, getPayments } from "../../utils/storage";

const fc = (amount) => formatINR(amount);

const fd = (date) => {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const daysFromNow = (date) => {
  if (!date) return null;
  const diff = Math.ceil(
    (new Date(date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
  );
  return diff;
};

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "loans", label: "Progress" },
  { key: "history", label: "History" },
];

/** Relative-day pill for an upcoming due date: text + tone, never colour alone. */
const duePill = (days) => {
  if (days === null || days === undefined) {
    return { label: "Scheduled", color: colors.textSecondary, bg: colors.surfaceSunken };
  }
  if (days < 0) {
    return { label: `Overdue ${Math.abs(days)}d`, color: colors.danger, bg: colors.dangerSoft };
  }
  if (days <= 3) {
    return { label: formatRelativeDays(days), color: colors.danger, bg: colors.dangerSoft };
  }
  if (days <= 7) {
    return { label: formatRelativeDays(days), color: colors.warning, bg: colors.warningSoft };
  }
  return { label: formatRelativeDays(days), color: colors.textSecondary, bg: colors.surfaceSunken };
};

export default function EMIPage() {
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState("upcoming");

  const loadData = useCallback(async () => {
    try {
      const l = await getLoans();
      const p = await getPayments();
      setLoans(l);
      setPayments(p);
      setLoadError(false);
    } catch (e) {
      console.error("Error loading data on analytics:", e);
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // ── Per-loan breakdowns ──────────────────────────────────────────
  const allBreakdowns = useMemo(() => {
    return loans
      .filter((l) => l.status !== "closed")
      .map((loan) => {
        const principal =
          parseFloat(String(loan.principal).replace(/,/g, "")) || 0;
        const interest = parseFloat(loan.interest) || 0;
        const tenure = parseInt(String(loan.tenure).replace(/,/g, "")) || 0;
        const emiAmount =
          parseFloat(String(loan.emiAmount).replace(/,/g, "")) || 0;
        const loanType = loan.loanType || "emi";
        const extraPayments = payments.filter((p) => p.loanId === loan.id);

        const monthsElapsed = loan.startDate
          ? getMonthsElapsed(loan.startDate, today)
          : 0;

        const bd = calculateEMIBreakdown(
          principal,
          interest,
          tenure,
          monthsElapsed,
          emiAmount,
          loanType,
          extraPayments,
          loan.startDate,
        );

        // Next due date: next scheduled EMI on/after today (null once the tenure is over)
        let nextDueDate = null;
        if (loan.startDate && loanType === "emi") {
          const next = getNextInstalment(loan.startDate, tenure, today);
          nextDueDate = next ? next.date : null;
        } else if (loanType === "bullet" && loan.startDate) {
          nextDueDate = getBulletMaturityDate(loan.startDate, tenure);
        }

        return {
          loan,
          bd,
          loanType,
          principal,
          tenure,
          emiAmount,
          nextDueDate,
        };
      });
  }, [loans, payments, today]);

  // Whether a logged payment is an extra payment (reduces the loan balance)
  const isExtraPayment = useMemo(() => {
    const loanById = {};
    loans.forEach((l) => {
      loanById[l.id] = l;
    });
    const emiByLoan = {};
    allBreakdowns.forEach((x) => {
      emiByLoan[x.loan.id] = x.bd.emi;
    });
    return (p) => {
      const loan = loanById[p.loanId];
      const loanType = (loan && loan.loanType) || "emi";
      const emi =
        emiByLoan[p.loanId] ??
        (loan
          ? parseFloat(String(loan.emiAmount || "0").replace(/,/g, "")) || 0
          : 0);
      return countsTowardBalance(p, loanType, emi);
    };
  }, [loans, allBreakdowns]);

  // ── Upcoming EMIs list (sorted by next due) ──────────────────────
  const upcomingEMIs = useMemo(() => {
    return allBreakdowns
      .filter((x) => x.bd.remainingAmount > 0 && x.nextDueDate)
      .map((x) => ({
        ...x,
        days: daysFromNow(x.nextDueDate),
      }))
      .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  }, [allBreakdowns]);

  // ── This Month stats ─────────────────────────────────────────────
  const thisMonthStats = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const todayMidnight = new Date(y, m, now.getDate());

    // EMI paid = schedule-based: sum EMI amounts for loans whose due date this month has passed
    // (same logic as calculateLoanStats in storage.js)
    let emiPaid = 0;
    let dueAmount = 0;

    loans
      .filter((l) => l.status !== "closed")
      .forEach((loan) => {
        if ((loan.loanType || "emi") !== "emi") return;
        const emiAmount =
          parseFloat(String(loan.emiAmount || "0").replace(/,/g, "")) || 0;
        const tenure =
          parseInt(String(loan.tenure || "0").replace(/,/g, "")) || 0;
        if (!loan.startDate || emiAmount === 0) return;

        // EMI #k falls in this month; none before the first or after the last EMI
        const sd = parseLocalDate(loan.startDate);
        const k = (y - sd.getFullYear()) * 12 + (m - sd.getMonth()) + 1;
        if (k < 1 || k > tenure) return;
        const emiDueThisMonth = getInstalmentDate(loan.startDate, k);

        // Due this month
        dueAmount += emiAmount;

        // Auto-paid: the scheduled EMI for this month whose due date has already passed
        if (emiDueThisMonth <= todayMidnight) {
          emiPaid += emiAmount;
        }
      });

    // Extra payments (prepayments / settlements) logged this month
    let extraPaid = 0;
    payments.forEach((p) => {
      if (!isExtraPayment(p)) return;
      const d = parseLocalDate(getPaymentDate(p));
      if (isNaN(d) || d.getMonth() !== m || d.getFullYear() !== y) return;
      extraPaid += parseFloat(p.amount || 0);
    });

    const totalPaid = emiPaid + extraPaid;
    const pending = Math.max(0, dueAmount - emiPaid);
    const progress = dueAmount > 0 ? Math.min(1, emiPaid / dueAmount) : 0;
    return { emiPaid, extraPaid, totalPaid, dueAmount, pending, progress };
  }, [loans, payments, isExtraPayment]);

  // ── Payment History (recent 15) ───────────────────────────────────
  const recentPayments = useMemo(() => {
    const loanMap = {};
    loans.forEach((l) => {
      loanMap[l.id] = l.loanName;
    });
    return [...payments]
      .sort(
        (a, b) => new Date(getPaymentDate(b)) - new Date(getPaymentDate(a)),
      )
      .slice(0, 15)
      .map((p) => ({
        ...p,
        loanName: loanMap[p.loanId] || "Unknown Loan",
        displayDate: fd(getPaymentDate(p)),
        isExtra: isExtraPayment(p),
      }));
  }, [payments, loans, isExtraPayment]);

  const openLoan = (id) =>
    router.push({
      pathname: "/loan-detail",
      params: { id },
    });

  const header = (
    <ScreenHeader
      title="EMIs"
      subtitle="What's due, what's paid, and how far each loan has come"
      actions={
        <HeaderAction
          icon="add"
          label="Add a loan"
          variant="primary"
          onPress={() => router.push("/add-loan")}
        />
      }
    />
  );

  // ── Loading / error / empty ───────────────────────────────────────
  if (!loaded) {
    return (
      <Screen>
        {header}
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primaryFill} />
          <Text style={styles.loadingText}>Loading your EMIs…</Text>
        </View>
      </Screen>
    );
  }

  if (loadError && loans.length === 0) {
    return (
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        {header}
        <Card>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load your EMIs"
            message="Pull down to try again."
          />
        </Card>
      </Screen>
    );
  }

  const hasActiveLoans = allBreakdowns.length > 0;
  const hasDue = thisMonthStats.dueAmount > 0;
  const progressPct = thisMonthStats.progress * 100;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      {header}

      {/* ── This month hero ───────────────────────────────────── */}
      {hasActiveLoans ? (
        <View style={styles.heroCard}>
          <LinearGradient
            colors={colors.heroGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroOverline}>
              This month · {formatMonthYear(today)}
            </Text>

            {hasDue ? (
              <View style={styles.heroMain}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.heroLabel}>EMIs paid</Text>
                  <AnimatedAmount
                    value={thisMonthStats.emiPaid}
                    format={formatINR}
                    style={styles.heroAmount}
                    accessibilityLabel={`${fc(thisMonthStats.emiPaid)} of ${fc(thisMonthStats.dueAmount)} EMIs paid this month`}
                  />
                  <Text style={styles.heroSub} numberOfLines={1}>
                    of {fc(thisMonthStats.dueAmount)} due this month
                  </Text>
                </View>
                <ProgressRing
                  value={progressPct}
                  size={76}
                  stroke={8}
                  trackColor={colors.heroTrack}
                  colors={[colors.heroAccent]}
                  label={formatPercent(progressPct, 0)}
                  labelColor={colors.heroText}
                  caption="paid"
                  captionColor={colors.heroTextMuted}
                  accessibilityLabel={`${formatPercent(progressPct, 0)} of this month's EMIs paid`}
                />
              </View>
            ) : (
              <View style={styles.heroMain}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroClear}>No EMIs due this month</Text>
                  <Text style={styles.heroSub}>
                    Nothing is scheduled for {formatMonthYear(today)}.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.heroStats}>
              <HeroStat
                label="Remaining"
                value={fc(thisMonthStats.pending)}
                highlight={thisMonthStats.pending > 0}
              />
              <View style={styles.heroStatDivider} />
              <HeroStat label="Prepaid" value={fc(thisMonthStats.extraPaid)} />
              <View style={styles.heroStatDivider} />
              <HeroStat label="Total cleared" value={fc(thisMonthStats.totalPaid)} />
            </View>

            {hasDue ? (
              <Text style={styles.heroFootnote}>
                EMIs count as paid on their due date.
              </Text>
            ) : null}
          </LinearGradient>
        </View>
      ) : (
        <Card>
          <EmptyState
            icon="wallet-outline"
            title="No active loans"
            message="Add a loan to see upcoming EMIs, this month's progress and your repayment history."
            actionLabel="Add loan"
            onAction={() => router.push("/add-loan")}
          />
        </Card>
      )}

      <Gap />

      <Segmented options={TABS} value={tab} onChange={setTab} />

      <Gap size={space.xl} />

      {/* ── Upcoming EMIs ─────────────────────────────────────── */}
      {tab === "upcoming" ? (
        <View>
          <SectionHeader title="Due next" count={upcomingEMIs.length} />
          {upcomingEMIs.length === 0 ? (
            <Card>
              <EmptyState
                icon="checkmark-circle-outline"
                title="All caught up"
                message="No upcoming EMIs or maturities on your active loans."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {upcomingEMIs.map((item, i) => {
                const isBullet = item.loanType === "bullet";
                const kind = isBullet ? kindColors.bullet : kindColors.emi;
                const due = new Date(item.nextDueDate);
                const pill = duePill(item.days);
                const amount = isBullet
                  ? item.bd.remainingAmount
                  : item.emiAmount || item.bd.emi;
                const subtitle = `${isBullet ? "Bullet maturity" : "EMI"} · ${formatDateWithDay(due)}`;
                return (
                  <ListRow
                    key={item.loan.id}
                    divider={i > 0}
                    leading={<DateTile date={due} kind={kind} />}
                    title={item.loan.loanName}
                    subtitle={subtitle}
                    value={fc(amount)}
                    valueCaption={isBullet ? "at maturity" : undefined}
                    onPress={() => openLoan(item.loan.id)}
                    accessibilityLabel={`${item.loan.loanName}, ${subtitle}, ${fc(amount)}, ${pill.label}`}
                    accessibilityHint="Opens loan details"
                  >
                    <Pill label={pill.label} color={pill.color} backgroundColor={pill.bg} />
                  </ListRow>
                );
              })}
            </Card>
          )}
        </View>
      ) : null}

      {/* ── Per-loan progress ─────────────────────────────────── */}
      {tab === "loans" ? (
        <View>
          <SectionHeader title="Repayment progress" count={allBreakdowns.length} />
          {allBreakdowns.length === 0 ? (
            <Card>
              <EmptyState
                icon="stats-chart-outline"
                title="No active loans"
                message="Progress for each loan appears here once you add one."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {allBreakdowns.map((item, i) => {
                const isBullet = item.loanType === "bullet";
                const kind = isBullet ? kindColors.bullet : kindColors.emi;
                const repaidPct =
                  item.principal > 0
                    ? Math.max(0, Math.min(100, (item.bd.principalPaid / item.principal) * 100))
                    : 0;
                const subtitle = isBullet
                  ? `Bullet · ${formatINRCompact(item.bd.remainingAmount)} to repay`
                  : `EMI ${fc(item.emiAmount || item.bd.emi)} · ${formatINRCompact(item.bd.remainingAmount)} outstanding`;
                return (
                  <ListRow
                    key={item.loan.id}
                    divider={i > 0}
                    leading={
                      <IconBadge
                        name={kind.icon}
                        color={kind.text}
                        backgroundColor={kind.soft}
                      />
                    }
                    title={item.loan.loanName}
                    subtitle={subtitle}
                    value={fc(item.bd.remainingPrincipalAmount)}
                    valueCaption="principal left"
                    onPress={() => openLoan(item.loan.id)}
                    accessibilityLabel={`${item.loan.loanName}. ${subtitle}. ${fc(item.bd.remainingPrincipalAmount)} principal left. ${formatPercent(repaidPct, 0)} of principal repaid`}
                    accessibilityHint="Opens loan details"
                  >
                    <View style={styles.progressRow}>
                      <ProgressBar
                        segments={[{ value: repaidPct, color: colors.primaryFill }]}
                        height={6}
                        style={{ flex: 1 }}
                      />
                      <Text style={styles.progressText}>
                        {formatPercent(repaidPct, 0)} repaid
                      </Text>
                    </View>
                  </ListRow>
                );
              })}
            </Card>
          )}
        </View>
      ) : null}

      {/* ── Payment history ───────────────────────────────────── */}
      {tab === "history" ? (
        <View>
          <SectionHeader
            title="Recent payments"
            actionLabel="See all"
            onAction={() => router.push("/history")}
          />
          {recentPayments.length === 0 ? (
            <Card>
              <EmptyState
                icon="receipt-outline"
                title="No payments logged yet"
                message="Prepayments and EMIs you record show up here."
              />
            </Card>
          ) : (
            <Card padded={false}>
              {recentPayments.map((p, i) => {
                const label = p.isExtra ? "Prepayment" : "EMI";
                return (
                  <ListRow
                    key={p.id || i}
                    divider={i > 0}
                    leading={
                      <IconBadge
                        name={p.isExtra ? "flash-outline" : "checkmark-circle-outline"}
                        color={p.isExtra ? colors.violet : colors.primary}
                        backgroundColor={p.isExtra ? colors.violetSoft : colors.primarySoft}
                      />
                    }
                    title={p.loanName}
                    subtitle={p.displayDate}
                    value={fc(p.amount)}
                    accessibilityLabel={`${p.loanName}, ${label}, ${p.displayDate}, ${fc(p.amount)}`}
                  >
                    <Pill
                      label={label}
                      color={p.isExtra ? colors.violet : colors.primary}
                      backgroundColor={p.isExtra ? colors.violetSoft : colors.primarySoft}
                    />
                  </ListRow>
                );
              })}
            </Card>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

function HeroStat({ label, value, highlight }) {
  return (
    <View style={styles.heroStat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.heroStatLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.heroStatValue, highlight && { color: colors.heroWarning }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
    </View>
  );
}

function DateTile({ date, kind }) {
  return (
    <View style={[styles.dateTile, { backgroundColor: kind.soft }]}>
      <Text style={[styles.dateDay, { color: kind.text }]}>{date.getDate()}</Text>
      <Text style={[styles.dateWeekday, { color: kind.text }]}>
        {WEEKDAYS[date.getDay()]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    paddingVertical: space.xxxl * 2,
    gap: space.md,
  },
  loadingText: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  heroCard: {
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.hero,
  },
  hero: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg + 2,
    paddingBottom: space.lg,
  },
  heroOverline: {
    ...type.overline,
    color: colors.heroTextSecondary,
  },
  heroMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    marginTop: space.md,
  },
  heroLabel: {
    ...type.label,
    fontWeight: "500",
    color: colors.heroTextSecondary,
  },
  heroAmount: {
    ...type.display,
    color: colors.heroText,
    marginTop: 2,
  },
  heroSub: {
    ...type.label,
    fontWeight: "500",
    color: colors.heroTextSecondary,
    marginTop: space.xs,
  },
  heroClear: {
    ...type.title,
    color: colors.heroText,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.heroDivider,
  },
  heroStat: {
    flex: 1,
    minWidth: 0,
  },
  heroStatDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.heroDivider,
    marginHorizontal: space.md,
  },
  heroStatLabel: {
    ...type.caption,
    fontWeight: "500",
    color: colors.heroTextMuted,
  },
  heroStatValue: {
    ...type.amountSmall,
    color: colors.heroText,
    marginTop: 2,
  },
  heroFootnote: {
    ...type.caption,
    fontWeight: "500",
    color: colors.heroTextMuted,
    marginTop: space.md,
  },
  dateTile: {
    width: 40,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  dateWeekday: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  progressText: {
    ...type.caption,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});

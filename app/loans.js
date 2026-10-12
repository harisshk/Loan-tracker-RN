import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Card,
  Chip,
  colors,
  EmptyState,
  Gap,
  HeaderAction,
  IconBadge,
  kindColors,
  Pill,
  PressableScale,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  Segmented,
  space,
  StatRow,
  StatTile,
  type,
} from "../components/ui/kit";
import {
  calculateEMIBreakdown,
  getBulletMaturityDate,
  getMonthsElapsed,
  getNextInstalment,
  parseLocalDate,
} from "../utils/emiCalculator";
import { daysFromToday, formatINR, formatINRCompact, formatPercent, toNumber } from "../utils/format";
import { deleteLoan, getLoans, getPayments } from "../utils/storage";

// ── Sort option definitions ───────────────────────────────────────────────────
const SORT_OPTIONS = [
  { id: "nextDue", label: "Due date", icon: "calendar-outline", desc: false },
  { id: "interestDesc", label: "Highest rate", icon: "trending-up-outline", desc: true },
  { id: "interestAsc", label: "Lowest rate", icon: "trending-down-outline", desc: false },
  { id: "principalDesc", label: "Largest amount", icon: "arrow-down-outline", desc: true },
  { id: "principalAsc", label: "Smallest amount", icon: "arrow-up-outline", desc: false },
];

const TONES = {
  critical: { text: colors.danger, soft: colors.dangerSoft },
  warning: { text: colors.warning, soft: colors.warningSoft },
  neutral: { text: colors.textSecondary, soft: colors.surfaceSunken },
  positive: { text: colors.primary, soft: colors.primarySoft },
};

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** Decorative icon guessed from the loan name (same mapping as the Home loans list). */
const iconFor = (name, isBullet) => {
  const n = (name || "").toLowerCase();
  if (/gold|jewel/.test(n)) return "diamond-outline";
  if (/home|house|housing|flat/.test(n)) return "home-outline";
  if (/car|auto|vehicle|creta/.test(n)) return "car-outline";
  if (/bike|scooter/.test(n)) return "bicycle-outline";
  if (/edu|student|study/.test(n)) return "school-outline";
  if (/business|shop/.test(n)) return "briefcase-outline";
  if (/personal/.test(n)) return "person-outline";
  return isBullet ? "hourglass-outline" : "wallet-outline";
};

const formatDate = (date) => {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export default function Loans() {
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [sortId, setSortId] = useState("nextDue");
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("active");

  const loadLoans = useCallback(async () => {
    try {
      const loansData = await getLoans();
      const paymentsData = await getPayments();
      setLoans(loansData);
      setPayments(paymentsData);
      setError(null);
    } catch (e) {
      console.error("Error loading loans:", e);
      setError("Couldn't load your loans. Pull down to try again.");
    } finally {
      setLoaded(true);
    }
  }, []);

  // Runs on first focus too, so no separate mount effect is needed.
  useFocusEffect(
    useCallback(() => {
      loadLoans();
    }, [loadLoans]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLoans();
    setRefreshing(false);
  };

  const handleDeleteLoan = (loanId, loanName) => {
    Alert.alert("Delete Loan", `Are you sure you want to delete "${loanName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteLoan(loanId);
          await loadLoans();
        },
      },
    ]);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getNextDueDate = (loan) => {
    if (!loan.startDate) return new Date(9999, 0);
    const tenure = parseInt(loan.tenure) || 0;

    if (loan.loanType === "bullet") {
      return getBulletMaturityDate(loan.startDate, tenure);
    }

    const next = getNextInstalment(loan.startDate, tenure, new Date());
    if (!next) return new Date(9999, 0); // completed
    return next.date;
  };

  const getRemainingBreakdown = (loan) => {
    const principal = parseFloat(loan.principal) || 0;
    const interest = parseFloat(loan.interest) || 0;
    const tenure = parseInt(loan.tenure) || 0;
    const emiAmount = parseFloat(loan.emiAmount) || 0;
    const loanType = loan.loanType || "emi";

    if (!loan.startDate) return { displayAmount: principal, breakdown: null };

    const monthsElapsed = getMonthsElapsed(loan.startDate, new Date());

    const extraPayments = payments.filter((p) => p.loanId === loan.id);
    const breakdown = calculateEMIBreakdown(
      principal,
      interest,
      tenure,
      monthsElapsed,
      emiAmount,
      loanType,
      extraPayments,
      loan.startDate,
    );

    return { displayAmount: breakdown.remainingPrincipalAmount, breakdown };
  };

  // ── Sorting ──────────────────────────────────────────────────────────────────
  const sorted = [...loans].sort((a, b) => {
    switch (sortId) {
      case "nextDue":
        return getNextDueDate(a) - getNextDueDate(b);
      case "interestDesc":
        return (parseFloat(b.interest) || 0) - (parseFloat(a.interest) || 0);
      case "interestAsc":
        return (parseFloat(a.interest) || 0) - (parseFloat(b.interest) || 0);
      case "principalDesc":
        return (parseFloat(b.principal) || 0) - (parseFloat(a.principal) || 0);
      case "principalAsc":
        return (parseFloat(a.principal) || 0) - (parseFloat(b.principal) || 0);
      default:
        return 0;
    }
  });

  // ── Per-row display data ─────────────────────────────────────────────────────
  const rows = sorted.map((loan) => {
    const isBullet = loan.loanType === "bullet";
    const isClosed = loan.status === "closed";
    const tenure = parseInt(loan.tenure) || 0;
    const principal = toNumber(loan.principal);
    const rate = toNumber(loan.interest);
    const nextDue = getNextDueDate(loan);
    const hasNextDue = nextDue.getFullYear() !== 9999;
    const { displayAmount: remaining } = getRemainingBreakdown(loan);

    // EMIs whose (clamped) due date has arrived, same count as the loan detail
    const monthsElapsed = loan.startDate ? getMonthsElapsed(loan.startDate, new Date()) : 0;
    const paymentsMade = Math.min(monthsElapsed, tenure);
    const emisLeft = Math.max(0, tenure - paymentsMade);

    const progress = isBullet
      ? tenure > 0
        ? (paymentsMade / tenure) * 100
        : 0
      : principal > 0
        ? ((principal - remaining) / principal) * 100
        : 0;

    const days = hasNextDue ? daysFromToday(nextDue) : null;
    const emiDay = !isBullet && loan.startDate ? parseLocalDate(loan.startDate).getDate() : null;

    const meta = isBullet
      ? `Bullet · ${formatPercent(rate, 2)} · matures ${hasNextDue ? formatDate(nextDue) : "N/A"}`
      : `EMI ${formatINR(loan.emiAmount)}${emiDay ? ` · ${ordinal(emiDay)}` : ""} · ${formatPercent(rate, 2)}`;

    let status = null;
    if (isClosed) {
      status = { label: "Closed", tone: "neutral", icon: "checkmark-circle-outline" };
    } else if (!isBullet && !hasNextDue) {
      status = { label: "All EMIs paid", tone: "positive", icon: "checkmark-circle-outline" };
    } else if (isBullet && days !== null && days < 0) {
      status = { label: `Matured ${-days}d ago`, tone: "critical", icon: "alert-circle-outline" };
    } else if (isBullet && days !== null && days <= 30) {
      status = {
        label: days === 0 ? "Matures today" : `Matures in ${days}d`,
        tone: days <= 7 ? "warning" : "neutral",
        icon: "time-outline",
      };
    } else if (!isBullet && days !== null && days <= 7) {
      status = {
        label: days === 0 ? "EMI today" : `EMI in ${days}d`,
        tone: days <= 1 ? "warning" : "neutral",
        icon: "time-outline",
      };
    } else if (!isBullet && emisLeft > 0 && emisLeft <= 3) {
      status = { label: `${emisLeft} EMI${emisLeft === 1 ? "" : "s"} left`, tone: "positive" };
    }

    return {
      loan,
      isBullet,
      isClosed,
      hasNextDue,
      remaining,
      principal,
      progress,
      meta,
      status,
      emi: toNumber(loan.emiAmount),
      progressLabel: isBullet
        ? `${formatPercent(progress, 0)} of term`
        : `${formatPercent(progress, 0)} repaid`,
    };
  });

  const activeRows = rows.filter((r) => !r.isClosed);
  const closedRows = rows.filter((r) => r.isClosed);
  const showClosed = closedRows.length > 0 && tab === "closed";
  const visibleRows = showClosed ? closedRows : activeRows;

  const outstanding = activeRows.reduce((s, r) => s + r.remaining, 0);
  const monthlyEmis = activeRows
    .filter((r) => !r.isBullet && r.hasNextDue)
    .reduce((s, r) => s + r.emi, 0);

  const openLoan = (loan) =>
    router.push({
      pathname: "/loan-detail",
      params: {
        id: loan.id,
        loanName: loan.loanName,
        principal: loan.principal,
        interest: loan.interest,
        emiAmount: loan.emiAmount,
        tenure: loan.tenure,
        startDate: loan.startDate,
        loanType: loan.loanType || "emi",
      },
    });

  const subtitle =
    loans.length === 0
      ? undefined
      : `${activeRows.length} active${closedRows.length ? ` · ${closedRows.length} closed` : ""}`;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader
        title="All loans"
        subtitle={subtitle}
        back
        actions={
          <HeaderAction icon="add" label="Add loan" variant="primary" onPress={() => router.push("/add-loan")} />
        }
      />

      {!loaded ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryFill} />
        </View>
      ) : error && loans.length === 0 ? (
        <Card>
          <EmptyState icon="cloud-offline-outline" title="Something went wrong" message={error} />
        </Card>
      ) : loans.length === 0 ? (
        <Card>
          <EmptyState
            icon="wallet-outline"
            title="No loans yet"
            message="Add your first loan to track EMIs, interest and payoff dates."
            actionLabel="Add loan"
            onAction={() => router.push("/add-loan")}
          />
        </Card>
      ) : (
        <>
          {/* Summary */}
          <Card>
            <StatRow>
              <StatTile label="Outstanding" value={formatINRCompact(outstanding)} caption="principal" />
              <StatTile label="EMIs / month" value={formatINRCompact(monthlyEmis)} caption="active loans" />
              <StatTile
                label="Active"
                value={String(activeRows.length)}
                caption={`loan${activeRows.length === 1 ? "" : "s"}`}
              />
            </StatRow>
          </Card>

          <Gap />

          {closedRows.length > 0 ? (
            <Segmented
              options={[
                { key: "active", label: `Active (${activeRows.length})` },
                { key: "closed", label: `Closed (${closedRows.length})` },
              ]}
              value={showClosed ? "closed" : "active"}
              onChange={setTab}
              style={styles.segmented}
            />
          ) : null}

          {visibleRows.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
              style={styles.sortScroll}
            >
              {SORT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.id}
                  label={opt.label}
                  icon={opt.icon}
                  selected={sortId === opt.id}
                  onPress={() => setSortId(opt.id)}
                />
              ))}
            </ScrollView>
          ) : null}

          <SectionHeader title={showClosed ? "Closed loans" : "Active loans"} count={visibleRows.length} />

          {visibleRows.length === 0 ? (
            <Card>
              <EmptyState
                icon="checkmark-done-outline"
                title="No active loans"
                message="All your loans are closed. Add a new one any time."
                actionLabel="Add loan"
                onAction={() => router.push("/add-loan")}
              />
            </Card>
          ) : (
            <>
              <Card padded={false}>
                {visibleRows.map((row, i) => (
                  <LoanRow
                    key={row.loan.id}
                    row={row}
                    first={i === 0}
                    onPress={() => openLoan(row.loan)}
                    onLongPress={() => handleDeleteLoan(row.loan.id, row.loan.loanName)}
                  />
                ))}
              </Card>
              <Text style={styles.footnote}>Press and hold a loan to delete it.</Text>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function LoanRow({ row, first, onPress, onLongPress }) {
  const { loan, isBullet, isClosed, remaining, principal, progress, meta, status, progressLabel } = row;
  const kind = isBullet ? kindColors.bullet : kindColors.emi;
  const tone = status ? TONES[status.tone] : null;
  const barColor = isClosed
    ? colors.textMuted
    : status?.tone === "critical"
      ? colors.dangerFill
      : isBullet
        ? kind.fill
        : colors.primaryFill;

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, !first && styles.rowDivider]}
      accessibilityLabel={`${loan.loanName}. ${meta}. ${formatINR(remaining)} principal left. ${progressLabel}${
        status ? `. ${status.label}` : ""
      }`}
      accessibilityHint="Opens loan details. Press and hold to delete."
    >
      <View style={styles.rowTop}>
        <IconBadge
          name={iconFor(loan.loanName, isBullet)}
          color={isClosed ? colors.textMuted : kind.text}
          backgroundColor={isClosed ? colors.surfaceSunken : kind.soft}
        />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {loan.loanName}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View style={styles.rowTrail}>
          <Text style={[styles.rowAmount, isClosed && styles.rowAmountClosed]} numberOfLines={1}>
            {formatINR(remaining)}
          </Text>
          <Text style={styles.rowAmountCaption}>of {formatINRCompact(principal)}</Text>
        </View>
      </View>
      <View style={styles.rowBottom}>
        <ProgressBar segments={[{ value: progress, color: barColor }]} height={5} style={styles.bar} />
        <Text style={styles.rowProgressText}>{progressLabel}</Text>
        {status && tone ? (
          <Pill label={status.label} icon={status.icon} color={tone.text} backgroundColor={tone.soft} />
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: space.xxxl * 2,
    alignItems: "center",
  },
  segmented: {
    marginBottom: space.md,
  },
  sortScroll: {
    marginHorizontal: -space.lg,
    marginBottom: space.xl,
  },
  sortRow: {
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  row: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    gap: space.sm + 2,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...type.body,
    fontWeight: "700",
    color: colors.text,
  },
  rowMeta: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 2,
  },
  rowTrail: {
    alignItems: "flex-end",
  },
  rowAmount: {
    ...type.amountSmall,
    color: colors.text,
  },
  rowAmountClosed: {
    color: colors.textSecondary,
  },
  rowAmountCaption: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 1,
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: 52,
  },
  bar: {
    flex: 1,
  },
  rowProgressText: {
    ...type.caption,
    fontSize: 11,
    color: colors.textSecondary,
    minWidth: 54,
  },
  footnote: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: space.md,
  },
});

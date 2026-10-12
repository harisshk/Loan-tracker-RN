import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useRef, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    Button,
    Card,
    Chip,
    colors,
    Divider,
    EmptyState,
    Field,
    IconBadge,
    kindColors,
    ListRow,
    radius,
    Screen,
    ScreenHeader,
    SectionHeader,
    shadow,
    space,
    StatRow,
    StatTile,
    type,
} from "../components/ui/kit";
import {
    calculateEMIBreakdown,
    getBulletMaturityDate,
    getInstalmentDate,
    getMonthsElapsed,
} from "../utils/emiCalculator";
import { formatINR, formatINRCompact, formatMonthYear } from "../utils/format";
import { getLoans, getPayments } from "../utils/storage";

const fc = (v) => formatINR(v);
const fmo = (d) =>
  new Date(d).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

/** One-tap extra monthly amounts for the simulator. */
const QUICK_EXTRAS = [2000, 5000, 10000, 20000];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Calendar months from `from` to `to` (0 = same month)
const monthOffset = (from, to) =>
  (to.getFullYear() - from.getFullYear()) * 12 +
  (to.getMonth() - from.getMonth());

// ── Core simulation engine ───────────────────────────────────────────────────
// Month 1 is the current calendar month. Each EMI loan pays one EMI per month
// starting from the month of its next unpaid instalment (l.firstEmiMonth).
function simulateDebtFree(loanStates, extraMonthlyBudget = 0, asOf = startOfToday()) {
  // Deep copy
  const states = loanStates.map((l) => ({ ...l }));
  const closures = [];
  let month = 0;
  const MAX_MONTHS = 600; // 50-year safety cap

  while (states.some((l) => !l.closed) && month < MAX_MONTHS) {
    month++;
    const date = new Date(asOf.getFullYear(), asOf.getMonth() + month - 1, 1);

    // Step 1: Aging Logic
    states.forEach((l) => {
      if (l.closed) return;

      if (l.loanType === "emi") {
        // This month's EMI is already paid (or the loan hasn't started yet)
        if (month < l.firstEmiMonth) return;
        const r = l.interest / 12 / 100;
        const interestPortion = l.remainingPrincipal * r;
        const principalPortion = Math.max(0, l.emiAmount - interestPortion);
        l.remainingPrincipal = Math.max(
          0,
          l.remainingPrincipal - principalPortion,
        );
        l.interestPaid = (l.interestPaid || 0) + interestPortion;
        l.tenureRemaining -= 1;
        l.emisPaid += 1;
        if (l.remainingPrincipal < 5 || l.tenureRemaining <= 0) {
          l.remainingPrincipal = 0;
          l.closed = true;
          closures.push({
            id: l.id,
            name: l.name,
            loanType: l.loanType,
            month,
            date:
              l.emisPaid <= l.tenure
                ? getInstalmentDate(l.startDate, l.emisPaid)
                : new Date(date),
          });
        }
      } else if (l.loanType === "bullet") {
        l.tenureRemaining -= 1;
        if (l.tenureRemaining <= 0) {
          // Mandatory payoff at maturity
          l.remainingPrincipal = 0;
          l.closed = true;
          closures.push({
            id: l.id,
            name: l.name,
            loanType: l.loanType,
            month,
            date: new Date(date),
            isMaturityClosure: true, // Distinguish from manual prepayments
          });
        }
      }
    });

    // Step 2: Apply extra budget to highest-priority open loan
    let budget = extraMonthlyBudget;
    const open = states
      .filter((l) => !l.closed)
      .sort((a, b) => {
        // Highest interest rate first
        if (b.interest !== a.interest) return b.interest - a.interest;
        return a.remainingPrincipal - b.remainingPrincipal;
      });

    for (const loan of open) {
      if (budget <= 0) break;
      const pay = Math.min(budget, loan.remainingPrincipal);
      loan.remainingPrincipal = Math.max(0, loan.remainingPrincipal - pay);
      budget -= pay;
      if (loan.remainingPrincipal < 1) {
        loan.remainingPrincipal = 0;
        if (!loan.closed) {
          loan.closed = true;
          if (!closures.find((c) => c.id === loan.id)) {
            closures.push({
              id: loan.id,
              name: loan.name,
              loanType: loan.loanType,
              month,
              date: new Date(date),
            });
          }
        }
      }
    }
  }

  const debtFreeDate =
    month < MAX_MONTHS
      ? new Date(asOf.getFullYear(), asOf.getMonth() + month - 1, 1)
      : null;

  return { closures, debtFreeMonth: month, debtFreeDate };
}

// ── Prep loan states from raw data ────────────────────────────────────────────
function buildLoanStates(loans, payments, asOf = startOfToday()) {
  const parseSafe = (val) => parseFloat(String(val || "0").replace(/,/g, ""));
  return loans
    .filter((l) => l.status !== "closed")
    .map((loan) => {
      const principal = parseSafe(loan.principal);
      const interest = parseFloat(loan.interest) || 0;
      const tenure = parseInt(String(loan.tenure).replace(/,/g, "")) || 0;
      const emiAmount = parseSafe(loan.emiAmount);
      const loanType = loan.loanType || "emi";

      // Same starting point as the Loans and Dashboard screens
      const monthsElapsed = getMonthsElapsed(loan.startDate, asOf);

      const extraPayments = payments.filter((p) => p.loanId === loan.id);
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

      // For bullet loans — fixed maturity date regardless of extra payments
      let bulletMaturity = null;
      if (loanType === "bullet") {
        bulletMaturity = getBulletMaturityDate(loan.startDate, tenure);
      }

      // Simulation month (1 = this month) of the next unpaid EMI
      const firstEmiMonth =
        monthsElapsed < tenure
          ? Math.max(
              1,
              monthOffset(asOf, getInstalmentDate(loan.startDate, monthsElapsed + 1)) + 1,
            )
          : 1;

      return {
        id: loan.id,
        name: loan.loanName,
        loanType,
        interest,
        emiAmount,
        remainingPrincipal: bd.remainingPrincipalAmount,
        totalInterestRemaining: bd.remainingInterestAmount,
        // Bullet: months until the maturity month (closes in that month)
        tenureRemaining:
          loanType === "bullet"
            ? Math.max(0, monthOffset(asOf, bulletMaturity) + 1)
            : Math.max(0, tenure - monthsElapsed),
        closed: bd.remainingAmount <= 5,
        startDate: loan.startDate,
        tenure,
        emisPaid: Math.min(monthsElapsed, tenure),
        firstEmiMonth,
        interestPaid: 0,
        bulletMaturity, // bullet loans have a fixed date
      };
    });
}

// ── Small pieces ──────────────────────────────────────────────────────────────

/** Numbered marker for the payoff order list. */
function OrderBadge({ index, loanType }) {
  const kind = loanType === "bullet" ? kindColors.bullet : kindColors.emi;
  return (
    <View
      style={[styles.orderBadge, { backgroundColor: kind.soft }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text style={[styles.orderBadgeText, { color: kind.text }]}>{index}</Text>
    </View>
  );
}

const formatDuration = (months) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y && m) return `${y} yr ${m} mo`;
  if (y) return `${y} yr`;
  return `${m} mo`;
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function DebtFree() {
  const [loanStates, setLoanStates] = useState([]);
  const [extraInput, setExtraInput] = useState("");
  // Latest typed amount, read by loadData without making it re-fetch on every keystroke.
  const extraRef = useRef("");
  const hasSuggested = useRef(false);
  const [suggestedAmount, setSuggestedAmount] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [accelerated, setAccelerated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [totalEMI, setTotalEMI] = useState(0);
  const [totalRemaining, setTotalRemaining] = useState(0);
  const [asOf, setAsOf] = useState(startOfToday);

  const loadData = useCallback(async () => {
    try {
      const loans = await getLoans();
      const payments = await getPayments();
      const today = startOfToday();
      const states = buildLoanStates(loans, payments, today);

      setAsOf(today);
      setLoanStates(states);
      setTotalEMI(
        states
          .filter((l) => l.loanType === "emi")
          .reduce((s, l) => s + l.emiAmount, 0),
      );
      setTotalRemaining(states.reduce((s, l) => s + l.remainingPrincipal, 0));

      const base = simulateDebtFree(
        states.map((l) => ({ ...l })),
        0,
        today,
      );
      setBaseline(base);

      // Smart suggestion for Gold loans
      if (!hasSuggested.current && states.some((l) => l.loanType === "bullet")) {
        const gold = states.find((l) => l.loanType === "bullet");
        // Suggest closing in roughly half the remaining time or at least 10k
        const suggested = Math.max(
          1000,
          Math.ceil(
            gold.remainingPrincipal / Math.max(1, gold.tenureRemaining / 2),
          ),
        );
        setExtraInput(String(suggested));
        extraRef.current = String(suggested);
        setSuggestedAmount(suggested);
        setAccelerated(
          simulateDebtFree(
            states.map((l) => ({ ...l })),
            suggested,
            today,
          ),
        );
        hasSuggested.current = true;
      } else {
        const extra = parseFloat(extraRef.current) || 0;
        if (extra > 0) {
          setAccelerated(
            simulateDebtFree(
              states.map((l) => ({ ...l })),
              extra,
              today,
            ),
          );
        } else {
          setAccelerated(null);
        }
      }
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

  const handleExtraChange = (val) => {
    const clean = val.replace(/[^0-9]/g, "");
    extraRef.current = clean;
    setExtraInput(clean);
    applyExtra(clean);
  };

  const applyExtra = (raw = extraInput) => {
    const extra = parseFloat(raw) || 0;
    if (extra > 0 && loanStates.length > 0) {
      setAccelerated(
        simulateDebtFree(
          loanStates.map((l) => ({ ...l })),
          extra,
          asOf,
        ),
      );
    } else {
      setAccelerated(null);
    }
  };

  const pickExtra = (amount) => {
    const v = String(amount);
    extraRef.current = v;
    setExtraInput(v);
    applyExtra(v);
  };

  // Derived
  const noLoans = loanStates.length === 0;
  const baseDate = baseline?.debtFreeDate;
  const accDate = accelerated?.debtFreeDate;
  const monthsSaved =
    accelerated && baseline
      ? Math.max(0, baseline.debtFreeMonth - accelerated.debtFreeMonth)
      : 0;
  const extraAmt = parseFloat(extraInput) || 0;

  const daysToFree = baseDate ? Math.ceil((baseDate - asOf) / 86400000) : null;
  const baseMonths = Math.round(baseline?.debtFreeMonth || 0);

  // Merge + sort closures for timeline
  const timelineItems =
    (accelerated || baseline)?.closures
      ?.slice()
      .sort((a, b) => a.month - b.month) || [];

  const quickExtras =
    suggestedAmount && !QUICK_EXTRAS.includes(suggestedAmount)
      ? [suggestedAmount, ...QUICK_EXTRAS]
      : QUICK_EXTRAS;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <ScreenHeader
          back
          title="Debt-free planner"
          subtitle="When you'll clear every loan, and how to get there sooner"
        />

        {!loaded ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primaryFill} />
          </View>
        ) : noLoans ? (
          <Card>
            <EmptyState
              icon="flag-outline"
              title="You're already debt-free"
              message="No active loans found. Add a loan to plan its payoff."
            />
          </Card>
        ) : (
          <>
            {/* Hero: debt-free date at the current pace */}
            <View style={styles.heroCard}>
              <LinearGradient
                colors={colors.heroGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hero}
              >
                <Text style={styles.heroOverline}>Debt-free by · current pace</Text>
                <Text
                  style={styles.heroValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {baseDate ? fmo(baseDate) : "N/A"}
                </Text>
                {daysToFree != null ? (
                  <Text style={styles.heroSub}>
                    {baseMonths} months to go · {formatDuration(baseMonths)}
                  </Text>
                ) : null}

                <View style={styles.heroStats}>
                  <View
                    style={styles.heroStat}
                    accessible
                    accessibilityLabel={`Principal left: ${fc(totalRemaining)}`}
                  >
                    <Text style={styles.heroStatLabel}>Principal left</Text>
                    <Text
                      style={styles.heroStatValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {fc(totalRemaining)}
                    </Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View
                    style={styles.heroStat}
                    accessible
                    accessibilityLabel={`Monthly EMIs: ${fc(totalEMI)} per month`}
                  >
                    <Text style={styles.heroStatLabel}>Monthly EMIs</Text>
                    <Text
                      style={styles.heroStatValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {fc(totalEMI)}/mo
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            {/* Extra payment simulator */}
            <SectionHeader title="Pay extra each month" style={styles.sectionGap} />
            <Card>
              <Field
                label="Extra amount per month"
                prefix="₹"
                value={extraInput}
                onChangeText={handleExtraChange}
                placeholder="e.g. 10000"
                keyboardType="numeric"
                hint={
                  suggestedAmount && extraAmt > 0 && extraInput === String(suggestedAmount)
                    ? "Suggested to clear your gold loan early. Adjust as you like."
                    : "Extra goes to your highest-rate loan first."
                }
              />
              <View style={styles.chips}>
                {quickExtras.map((amt) => (
                  <Chip
                    key={amt}
                    label={
                      amt === suggestedAmount
                        ? `Suggested ${formatINRCompact(amt)}`
                        : `+${formatINRCompact(amt)}`
                    }
                    icon={amt === suggestedAmount ? "sparkles-outline" : undefined}
                    selected={extraInput === String(amt)}
                    onPress={() => pickExtra(amt)}
                  />
                ))}
              </View>
              <Button
                label="Update"
                variant="secondary"
                icon="refresh"
                onPress={() => applyExtra()}
                style={styles.updateBtn}
              />

              {accelerated ? (
                <>
                  <Divider style={styles.resultDivider} />
                  <Text style={styles.resultTitle}>
                    With {fc(extraAmt)}/mo extra
                  </Text>
                  <StatRow>
                    <StatTile
                      label="New date"
                      value={accDate ? formatMonthYear(accDate) : "N/A"}
                      caption={baseDate ? `was ${formatMonthYear(baseDate)}` : undefined}
                      tone={monthsSaved > 0 ? "positive" : "default"}
                    />
                    <StatTile
                      label="Months saved"
                      value={String(monthsSaved)}
                      caption={monthsSaved > 0 ? "earlier" : "same month"}
                      tone={monthsSaved > 0 ? "positive" : "default"}
                    />
                    <StatTile
                      label="Finish in"
                      value={formatDuration(Math.round(accelerated.debtFreeMonth))}
                      caption={`${Math.round(accelerated.debtFreeMonth)} months`}
                    />
                  </StatRow>
                </>
              ) : null}
            </Card>

            {/* Payoff order */}
            {timelineItems.length > 0 ? (
              <>
                <SectionHeader title="Payoff order" style={styles.sectionGap} />
                <Text style={styles.sectionNote}>
                  {accelerated
                    ? "With your extra payments applied"
                    : "At your current payment pace"}
                </Text>
                <Card padded={false}>
                  {timelineItems.map((item, i) => {
                    const monthsAway =
                      (item.date.getFullYear() - asOf.getFullYear()) * 12 +
                      (item.date.getMonth() - asOf.getMonth());
                    const status = item.isMaturityClosure
                      ? "Fixed maturity payoff"
                      : monthsAway <= 0
                        ? "Cleared this month"
                        : monthsAway === 1
                          ? "Next month"
                          : `${monthsAway} months from now`;
                    const typeLabel = item.loanType === "bullet" ? "Gold / bullet" : "EMI";
                    return (
                      <ListRow
                        key={item.id}
                        divider={i > 0}
                        leading={<OrderBadge index={i + 1} loanType={item.loanType} />}
                        title={item.name || "Loan"}
                        subtitle={`${typeLabel} · ${status}`}
                        value={formatMonthYear(item.date)}
                        valueColor={item.isMaturityClosure ? colors.warning : undefined}
                        accessibilityLabel={`${i + 1}. ${item.name || "Loan"}, ${typeLabel}, closes ${fmo(item.date)}, ${status}`}
                      />
                    );
                  })}
                </Card>
              </>
            ) : null}

            {/* Per-loan snapshot */}
            <SectionHeader title="Your loans" count={loanStates.length} style={styles.sectionGap} />
            <Card padded={false}>
              {loanStates.map((l, i) => {
                const kind = l.loanType === "bullet" ? kindColors.bullet : kindColors.emi;
                return (
                  <ListRow
                    key={l.id}
                    divider={i > 0}
                    leading={
                      <IconBadge name={kind.icon} color={kind.text} backgroundColor={kind.soft} />
                    }
                    title={l.name || "Loan"}
                    subtitle={
                      l.loanType === "bullet"
                        ? `Gold / bullet · ${l.interest}% p.a.`
                        : `EMI ${fc(l.emiAmount)}/mo · ${l.interest}% p.a.`
                    }
                    value={fc(l.remainingPrincipal)}
                    valueCaption="left"
                  />
                );
              })}
            </Card>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  loading: {
    paddingVertical: space.xxxl * 2,
    alignItems: "center",
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
  heroValue: {
    ...type.display,
    color: colors.heroText,
    marginTop: space.sm,
  },
  heroSub: {
    ...type.label,
    fontWeight: "500",
    color: colors.heroTextSecondary,
    marginTop: space.xs,
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
    ...type.amount,
    color: colors.heroText,
    marginTop: 2,
  },
  sectionGap: {
    marginTop: space.xxl,
  },
  sectionNote: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: -space.sm,
    marginBottom: space.md,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: -space.xs,
  },
  updateBtn: {
    marginTop: space.lg,
  },
  resultDivider: {
    marginVertical: space.lg,
  },
  resultTitle: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.md,
  },
  orderBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  orderBadgeText: {
    ...type.headline,
    fontVariant: ["tabular-nums"],
  },
});

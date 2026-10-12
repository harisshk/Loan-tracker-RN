import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  colors,
  Divider,
  EmptyState,
  Gap,
  IconBadge,
  kindColors,
  ListRow,
  Pill,
  PressableScale,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
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
  parseLocalDate,
  toLocalISOString,
} from "../utils/emiCalculator";
import { formatINR, formatINRCompact, formatPercent } from "../utils/format";
import { getLoans, getPayments } from "../utils/storage";

const fd = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Urgency tone for a bullet loan; label + icon so colour is never the only signal. */
function urgencyMeta(days) {
  if (days < 0)
    return { label: "Matured", icon: "alert-circle", text: colors.danger, soft: colors.dangerSoft, fill: colors.dangerFill };
  if (days <= 30)
    return { label: "Due soon", icon: "alert-circle", text: colors.danger, soft: colors.dangerSoft, fill: colors.dangerFill };
  if (days <= 90)
    return { label: "Coming up", icon: "time-outline", text: colors.warning, soft: colors.warningSoft, fill: colors.warningFill };
  if (days <= 180)
    return { label: "Upcoming", icon: "calendar-outline", text: colors.info, soft: colors.infoSoft, fill: colors.infoFill };
  return { label: "On track", icon: "checkmark-circle", text: colors.primary, soft: colors.primarySoft, fill: colors.primaryFill };
}

export default function MaturityAlerts() {
  const router = useRouter();
  const [bulletLoans, setBulletLoans] = useState([]);
  const [nearingEMIs, setNearingEMIs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const loans = await getLoans();
    const payments = await getPayments();

    const bullets = [];
    const nearEMI = [];

    loans
      .filter((l) => l.status !== "closed")
      .forEach((loan) => {
        const parseSafe = (val) =>
          parseFloat(String(val || "0").replace(/,/g, ""));
        const principal = parseSafe(loan.principal);
        const interest = parseFloat(loan.interest) || 0;
        const tenure = parseInt(String(loan.tenure).replace(/,/g, "")) || 0;
        const emiAmount = parseSafe(loan.emiAmount);
        const loanType = loan.loanType || "emi";

        if (loanType === "bullet") {
          const maturity = getBulletMaturityDate(loan.startDate, tenure);
          const daysLeft = Math.ceil((maturity - today) / 86400000);

          const monthsElapsed = getMonthsElapsed(loan.startDate, today);

          const extraPayments = payments.filter((p) => p.loanId === loan.id);
          const bd = calculateEMIBreakdown(
            principal,
            interest,
            tenure,
            monthsElapsed,
            emiAmount,
            "bullet",
            extraPayments,
            loan.startDate,
          );

          // Monthly savings needed to accumulate remaining amount
          const monthsRemaining = Math.max(
            1,
            Math.ceil((maturity - today) / (1000 * 60 * 60 * 24 * 30.44)),
          );
          const monthlySavingsNeeded = bd.remainingAmount / monthsRemaining;

          bullets.push({
            loan,
            maturity,
            daysLeft,
            totalDays: tenure * 30,
            dueAmount: bd.remainingAmount,
            principal: bd.remainingPrincipalAmount,
            interest: bd.remainingInterestAmount,
            totalInterest: bd.totalInterest,
            monthsRemaining,
            monthlySavingsNeeded,
            extraPayments,
          });
        } else {
          // EMI loans nearing end (last 3 EMIs)
          const emisDone = Math.min(
            getMonthsElapsed(loan.startDate, today),
            tenure,
          );
          const remaining = tenure - emisDone;
          if (remaining > 0 && remaining <= 6) {
            // Due date of the last EMI
            const endDate = getInstalmentDate(loan.startDate, tenure);
            const extraPayments = payments.filter((p) => p.loanId === loan.id);
            const bd = calculateEMIBreakdown(
              principal,
              interest,
              tenure,
              emisDone,
              emiAmount,
              "emi",
              extraPayments,
              loan.startDate,
            );
            nearEMI.push({
              loan,
              endDate,
              emisLeft: remaining,
              remainingAmount: bd.remainingPrincipalAmount,
              monthlyEMI: emiAmount,
            });
          }
        }
      });

    // Sort by urgency
    bullets.sort((a, b) => a.daysLeft - b.daysLeft);
    nearEMI.sort((a, b) => a.emisLeft - b.emisLeft);

    setBulletLoans(bullets);
    setNearingEMIs(nearEMI);
    setLoaded(true);
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

  // ── Navigation (same routes/params as the loan detail screen) ────────────
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

  const renewLoan = (item) =>
    router.push({
      pathname: "/renew-loan",
      params: {
        id: item.loan.id,
        action: "renew",
        loanName: item.loan.loanName,
        remainingInterest: item.interest,
        oldPrincipal: item.loan.principal,
        oldInterestRate: item.loan.interest,
        oldMaturity: toLocalISOString(item.maturity),
      },
    });

  const closeLoan = (item) =>
    router.push({
      pathname: "/renew-loan",
      params: {
        id: item.loan.id,
        action: "close",
        loanName: item.loan.loanName,
        remainingAmount: item.dueAmount,
      },
    });

  // Total exposure
  const totalExposure = bulletLoans.reduce((s, b) => s + b.dueAmount, 0);
  const criticalCount = bulletLoans.filter((b) => b.daysLeft <= 30).length;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader
        title="Maturity alerts"
        subtitle="Bullet loan countdowns and EMI endings"
        back
      />

      {!loaded ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryFill} />
        </View>
      ) : bulletLoans.length === 0 && nearingEMIs.length === 0 ? (
        <Card>
          <EmptyState
            icon="checkmark-done-outline"
            title="All clear"
            message="No active bullet or gold loans, and no EMI loans in their last six months."
          />
        </Card>
      ) : (
        <>
          {/* Summary */}
          {bulletLoans.length > 0 ? (
            <>
              <Card>
                <StatRow>
                  <StatTile
                    label="Due at maturity"
                    value={formatINRCompact(totalExposure)}
                    caption="all bullet loans"
                  />
                  <StatTile
                    label="Bullet loans"
                    value={String(bulletLoans.length)}
                    caption="active"
                  />
                  <StatTile
                    label="Within 30 days"
                    value={String(criticalCount)}
                    caption={criticalCount > 0 ? "need attention" : "none"}
                    tone={criticalCount > 0 ? "critical" : "default"}
                  />
                </StatRow>
              </Card>
              <Gap />

              <SectionHeader title="Bullet and gold loans" count={bulletLoans.length} />
              {bulletLoans.map((item, i) => (
                <View key={item.loan.id} style={i > 0 ? styles.cardGap : null}>
                  <BulletCard
                    item={item}
                    onOpen={() => openLoan(item.loan)}
                    onRenew={() => renewLoan(item)}
                    onClose={() => closeLoan(item)}
                  />
                </View>
              ))}
              <Gap />
            </>
          ) : null}

          {/* EMI loans nearing end */}
          {nearingEMIs.length > 0 ? (
            <>
              <SectionHeader title="EMI loans nearing completion" count={nearingEMIs.length} />
              <Card padded={false}>
                {nearingEMIs.map((item, i) => (
                  <ListRow
                    key={item.loan.id}
                    divider={i > 0}
                    leading={
                      <IconBadge
                        name={kindColors.emi.icon}
                        color={kindColors.emi.text}
                        backgroundColor={kindColors.emi.soft}
                      />
                    }
                    title={item.loan.loanName}
                    subtitle={`Last EMI ${fd(item.endDate)} · ${formatINR(item.monthlyEMI)}/month`}
                    value={formatINR(item.remainingAmount)}
                    valueCaption="principal left"
                    onPress={() => openLoan(item.loan)}
                    accessibilityHint="Opens loan details"
                  >
                    <Pill
                      label={`${item.emisLeft} EMI${item.emisLeft !== 1 ? "s" : ""} left`}
                      icon="flag-outline"
                      color={colors.primary}
                      backgroundColor={colors.primarySoft}
                    />
                  </ListRow>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function BulletCard({ item, onOpen, onRenew, onClose }) {
  const meta = urgencyMeta(item.daysLeft);
  const matured = item.daysLeft < 0;
  const kind = kindColors.bullet;

  // Share of the term that has passed, from the start date to maturity.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseLocalDate(item.loan.startDate);
  const termMs = item.maturity - start;
  const elapsedPct = termMs > 0 ? Math.max(0, Math.min(100, ((today - start) / termMs) * 100)) : 100;

  const countdownValue = matured ? "Matured" : item.daysLeft === 0 ? "Today" : String(item.daysLeft);
  const countdownCaption = matured
    ? `${Math.abs(item.daysLeft)} day${Math.abs(item.daysLeft) === 1 ? "" : "s"} ago`
    : item.daysLeft === 0
      ? "matures"
      : `day${item.daysLeft === 1 ? "" : "s"} left`;

  return (
    <Card>
      <PressableScale
        onPress={onOpen}
        style={styles.cardTop}
        accessibilityLabel={`${item.loan.loanName}. ${meta.label}. Matures ${fd(item.maturity)}. ${countdownValue} ${countdownCaption}.`}
        accessibilityHint="Opens loan details"
      >
        <IconBadge name={kind.icon} color={kind.text} backgroundColor={kind.soft} />
        <View style={styles.cardTitleWrap}>
          <Text style={styles.loanName} numberOfLines={1}>
            {item.loan.loanName}
          </Text>
          <Text style={styles.maturityDate} numberOfLines={1}>
            {matured ? "Matured" : "Matures"} {fd(item.maturity)}
          </Text>
          <Pill label={meta.label} icon={meta.icon} color={meta.text} backgroundColor={meta.soft} style={styles.pill} />
        </View>
        <View style={styles.countdown}>
          <Text
            style={[styles.countdownValue, matured && styles.countdownValueSmall, { color: matured || item.daysLeft <= 30 ? colors.danger : colors.text }]}
            numberOfLines={1}
          >
            {countdownValue}
          </Text>
          <Text style={[styles.countdownCaption, matured && { color: colors.danger }]}>{countdownCaption}</Text>
        </View>
      </PressableScale>

      <View style={styles.progressWrap}>
        <ProgressBar
          segments={[{ value: elapsedPct, color: meta.fill }]}
          height={6}
          accessibilityLabel={`${formatPercent(elapsedPct, 0)} of the term elapsed`}
        />
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>{formatPercent(elapsedPct, 0)} of term elapsed</Text>
          <Text style={styles.progressText}>
            {matured ? "Term over" : `${item.monthsRemaining} month${item.monthsRemaining === 1 ? "" : "s"} left`}
          </Text>
        </View>
      </View>

      <Divider style={styles.divider} />

      <View style={styles.figures}>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>Due at maturity</Text>
          <Text style={[styles.figureValue, matured && { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(item.dueAmount)}
          </Text>
          <Text style={styles.figureCaption} numberOfLines={1}>
            {formatINRCompact(item.principal)} principal + {formatINRCompact(item.interest)} interest
          </Text>
        </View>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>Save each month</Text>
          <Text style={styles.figureValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(item.monthlySavingsNeeded)}
          </Text>
          <Text style={styles.figureCaption} numberOfLines={1}>
            for {item.monthsRemaining} month{item.monthsRemaining === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button label="Renew" icon="refresh" variant="secondary" onPress={onRenew} style={styles.action} />
        <Button label="Close loan" icon="checkmark-done" variant="secondary" onPress={onClose} style={styles.action} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: space.xxxl * 2,
    alignItems: "center",
  },
  cardGap: {
    marginTop: space.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  loanName: {
    ...type.body,
    fontWeight: "700",
    color: colors.text,
  },
  maturityDate: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 2,
  },
  pill: {
    marginTop: space.sm,
  },
  countdown: {
    alignItems: "flex-end",
    maxWidth: "40%",
  },
  countdownValue: {
    ...type.display,
    fontSize: 30,
    lineHeight: 34,
  },
  countdownValueSmall: {
    ...type.amount,
  },
  countdownCaption: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
  },
  progressWrap: {
    marginTop: space.lg,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.xs + 2,
  },
  progressText: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
  },
  divider: {
    marginVertical: space.lg,
  },
  figures: {
    flexDirection: "row",
    gap: space.md,
  },
  figure: {
    flex: 1,
    minWidth: 0,
  },
  figureLabel: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
  },
  figureValue: {
    ...type.amount,
    color: colors.text,
    marginTop: 2,
  },
  figureCaption: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: 1,
  },
  actions: {
    flexDirection: "row",
    gap: space.md,
    marginTop: space.lg,
  },
  action: {
    flex: 1,
  },
});

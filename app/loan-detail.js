import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ProgressRing from "../components/dashboard/ProgressRing";
import {
  Button,
  Card,
  colors,
  Divider,
  Field,
  Gap,
  HeaderAction,
  IconBadge,
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
  getNextInstalment,
  parseLocalDate,
  toLocalISOString,
} from "../utils/emiCalculator";
import {
  daysFromToday,
  formatDateWithDay,
  formatINR,
  formatINRCompact,
  formatPercent,
  formatRelativeDays,
  toNumber,
} from "../utils/format";
import { addPayment, getLoans, getPayments } from "../utils/storage";

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export default function LoanDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const {
    id: paramId,
    loanName: paramName,
    principal: paramPrincipal,
    interest: paramInterest,
    emiAmount: paramEmi,
    tenure: paramTenure,
    startDate: paramStart,
    loanType: paramType,
  } = params;
  const [refreshing, setRefreshing] = useState(false);
  const [extraPayments, setExtraPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulationAmount, setSimulationAmount] = useState("");
  // "Log extra payment" sheet (Alert.prompt only exists on iOS)
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [loan, setLoan] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const allLoans = await getLoans();
      const allPayments = await getPayments();
      const foundLoan = allLoans.find((l) => l.id === paramId);
      if (foundLoan) {
        setLoan(foundLoan);
      } else {
        // Fallback to params
        const lType = paramType || "emi";
        setLoan({
          loanName: paramName || "Loan Detail",
          principal: parseFloat(paramPrincipal) || 0,
          interest: parseFloat(paramInterest) || 0,
          emiAmount: parseFloat(paramEmi) || 0,
          tenure: parseInt(paramTenure) || 0,
          startDate: paramStart || new Date().toISOString().split("T")[0],
          loanType: lType,
        });
      }
      setExtraPayments(allPayments.filter((p) => p.loanId === paramId));
    } catch (e) {
      console.error("Error loading loan details:", e);
    } finally {
      setLoading(false);
    }
  }, [paramId, paramName, paramPrincipal, paramInterest, paramEmi, paramTenure, paramStart, paramType]);

  // Reload whenever the screen regains focus (e.g. back from Edit or Renew).
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  if (loading || !loan) {
    return (
      <Screen>
        <ScreenHeader title={paramName || "Loan"} back />
        <View style={styles.loading}>
          {loading ? (
            <ActivityIndicator color={colors.primaryFill} />
          ) : (
            <Text style={styles.mutedText}>{"Couldn't load this loan. Go back and try again."}</Text>
          )}
        </View>
      </Screen>
    );
  }

  const loanType = loan.loanType || "emi";
  const isBullet = loanType === "bullet";
  const isClosed = params.status === "closed" || loan.status === "closed";

  // Calculate months elapsed
  const today = new Date();

  // EMIs whose due date (clamped to month end for 29th-31st starts) has arrived
  const monthsElapsed = getMonthsElapsed(loan.startDate, today);

  const bulletRenewalDate =
    loanType === "bullet" ? getBulletMaturityDate(loan.startDate, loan.tenure) : null;
  const daysToRenewal = bulletRenewalDate
    ? Math.ceil((bulletRenewalDate.getTime() - today.getTime()) / 86400000)
    : 0;

  // Calculate EMI breakdown using proper amortization
  // Use the user-provided EMI amount for accurate calculation
  const breakdown = calculateEMIBreakdown(
    loan.principal,
    loan.interest,
    loan.tenure,
    monthsElapsed,
    loan.emiAmount,
    loanType,
    extraPayments,
    loan.startDate,
  );

  const getSimulationResult = () => {
    if (!simulationAmount) return null;
    const simAmount = parseFloat(simulationAmount.replace(/,/g, ""));
    if (isNaN(simAmount) || simAmount <= 0) return null;

    const simulatedExtra = [
      ...extraPayments,
      {
        amount: simAmount,
        date: toLocalISOString(new Date()),
        kind: "prepayment",
      },
    ];
    const simBreakdown = calculateEMIBreakdown(
      loan.principal,
      loan.interest,
      loan.tenure,
      monthsElapsed,
      loan.emiAmount,
      loan.loanType,
      simulatedExtra,
      loan.startDate,
    );

    // EMI loans: extra interest saved by the hypothetical prepayment on top of
    // what logged prepayments already save. Bullet loans keep the old measure.
    const interestSaved = Math.max(
      0,
      loanType === "bullet"
        ? breakdown.remainingInterestAmount - simBreakdown.remainingInterestAmount
        : simBreakdown.interestSaved - breakdown.interestSaved,
    );

    let monthsShortened = 0;
    if (loan.loanType !== "bullet" && loan.emiAmount > 0) {
      let simulatedRemainingMonths = 0;
      let tempPrincipal = simBreakdown.remainingPrincipalAmount;
      const monthlyRate = loan.interest / 12 / 100;
      while (tempPrincipal > 0.01 && simulatedRemainingMonths < loan.tenure) {
        const interest = tempPrincipal * monthlyRate;
        const principalRed = Math.min(tempPrincipal, loan.emiAmount - interest);
        if (principalRed <= 0) break;
        tempPrincipal -= principalRed;
        simulatedRemainingMonths++;
      }

      let currentRemainingMonths = 0;
      let tempP = breakdown.remainingPrincipalAmount;
      while (tempP > 0.01 && currentRemainingMonths < loan.tenure) {
        const interest = tempP * monthlyRate;
        const principalRed = Math.min(tempP, loan.emiAmount - interest);
        if (principalRed <= 0) break;
        tempP -= principalRed;
        currentRemainingMonths++;
      }

      monthsShortened = Math.max(0, currentRemainingMonths - simulatedRemainingMonths);
    }

    return {
      interestSaved,
      monthsShortened,
      newRemainingAmount: simBreakdown.remainingAmount,
    };
  };

  const simResult = getSimulationResult();

  const progress = loan.tenure > 0 ? breakdown.paymentsMade / loan.tenure : 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCloseLoan = () => {
    // Only pay the remaining balance to completely close the loan
    router.push({
      pathname: "/renew-loan",
      params: {
        id: params.id,
        action: "close",
        loanName: loan.loanName,
        remainingAmount: breakdown.remainingAmount, // Full P + I
      },
    });
  };

  const handleLogExtraPayment = () => {
    setPaymentAmount("");
    setPaymentError("");
    setPaymentSheetOpen(true);
  };

  const saveExtraPayment = async () => {
    const amount = parseFloat(String(paymentAmount).replace(/,/g, ""));
    if (!(amount > 0)) {
      setPaymentError("Enter the amount you paid towards principal");
      return;
    }
    setSavingPayment(true);
    try {
      await addPayment({
        loanId: params.id,
        amount: String(amount),
        date: toLocalISOString(new Date()),
        note: "Extra Payment",
        kind: "prepayment",
      });
      setPaymentSheetOpen(false);
      await loadData();
      Alert.alert("Payment logged", `${formatINR(amount)} prepayment saved. Your balance and interest are updated.`);
    } catch {
      setPaymentError("Couldn't save the payment. Check your connection and try again.");
    } finally {
      setSavingPayment(false);
    }
  };


  const handleRenewLoan = () => {
    // Pay interest, set new principal, set new interest
    const renewalDateStr = toLocalISOString(getBulletMaturityDate(loan.startDate, loan.tenure));
    router.push({
      pathname: "/renew-loan",
      params: {
        id: params.id,
        action: "renew",
        loanName: loan.loanName,
        remainingInterest: breakdown.remainingInterestAmount,
        oldPrincipal: loan.principal,
        oldInterestRate: loan.interest,
        oldMaturity: renewalDateStr,
      },
    });
  };

  const openEdit = () =>
    router.push({
      pathname: "/edit-loan",
      params: {
        id: params.id,
        loanName: loan.loanName,
        loanType: loan.loanType,
        principal: loan.principal,
        interest: loan.interest,
        emiAmount: loan.emiAmount,
        tenure: loan.tenure,
        startDate: loan.startDate,
      },
    });

  const openSchedule = () =>
    router.push({
      pathname: "/amortization",
      params: {
        id: params.id,
        loanName: loan.loanName,
        loanType: loanType,
        principal: loan.principal,
        interest: loan.interest,
        emiAmount: loan.emiAmount || 0,
        tenure: loan.tenure,
        startDate: loan.startDate,
      },
    });

  // ── Display values (presentation only) ─────────────────────────────────────
  const principalNum = toNumber(loan.principal);
  const rate = toNumber(loan.interest);
  const tenure = parseInt(loan.tenure) || 0;
  const startDate = parseLocalDate(loan.startDate);
  const elapsedMonths = Math.min(monthsElapsed, tenure);
  const termPct = tenure > 0 ? Math.min(1, Math.max(0, monthsElapsed / tenure)) * 100 : 0;
  const repaidPct = isBullet
    ? termPct
    : principalNum > 0
      ? Math.min(100, Math.max(0, (breakdown.principalPaid / principalNum) * 100))
      : Math.min(1, Math.max(0, progress)) * 100;
  const paidOff = !isBullet && breakdown.remainingPrincipalAmount <= 0.01;
  const nextInstalment = !isBullet ? getNextInstalment(loan.startDate, tenure, today) : null;
  const lastInstalmentDate = !isBullet && tenure > 0 ? getInstalmentDate(loan.startDate, tenure) : null;
  const maturityDate = isBullet ? bulletRenewalDate : lastInstalmentDate;
  const emiDay = startDate.getDate();
  const monthlyInterest = breakdown.monthlyInterest || (loan.principal * loan.interest) / 1200;
  const longDate = (d) =>
    d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "N/A";

  // Hero footer: what happens next for this loan.
  let nextLabel;
  let nextValue;
  let nextCaption = null;
  let nextAlert = false;
  let nextRightLabel = null;
  let nextRightValue = null;
  if (isClosed) {
    nextLabel = "Status";
    nextValue = "Loan closed";
  } else if (isBullet) {
    nextLabel = daysToRenewal >= 0 ? "Matures" : "Matured";
    nextValue = longDate(bulletRenewalDate);
    nextCaption =
      daysToRenewal >= 0 ? formatRelativeDays(daysFromToday(bulletRenewalDate)) : "Due for renewal";
    nextAlert = daysToRenewal < 0;
    nextRightLabel = "Due at maturity";
    nextRightValue = formatINR(breakdown.remainingAmount);
  } else if (paidOff || !nextInstalment) {
    nextLabel = "Status";
    nextValue = paidOff ? "Principal fully repaid" : "All EMIs paid";
  } else {
    nextLabel = `Next EMI · ${nextInstalment.number} of ${tenure}`;
    nextValue = formatDateWithDay(nextInstalment.date);
    nextCaption = formatRelativeDays(daysFromToday(nextInstalment.date));
    nextRightLabel = "EMI";
    nextRightValue = formatINR(loan.emiAmount);
  }

  const subtitleParts = [isBullet ? "Bullet loan" : "EMI loan", `${formatPercent(rate, 2)} p.a.`];
  if (isClosed) subtitleParts.push("Closed");

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader
        title={loan.loanName}
        subtitle={subtitleParts.join(" · ")}
        back
        actions={<HeaderAction icon="create-outline" label="Edit loan" onPress={openEdit} />}
      />

      {/* ── Hero: remaining principal ─────────────────────────────────────── */}
      <View style={styles.heroCard}>
        <LinearGradient
          colors={colors.heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroMain}>
              <Text style={styles.heroOverline}>
                {isBullet ? "Principal outstanding" : "Remaining principal"}
              </Text>
              <Text
                style={styles.heroAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatINR(breakdown.remainingPrincipalAmount)}
              </Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {isBullet
                  ? `${elapsedMonths} of ${tenure} months elapsed`
                  : `${formatINRCompact(breakdown.principalPaid)} repaid of ${formatINRCompact(principalNum)}`}
              </Text>
            </View>
            <ProgressRing
              value={repaidPct}
              size={76}
              stroke={7}
              trackColor={colors.heroTrack}
              colors={[isBullet ? colors.heroWarning : colors.heroAccent]}
              label={formatPercent(repaidPct, 0)}
              labelColor={colors.heroText}
              caption={isBullet ? "of term" : "repaid"}
              captionColor={colors.heroTextMuted}
              accessibilityLabel={
                isBullet
                  ? `${formatPercent(repaidPct, 0)} of term elapsed`
                  : `${formatPercent(repaidPct, 0)} of principal repaid`
              }
            />
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroFooter}>
            <View style={styles.heroMain}>
              <Text style={styles.heroLabel}>{nextLabel}</Text>
              <Text style={styles.heroValue} numberOfLines={1}>
                {nextValue}
              </Text>
              {nextCaption ? (
                <View style={styles.heroCaptionRow}>
                  {nextAlert ? (
                    <Ionicons name="alert-circle" size={13} color={colors.heroWarning} />
                  ) : null}
                  <Text style={[styles.heroCaption, nextAlert && { color: colors.heroWarning }]}>
                    {nextCaption}
                  </Text>
                </View>
              ) : null}
            </View>
            {nextRightValue ? (
              <View style={styles.heroRight}>
                <Text style={styles.heroLabel}>{nextRightLabel}</Text>
                <Text style={styles.heroValue} numberOfLines={1}>
                  {nextRightValue}
                </Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>
      </View>

      <Gap />

      {/* ── Key numbers ───────────────────────────────────────────────────── */}
      <Card>
        <StatRow>
          <StatTile label="Interest paid" value={formatINRCompact(breakdown.interestPaid)} />
          <StatTile
            label="Interest left"
            value={formatINRCompact(breakdown.remainingInterestAmount)}
            tone={breakdown.remainingInterestAmount > 0 ? "warning" : "default"}
          />
          <StatTile
            label={isBullet ? "Due at maturity" : "Total payable"}
            value={formatINRCompact(breakdown.totalAmount)}
            caption={`${formatINRCompact(breakdown.totalInterest)} interest`}
          />
        </StatRow>
        <Divider style={styles.statDivider} />
        <StatRow>
          <StatTile label="Total paid" value={formatINRCompact(breakdown.totalPaid)} tone="positive" />
          <StatTile label="Outstanding" value={formatINRCompact(breakdown.remainingAmount)} caption="principal + interest" />
          <StatTile
            label={isBullet ? "Months" : "EMIs paid"}
            value={`${isBullet ? elapsedMonths : breakdown.paymentsMade} / ${tenure}`}
            caption={
              isBullet
                ? `${Math.max(0, tenure - monthsElapsed)} left`
                : `${Math.max(0, tenure - breakdown.paymentsMade)} left`
            }
          />
        </StatRow>
      </Card>

      {breakdown.interestSaved > 0 ? (
        <>
          <Gap size={space.md} />
          <Card padded={false}>
            <ListRow
              leading={
                <IconBadge name="sparkles-outline" color={colors.primary} backgroundColor={colors.primarySoft} />
              }
              title="Interest saved through prepayments"
              subtitle={`From ${formatINR(breakdown.extraPaid)} prepaid so far`}
              value={formatINR(breakdown.interestSaved)}
              valueColor={colors.primary}
            />
          </Card>
        </>
      ) : null}

      <Gap />

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <View style={styles.actions}>
        {isBullet && !isClosed ? (
          <View style={styles.actionRow}>
            <Button label="Renew" icon="refresh" onPress={handleRenewLoan} style={styles.actionHalf} />
            <Button
              label="Close loan"
              icon="checkmark-circle-outline"
              variant="secondary"
              onPress={handleCloseLoan}
              style={styles.actionHalf}
            />
          </View>
        ) : null}
        {!isClosed ? (
          <Button
            label="Log extra payment"
            icon="add-circle-outline"
            variant={isBullet ? "secondary" : "primary"}
            onPress={handleLogExtraPayment}
          />
        ) : null}
        <Button
          label={isBullet ? "Interest & maturity schedule" : "Amortization schedule"}
          icon="list-outline"
          variant="secondary"
          onPress={openSchedule}
        />
      </View>

      {/* ── Prepayment what-if ─────────────────────────────────────────────── */}
      {!isClosed ? (
        <>
          <Gap />
          <SectionHeader title="What if you prepay?" />
          <Card>
            <Text style={styles.cardIntro}>
              {isBullet
                ? "See how much interest a part-payment today would save."
                : "See how much interest and time a one-time prepayment today would save."}
            </Text>
            <Field
              label="Prepayment amount"
              prefix="₹"
              keyboardType="numeric"
              placeholder="10000"
              value={simulationAmount}
              onChangeText={(val) => setSimulationAmount(val.replace(/[^0-9]/g, ""))}
            />
            {simResult ? (
              <>
                <StatRow>
                  <StatTile label="Interest saved" value={formatINRCompact(simResult.interestSaved)} tone="positive" />
                  {!isBullet ? (
                    <StatTile
                      label="Tenure reduced"
                      value={`${simResult.monthsShortened} month${simResult.monthsShortened === 1 ? "" : "s"}`}
                    />
                  ) : null}
                  <StatTile label="New balance" value={formatINRCompact(simResult.newRemainingAmount)} />
                </StatRow>
                <Text style={styles.simNote}>Estimate only. Nothing is saved until you log a payment.</Text>
              </>
            ) : (
              <Text style={styles.simPlaceholder}>Enter an amount to see your savings.</Text>
            )}
          </Card>
        </>
      ) : null}

      {/* ── Details ───────────────────────────────────────────────────────── */}
      <Gap />
      <SectionHeader title="Loan details" />
      <Card padded={false}>
        <ListRow title="Loan type" value={isBullet ? "Bullet (gold)" : "EMI"} />
        <ListRow title="Principal borrowed" value={formatINR(principalNum)} divider />
        {isBullet ? (
          <ListRow title="Monthly interest" value={`${formatINR(monthlyInterest)} / mo`} divider />
        ) : (
          <ListRow title="Monthly EMI" value={formatINR(loan.emiAmount)} divider />
        )}
        <ListRow title="Interest rate" value={`${rate}% p.a.`} divider />
        <ListRow title="Tenure" value={`${tenure} months`} divider />
        <ListRow title="Start date" value={longDate(startDate)} divider />
        {!isBullet ? (
          <ListRow
            title="EMI day"
            value={`${ordinal(emiDay)} of each month`}
            valueCaption={emiDay > 28 ? "or month end" : undefined}
            divider
          />
        ) : null}
        <ListRow
          title={isBullet ? "Renewal / maturity" : "Last EMI"}
          value={longDate(maturityDate)}
          valueColor={isBullet && daysToRenewal < 0 && !isClosed ? colors.danger : undefined}
          divider
        />
      </Card>

      <Modal
        visible={paymentSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPaymentSheetOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPaymentSheetOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Log extra payment
            </Text>
            <Text style={styles.sheetSub}>
              Money you paid towards principal on top of your EMI. It lowers your balance and future interest.
            </Text>
            <Field
              label="Amount"
              prefix="₹"
              value={paymentAmount}
              onChangeText={(v) => {
                setPaymentAmount(v.replace(/[^0-9.]/g, ""));
                setPaymentError("");
              }}
              keyboardType="numeric"
              placeholder="0"
              autoFocus
              error={paymentError}
              hint="Saved with today's date"
            />
            <View style={styles.actionRow}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setPaymentSheetOpen(false)}
                style={styles.actionHalf}
              />
              <Button
                label="Save payment"
                onPress={saveExtraPayment}
                loading={savingPayment}
                style={styles.actionHalf}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: space.xl,
    paddingBottom: space.xxxl,
    ...shadow.raised,
  },
  sheetTitle: {
    ...type.title,
    color: colors.text,
  },
  sheetSub: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  loading: {
    paddingVertical: space.xxxl * 2,
    alignItems: "center",
  },
  mutedText: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    textAlign: "center",
  },
  heroCard: {
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.heroGradient[0],
    ...shadow.hero,
  },
  hero: {
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.lg,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
  },
  heroOverline: {
    ...type.overline,
    color: colors.heroTextSecondary,
  },
  heroAmount: {
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
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.heroDivider,
    marginVertical: space.lg,
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.lg,
  },
  heroRight: {
    alignItems: "flex-end",
  },
  heroLabel: {
    ...type.caption,
    fontWeight: "500",
    color: colors.heroTextMuted,
  },
  heroValue: {
    ...type.amountSmall,
    color: colors.heroText,
    marginTop: 2,
  },
  heroCaptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  heroCaption: {
    ...type.caption,
    color: colors.heroTextSecondary,
  },
  statDivider: {
    marginVertical: space.md + 2,
  },
  actions: {
    gap: space.md,
  },
  actionRow: {
    flexDirection: "row",
    gap: space.md,
  },
  actionHalf: {
    flex: 1,
    paddingHorizontal: space.md,
  },
  cardIntro: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    marginBottom: space.lg,
  },
  simNote: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: space.md,
  },
  simPlaceholder: {
    ...type.label,
    fontWeight: "500",
    color: colors.textMuted,
  },
});

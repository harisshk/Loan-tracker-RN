import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
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
  Field,
  hapticImpact,
  IconBadge,
  PressableScale,
  radius,
  Screen,
  ScreenHeader,
  SectionHeader,
  space,
  type,
} from "../components/ui/kit";
import {
  getBulletMaturityDate,
  parseLocalDate,
  toLocalISOString,
} from "../utils/emiCalculator";
import { addPayment, saveLoan, updateLoan } from "../utils/storage";

const TENURE_PRESETS = [3, 6, 12, 24];

export default function RenewLoan() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const action = params.action; // 'renew' or 'close'

  // Common State
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Close State
  const closingPayment = parseFloat(params.remainingAmount || 0);

  // Renew State
  const remainingInterest = parseFloat(params.remainingInterest || 0);
  const oldPrincipal = parseFloat(params.oldPrincipal || 0);

  const initialStartDate = params.oldMaturity || toLocalISOString(new Date());
  const [formData, setFormData] = useState({
    newPrincipal: params.oldPrincipal || "",
    newInterest: params.oldInterestRate || "",
    newTenure: "12",
    startDate: initialStartDate,
  });

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [newStartDate, setNewStartDate] = useState(
    parseLocalDate(initialStartDate),
  );

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const onDateChange = (event, date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (date) {
      setPaymentDate(date);
    }
  };

  const onNewStartDateChange = (event, date) => {
    setShowStartDatePicker(Platform.OS === "ios");
    if (date) {
      setNewStartDate(date);
      setFormData((prev) => ({ ...prev, startDate: toLocalISOString(date) }));
    }
  };

  const formatDisplayDate = (date) => {
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const handleClose = async () => {
    if (closingPayment <= 0) {
      Alert.alert("Error", "Remaining amount is invalid.");
      return;
    }

    setSaving(true);
    try {
      // Log the full payment to close out the loan
      await addPayment({
        loanId: params.id,
        loanName: params.loanName,
        amount: closingPayment.toString(),
        date: toLocalISOString(paymentDate),
        kind: "settlement",
      });

      // Mark the old loan as closed
      await updateLoan(params.id, { status: "closed" });

      Alert.alert("Success", "Loan closed successfully!", [
        { text: "OK", onPress: () => router.replace("/loans") },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to close the loan.");
    } finally {
      setSaving(false);
    }
  };

  const handleRenew = async () => {
    const p = parseFloat(formData.newPrincipal);
    const i = parseFloat(formData.newInterest);
    const t = parseInt(formData.newTenure);

    const next = {};
    if (!p || p <= 0) next.newPrincipal = "Enter a valid principal";
    if (i < 0 || isNaN(i)) next.newInterest = "Enter a valid interest rate";
    if (!t || t <= 0) next.newTenure = "Enter a valid tenure";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      hapticImpact();
      return;
    }

    setSaving(true);
    try {
      // We will record the payment that perfectly clears the old loan so it can be closed.
      // To keep history clean, we formally clear the total old principal + interest.
      // Actually, since emiCalculator relies on `totalExtraPaid` to calculate how much is paid,
      // and we are marking it closed, we need to inject the full payment of old loan so history shows it fully settled.
      const fullSettlementAmount = remainingInterest + oldPrincipal;

      await addPayment({
        loanId: params.id,
        loanName: params.loanName,
        amount: fullSettlementAmount.toString(),
        date: toLocalISOString(paymentDate),
        note: "Automatic settlement on renewal/rollover",
        kind: "settlement",
      });

      // 2. Close old loan
      await updateLoan(params.id, { status: "closed" });

      // 3. Create the new loan
      const newLoanName = params.loanName.endsWith("(Renewed)")
        ? params.loanName
        : `${params.loanName} (Renewed)`;

      await saveLoan({
        loanName: newLoanName,
        principal: p.toString(),
        interest: i.toString(),
        tenure: t.toString(),
        emiAmount: "0",
        startDate: formData.startDate,
        loanType: "bullet",
        status: "active",
      });

      Alert.alert("Success", "Loan renewed successfully!", [
        { text: "OK", onPress: () => router.replace("/loans") },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to renew the loan.");
    } finally {
      setSaving(false);
    }
  };

  const isRenew = action === "renew";

  // What leaves your pocket on the settlement date (display only): all outstanding
  // interest, plus any principal you are paying down by renewing for less.
  const newP = parseFloat(formData.newPrincipal);
  const newI = parseFloat(formData.newInterest);
  const newT = parseInt(formData.newTenure);
  const principalChange = Number.isFinite(newP) ? newP - oldPrincipal : 0;
  const payToday = remainingInterest + Math.max(0, -principalChange);
  const newTermsValid = newP > 0 && newI >= 0 && newT > 0;
  const newTermInterest = newTermsValid ? newP * (newI / 100) * (newT / 12) : 0;
  const newMaturity = newTermsValid
    ? getBulletMaturityDate(formData.startDate, newT)
    : null;

  const footer = (
    <Button
      label={isRenew ? "Confirm renewal" : "Confirm closure"}
      icon={isRenew ? "refresh" : "checkmark-done"}
      onPress={isRenew ? handleRenew : handleClose}
      loading={saving}
    />
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.flex}
    >
      <Screen footer={footer}>
        <ScreenHeader
          back
          title={isRenew ? "Renew loan" : "Close loan"}
          subtitle={params.loanName}
        />

        {/* What this action does */}
        <View style={styles.modeRow}>
          <IconBadge
            name={isRenew ? "refresh-outline" : "lock-closed-outline"}
            color={isRenew ? colors.warning : colors.primary}
            backgroundColor={isRenew ? colors.warningSoft : colors.primarySoft}
          />
          <Text style={styles.modeText}>
            {isRenew
              ? "Pay the outstanding interest and roll the principal into a new gold loan for the next term."
              : "Pay off the full principal and interest. The loan moves to your closed loans."}
          </Text>
        </View>

        {/* Summary of what will be paid */}
        <Card style={styles.summaryCard}>
          <Text style={styles.overline}>
            {isRenew ? "You pay on settlement" : "Total settlement amount"}
          </Text>
          <Text
            style={styles.summaryAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={`${isRenew ? "You pay" : "Settlement amount"} ${formatCurrency(isRenew ? payToday : closingPayment)}`}
          >
            {formatCurrency(isRenew ? payToday : closingPayment)}
          </Text>

          {isRenew ? (
            <View style={styles.lines}>
              <SummaryLine label="Outstanding interest" value={formatCurrency(remainingInterest)} />
              {principalChange < 0 ? (
                <SummaryLine label="Principal paid down" value={formatCurrency(-principalChange)} />
              ) : null}
              {principalChange > 0 ? (
                <SummaryLine
                  label="Top-up on new loan"
                  value={`+${formatCurrency(principalChange)}`}
                  muted
                />
              ) : null}
              <SummaryLine label="Current principal" value={formatCurrency(oldPrincipal)} muted />
            </View>
          ) : null}

          <Divider style={styles.summaryDivider} />
          <DateRow
            label={isRenew ? "Settlement date" : "Date of closure"}
            value={formatDisplayDate(paymentDate)}
            open={showDatePicker}
            onPress={() => setShowDatePicker((v) => !v)}
          />
          {showDatePicker ? (
            <View>
              <DateTimePicker
                value={paymentDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
              />
              {Platform.OS === "ios" ? (
                <Button label="Done" variant="ghost" onPress={() => setShowDatePicker(false)} />
              ) : null}
            </View>
          ) : null}
        </Card>

        {isRenew ? (
          <>
            <SectionHeader title="New loan terms" style={styles.sectionGap} />
            <Card style={styles.formCard}>
              <Field
                label="New principal"
                prefix="₹"
                keyboardType="numeric"
                value={formData.newPrincipal}
                onChangeText={(val) => handleInputChange("newPrincipal", val)}
                error={errors.newPrincipal}
                hint="Lower it to pay down principal now"
              />
              <Field
                label="Interest rate"
                suffix="% p.a."
                keyboardType="decimal-pad"
                value={formData.newInterest}
                onChangeText={(val) => handleInputChange("newInterest", val)}
                error={errors.newInterest}
              />
              <Field
                label="Tenure"
                suffix="months"
                keyboardType="numeric"
                value={formData.newTenure}
                onChangeText={(val) => handleInputChange("newTenure", val)}
                error={errors.newTenure}
              />
              <View style={styles.chips}>
                {TENURE_PRESETS.map((m) => (
                  <Chip
                    key={m}
                    label={`${m} mo`}
                    selected={String(m) === String(formData.newTenure)}
                    onPress={() => handleInputChange("newTenure", String(m))}
                  />
                ))}
              </View>
              <DateRow
                label="New loan start date"
                value={formatDisplayDate(newStartDate)}
                open={showStartDatePicker}
                onPress={() => setShowStartDatePicker((v) => !v)}
              />
              {showStartDatePicker ? (
                <View>
                  <DateTimePicker
                    value={newStartDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onNewStartDateChange}
                  />
                  {Platform.OS === "ios" ? (
                    <Button
                      label="Done"
                      variant="ghost"
                      onPress={() => setShowStartDatePicker(false)}
                    />
                  ) : null}
                </View>
              ) : null}

              {newMaturity ? (
                <View style={styles.previewBox}>
                  <SummaryLine label="Interest for new term" value={formatCurrency(newTermInterest)} />
                  <SummaryLine label="Due at maturity" value={formatCurrency(newP + newTermInterest)} />
                  <SummaryLine label="Matures on" value={formatDisplayDate(newMaturity)} />
                </View>
              ) : null}
            </Card>

            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.noteText}>
                The current loan is closed with a settlement of{" "}
                {formatCurrency(remainingInterest + oldPrincipal)} in your history, and a
                new bullet loan is created as “{params.loanName}
                {String(params.loanName || "").endsWith("(Renewed)") ? "" : " (Renewed)"}”.
              </Text>
            </View>
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function SummaryLine({ label, value, muted }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, muted && styles.lineValueMuted]}>{value}</Text>
    </View>
  );
}

/** Field-styled row that opens a date picker. */
function DateRow({ label, value, open, onPress }) {
  return (
    <View style={styles.dateField}>
      <Text style={styles.dateLabel}>{label}</Text>
      <PressableScale
        onPress={onPress}
        style={[styles.dateInput, open && styles.dateInputOpen]}
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint="Opens the date picker"
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <Text style={styles.dateValue}>{value}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  modeText: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    flex: 1,
  },
  summaryCard: {
    marginTop: space.xl,
  },
  overline: {
    ...type.overline,
    color: colors.textMuted,
  },
  summaryAmount: {
    ...type.display,
    color: colors.text,
    marginTop: space.xs,
  },
  lines: {
    marginTop: space.md,
    gap: space.sm,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  lineLabel: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    flex: 1,
  },
  lineValue: {
    ...type.amountSmall,
    color: colors.text,
  },
  lineValueMuted: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  summaryDivider: {
    marginTop: space.lg,
    marginBottom: space.lg,
  },
  sectionGap: {
    marginTop: space.xxl,
  },
  formCard: {
    paddingBottom: space.lg,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: -space.sm,
    marginBottom: space.lg,
  },
  previewBox: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    marginTop: space.lg,
    paddingHorizontal: space.xs,
  },
  noteText: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
    flex: 1,
  },
  dateField: {
    marginBottom: space.lg,
  },
  dateLabel: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.xs + 2,
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  dateInputOpen: {
    borderColor: colors.indigo,
  },
  dateValue: {
    ...type.body,
    color: colors.text,
    flex: 1,
  },
});

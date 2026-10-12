import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
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
  HIT,
  kindColors,
  PressableScale,
  radius,
  Screen,
  ScreenHeader,
  Segmented,
  space,
  StatRow,
  StatTile,
  type,
} from "../components/ui/kit";
import {
  getBulletMaturityDate,
  getInstalmentDate,
  parseLocalDate,
  toLocalISOString,
} from "../utils/emiCalculator";
import { formatINR } from "../utils/format";
import { saveLoan } from "../utils/storage";

const LOAN_TYPES = [
  { key: "emi", label: "EMI loan" },
  { key: "bullet", label: "Bullet / gold loan" },
];

const TENURE_PRESETS = {
  emi: [12, 24, 36, 60, 120],
  bullet: [6, 12, 24, 36],
};

const toNum = (val) => parseFloat(String(val || "").replace(/,/g, ""));

/** Standard reducing-balance EMI, the same formula the schedule uses. */
const formulaEMI = (p, annualRate, months) => {
  const r = annualRate / 12 / 100;
  if (r === 0) return p / months;
  const f = Math.pow(1 + r, months);
  return (p * r * f) / (f - 1);
};

const formatLongDate = (date) =>
  date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function AddLoan() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    loanName: "",
    principal: "",
    interest: "",
    emiAmount: "",
    startDate: toLocalISOString(new Date()),
    tenure: "",
    loanType: "emi",
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const isBullet = formData.loanType === "bullet";

  // Suggested EMI from principal, rate and tenure (EMI loans only).
  const p = toNum(formData.principal);
  const i = parseFloat(formData.interest);
  const t = parseInt(formData.tenure);
  const termsValid = p > 0 && i >= 0 && t > 0;
  const calculatedEMI =
    !isBullet && termsValid ? String(Math.round(formulaEMI(p, i, t))) : null;

  const handleInputChange = (name, value) => {
    // Sanitize numeric inputs by removing commas (e.g. 1,00,000 -> 100000)
    let sanitizedValue = value;
    if (["principal", "interest", "emiAmount", "tenure"].includes(name)) {
      sanitizedValue = value.replace(/,/g, "");
    }
    setFormData((prev) => ({ ...prev, [name]: sanitizedValue }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const applyCalculatedEMI = () => {
    if (calculatedEMI) {
      handleInputChange("emiAmount", calculatedEMI);
    }
  };

  const onDateChange = (event, date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (date) {
      setSelectedDate(date);
      const formattedDate = toLocalISOString(date);
      setFormData((prev) => ({ ...prev, startDate: formattedDate }));
    }
  };

  const validateForm = () => {
    const next = {};
    if (!formData.loanName.trim()) {
      next.loanName = "Enter a name for this loan";
    }
    if (!formData.principal || toNum(formData.principal) <= 0) {
      next.principal = "Enter a principal amount above zero";
    }
    if (!formData.interest || toNum(formData.interest) < 0) {
      next.interest = "Enter a valid interest rate";
    }
    if (
      formData.loanType === "emi" &&
      (!formData.emiAmount || toNum(formData.emiAmount) <= 0)
    ) {
      next.emiAmount = "Enter your monthly EMI amount";
    }
    if (
      !formData.tenure ||
      parseInt(String(formData.tenure).replace(/,/g, "")) <= 0
    ) {
      next.tenure = "Enter the tenure in months";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      hapticImpact();
      return;
    }
    setSaving(true);
    try {
      await saveLoan(formData);
      Alert.alert("Success", "Loan added successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (_error) {
      Alert.alert("Error", "Failed to save loan. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Live preview, derived from what has been entered so far.
  const emiForPreview = toNum(formData.emiAmount) || 0;
  const preview = !termsValid
    ? null
    : isBullet
      ? {
          stats: [
            { label: "Monthly interest", value: formatINR((p * (i / 100)) / 12) },
            { label: "Total interest", value: formatINR(p * (i / 100) * (t / 12)) },
            {
              label: "Due at maturity",
              value: formatINR(p + p * (i / 100) * (t / 12)),
            },
          ],
          dateLabel: "Matures on",
          date: getBulletMaturityDate(formData.startDate, t),
        }
      : {
          stats: [
            {
              label: "Monthly EMI",
              value: emiForPreview > 0 ? formatINR(emiForPreview) : "—",
            },
            {
              label: "Total interest",
              value:
                emiForPreview > 0
                  ? formatINR(Math.max(0, emiForPreview * t - p))
                  : "—",
            },
            {
              label: "Total payable",
              value: emiForPreview > 0 ? formatINR(emiForPreview * t) : "—",
            },
          ],
          dateLabel: "Last EMI on",
          date: getInstalmentDate(formData.startDate, t),
        };

  const hasErrors = Object.values(errors).some(Boolean);
  const kind = kindColors[formData.loanType] || kindColors.emi;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.flex}
    >
      <Screen
        footer={
          <View>
            {hasErrors ? (
              <Text style={styles.footerError} accessibilityLiveRegion="polite">
                Check the highlighted fields
              </Text>
            ) : null}
            <Button
              label="Save loan"
              icon="checkmark"
              onPress={handleSave}
              loading={saving}
            />
          </View>
        }
      >
        <ScreenHeader
          back
          title="Add loan"
          subtitle="Track an EMI or a bullet / gold loan"
        />

        <Segmented
          options={LOAN_TYPES}
          value={formData.loanType}
          onChange={(key) => {
            handleInputChange("loanType", key);
            setErrors({});
          }}
        />
        <View style={styles.typeHint}>
          <Ionicons name={kind.icon} size={14} color={kind.text} />
          <Text style={styles.typeHintText}>
            {isBullet
              ? "Interest accrues monthly; principal and interest are repaid in one lump sum at maturity."
              : "Repaid in fixed monthly instalments (reducing balance)."}
          </Text>
        </View>

        <Card style={styles.formCard}>
          <Field
            label="Loan name"
            value={formData.loanName}
            onChangeText={(v) => handleInputChange("loanName", v)}
            placeholder={isBullet ? "e.g. Gold loan" : "e.g. Home loan"}
            error={errors.loanName}
          />
          <Field
            label="Principal amount"
            prefix="₹"
            value={formData.principal}
            onChangeText={(v) => handleInputChange("principal", v)}
            placeholder="500000"
            keyboardType="numeric"
            error={errors.principal}
          />
          <Field
            label="Interest rate"
            suffix="% p.a."
            value={formData.interest}
            onChangeText={(v) => handleInputChange("interest", v)}
            placeholder="8.5"
            keyboardType="decimal-pad"
            error={errors.interest}
          />
          <Field
            label="Tenure"
            suffix="months"
            value={formData.tenure}
            onChangeText={(v) => handleInputChange("tenure", v)}
            placeholder="60"
            keyboardType="numeric"
            error={errors.tenure}
          />
          <View style={styles.chips}>
            {TENURE_PRESETS[formData.loanType].map((m) => (
              <Chip
                key={m}
                label={m % 12 === 0 ? `${m / 12} yr` : `${m} mo`}
                selected={String(m) === String(formData.tenure)}
                onPress={() => handleInputChange("tenure", String(m))}
              />
            ))}
          </View>

          {!isBullet ? (
            <>
              <Field
                label="Monthly EMI"
                prefix="₹"
                value={formData.emiAmount}
                onChangeText={(v) => handleInputChange("emiAmount", v)}
                placeholder="15000"
                keyboardType="numeric"
                error={errors.emiAmount}
                hint="Use the amount on your bank statement"
              />
              {calculatedEMI ? (
                <PressableScale
                  onPress={applyCalculatedEMI}
                  style={styles.calcRow}
                  accessibilityLabel={`Use calculated EMI ${formatINR(calculatedEMI)}`}
                >
                  <Ionicons name="calculator-outline" size={18} color={colors.indigo} />
                  <Text style={styles.calcText} numberOfLines={1}>
                    Calculated EMI{" "}
                    <Text style={styles.calcAmount}>{formatINR(calculatedEMI)}</Text>
                  </Text>
                  <Text style={styles.calcAction}>
                    {String(formData.emiAmount) === calculatedEMI ? "Applied" : "Use"}
                  </Text>
                </PressableScale>
              ) : null}
            </>
          ) : null}

          <DateRow
            label={isBullet ? "Loan date" : "First EMI date"}
            value={formatLongDate(parseLocalDate(formData.startDate))}
            open={showDatePicker}
            onPress={() => setShowDatePicker((v) => !v)}
          />
          {showDatePicker ? (
            <View>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
              />
              {Platform.OS === "ios" ? (
                <Button
                  label="Done"
                  variant="ghost"
                  onPress={() => setShowDatePicker(false)}
                />
              ) : null}
            </View>
          ) : null}
        </Card>

        {preview ? (
          <Card style={styles.previewCard}>
            <Text style={styles.overline}>Preview</Text>
            <StatRow style={styles.previewStats}>
              {preview.stats.map((s) => (
                <StatTile key={s.label} label={s.label} value={s.value} />
              ))}
            </StatRow>
            <Divider style={styles.previewDivider} />
            <View style={styles.previewDate}>
              <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
              <Text style={styles.previewDateLabel}>{preview.dateLabel}</Text>
              <Text style={styles.previewDateValue}>{formatLongDate(preview.date)}</Text>
            </View>
          </Card>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** Field-styled row that opens the date picker. */
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
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.textMuted}
        />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  typeHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    marginTop: space.md,
    paddingHorizontal: space.xs,
  },
  typeHintText: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
    flex: 1,
  },
  formCard: {
    marginTop: space.xl,
    paddingBottom: space.xs,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: -space.sm,
    marginBottom: space.lg,
  },
  calcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: HIT,
    marginTop: -space.sm,
    marginBottom: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.indigoSoft,
  },
  calcText: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    flex: 1,
  },
  calcAmount: {
    ...type.label,
    fontWeight: "700",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  calcAction: {
    ...type.label,
    color: colors.indigo,
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
  previewCard: {
    marginTop: space.xxl,
  },
  overline: {
    ...type.overline,
    color: colors.textMuted,
  },
  previewStats: {
    marginTop: space.md,
  },
  previewDivider: {
    marginVertical: space.md,
  },
  previewDate: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  previewDateLabel: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    flex: 1,
  },
  previewDateValue: {
    ...type.label,
    fontWeight: "700",
    color: colors.text,
  },
  footerError: {
    ...type.caption,
    color: colors.danger,
    textAlign: "center",
    marginBottom: space.sm,
  },
});

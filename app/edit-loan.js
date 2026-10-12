import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
  kindColors,
  Pill,
  PressableScale,
  radius,
  Screen,
  ScreenHeader,
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
import { getLoans, updateLoan } from "../utils/storage";

const TENURE_PRESETS = {
  emi: [12, 24, 36, 60, 120],
  bullet: [6, 12, 24, 36],
};

const toNum = (val) => parseFloat(String(val || "").replace(/,/g, ""));

/** Start date as a Date for the picker; today if the stored value is unreadable. */
const toPickerDate = (value) => {
  const d = parseLocalDate(value);
  return isNaN(d.getTime()) ? new Date() : d;
};

const formatLongDate = (date) =>
  isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

export default function EditLoan() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    loanName: "",
    loanType: "emi",
    principal: "",
    interest: "",
    emiAmount: "",
    startDate: toLocalISOString(new Date()),
    tenure: "",
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [originalName, setOriginalName] = useState("");

  const loanType = formData.loanType || "emi";
  const isBullet = loanType === "bullet";

  // Load the saved loan (falls back to the route params if it isn't found).
  React.useEffect(() => {
    getLoans()
      .then((allLoans) => {
        const found = allLoans.find((l) => l.id === params.id);
        setOriginalName((found ? found.loanName : params.loanName) || "");
        if (found) {
          setFormData({
            loanName: found.loanName || "",
            loanType: found.loanType || "emi",
            principal: found.principal ? String(found.principal) : "",
            interest: found.interest ? String(found.interest) : "",
            emiAmount: found.emiAmount ? String(found.emiAmount) : "",
            startDate: found.startDate || toLocalISOString(new Date()),
            tenure: found.tenure ? String(found.tenure) : "",
          });
        } else {
          // Fallback to params
          setFormData({
            loanName: params.loanName || "",
            loanType: params.loanType || "emi",
            principal: params.principal ? String(params.principal) : "",
            interest: params.interest ? String(params.interest) : "",
            emiAmount: params.emiAmount ? String(params.emiAmount) : "",
            startDate: params.startDate || toLocalISOString(new Date()),
            tenure: params.tenure ? String(params.tenure) : "",
          });
        }
      })
      .catch((e) => {
        console.error("Error loading loan details:", e);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    params.id,
    params.loanName,
    params.loanType,
    params.principal,
    params.interest,
    params.emiAmount,
    params.startDate,
    params.tenure,
  ]);

  const handleInputChange = (field, value) => {
    let sanitizedValue = value;
    if (["principal", "interest", "emiAmount", "tenure"].includes(field)) {
      sanitizedValue = String(value || "").replace(/,/g, "");
    }
    setFormData((prev) => ({ ...prev, [field]: sanitizedValue }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const onDateChange = (event, date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (date) {
      handleInputChange("startDate", toLocalISOString(date));
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
    if (!isBullet && (!formData.emiAmount || toNum(formData.emiAmount) <= 0)) {
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
      const dataToSave = { ...formData };
      if (isBullet) {
        dataToSave.emiAmount = "0";
      }
      await updateLoan(params.id, dataToSave);
      Alert.alert("Success", "Loan updated successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (_error) {
      Alert.alert("Error", "Failed to update loan. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const kind = kindColors[loanType] || kindColors.emi;

  if (loading) {
    return (
      <Screen>
        <ScreenHeader back title="Edit loan" />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryFill} />
          <Text style={styles.loadingText}>Loading loan details…</Text>
        </View>
      </Screen>
    );
  }

  // Live preview, derived from the current values.
  const p = toNum(formData.principal);
  const i = parseFloat(formData.interest);
  const t = parseInt(formData.tenure);
  const emi = toNum(formData.emiAmount) || 0;
  const termsValid = p > 0 && i >= 0 && t > 0;
  const preview = !termsValid
    ? null
    : isBullet
      ? {
          stats: [
            { label: "Monthly interest", value: formatINR((p * (i / 100)) / 12) },
            { label: "Total interest", value: formatINR(p * (i / 100) * (t / 12)) },
            { label: "Due at maturity", value: formatINR(p + p * (i / 100) * (t / 12)) },
          ],
          dateLabel: "Matures on",
          date: getBulletMaturityDate(formData.startDate, t),
        }
      : {
          stats: [
            { label: "Monthly EMI", value: emi > 0 ? formatINR(emi) : "—" },
            {
              label: "Total interest",
              value: emi > 0 ? formatINR(Math.max(0, emi * t - p)) : "—",
            },
            { label: "Total payable", value: emi > 0 ? formatINR(emi * t) : "—" },
          ],
          dateLabel: "Last EMI on",
          date: getInstalmentDate(formData.startDate, t),
        };

  const hasErrors = Object.values(errors).some(Boolean);
  const pickerDate = toPickerDate(formData.startDate);

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
              label="Save changes"
              icon="checkmark"
              onPress={handleSave}
              loading={saving}
            />
          </View>
        }
      >
        <ScreenHeader back title="Edit loan" subtitle={originalName || undefined} />

        <View style={styles.typeRow}>
          <Pill
            label={isBullet ? "Bullet / gold loan" : "EMI loan"}
            icon={kind.icon}
            color={kind.text}
            backgroundColor={kind.soft}
          />
          <Text style={styles.typeRowHint}>Loan type can’t be changed</Text>
        </View>

        <Card style={styles.formCard}>
          <Field
            label="Loan name"
            value={formData.loanName}
            onChangeText={(value) => handleInputChange("loanName", value)}
            placeholder="e.g. Home loan, Car loan"
            error={errors.loanName}
          />
          <Field
            label="Principal amount"
            prefix="₹"
            value={formData.principal}
            onChangeText={(value) => handleInputChange("principal", value)}
            placeholder="500000"
            keyboardType="numeric"
            error={errors.principal}
          />
          <Field
            label="Interest rate"
            suffix="% p.a."
            value={formData.interest}
            onChangeText={(value) => handleInputChange("interest", value)}
            placeholder="8.5"
            keyboardType="decimal-pad"
            error={errors.interest}
          />
          <Field
            label="Tenure"
            suffix="months"
            value={formData.tenure}
            onChangeText={(value) => handleInputChange("tenure", value)}
            placeholder="60"
            keyboardType="numeric"
            error={errors.tenure}
          />
          <View style={styles.chips}>
            {TENURE_PRESETS[loanType].map((m) => (
              <Chip
                key={m}
                label={m % 12 === 0 ? `${m / 12} yr` : `${m} mo`}
                selected={String(m) === String(formData.tenure)}
                onPress={() => handleInputChange("tenure", String(m))}
              />
            ))}
          </View>

          {/* EMI amount — only for regular EMI loans */}
          {!isBullet ? (
            <Field
              label="Monthly EMI"
              prefix="₹"
              value={formData.emiAmount}
              onChangeText={(value) => handleInputChange("emiAmount", value)}
              placeholder="15000"
              keyboardType="numeric"
              error={errors.emiAmount}
            />
          ) : (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
              <Text style={styles.infoText}>
                Bullet / gold loans are repaid in a lump sum at maturity, so there
                is no monthly EMI.
              </Text>
            </View>
          )}

          <DateRow
            label={isBullet ? "Loan date" : "First EMI date"}
            value={formatLongDate(parseLocalDate(formData.startDate))}
            open={showDatePicker}
            onPress={() => setShowDatePicker((v) => !v)}
          />
          {showDatePicker ? (
            <View>
              <DateTimePicker
                value={pickerDate}
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
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  loading: {
    alignItems: "center",
    paddingVertical: space.xxxl,
    gap: space.sm,
  },
  loadingText: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  typeRowHint: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
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
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    padding: space.md,
    marginBottom: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  infoText: {
    ...type.label,
    fontWeight: "500",
    color: colors.text,
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

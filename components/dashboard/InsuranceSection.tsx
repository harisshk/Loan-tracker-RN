import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, HIT, kindColors, radius, space, type } from "../../constants/dashboardTheme";
import type { InsuranceSummary } from "../../hooks/use-dashboard-data";
import { formatDateWithDay, formatRelativeDays } from "../../utils/format";
import { toneColors } from "./DashboardHeader";
import { Card, IconBadge, Pill, PressableScale, SectionHeader } from "./primitives";
import { useMoney } from "./privacy";

interface InsuranceSectionProps {
  insurances: InsuranceSummary[];
  annualTotal: number;
  onOpen: () => void;
  onAdd: () => void;
}

export default function InsuranceSection({ insurances, annualTotal, onOpen, onAdd }: InsuranceSectionProps) {
  const money = useMoney();
  const next = insurances.find((i) => i.nextDue && i.daysLeft !== null) || null;
  const missingDates = insurances.filter((i) => !i.nextDue).length;
  const kind = kindColors.insurance;
  const nextTone =
    next && next.daysLeft !== null
      ? toneColors[next.daysLeft <= 0 ? "critical" : next.daysLeft <= 7 ? "warning" : "neutral"]
      : null;

  return (
    <View>
      <SectionHeader title="Insurance" count={insurances.length} actionLabel="View all" onAction={onOpen} />
      {insurances.length === 0 ? (
        <Card style={styles.emptyRow}>
          <IconBadge name="shield-outline" color={kind.text} backgroundColor={kind.soft} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>No policies tracked</Text>
            <Text style={styles.sub}>Add premiums so renewals never surprise you.</Text>
          </View>
          <PressableScale onPress={onAdd} style={styles.addBtn} accessibilityLabel="Add insurance policy">
            <Text style={styles.addBtnText}>Add</Text>
          </PressableScale>
        </Card>
      ) : (
        <Card
          onPress={onOpen}
          accessibilityLabel={`${insurances.length} policies, ${money.spoken(annualTotal)} a year${
            next ? `. Next premium ${next.name}, ${money.spoken(next.premium)}, ${formatDateWithDay(next.nextDue)}` : ""
          }`}
          accessibilityHint="Opens insurance policies"
        >
          <View style={styles.row}>
            <IconBadge name="shield-checkmark-outline" color={kind.text} backgroundColor={kind.soft} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {insurances.length} polic{insurances.length === 1 ? "y" : "ies"} · {money.exact(annualTotal)} a year
              </Text>
              {next ? (
                <Text style={styles.sub} numberOfLines={2}>
                  Next: {next.name} · {money.exact(next.premium)} · {formatDateWithDay(next.nextDue)}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
          {(next && nextTone && next.daysLeft !== null) || missingDates > 0 ? (
            <View style={styles.chips}>
              {next && nextTone && next.daysLeft !== null ? (
                <Pill label={formatRelativeDays(next.daysLeft)} color={nextTone.text} backgroundColor={nextTone.soft} icon="time-outline" />
              ) : null}
              {missingDates > 0 ? (
                <Pill
                  label={`${missingDates} need${missingDates === 1 ? "s" : ""} a start date`}
                  color={colors.warning}
                  backgroundColor={colors.warningSoft}
                  icon="warning-outline"
                />
              ) : null}
            </View>
          ) : null}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  title: {
    ...type.body,
    fontWeight: "700",
    color: colors.text,
  },
  sub: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: 2,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.md,
    paddingLeft: 52,
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  addBtn: {
    minHeight: HIT,
    minWidth: HIT + 8,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    ...type.label,
    fontWeight: "700",
    color: colors.info,
  },
});

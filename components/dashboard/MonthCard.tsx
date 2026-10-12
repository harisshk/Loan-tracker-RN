import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, kindColors, radius, space, type } from "../../constants/dashboardTheme";
import type { MonthSummary } from "../../hooks/use-dashboard-data";
import { formatDateShort, formatDateWithDay, formatPercent } from "../../utils/format";
import { toneColors } from "./DashboardHeader";
import ProgressRing from "./ProgressRing";
import { Card, Pill, PressableScale, ProgressBar, SectionHeader } from "./primitives";
import { useMoney } from "./privacy";

interface MonthCardProps {
  month: MonthSummary;
  onOpenCalendar: () => void;
  onOpenSpends: () => void;
  onOpenPayments: () => void;
  onOpenMaturity: (loanId: string) => void;
}

export default function MonthCard({ month, onOpenCalendar, onOpenSpends, onOpenPayments, onOpenMaturity }: MonthCardProps) {
  const money = useMoney();
  const hasSchedule = month.committed > 0;
  const budgetTone = toneColors[month.budgetTone];
  const barColor =
    month.budgetTone === "critical" ? colors.dangerFill : month.budgetTone === "warning" ? colors.warningFill : colors.pinkFill;

  return (
    <View>
      <SectionHeader title={`This month · ${month.monthName}`} />
      <Card padded={false}>
        {/* Repayments */}
        <PressableScale
          onPress={onOpenCalendar}
          style={styles.block}
          accessibilityLabel={
            hasSchedule
              ? `Repayments: ${money.spoken(month.cleared)} of ${money.spoken(month.committed)} cleared, ${money.spoken(month.left)} left`
              : "No repayments scheduled this month"
          }
          accessibilityHint="Opens the payment calendar"
        >
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>Repayments</Text>
            <Text style={styles.blockMeta}>
              Day {month.dayOfMonth} of {month.daysInMonth}
            </Text>
          </View>
          {hasSchedule ? (
            <View style={styles.repayRow}>
              <ProgressRing
                value={month.clearedPct}
                size={64}
                stroke={7}
                trackColor={colors.surfaceSunken}
                colors={[colors.primaryFill]}
                label={formatPercent(month.clearedPct, 0)}
                labelColor={colors.text}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.bigLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  <Text style={styles.bigValue}>{money.exact(month.cleared)}</Text>
                  <Text style={styles.bigOf}> of {money.exact(month.committed)}</Text>
                </Text>
                <Text style={styles.subLine}>
                  {month.left > 0
                    ? `${money.exact(month.left)} left · ${month.leftCount} payment${month.leftCount === 1 ? "" : "s"}${month.nextDate ? ` · next ${formatDateShort(month.nextDate)}` : ""}`
                    : "All cleared for this month"}
                </Text>
                <View style={styles.legend}>
                  {month.emiTotal > 0 ? (
                    <LegendDot color={kindColors.emi.fill} label={`EMIs ${money.compact(month.emiTotal)}`} />
                  ) : null}
                  {month.premiumTotal > 0 ? (
                    <LegendDot color={kindColors.insurance.fill} label={`Premiums ${money.compact(month.premiumTotal)}`} />
                  ) : null}
                </View>
              </View>
            </View>
          ) : (
            <Text style={styles.subLine}>No EMIs or premiums scheduled in {month.monthName}.</Text>
          )}
          {hasSchedule ? <Text style={styles.footnote}>EMIs count as paid on their due date.</Text> : null}
        </PressableScale>

        {month.maturities.map((m) => (
          <PressableScale
            key={m.id}
            onPress={() => onOpenMaturity(m.id)}
            style={styles.maturityRow}
            accessibilityLabel={`${m.name} ${m.overdue ? "matured" : "matures"} ${formatDateWithDay(m.date)}, ${money.spoken(m.amount)}`}
          >
            <Ionicons
              name={m.overdue ? "alert-circle" : "hourglass-outline"}
              size={16}
              color={m.overdue ? colors.dangerFill : colors.warning}
            />
            <Text style={[styles.maturityText, { color: m.overdue ? colors.danger : colors.warning }]} numberOfLines={2}>
              {m.name} {m.overdue ? "matured" : "matures"} {formatDateWithDay(m.date)} · {money.exact(m.amount)}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </PressableScale>
        ))}

        <View style={styles.divider} />

        {/* Spending */}
        <PressableScale
          onPress={onOpenSpends}
          style={styles.block}
          accessibilityLabel={`Spending: ${money.spoken(month.spent)} of ${money.spoken(month.budget)} budget`}
          accessibilityHint="Opens the spend tracker"
        >
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>Spending</Text>
            {month.budgetIsDefault ? (
              <Pill label="Default budget · Set yours" color={colors.indigo} backgroundColor={colors.indigoSoft} />
            ) : month.budgetTone !== "positive" ? (
              <Pill
                label={month.budgetTone === "critical" ? "Over budget" : "Near limit"}
                color={budgetTone.text}
                backgroundColor={budgetTone.soft}
                icon={month.budgetTone === "critical" ? "alert-circle" : "warning-outline"}
              />
            ) : null}
          </View>
          <Text style={styles.bigLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            <Text style={styles.bigValue}>{money.exact(month.spent)}</Text>
            <Text style={styles.bigOf}> of {money.exact(month.budget)}</Text>
          </Text>
          <View style={styles.meterWrap}>
            <ProgressBar
              segments={[{ value: month.budgetUsedPct, color: barColor }]}
              height={8}
              accessibilityLabel={`${formatPercent(month.budgetUsedPct, 0)} of budget used`}
            />
            <View
              style={[styles.paceMarker, { left: `${Math.min(100, month.monthElapsedPct)}%` }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>
          <Text style={[styles.subLine, month.budgetLeft < 0 && { color: colors.danger }]}>
            {month.budgetLeft >= 0
              ? `${money.exact(month.budgetLeft)} left · ${money.exact(month.perDayLeft)}/day for ${month.daysLeftInMonth} days`
              : `Over by ${money.exact(-month.budgetLeft)}`}
          </Text>
        </PressableScale>

        {month.prepaidThisMonth > 0 ? (
          <PressableScale
            onPress={onOpenPayments}
            style={styles.linkRow}
            accessibilityRole="link"
            accessibilityLabel={`${money.spoken(month.prepaidThisMonth)} prepaid towards loans this month. Opens payment history`}
          >
            <Ionicons name="receipt-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.linkText}>
              {money.exact(month.prepaidThisMonth)} prepaid towards loans this month
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </Card>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    padding: space.lg,
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
    gap: space.sm,
  },
  blockTitle: {
    ...type.label,
    color: colors.textSecondary,
  },
  blockMeta: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
  },
  repayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  bigLine: {
    color: colors.text,
  },
  bigValue: {
    ...type.amount,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
  },
  bigOf: {
    ...type.label,
    fontWeight: "500",
    color: colors.textMuted,
  },
  subLine: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: space.xs,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    marginTop: space.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  footnote: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: space.md,
  },
  maturityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    minHeight: 44,
  },
  maturityText: {
    ...type.caption,
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
    marginHorizontal: space.lg,
  },
  meterWrap: {
    marginTop: space.md,
    justifyContent: "center",
  },
  paceMarker: {
    position: "absolute",
    width: 2,
    height: 14,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.text,
    opacity: 0.55,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  linkText: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
    flex: 1,
  },
});

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, HIT, radius, space, type } from "../../constants/dashboardTheme";
import type { Insight, PortfolioTotals } from "../../hooks/use-dashboard-data";
import { formatMonthYear, formatPercent } from "../../utils/format";
import { toneColors } from "./DashboardHeader";
import ProgressRing from "./ProgressRing";
import { AnimatedAmount, Card, IconBadge, PressableScale, SectionHeader } from "./primitives";
import { useMoney } from "./privacy";

const formatDuration = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y && m) return `${y} yr ${m} mo`;
  if (y) return `${y} yr`;
  return `${m} mo`;
};

interface DebtCardProps {
  totals: PortfolioTotals;
  hasLoans: boolean;
  closedLoanCount: number;
  onOpenRoadmap: () => void;
  onOpenDebtFree: () => void;
}

export default function DebtCard({ totals, hasLoans, closedLoanCount, onOpenRoadmap, onOpenDebtFree }: DebtCardProps) {
  const money = useMoney();

  if (!hasLoans) {
    if (closedLoanCount === 0) return null;
    return (
      <View>
        <SectionHeader title="Debt progress" />
        <LinearGradient colors={["#047857", "#065f46"]} style={styles.freeCard}>
          <Ionicons name="checkmark-circle" size={32} color="#ffffff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.freeTitle}>You&apos;re debt-free</Text>
            <Text style={styles.freeSub}>
              {closedLoanCount} loan{closedLoanCount === 1 ? "" : "s"} closed. Keep the momentum going.
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View>
      <SectionHeader title="Debt progress" actionLabel="Roadmap" onAction={onOpenRoadmap} />
      <Card padded={false}>
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>Principal outstanding</Text>
            <AnimatedAmount value={totals.principalOutstanding} format={money.exact} style={styles.amount} />
            <Text style={styles.caption} numberOfLines={2}>
              of {money.compact(totals.principalBorrowed)} borrowed · {totals.activeCount} active loan
              {totals.activeCount === 1 ? "" : "s"}
            </Text>
          </View>
          <ProgressRing
            value={totals.repaidPct}
            size={76}
            stroke={8}
            trackColor={colors.surfaceSunken}
            colors={["#34d399", "#0ea5e9"]}
            label={formatPercent(totals.repaidPct, 0)}
            labelColor={colors.text}
            caption="repaid"
            captionColor={colors.textMuted}
            accessibilityLabel={`${formatPercent(totals.repaidPct, 0)} of principal repaid`}
          />
        </View>

        <View style={styles.kpis}>
          <Kpi label="Interest ahead" value={money.compact(totals.interestOutstanding)} />
          <Kpi label="Total payable" value={money.compact(totals.totalPayable)} />
          <Kpi label="EMIs / month" value={money.compact(totals.emisPerMonth)} />
        </View>

        {totals.interestSaved >= 1 ? (
          <View style={styles.savedRow} accessible accessibilityLabel={`${money.spoken(totals.interestSaved)} interest saved through prepayments`}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={styles.savedText}>
              {money.exact(totals.interestSaved)} interest saved through prepayments
            </Text>
          </View>
        ) : null}

        {totals.debtFreeDate ? (
          <PressableScale
            onPress={onOpenDebtFree}
            style={styles.debtFreeRow}
            accessibilityLabel={`Debt-free by ${formatMonthYear(totals.debtFreeDate)}, in ${formatDuration(totals.monthsToDebtFree)}`}
            accessibilityHint="Opens the debt-free planner"
          >
            <IconBadge name="flag-outline" color={colors.primary} backgroundColor={colors.primarySoft} size={32} iconSize={16} />
            <Text style={styles.debtFreeText}>
              Debt-free by <Text style={styles.debtFreeStrong}>{formatMonthYear(totals.debtFreeDate)}</Text>
              <Text style={styles.debtFreeMuted}> · in {formatDuration(totals.monthsToDebtFree)}</Text>
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </Card>
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi} accessible accessibilityLabel={`${label}: ${value === "₹ ••••" ? "hidden" : value}`}>
      <Text style={styles.kpiLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Text>
    </View>
  );
}

// ── Insights ────────────────────────────────────────────────────────────────

interface InsightsCardProps {
  insights: Insight[];
  onInsight: (insight: Insight) => void;
  onAskAI: () => void;
}

export function InsightsCard({ insights, onInsight, onAskAI }: InsightsCardProps) {
  const money = useMoney();
  return (
    <View>
      <View style={styles.insightsHeader}>
        <SectionHeader title="Insights" style={{ marginBottom: 0, flex: 1 }} />
        <PressableScale onPress={onAskAI} style={styles.askAi} accessibilityLabel="Ask the AI Advisor" hitSlop={4}>
          <Ionicons name="sparkles" size={14} color={colors.violet} />
          <Text style={styles.askAiText}>Ask AI</Text>
        </PressableScale>
      </View>
      <Card padded={false}>
        {insights.map((insight, i) => {
          const isAi = insight.tone === "ai";
          const tone = isAi ? null : toneColors[insight.tone as keyof typeof toneColors];
          return (
            <PressableScale
              key={insight.key}
              onPress={() => onInsight(insight)}
              style={[styles.insightRow, i > 0 && styles.insightDivider]}
              accessibilityLabel={money.spokenText(insight.text)}
            >
              <IconBadge
                name={insight.icon as any}
                color={isAi ? colors.violet : tone!.text}
                backgroundColor={isAi ? colors.violetSoft : tone!.soft}
                size={36}
                iconSize={18}
              />
              <Text style={styles.insightText}>{money.text(insight.text)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </PressableScale>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    padding: space.lg,
  },
  overline: {
    ...type.overline,
    color: colors.textMuted,
  },
  amount: {
    ...type.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
    marginTop: space.xs,
  },
  caption: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: 2,
  },
  kpis: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  kpi: {
    flex: 1,
  },
  kpiLabel: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
  },
  kpiValue: {
    ...type.amountSmall,
    color: colors.text,
    marginTop: 2,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.primarySoft,
  },
  savedText: {
    ...type.label,
    color: colors.primary,
    flex: 1,
  },
  debtFreeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  debtFreeText: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    flex: 1,
  },
  debtFreeStrong: {
    fontWeight: "700",
    color: colors.primary,
  },
  debtFreeMuted: {
    color: colors.textMuted,
  },
  freeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.xl,
  },
  freeTitle: {
    ...type.title,
    color: "#ffffff",
  },
  freeSub: {
    ...type.label,
    fontWeight: "500",
    color: "#ffffff",
    marginTop: 2,
  },
  insightsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space.md,
  },
  askAi: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 40,
    minWidth: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.violetSoft,
  },
  askAiText: {
    ...type.label,
    fontWeight: "700",
    color: colors.violet,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    minHeight: 64,
  },
  insightDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  insightText: {
    ...type.label,
    fontWeight: "500",
    color: colors.text,
    flex: 1,
  },
});

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, HIT, kindColors, radius, space, type } from "../../constants/dashboardTheme";
import type { LoanSummary, Tone } from "../../hooks/use-dashboard-data";
import { daysFromToday, formatDateShort, formatPercent } from "../../utils/format";
import { toneColors } from "./DashboardHeader";
import { Card, IconBadge, Pill, PressableScale, ProgressBar, SectionHeader } from "./primitives";
import { useMoney } from "./privacy";

const MAX_ROWS = 3;

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** Decorative icon guessed from the loan name; the kind label stays factual. */
const iconFor = (loan: LoanSummary): keyof typeof Ionicons.glyphMap => {
  const n = loan.name.toLowerCase();
  if (/gold|jewel/.test(n)) return "diamond-outline";
  if (/home|house|housing|flat/.test(n)) return "home-outline";
  if (/car|auto|vehicle|creta/.test(n)) return "car-outline";
  if (/bike|scooter/.test(n)) return "bicycle-outline";
  if (/edu|student|study/.test(n)) return "school-outline";
  if (/business|shop/.test(n)) return "briefcase-outline";
  if (/personal/.test(n)) return "person-outline";
  return loan.kind === "bullet" ? "hourglass-outline" : "wallet-outline";
};

const statusChip = (loan: LoanSummary): { label: string; tone: Tone } | null => {
  if (loan.isMatured) {
    return { label: `Matured ${loan.daysOverdue}d ago`, tone: "critical" };
  }
  const days = loan.nextDueDate ? daysFromToday(loan.nextDueDate) : null;
  if (loan.kind === "bullet" && days !== null && days <= 30) {
    return { label: days === 0 ? "Matures today" : `Matures in ${days}d`, tone: days <= 7 ? "warning" : "neutral" };
  }
  if (loan.kind === "emi" && loan.monthsLeft > 0 && loan.monthsLeft <= 3) {
    return { label: `${loan.monthsLeft} EMI${loan.monthsLeft === 1 ? "" : "s"} left`, tone: "positive" };
  }
  if (loan.kind === "emi" && days !== null && days <= 7) {
    return { label: days === 0 ? "EMI today" : `EMI in ${days}d`, tone: days <= 1 ? "warning" : "neutral" };
  }
  return null;
};

interface LoansSectionProps {
  loans: LoanSummary[];
  closedCount: number;
  onOpenLoan: (id: string) => void;
  onViewAll: () => void;
  onAddLoan: () => void;
}

export default function LoansSection({ loans, closedCount, onOpenLoan, onViewAll, onAddLoan }: LoansSectionProps) {
  const shown = loans.slice(0, MAX_ROWS);

  return (
    <View>
      <SectionHeader title="Your loans" count={loans.length} actionLabel="View all" onAction={onViewAll} />
      {loans.length === 0 ? (
        <Card style={styles.empty}>
          <IconBadge name="wallet-outline" color={colors.indigo} backgroundColor={colors.indigoSoft} size={48} iconSize={24} />
          <Text style={styles.emptyTitle}>{closedCount > 0 ? "All loans are closed" : "No active loans"}</Text>
          <Text style={styles.emptySub}>
            {closedCount > 0
              ? `${closedCount} closed loan${closedCount === 1 ? "" : "s"} in your history. Add a new one any time.`
              : "Track EMIs and gold loans to see what's due and when you'll be debt-free."}
          </Text>
          <PressableScale onPress={onAddLoan} style={styles.emptyBtn} accessibilityLabel="Add a loan">
            <Ionicons name="add" size={18} color={colors.textOnAccent} />
            <Text style={styles.emptyBtnText}>Add loan</Text>
          </PressableScale>
        </Card>
      ) : (
        <Card padded={false}>
          {shown.map((loan, i) => (
            <LoanRow key={loan.id} loan={loan} first={i === 0} onPress={() => onOpenLoan(loan.id)} />
          ))}
          {loans.length > MAX_ROWS ? (
            <PressableScale onPress={onViewAll} style={styles.moreRow} accessibilityRole="link">
              <Text style={styles.moreText}>View all {loans.length} loans</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.indigo} />
            </PressableScale>
          ) : null}
        </Card>
      )}
    </View>
  );
}

function LoanRow({ loan, first, onPress }: { loan: LoanSummary; first: boolean; onPress: () => void }) {
  const money = useMoney();
  const kind = kindColors[loan.kind];
  const chip = statusChip(loan);
  const chipTone = chip ? toneColors[chip.tone] : null;
  const meta =
    loan.kind === "emi"
      ? `EMI ${money.exact(loan.emi)}${loan.emiDay ? ` · ${ordinal(loan.emiDay)}` : ""} · ${formatPercent(loan.rate, 2)}`
      : `Bullet · ${formatPercent(loan.rate, 2)} · matures ${formatDateShort(loan.endDate)}`;
  const progress = loan.kind === "emi" ? loan.repaidPct : loan.termElapsedPct;
  const barColor = loan.isMatured ? colors.dangerFill : loan.kind === "emi" ? colors.primaryFill : kind.fill;

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.row, !first && styles.rowDivider]}
      accessibilityLabel={`${loan.name}. ${meta}. ${money.spoken(loan.remainingPrincipal)} principal left${chip ? `. ${chip.label}` : ""}`}
      accessibilityHint="Opens loan details"
    >
      <View style={styles.rowTop}>
        <IconBadge name={iconFor(loan)} color={kind.text} backgroundColor={kind.soft} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {loan.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View style={styles.rowTrail}>
          <Text style={styles.rowAmount} numberOfLines={1}>
            {money.exact(loan.remainingPrincipal)}
          </Text>
          <Text style={styles.rowAmountCaption}>of {money.compact(loan.principal)}</Text>
        </View>
      </View>
      <View style={styles.rowBottom}>
        <ProgressBar
          segments={[{ value: progress, color: barColor }]}
          height={5}
          style={{ flex: 1 }}
          accessibilityLabel={
            loan.kind === "emi"
              ? `${formatPercent(loan.repaidPct, 0)} of principal repaid`
              : `${formatPercent(loan.termElapsedPct, 0)} of term elapsed`
          }
        />
        <Text style={styles.rowProgressText}>
          {loan.kind === "emi" ? `${formatPercent(loan.repaidPct, 0)} repaid` : `${formatPercent(loan.termElapsedPct, 0)} of term`}
        </Text>
        {chip && chipTone ? <Pill label={chip.label} color={chipTone.text} backgroundColor={chipTone.soft} /> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
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
  rowProgressText: {
    ...type.caption,
    fontSize: 11,
    color: colors.textSecondary,
    minWidth: 54,
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: HIT,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  moreText: {
    ...type.label,
    color: colors.indigo,
  },
  empty: {
    alignItems: "center",
    paddingVertical: space.xxl,
    gap: space.sm,
  },
  emptyTitle: {
    ...type.headline,
    color: colors.text,
    marginTop: space.xs,
  },
  emptySub: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: space.sm,
    minHeight: HIT,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  emptyBtnText: {
    ...type.body,
    fontWeight: "700",
    color: colors.textOnAccent,
  },
});

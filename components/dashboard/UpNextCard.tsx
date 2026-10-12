import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { colors, HIT, kindColors, radius, shadow, space, type } from "../../constants/dashboardTheme";
import { DUE_WINDOW_DAYS, type DueItem, type DueKind } from "../../hooks/use-dashboard-data";
import { formatDateShort, formatDateWithDay, formatRelativeDays } from "../../utils/format";
import { toneColors } from "./DashboardHeader";
import { AnimatedAmount, PressableScale } from "./primitives";
import { useMoney } from "./privacy";

const MAX_ROWS = 4;

/** Marker colours tuned for the dark hero surface. */
const RUNWAY_COLORS: Record<DueKind, string> = {
  emi: "#818cf8",
  bullet: "#fbbf24",
  insurance: "#38bdf8",
};

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface UpNextCardProps {
  dues: DueItem[];
  duesTotal: number;
  overdueTotal: number;
  nextBeyondWindow: DueItem | null;
  windowEnd: Date;
  onOpenCalendar: () => void;
  onOpenItem: (item: DueItem) => void;
}

export default function UpNextCard({
  dues,
  duesTotal,
  overdueTotal,
  nextBeyondWindow,
  windowEnd,
  onOpenCalendar,
  onOpenItem,
}: UpNextCardProps) {
  const money = useMoney();
  const hasDues = dues.length > 0;
  const shown = dues.slice(0, MAX_ROWS);
  const more = dues.length - shown.length;

  return (
    <View style={styles.card}>
      <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={[styles.glow, styles.glowTop]} pointerEvents="none" />
        <View style={[styles.glow, styles.glowBottom]} pointerEvents="none" />

        <View style={styles.heroTop}>
          <Text style={styles.overline}>Due in the next {DUE_WINDOW_DAYS} days</Text>
          <PressableScale
            onPress={onOpenCalendar}
            style={styles.calendarLink}
            accessibilityRole="link"
            accessibilityLabel="Open payment calendar"
            hitSlop={10}
          >
            <Ionicons name="calendar-outline" size={14} color={colors.heroTextSecondary} />
            <Text style={styles.calendarLinkText}>Calendar</Text>
          </PressableScale>
        </View>

        {hasDues ? (
          <>
            <AnimatedAmount
              value={duesTotal}
              format={money.exact}
              style={styles.amount}
              accessibilityLabel={`${money.spoken(duesTotal)} due in the next ${DUE_WINDOW_DAYS} days`}
            />
            <Text style={styles.subline} numberOfLines={1}>
              {dues.length} payment{dues.length === 1 ? "" : "s"} · next {formatDateWithDay(dues[0].date)}
            </Text>
            <Text style={styles.helper} numberOfLines={1}>
              Keep this ready in your account for auto-debits
            </Text>
          </>
        ) : (
          <View style={styles.clearRow}>
            <Ionicons name="checkmark-circle" size={26} color={colors.heroAccent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.clearTitle}>All clear</Text>
              <Text style={styles.subline} numberOfLines={2}>
                {nextBeyondWindow
                  ? `Next: ${nextBeyondWindow.name} · ${money.exact(nextBeyondWindow.amount)} · ${formatDateWithDay(nextBeyondWindow.date)}`
                  : "Nothing scheduled yet"}
              </Text>
            </View>
          </View>
        )}

        {overdueTotal > 0 ? (
          <View style={styles.overdueChip}>
            <Ionicons name="alert-circle" size={13} color="#fb7185" />
            <Text style={styles.overdueText}>Plus {money.exact(overdueTotal)} overdue</Text>
          </View>
        ) : null}

        <Runway dues={dues} windowEnd={windowEnd} />
      </LinearGradient>

      {hasDues ? (
        <View style={styles.list}>
          {shown.map((item, i) => (
            <DueRow key={item.key} item={item} first={i === 0} onPress={() => onOpenItem(item)} />
          ))}
          {more > 0 ? (
            <PressableScale onPress={onOpenCalendar} style={styles.moreRow} accessibilityRole="link">
              <Text style={styles.moreText}>
                +{more} more · Open calendar
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.indigo} />
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ── Runway: a 15-day strip with one marker per due date ─────────────────────

function Runway({ dues, windowEnd }: { dues: DueItem[]; windowEnd: Date }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const groups = dues.reduce<{ day: number; amount: number; count: number; kind: DueKind; top: number }[]>(
    (acc, d) => {
      const g = acc.find((x) => x.day === d.daysLeft);
      if (g) {
        g.amount += d.amount;
        g.count += 1;
        if (d.amount > g.top) {
          g.top = d.amount;
          g.kind = d.kind;
        }
        return acc;
      }
      return [...acc, { day: d.daysLeft, amount: d.amount, count: 1, kind: d.kind, top: d.amount }];
    },
    [],
  );
  const maxAmount = Math.max(1, ...groups.map((g) => g.amount));
  const pad = 14;
  const baseline = 30;

  return (
    <View
      style={styles.runway}
      onLayout={onLayout}
      accessible
      accessibilityLabel={
        groups.length
          ? `Timeline: ${dues.map((d) => `${d.name} ${formatRelativeDays(d.daysLeft).toLowerCase()}`).join(", ")}`
          : "Timeline: nothing due in the next 15 days"
      }
    >
      {width > 0 ? (
        <>
          <View style={[styles.runwayLine, { top: baseline, left: pad, right: pad }]} />
          {Array.from({ length: DUE_WINDOW_DAYS + 1 }, (_, day) => (
            <View
              key={day}
              style={[
                styles.tick,
                {
                  left: pad + (day / DUE_WINDOW_DAYS) * (width - pad * 2) - 0.5,
                  top: baseline - (day % 7 === 0 ? 4 : 2),
                  height: day % 7 === 0 ? 9 : 5,
                  opacity: day % 7 === 0 ? 0.5 : 0.28,
                },
              ]}
            />
          ))}
          {groups.map((g, i) => {
            const size = 10 + 14 * Math.sqrt(g.amount / maxAmount);
            const x = pad + (g.day / DUE_WINDOW_DAYS) * (width - pad * 2);
            return (
              <Animated.View
                key={g.day}
                entering={ZoomIn.delay(200 + i * 60).springify().damping(14)}
                style={[
                  styles.marker,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    left: x - size / 2,
                    top: baseline + 0.5 - size / 2,
                    backgroundColor: RUNWAY_COLORS[g.kind],
                  },
                ]}
              >
                {g.count > 1 ? <Text style={styles.markerCount}>{g.count}</Text> : null}
              </Animated.View>
            );
          })}
          <Text style={[styles.runwayLabel, { left: pad - 4 }]}>Today</Text>
          <Text style={[styles.runwayLabel, { right: pad - 4, textAlign: "right" }]}>
            {formatDateShort(windowEnd)}
          </Text>
        </>
      ) : null}
    </View>
  );
}

// ── Agenda row ──────────────────────────────────────────────────────────────

function DueRow({ item, first, onPress }: { item: DueItem; first: boolean; onPress: () => void }) {
  const money = useMoney();
  const kind = kindColors[item.kind];
  const tone = toneColors[item.tone];
  const relative = formatRelativeDays(item.daysLeft);

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.row, !first && styles.rowDivider]}
      accessibilityLabel={`${item.name}, ${item.meta}, ${money.spoken(item.amount)}, due ${formatDateWithDay(item.date)}, ${relative}`}
      accessibilityHint={item.kind === "insurance" ? "Opens insurance policies" : "Opens loan details"}
    >
      <View style={[styles.dateTile, { backgroundColor: kind.soft }]}>
        <Text style={[styles.dateDay, { color: kind.text }]}>{item.date.getDate()}</Text>
        <Text style={[styles.dateWeekday, { color: kind.text }]}>{WEEKDAYS[item.date.getDay()]}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.meta}
        </Text>
      </View>
      <View style={styles.rowTrail}>
        <Text style={styles.rowAmount} numberOfLines={1}>
          {money.exact(item.amount)}
        </Text>
        <View style={[styles.relChip, { backgroundColor: tone.soft }]}>
          <Text style={[styles.relText, { color: tone.text }]}>{relative}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadow.hero,
  },
  hero: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.md,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
  },
  glowTop: {
    width: 220,
    height: 220,
    top: -110,
    right: -70,
    backgroundColor: "rgba(56, 189, 248, 0.14)",
  },
  glowBottom: {
    width: 180,
    height: 180,
    bottom: -100,
    left: -60,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
  },
  overline: {
    ...type.overline,
    color: colors.heroTextSecondary,
  },
  calendarLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.heroChip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.heroChipBorder,
  },
  calendarLinkText: {
    ...type.caption,
    color: colors.heroTextSecondary,
  },
  amount: {
    ...type.display,
    color: colors.heroText,
    marginTop: space.sm,
  },
  subline: {
    ...type.label,
    fontWeight: "500",
    color: colors.heroTextSecondary,
    marginTop: space.xs,
  },
  helper: {
    ...type.caption,
    fontWeight: "500",
    color: colors.heroTextMuted,
    marginTop: 2,
  },
  clearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
  },
  clearTitle: {
    ...type.title,
    color: colors.heroText,
  },
  overdueChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: space.sm + 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(251, 113, 133, 0.16)",
  },
  overdueText: {
    ...type.caption,
    color: "#fda4af",
  },
  runway: {
    height: 58,
    marginTop: space.md,
    marginHorizontal: -space.xs,
  },
  runwayLine: {
    position: "absolute",
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  tick: {
    position: "absolute",
    width: 1,
    backgroundColor: "#ffffff",
  },
  marker: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#121a2f",
  },
  markerCount: {
    fontSize: 9,
    fontWeight: "800",
    color: "#0b1020",
  },
  runwayLabel: {
    position: "absolute",
    bottom: 0,
    ...type.caption,
    fontSize: 11,
    color: colors.heroTextMuted,
  },
  list: {
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.sm + 2,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  dateTile: {
    width: 44,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  dateWeekday: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
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
    gap: 4,
  },
  rowAmount: {
    ...type.amountSmall,
    color: colors.text,
  },
  relChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  relText: {
    ...type.caption,
    fontSize: 11,
    lineHeight: 14,
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
});

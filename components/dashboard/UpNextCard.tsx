import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
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

  const nextDue = hasDues ? dues[0] : null;
  const daysLeft = nextDue ? nextDue.daysLeft : 0;

  let nextBadge: {
    label: string;
    dot: string;
    text: string;
    bg: string;
    border: string;
    icon: keyof typeof Ionicons.glyphMap;
  } = {
    label: `In ${daysLeft} days · ${nextDue ? formatDateShort(nextDue.date) : ""}`,
    dot: "#818cf8",
    text: "#c7d2fe",
    bg: "rgba(99, 102, 241, 0.20)",
    border: "rgba(129, 140, 248, 0.35)",
    icon: "calendar-outline",
  };

  if (nextDue) {
    if (daysLeft < 0) {
      nextBadge = {
        label: `Overdue by ${Math.abs(daysLeft)}d · ${formatDateShort(nextDue.date)}`,
        dot: "#f43f5e",
        text: "#fda4af",
        bg: "rgba(244, 63, 94, 0.22)",
        border: "rgba(251, 113, 133, 0.40)",
        icon: "alert-circle-outline" as const,
      };
    } else if (daysLeft === 0) {
      nextBadge = {
        label: "Due Today · Auto-debit",
        dot: "#fbbf24",
        text: "#fde68a",
        bg: "rgba(245, 158, 11, 0.24)",
        border: "rgba(251, 191, 36, 0.45)",
        icon: "flash-outline" as const,
      };
    } else if (daysLeft === 1) {
      nextBadge = {
        label: `Due Tomorrow · ${formatDateShort(nextDue.date)}`,
        dot: "#f59e0b",
        text: "#fde68a",
        bg: "rgba(245, 158, 11, 0.20)",
        border: "rgba(251, 191, 36, 0.38)",
        icon: "time-outline" as const,
      };
    } else if (daysLeft <= 3) {
      nextBadge = {
        label: `In ${daysLeft} days · ${formatDateShort(nextDue.date)}`,
        dot: "#38bdf8",
        text: "#bae6fd",
        bg: "rgba(56, 189, 248, 0.20)",
        border: "rgba(56, 189, 248, 0.38)",
        icon: "time-outline" as const,
      };
    }
  }

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

        {hasDues && nextDue ? (
          <>
            <AnimatedAmount
              value={duesTotal}
              format={money.exact}
              style={styles.amount}
              accessibilityLabel={`${money.spoken(duesTotal)} due in the next ${DUE_WINDOW_DAYS} days`}
            />

            {/* Prominent Next EMI Callout Bubble */}
            <View style={[styles.nextEmiBubble, { backgroundColor: nextBadge.bg, borderColor: nextBadge.border }]}>
              <View style={[styles.nextEmiDot, { backgroundColor: nextBadge.dot }]} />
              <Ionicons name={nextBadge.icon} size={13} color={nextBadge.text} style={{ marginRight: 4 }} />
              <Text style={[styles.nextEmiText, { color: nextBadge.text }]}>
                {nextBadge.label}
              </Text>
              <Text style={styles.nextEmiName} numberOfLines={1}>
                {" · "}{nextDue.name} ({money.exact(nextDue.amount)})
              </Text>
            </View>

            <Text style={styles.subline} numberOfLines={1}>
              {dues.length} payment{dues.length === 1 ? "" : "s"} scheduled in next 15 days
            </Text>
            <Text style={styles.helper} numberOfLines={1}>
              Keep this ready in your account for auto-debits
            </Text>
          </>
        ) : (
          <View style={styles.clearRow}>
            <View style={styles.clearIconCircle}>
              <Ionicons name="checkmark-circle" size={26} color={colors.heroAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clearTitle}>All clear for next 15 days</Text>
              {nextBeyondWindow ? (
                <View style={styles.nextBeyondBadge}>
                  <Ionicons name="calendar-outline" size={13} color="rgba(255, 255, 255, 0.8)" />
                  <Text style={styles.nextBeyondText} numberOfLines={2}>
                    Next: <Text style={{ fontWeight: "700", color: "#fff" }}>{nextBeyondWindow.name}</Text>
                    {" · "}
                    {money.exact(nextBeyondWindow.amount)}
                    {" · "}
                    <Text style={{ color: "#34d399", fontWeight: "700" }}>
                      in {nextBeyondWindow.daysLeft} days ({formatDateShort(nextBeyondWindow.date)})
                    </Text>
                  </Text>
                </View>
              ) : (
                <Text style={styles.subline} numberOfLines={2}>
                  No upcoming payments scheduled
                </Text>
              )}
            </View>
          </View>
        )}

        {overdueTotal > 0 ? (
          <View style={styles.overdueChip}>
            <Ionicons name="alert-circle" size={13} color="#fb7185" />
            <Text style={styles.overdueText}>Plus {money.exact(overdueTotal)} overdue</Text>
          </View>
        ) : null}

        <Runway dues={dues} windowEnd={windowEnd} onSelectItem={onOpenItem} />
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

// ── Runway: a 15-day strip with interactive markers and date bubble callouts ─

function Runway({
  dues,
  windowEnd,
  onSelectItem,
}: {
  dues: DueItem[];
  windowEnd: Date;
  onSelectItem: (item: DueItem) => void;
}) {
  const money = useMoney();
  const [width, setWidth] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const groups = dues.reduce<
    {
      day: number;
      amount: number;
      count: number;
      kind: DueKind;
      top: number;
      date: Date;
      items: DueItem[];
    }[]
  >((acc, d) => {
    const g = acc.find((x) => x.day === d.daysLeft);
    if (g) {
      g.amount += d.amount;
      g.count += 1;
      g.items.push(d);
      if (d.amount > g.top) {
        g.top = d.amount;
        g.kind = d.kind;
      }
      return acc;
    }
    return [
      ...acc,
      {
        day: d.daysLeft,
        amount: d.amount,
        count: 1,
        kind: d.kind,
        top: d.amount,
        date: d.date,
        items: [d],
      },
    ];
  }, []);

  const maxAmount = Math.max(1, ...groups.map((g) => g.amount));
  const pad = 16;
  const baseline = 42;

  const selectedGroup = groups.find((g) => g.day === selectedDay);

  return (
    <View
      style={styles.runwayContainer}
      onLayout={onLayout}
      accessible
      accessibilityLabel={
        groups.length
          ? `Timeline: ${dues.map((d) => `${d.name} ${formatRelativeDays(d.daysLeft).toLowerCase()}`).join(", ")}`
          : "Timeline: nothing due in the next 15 days"
      }
    >
      {width > 0 ? (
        <View style={styles.runway}>
          <View style={[styles.runwayLine, { top: baseline, left: pad, right: pad }]} />
          {Array.from({ length: DUE_WINDOW_DAYS + 1 }, (_, day) => (
            <View
              key={day}
              style={[
                styles.tick,
                {
                  left: pad + (day / DUE_WINDOW_DAYS) * (width - pad * 2) - 0.5,
                  top: baseline - (day % 7 === 0 ? 5 : 2),
                  height: day % 7 === 0 ? 10 : 5,
                  opacity: day % 7 === 0 ? 0.5 : 0.28,
                },
              ]}
            />
          ))}

          {groups.map((g, i) => {
            const size = Math.min(26, Math.max(14, 12 + 14 * Math.sqrt(g.amount / maxAmount)));
            const x = pad + (g.day / DUE_WINDOW_DAYS) * (width - pad * 2);
            const isSelected = selectedDay === g.day;
            const tagX = Math.max(2, Math.min(width - 48, x - 20));

            return (
              <React.Fragment key={g.day}>
                {/* Floating Date Bubble Tag Above Marker */}
                <PressableScale
                  onPress={() => setSelectedDay(isSelected ? null : g.day)}
                  haptic={false}
                  style={[
                    styles.bubbleTag,
                    {
                      left: tagX,
                      top: baseline - 28,
                      backgroundColor: isSelected
                        ? "#38bdf8"
                        : g.day <= 1
                        ? "rgba(251, 191, 36, 0.25)"
                        : "rgba(255, 255, 255, 0.16)",
                      borderColor: isSelected
                        ? "#bae6fd"
                        : g.day <= 1
                        ? "rgba(251, 191, 36, 0.50)"
                        : "rgba(255, 255, 255, 0.25)",
                    },
                  ]}
                  accessibilityLabel={`Due ${g.day === 0 ? "today" : g.day === 1 ? "tomorrow" : `in ${g.day} days`}`}
                >
                  <Text
                    style={[
                      styles.bubbleTagText,
                      isSelected && styles.bubbleTagTextSelected,
                      g.day <= 1 && !isSelected && { color: "#fde68a" },
                    ]}
                  >
                    {g.day === 0 ? "Today" : g.day === 1 ? "Tmrw" : `${g.date.getDate()}th`}
                  </Text>
                </PressableScale>

                {/* Circular EMI Due Bubble Marker */}
                <PressableScale
                  onPress={() => setSelectedDay(isSelected ? null : g.day)}
                  haptic={false}
                  style={[
                    styles.markerHitbox,
                    {
                      left: x - size / 2 - 4,
                      top: baseline + 0.5 - size / 2 - 4,
                      width: size + 8,
                      height: size + 8,
                    },
                  ]}
                >
                  <Animated.View
                    entering={ZoomIn.delay(200 + i * 60).springify().damping(14)}
                    style={[
                      styles.marker,
                      {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor: RUNWAY_COLORS[g.kind],
                        borderColor: isSelected ? "#ffffff" : "#121a2f",
                        borderWidth: isSelected ? 2.5 : 2,
                      },
                      g.day <= 1 && styles.markerUrgent,
                    ]}
                  >
                    {g.count > 1 ? <Text style={styles.markerCount}>{g.count}</Text> : null}
                  </Animated.View>
                </PressableScale>
              </React.Fragment>
            );
          })}

          <Text style={[styles.runwayLabel, { left: pad - 4 }]}>Today</Text>
          <Text style={[styles.runwayLabel, { right: pad - 4, textAlign: "right" }]}>
            {formatDateShort(windowEnd)}
          </Text>
        </View>
      ) : null}

      {/* Selected Bubble Detail Callout */}
      {selectedGroup ? (
        <Animated.View entering={FadeInDown.duration(180)} style={styles.bubblePopup}>
          <View style={styles.bubblePopupHeader}>
            <Text style={styles.bubblePopupTitle} numberOfLines={1}>
              {selectedGroup.items.map((it) => it.name).join(", ")}
            </Text>
            <Text style={styles.bubblePopupAmount}>
              {money.exact(selectedGroup.amount)}
            </Text>
          </View>
          <View style={styles.bubblePopupFooter}>
            <Text style={styles.bubblePopupSub}>
              {formatDateWithDay(selectedGroup.date)} · {formatRelativeDays(selectedGroup.day)}
            </Text>
            <PressableScale
              onPress={() => onSelectItem(selectedGroup.items[0])}
              style={styles.bubblePopupAction}
              hitSlop={8}
            >
              <Text style={styles.bubblePopupActionText}>View details</Text>
              <Ionicons name="arrow-forward" size={12} color="#38bdf8" />
            </PressableScale>
          </View>
        </Animated.View>
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
  const isUrgent = item.daysLeft <= 1;

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.row, !first && styles.rowDivider]}
      accessibilityLabel={`${item.name}, ${item.meta}, ${money.spoken(item.amount)}, due ${formatDateWithDay(item.date)}, ${relative}`}
      accessibilityHint={item.kind === "insurance" ? "Opens insurance policies" : "Opens loan details"}
    >
      <View style={[styles.dateTile, { backgroundColor: kind.soft }, isUrgent && styles.dateTileUrgent]}>
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
        <View style={[styles.relChip, { backgroundColor: tone.soft }, isUrgent && styles.relChipUrgent]}>
          {isUrgent ? (
            <Ionicons name="flash" size={10} color={tone.text} style={{ marginRight: 2 }} />
          ) : null}
          <Text style={[styles.relText, { color: tone.text, fontWeight: isUrgent ? "700" : "500" }]}>
            {relative}
          </Text>
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
  nextEmiBubble: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: space.sm,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  nextEmiDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  nextEmiText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  nextEmiName: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.75)",
    maxWidth: 160,
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
  clearIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(52, 211, 153, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  clearTitle: {
    ...type.title,
    fontSize: 20,
    color: colors.heroText,
  },
  nextBeyondBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  nextBeyondText: {
    ...type.caption,
    color: "rgba(255, 255, 255, 0.8)",
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
  runwayContainer: {
    marginTop: space.md,
    marginHorizontal: -space.xs,
  },
  runway: {
    height: 72,
  },
  runwayLine: {
    position: "absolute",
    height: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  tick: {
    position: "absolute",
    width: 1,
    backgroundColor: "#ffffff",
  },
  bubbleTag: {
    position: "absolute",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  bubbleTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.9)",
    letterSpacing: -0.2,
  },
  bubbleTagTextSelected: {
    color: "#0369a1",
  },
  markerHitbox: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  marker: {
    alignItems: "center",
    justifyContent: "center",
  },
  markerUrgent: {
    shadowColor: "#fbbf24",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  markerCount: {
    fontSize: 9,
    fontWeight: "800",
    color: "#0b1020",
  },
  bubblePopup: {
    marginTop: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  bubblePopupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bubblePopupTitle: {
    ...type.body,
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    flex: 1,
    marginRight: space.sm,
  },
  bubblePopupAmount: {
    ...type.amountSmall,
    color: "#38bdf8",
    fontSize: 13,
  },
  bubblePopupFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  bubblePopupSub: {
    ...type.caption,
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
  },
  bubblePopupAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  bubblePopupActionText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#38bdf8",
  },
  runwayLabel: {
    position: "absolute",
    bottom: 2,
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
  dateTileUrgent: {
    borderWidth: 1.5,
    borderColor: "rgba(245, 158, 11, 0.4)",
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  relChipUrgent: {
    paddingHorizontal: space.sm + 2,
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

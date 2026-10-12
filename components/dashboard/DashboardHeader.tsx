import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { colors, HIT, radius, shadow, space, type } from "../../constants/dashboardTheme";
import type { StatusLine, Tone } from "../../hooks/use-dashboard-data";
import { hapticImpact, hapticTap, PressableScale } from "./primitives";
import { useMoney } from "./privacy";

export const toneColors: Record<Tone, { dot: string; text: string; soft: string }> = {
  critical: { dot: colors.dangerFill, text: colors.danger, soft: colors.dangerSoft },
  warning: { dot: colors.warningFill, text: colors.warning, soft: colors.warningSoft },
  neutral: { dot: colors.textMuted, text: colors.textSecondary, soft: colors.surfaceSunken },
  positive: { dot: colors.primaryFill, text: colors.primary, soft: colors.primarySoft },
};

interface DashboardHeaderProps {
  greeting: string;
  todayLabel: string;
  status: StatusLine;
  privacyHidden: boolean;
  onMenu: () => void;
  onQuickAdd: () => void;
  onTogglePrivacy: () => void;
  onStatusPress?: () => void;
}

export default function DashboardHeader({
  greeting,
  todayLabel,
  status,
  privacyHidden,
  onMenu,
  onQuickAdd,
  onTogglePrivacy,
  onStatusPress,
}: DashboardHeaderProps) {
  const money = useMoney();
  const tone = toneColors[status.tone];

  return (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <PressableScale onPress={onMenu} style={styles.iconBtn} accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={22} color={colors.text} />
        </PressableScale>
        <View style={{ flex: 1 }} />
        <PressableScale
          onPress={() => {
            hapticTap();
            onTogglePrivacy();
          }}
          haptic={false}
          style={styles.iconBtn}
          accessibilityLabel={privacyHidden ? "Show amounts" : "Hide amounts"}
          accessibilityState={{ selected: privacyHidden }}
        >
          <Ionicons name={privacyHidden ? "eye-off-outline" : "eye-outline"} size={20} color={colors.text} />
        </PressableScale>
        <PressableScale
          onPress={() => {
            hapticImpact();
            onQuickAdd();
          }}
          haptic={false}
          style={styles.addBtn}
          accessibilityLabel="Quick add"
          accessibilityHint="Add a loan, insurance policy, expense or income"
        >
          <Ionicons name="add" size={26} color={colors.textOnAccent} />
        </PressableScale>
      </View>

      <Text style={styles.greeting} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="header">
        {greeting}
      </Text>
      <PressableScale
        onPress={onStatusPress}
        disabled={!onStatusPress}
        haptic={false}
        style={styles.statusRow}
        accessibilityRole="button"
        accessibilityLabel={`${todayLabel}. ${money.spokenText(status.text)}`}
        accessibilityHint={onStatusPress ? "Shows upcoming payments" : undefined}
      >
        <Text style={styles.date} numberOfLines={1}>
          {todayLabel}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: tone.soft }]}>
          <View style={[styles.dot, { backgroundColor: tone.dot }]} />
          <Text style={[styles.status, { color: tone.text }]} numberOfLines={1}>
            {money.text(status.text)}
          </Text>
          {onStatusPress ? <Ionicons name="chevron-down" size={12} color={tone.text} /> : null}
        </View>
      </PressableScale>
    </View>
  );
}

interface StickyHeaderProps {
  scrollY: SharedValue<number>;
  /** Scroll offset at which the bar is fully visible. */
  showAt: number;
  topInset: number;
  title: string;
  subtitle: string;
  tone: Tone;
  onPress: () => void;
  onQuickAdd: () => void;
}

/** Compact bar that fades in once the header scrolls away, keeping the key number visible. */
export function StickyHeader({ scrollY, showAt, topInset, title, subtitle, tone, onPress, onQuickAdd }: StickyHeaderProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [showAt - 40, showAt], [0, 1], "clamp");
    return {
      opacity,
      transform: [{ translateY: interpolate(opacity, [0, 1], [-8, 0]) }],
    };
  });
  const toneColor = toneColors[tone];
  const money = useMoney();
  // An invisible bar must not swallow taps meant for the header underneath it
  // (Android and web still hit-test views at opacity 0).
  const [interactive, setInteractive] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > showAt - 20,
    (visible, prev) => {
      if (visible !== prev) scheduleOnRN(setInteractive, visible);
    },
    [showAt],
  );

  return (
    <Animated.View
      style={[styles.sticky, { paddingTop: topInset }, animatedStyle]}
      pointerEvents={interactive ? "box-none" : "none"}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? "auto" : "no-hide-descendants"}
    >
      <View style={styles.stickyInner}>
        <PressableScale
          onPress={onPress}
          haptic={false}
          style={styles.stickyText}
          accessibilityLabel={`${money.spokenText(title)}, ${money.spokenText(subtitle)}. Scroll to top`}
        >
          <View style={[styles.dot, { backgroundColor: toneColor.dot }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.stickyTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.stickySubtitle} numberOfLines={1}>
              {money.text(subtitle)}
            </Text>
          </View>
        </PressableScale>
        <PressableScale
          onPress={() => {
            hapticImpact();
            onQuickAdd();
          }}
          haptic={false}
          style={[styles.addBtn, styles.addBtnSmall]}
          accessibilityLabel="Quick add"
        >
          <Ionicons name="add" size={22} color={colors.textOnAccent} />
        </PressableScale>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: space.lg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.md,
  },
  iconBtn: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    ...type.title,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.xs + 2,
    minHeight: 28,
  },
  date: {
    ...type.label,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  status: {
    ...type.caption,
    flexShrink: 1,
  },
  addBtn: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.fab,
  },
  addBtnSmall: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
  },
  sticky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
    zIndex: 10,
    ...shadow.card,
  },
  stickyInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
  },
  stickyText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: HIT,
    borderRadius: radius.md,
  },
  stickyTitle: {
    ...type.amountSmall,
    color: colors.text,
  },
  stickySubtitle: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
  },
});

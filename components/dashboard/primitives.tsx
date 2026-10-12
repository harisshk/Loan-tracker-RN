import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, HIT, motion, radius, shadow, space, type } from "../../constants/dashboardTheme";

// ── Haptics ─────────────────────────────────────────────────────────────────

export const hapticTap = () => {
  if (Platform.OS === "web") return;
  Haptics.selectionAsync().catch(() => {});
};

export const hapticImpact = () => {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

// ── PressableScale ──────────────────────────────────────────────────────────

interface PressableScaleProps {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: "button" | "link" | "summary";
  accessibilityState?: { selected?: boolean; expanded?: boolean };
  haptic?: boolean;
  disabled?: boolean;
  hitSlop?: number;
  testID?: string;
}

/** Pressable with a subtle press-in scale + dim, and optional haptic tick. */
export function PressableScale({
  onPress,
  onLongPress,
  style,
  children,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  accessibilityState,
  haptic = true,
  disabled,
  hitSlop,
  testID,
}: PressableScaleProps) {
  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              if (haptic) hapticTap();
              onPress();
            }
          : undefined
      }
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={disabled ? { ...accessibilityState, disabled: true } : accessibilityState}
      testID={testID}
      style={({ pressed }) => [
        style,
        pressed && !disabled && { transform: [{ scale: motion.pressScale }], opacity: 0.92 },
      ]}
    >
      {children}
    </Pressable>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  padded?: boolean;
}

export function Card({ children, style, onPress, accessibilityLabel, accessibilityHint, padded = true }: CardProps) {
  const cardStyle = [styles.card, padded && styles.cardPadded, style];
  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        style={cardStyle}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {children}
      </PressableScale>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

// ── SectionHeader ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, count, actionLabel = "See all", onAction, style }: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
        {typeof count === "number" ? <Text style={styles.sectionCount}>{`  ${count}`}</Text> : null}
      </Text>
      {onAction ? (
        <PressableScale
          onPress={onAction}
          style={styles.sectionAction}
          accessibilityRole="link"
          accessibilityLabel={`${actionLabel}: ${title}`}
          hitSlop={8}
        >
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.indigo} />
        </PressableScale>
      ) : null}
    </View>
  );
}

// ── ProgressBar ─────────────────────────────────────────────────────────────

export interface ProgressSegment {
  /** 0-100 */
  value: number;
  color: string;
}

interface ProgressBarProps {
  segments: ProgressSegment[];
  height?: number;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

function AnimatedSegment({ value, color, height }: ProgressSegment & { height: number }) {
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(reduceMotion ? value : 0);

  useEffect(() => {
    width.value = reduceMotion
      ? value
      : withTiming(value, { duration: motion.slow * 2, easing: Easing.out(Easing.cubic) });
  }, [value, reduceMotion, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return <Animated.View style={[{ height, backgroundColor: color }, animatedStyle]} />;
}

/** Stacked horizontal bar; segment values are percentages of the full track. */
export function ProgressBar({ segments, height = 8, trackColor = colors.surfaceSunken, style, accessibilityLabel }: ProgressBarProps) {
  // Clamp so the stacked segments never exceed the track.
  const clamped = segments.reduce<ProgressSegment[]>((acc, s) => {
    const used = acc.reduce((sum, a) => sum + a.value, 0);
    const v = Math.max(0, Math.min(100 - used, Number.isFinite(s.value) ? s.value : 0));
    return [...acc, { ...s, value: v }];
  }, []);
  const total = clamped.reduce((sum, s) => sum + s.value, 0);
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(total) }}
    >
      {clamped.map((s, i) => (
        <AnimatedSegment key={i} value={s.value} color={s.color} height={height} />
      ))}
    </View>
  );
}

// ── Count-up numbers ────────────────────────────────────────────────────────

/**
 * Tweens from the previous value to `target` with an ease-out curve.
 * Jumps straight to the target when the user prefers reduced motion.
 */
export function useCountUp(target: number, duration: number = motion.countUp) {
  const reduceMotion = useReducedMotion();
  const skip = reduceMotion || !Number.isFinite(target);
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (skip) return;
    const from = fromRef.current;
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      fromRef.current = next;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, skip]);

  return skip ? target : value;
}

interface AnimatedAmountProps {
  value: number;
  format: (n: number) => string;
  style?: StyleProp<TextStyle>;
  duration?: number;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  accessibilityLabel?: string;
}

/** Text that counts up to `value`; screen readers always get the final value. */
export function AnimatedAmount({
  value,
  format,
  style,
  duration,
  numberOfLines = 1,
  adjustsFontSizeToFit = true,
  accessibilityLabel,
}: AnimatedAmountProps) {
  const current = useCountUp(value, duration);
  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={0.7}
      accessibilityLabel={accessibilityLabel ?? format(value)}
    >
      {format(current)}
    </Text>
  );
}

// ── Pill & IconBadge ────────────────────────────────────────────────────────

interface PillProps {
  label: string;
  color: string;
  backgroundColor: string;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

export function Pill({ label, color, backgroundColor, icon, style }: PillProps) {
  return (
    <View style={[styles.pill, { backgroundColor }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

interface IconBadgeProps {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  backgroundColor: string;
  size?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconBadge({ name, color, backgroundColor, size = 40, iconSize = 20, style }: IconBadgeProps) {
  return (
    <View
      style={[styles.iconBadge, { width: size, height: size, borderRadius: size * 0.32, backgroundColor }, style]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Ionicons name={name} size={iconSize} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardPadded: {
    padding: space.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
    minHeight: HIT - 12,
  },
  sectionTitle: {
    ...type.headline,
    color: colors.text,
  },
  sectionCount: {
    ...type.label,
    color: colors.textSecondary,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: HIT - 12,
    paddingHorizontal: space.xs,
  },
  sectionActionText: {
    ...type.label,
    color: colors.indigo,
  },
  track: {
    width: "100%",
    flexDirection: "row",
    overflow: "hidden",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  pillText: {
    ...type.caption,
  },
  iconBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
});

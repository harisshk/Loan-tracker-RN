import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useCountUp } from "./primitives";

interface ProgressRingProps {
  /** 0-100 */
  value: number;
  size?: number;
  stroke?: number;
  trackColor: string;
  /** Solid colour, or two colours for a gradient stroke. */
  colors: readonly [string] | readonly [string, string];
  label?: string;
  labelColor: string;
  caption?: string;
  captionColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Circular progress with a sweeping fill (instant under reduced motion). */
export default function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  trackColor,
  colors,
  label,
  labelColor,
  caption,
  captionColor,
  style,
  accessibilityLabel,
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const animated = useCountUp(pct);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - animated / 100);
  const gradientId = `ring-${colors.join("-").replace(/[^a-z0-9-]/gi, "")}`;
  const strokeColor = colors.length === 2 ? `url(#${gradientId})` : colors[0];

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <Svg width={size} height={size}>
        {colors.length === 2 ? (
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors[0]} />
              <Stop offset="1" stopColor={colors[1]} />
            </LinearGradient>
          </Defs>
        ) : null}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {animated > 0.2 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={strokeColor}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {label ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={[styles.label, { color: labelColor, fontSize: size >= 72 ? 17 : 14 }]}>{label}</Text>
          {caption ? <Text style={[styles.caption, { color: captionColor ?? labelColor }]}>{caption}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
  },
  caption: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: -1,
  },
});

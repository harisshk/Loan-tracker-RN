import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, space, type } from "../../constants/dashboardTheme";
import { PressableScale } from "./primitives";

interface WelcomeCardProps {
  budgetIsDefault: boolean;
  onAddLoan: () => void;
  onAddInsurance: () => void;
  onSetBudget: () => void;
}

/** First-run hero: a short checklist instead of a wall of ₹0 figures. */
export default function WelcomeCard({ budgetIsDefault, onAddLoan, onAddInsurance, onSetBudget }: WelcomeCardProps) {
  const steps = [
    { key: "loan", icon: "wallet-outline", title: "Add your first loan", sub: "EMI or bullet / gold loan", done: false, onPress: onAddLoan },
    { key: "ins", icon: "shield-checkmark-outline", title: "Add an insurance policy", sub: "Never miss a premium", done: false, onPress: onAddInsurance },
    { key: "budget", icon: "pie-chart-outline", title: "Set a monthly budget", sub: "Track spending against it", done: !budgetIsDefault, onPress: onSetBudget },
  ] as const;

  return (
    <View style={styles.card}>
      <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.overline}>Welcome to Velo Flow</Text>
        <Text style={styles.title}>See every EMI, premium and rupee in one place</Text>
        <Text style={styles.sub}>Three quick steps and your dashboard comes alive.</Text>
      </LinearGradient>
      <View style={styles.list}>
        {steps.map((s, i) => (
          <PressableScale
            key={s.key}
            onPress={s.onPress}
            style={[styles.row, i > 0 && styles.rowDivider]}
            accessibilityLabel={`Step ${i + 1}: ${s.title}${s.done ? ", done" : ""}`}
          >
            <View style={[styles.step, s.done && styles.stepDone]}>
              {s.done ? (
                <Ionicons name="checkmark" size={16} color={colors.textOnAccent} />
              ) : (
                <Text style={styles.stepText}>{i + 1}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, s.done && styles.rowTitleDone]}>{s.title}</Text>
              <Text style={styles.rowSub}>{s.sub}</Text>
            </View>
            <Ionicons name={s.icon} size={20} color={colors.textMuted} />
          </PressableScale>
        ))}
      </View>
    </View>
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
    padding: space.xl,
  },
  overline: {
    ...type.overline,
    color: colors.heroAccent,
  },
  title: {
    ...type.title,
    color: colors.heroText,
    marginTop: space.sm,
  },
  sub: {
    ...type.label,
    fontWeight: "500",
    color: colors.heroTextSecondary,
    marginTop: space.xs,
  },
  list: {
    paddingHorizontal: space.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  step: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDone: {
    backgroundColor: colors.primaryFill,
    borderColor: colors.primaryFill,
  },
  stepText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  rowTitle: {
    ...type.body,
    fontWeight: "700",
    color: colors.text,
  },
  rowTitleDone: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  rowSub: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 2,
  },
});

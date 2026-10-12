import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space, type } from "../../constants/dashboardTheme";
import { PressableScale, SectionHeader } from "./primitives";

const TOOLS = [
  { key: "roadmap", label: "Roadmap", icon: "map-outline", color: colors.indigo, soft: colors.indigoSoft, route: "/roadmap" },
  { key: "spends", label: "Spends", icon: "pie-chart-outline", color: colors.pink, soft: colors.pinkSoft, route: "/spend-tracker" },
  { key: "ai", label: "AI Advisor", icon: "sparkles", color: "#ffffff", soft: "", route: "/ai-advisor" },
  { key: "compare", label: "Compare", icon: "git-compare-outline", color: colors.info, soft: colors.infoSoft, route: "/compare-loans" },
] as const;

export default function ToolsRow({ onOpen }: { onOpen: (route: string) => void }) {
  return (
    <View>
      <SectionHeader title="Tools" />
      <View style={styles.row}>
        {TOOLS.map((t) => (
          <PressableScale
            key={t.key}
            onPress={() => onOpen(t.route)}
            style={styles.tile}
            accessibilityLabel={t.label}
          >
            {t.key === "ai" ? (
              <LinearGradient colors={["#7c3aed", "#9333ea"]} style={styles.icon}>
                <Ionicons name={t.icon} size={20} color={t.color} />
              </LinearGradient>
            ) : (
              <View style={[styles.icon, { backgroundColor: t.soft }]}>
                <Ionicons name={t.icon} size={20} color={t.color} />
              </View>
            )}
            <Text style={styles.label} numberOfLines={1}>
              {t.label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.sm + 2,
  },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 84,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...type.caption,
    color: colors.text,
  },
});

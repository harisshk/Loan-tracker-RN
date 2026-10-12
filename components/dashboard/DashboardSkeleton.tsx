import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, radius, space } from "../../constants/dashboardTheme";
import { PulseSkeleton } from "../ui/skeleton";

/** Mirrors the dashboard layout so content doesn't jump when data arrives. */
export default function DashboardSkeleton() {
  return (
    <View accessibilityLabel="Loading your dashboard" accessible>
      <View style={styles.header}>
        <PulseSkeleton width={44} height={44} borderRadius={22} />
        <View style={{ flex: 1, gap: 6 }}>
          <PulseSkeleton width={170} height={20} borderRadius={6} />
          <PulseSkeleton width={210} height={12} borderRadius={4} />
        </View>
        <PulseSkeleton width={44} height={44} borderRadius={22} />
        <PulseSkeleton width={44} height={44} borderRadius={22} />
      </View>

      <View style={styles.hero}>
        <PulseSkeleton width={150} height={12} borderRadius={4} style={styles.onDark} />
        <PulseSkeleton width={200} height={36} borderRadius={8} style={[styles.onDark, { marginTop: 12 }]} />
        <PulseSkeleton width={230} height={12} borderRadius={4} style={[styles.onDark, { marginTop: 10 }]} />
        <PulseSkeleton height={6} borderRadius={3} style={[styles.onDark, { marginTop: 28 }]} />
      </View>
      <View style={styles.list}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.row}>
            <PulseSkeleton width={44} height={48} borderRadius={12} />
            <View style={{ flex: 1, gap: 6 }}>
              <PulseSkeleton width="60%" height={14} borderRadius={4} />
              <PulseSkeleton width="40%" height={11} borderRadius={4} />
            </View>
            <PulseSkeleton width={70} height={14} borderRadius={4} />
          </View>
        ))}
      </View>

      <PulseSkeleton width={160} height={18} borderRadius={6} style={{ marginTop: space.xxl, marginBottom: space.md }} />
      <PulseSkeleton height={220} borderRadius={radius.xl} />
      <PulseSkeleton width={140} height={18} borderRadius={6} style={{ marginTop: space.xxl, marginBottom: space.md }} />
      <PulseSkeleton height={190} borderRadius={radius.xl} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.lg,
  },
  hero: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: "#141c30",
    padding: space.xl,
  },
  onDark: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  list: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm + 2,
  },
});

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, HIT, radius, space, type } from "../../constants/dashboardTheme";
import type { LoanSummary } from "../../hooks/use-dashboard-data";
import { PressableScale } from "./primitives";
import { useMoney } from "./privacy";

interface AttentionBannerProps {
  maturedLoans: LoanSummary[];
  onResolve: () => void;
}

/** Shown only when a bullet / gold loan is past maturity and still open. */
export default function AttentionBanner({ maturedLoans, onResolve }: AttentionBannerProps) {
  const money = useMoney();
  if (maturedLoans.length === 0) return null;

  const single = maturedLoans.length === 1 ? maturedLoans[0] : null;
  const total = maturedLoans.reduce((s, l) => s + l.remainingAmount, 0);
  const title = single
    ? `${single.name} matured ${single.daysOverdue === 1 ? "yesterday" : `${single.daysOverdue} days ago`}`
    : `${maturedLoans.length} bullet loans are past maturity`;
  const body = single
    ? `${money.exact(total)} is due. Interest can keep building up, so renew or close it.`
    : `${maturedLoans.map((l) => l.name).slice(0, 2).join(", ")}${maturedLoans.length > 2 ? "…" : ""} · ${money.exact(total)} due in total.`;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <View style={styles.rule} />
      <Ionicons name="alert-circle" size={22} color={colors.dangerFill} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <PressableScale
        onPress={onResolve}
        style={styles.cta}
        accessibilityLabel={single ? `Resolve ${single.name}` : "Review matured loans"}
      >
        <Text style={styles.ctaText}>{single ? "Resolve" : "Review"}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md + 2,
    paddingLeft: space.lg + 2,
    borderRadius: radius.lg,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    overflow: "hidden",
    marginBottom: space.lg,
  },
  rule: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.dangerFill,
  },
  title: {
    ...type.body,
    fontWeight: "700",
    color: "#9f1239",
  },
  body: {
    ...type.label,
    fontWeight: "500",
    color: "#9f1239",
    marginTop: 2,
  },
  cta: {
    alignSelf: "center",
    minHeight: HIT,
    minWidth: HIT + 20,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerFill,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    ...type.label,
    fontWeight: "700",
    color: colors.textOnAccent,
  },
});

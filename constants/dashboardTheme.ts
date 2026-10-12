// Design tokens for the dashboard. Text colors are chosen to meet WCAG AA
// (4.5:1) on their intended surface; "accent" fills are for icons/bars only.

export const colors = {
  // Surfaces
  page: "#f3f5f9",
  pageGradient: ["#f8fafc", "#f1f5f9", "#eaeef4"] as const,
  surface: "#ffffff",
  surfaceMuted: "#f8fafc",
  surfaceSunken: "#eef2f7",
  border: "rgba(15, 23, 42, 0.07)",
  borderStrong: "rgba(15, 23, 42, 0.12)",
  overlay: "rgba(2, 6, 23, 0.45)",

  // Text on light surfaces
  text: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  textOnAccent: "#ffffff",

  // Brand / semantic (text-safe on white)
  primary: "#047857",
  primaryFill: "#10b981",
  primarySoft: "rgba(16, 185, 129, 0.12)",
  indigo: "#4f46e5",
  indigoSoft: "rgba(79, 70, 229, 0.10)",
  violet: "#6d28d9",
  violetFill: "#7c3aed",
  violetSoft: "rgba(124, 58, 237, 0.10)",
  warning: "#b45309",
  warningFill: "#f59e0b",
  warningSoft: "rgba(245, 158, 11, 0.14)",
  danger: "#be123c",
  dangerFill: "#e11d48",
  dangerSoft: "rgba(225, 29, 72, 0.10)",
  info: "#0369a1",
  infoFill: "#0ea5e9",
  infoSoft: "rgba(14, 165, 233, 0.12)",
  pink: "#be185d",
  pinkFill: "#ec4899",
  pinkSoft: "rgba(236, 72, 153, 0.12)",

  // Dark hero card
  heroGradient: ["#0b1020", "#121a2f", "#172440"] as const,
  heroText: "#ffffff",
  heroTextSecondary: "rgba(255, 255, 255, 0.72)",
  heroTextMuted: "rgba(255, 255, 255, 0.56)",
  heroDivider: "rgba(255, 255, 255, 0.10)",
  heroChip: "rgba(255, 255, 255, 0.08)",
  heroChipBorder: "rgba(255, 255, 255, 0.12)",
  heroAccent: "#34d399",
  heroTrack: "rgba(255, 255, 255, 0.10)",
  heroWarning: "#fbbf24",
} as const;

/** Per-item kind accents used for icons, chips and bars. */
export const kindColors = {
  emi: { fill: colors.indigo, text: colors.indigo, soft: colors.indigoSoft, icon: "card-outline" },
  bullet: { fill: colors.warningFill, text: colors.warning, soft: colors.warningSoft, icon: "flash-outline" },
  insurance: { fill: colors.infoFill, text: colors.info, soft: colors.infoSoft, icon: "shield-checkmark-outline" },
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  gutter: 20,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

const tabular = { fontVariant: ["tabular-nums"] as ("tabular-nums")[] };

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1, ...tabular },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.4 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "700", letterSpacing: -0.2 },
  amount: { fontSize: 17, lineHeight: 22, fontWeight: "800", letterSpacing: -0.3, ...tabular },
  amountSmall: { fontSize: 15, lineHeight: 20, fontWeight: "700", ...tabular },
  body: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
} as const;

export const shadow = {
  card: { boxShadow: "0px 4px 14px rgba(15, 23, 42, 0.06)" },
  raised: { boxShadow: "0px 10px 28px rgba(15, 23, 42, 0.12)" },
  hero: { boxShadow: "0px 16px 36px rgba(11, 16, 32, 0.32)" },
  fab: { boxShadow: "0px 8px 20px rgba(16, 185, 129, 0.35)" },
} as const;

export const motion = {
  fast: 150,
  base: 250,
  slow: 450,
  countUp: 700,
  stagger: 60,
  pressScale: 0.97,
} as const;

/** Minimum touch target (iOS HIG 44pt / Material 48dp). */
export const HIT = 44;

export const dashboardTheme = { colors, kindColors, space, radius, type, shadow, motion, HIT };
export default dashboardTheme;

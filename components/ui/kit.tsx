// Shared building blocks for every screen, using the same tokens as the Home dashboard.
// Screens import from here so the app looks and behaves consistently.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, HIT, radius, shadow, space, type } from "../../constants/dashboardTheme";
import { hapticTap, PressableScale } from "../dashboard/primitives";

export {
  AnimatedAmount,
  Card,
  hapticImpact,
  hapticTap,
  IconBadge,
  Pill,
  PressableScale,
  ProgressBar,
  SectionHeader,
} from "../dashboard/primitives";
export { colors, HIT, kindColors, radius, shadow, space, type } from "../../constants/dashboardTheme";

// ── Screen ──────────────────────────────────────────────────────────────────

/**
 * Space to leave below scrolling content so the last item clears the tab bar
 * (iOS native tabs float over the page) and the home indicator.
 */
export const TAB_BAR_CLEARANCE = 88;

interface ScreenProps {
  children: React.ReactNode;
  /** Pull-to-refresh handler. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Content that should not scroll (e.g. a sticky footer button). */
  footer?: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Page container: canvas background, safe-area top padding, centred 680pt column. */
export function Screen({ children, onRefresh, refreshing = false, footer, scroll = true, contentStyle }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const content = [
    styles.content,
    {
      paddingTop: insets.top + space.sm,
      paddingBottom: footer ? space.xxl : insets.bottom + TAB_BAR_CLEARANCE,
    },
    contentStyle,
  ];
  return (
    <View style={styles.screen}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryFill} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[content, { flex: 1 }]}>{children}</View>
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>{footer}</View>
      ) : null}
    </View>
  );
}

// ── ScreenHeader ────────────────────────────────────────────────────────────

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Show a back button (stack screens). */
  back?: boolean;
  onBack?: () => void;
  /** Right-side actions, e.g. <HeaderAction icon="add" … />. */
  actions?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, back, onBack, actions }: ScreenHeaderProps) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      {back || actions ? (
        <View style={styles.headerBar}>
          {back ? (
            <HeaderAction
              icon="chevron-back"
              label="Go back"
              onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/" as any)))}
            />
          ) : (
            <View />
          )}
          <View style={styles.headerActions}>{actions}</View>
        </View>
      ) : null}
      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

interface HeaderActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: "plain" | "primary";
}

/** Round 44pt header button. "primary" is the emerald add button. */
export function HeaderAction({ icon, label, onPress, variant = "plain" }: HeaderActionProps) {
  const primary = variant === "primary";
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.headerBtn, primary && styles.headerBtnPrimary]}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={primary ? 24 : 21} color={primary ? colors.textOnAccent : colors.text} />
    </PressableScale>
  );
}

// ── Stat tiles ──────────────────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: string;
  caption?: string;
  tone?: "default" | "positive" | "warning" | "critical";
  style?: StyleProp<ViewStyle>;
}

/** Small label + value block; place 2-3 in a <StatRow>. */
export function StatTile({ label, value, caption, tone = "default", style }: StatTileProps) {
  const color =
    tone === "positive" ? colors.primary : tone === "warning" ? colors.warning : tone === "critical" ? colors.danger : colors.text;
  return (
    <View style={[styles.stat, style]} accessible accessibilityLabel={`${label}: ${value}${caption ? `, ${caption}` : ""}`}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
      {caption ? (
        <Text style={styles.statCaption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export function StatRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.statRow, style]}>{children}</View>;
}

// ── List rows ───────────────────────────────────────────────────────────────

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading element, usually an <IconBadge>. */
  leading?: React.ReactNode;
  /** Right-aligned value, e.g. an amount. */
  value?: string;
  valueCaption?: string;
  valueColor?: string;
  /** Extra content under the text (chips, progress bar). */
  children?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  divider?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function ListRow({
  title,
  subtitle,
  leading,
  value,
  valueCaption,
  valueColor,
  children,
  onPress,
  chevron = !!onPress,
  divider = false,
  accessibilityLabel,
  accessibilityHint,
}: ListRowProps) {
  const body = (
    <>
      <View style={styles.rowTop}>
        {leading}
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value !== undefined ? (
          <View style={styles.rowValueWrap}>
            <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
              {value}
            </Text>
            {valueCaption ? <Text style={styles.rowValueCaption}>{valueCaption}</Text> : null}
          </View>
        ) : null}
        {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
      </View>
      {children ? <View style={leading ? styles.rowChildrenIndented : null}>{children}</View> : null}
    </>
  );
  const rowStyle = [styles.row, divider && styles.rowDivider];
  const label = accessibilityLabel ?? [title, subtitle, value, valueCaption].filter(Boolean).join(", ");
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={rowStyle} accessibilityLabel={label} accessibilityHint={accessibilityHint}>
        {body}
      </PressableScale>
    );
  }
  return (
    <View style={rowStyle} accessible accessibilityLabel={label}>
      {body}
    </View>
  );
}

// ── Segmented control ───────────────────────────────────────────────────────

interface SegmentedProps<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function Segmented<T extends string>({ options, value, onChange, style }: SegmentedProps<T>) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <PressableScale
            key={o.key}
            onPress={() => {
              if (!active) {
                hapticTap();
                onChange(o.key);
              }
            }}
            haptic={false}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── Selectable chip ─────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function Chip({ label, selected, onPress, icon }: ChipProps) {
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? colors.textOnAccent : colors.textSecondary} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

// ── Form field ──────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  prefix,
  suffix,
  keyboardType,
  multiline,
  autoFocus,
  editable = true,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrap, !!error && styles.inputWrapError, !editable && styles.inputWrapDisabled]}>
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          multiline={multiline}
          autoFocus={autoFocus}
          editable={editable}
          accessibilityLabel={label}
          accessibilityHint={hint}
        />
        {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
      </View>
      {error ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = "primary", icon, loading, disabled, style }: ButtonProps) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.textOnAccent, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
    danger: { bg: colors.surface, fg: colors.danger, border: "#fecdd3" },
    ghost: { bg: "transparent", fg: colors.indigo, border: "transparent" },
  }[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (disabled || loading) && styles.buttonDisabled,
        style,
      ]}
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={palette.fg} />
      ) : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </PressableScale>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.indigo} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} icon="add" style={{ marginTop: space.sm, alignSelf: "center" }} />
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function Gap({ size = space.xxl }: { size?: number }) {
  return <View style={{ height: size }} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl + space.lg,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  header: {
    marginBottom: space.xl,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  headerBtn: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnPrimary: {
    backgroundColor: "#059669",
    borderColor: "#059669",
    ...shadow.fab,
  },
  title: {
    ...type.title,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
  },
  subtitle: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: space.xs,
  },
  statRow: {
    flexDirection: "row",
    gap: space.md,
  },
  stat: {
    flex: 1,
    minWidth: 0,
  },
  statLabel: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
  },
  statValue: {
    ...type.amount,
    marginTop: 2,
  },
  statCaption: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: 1,
  },
  row: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    minHeight: 60,
    justifyContent: "center",
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...type.body,
    fontWeight: "700",
    color: colors.text,
  },
  rowSubtitle: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 2,
  },
  rowValueWrap: {
    alignItems: "flex-end",
    maxWidth: "45%",
  },
  rowValue: {
    ...type.amountSmall,
    color: colors.text,
  },
  rowValueCaption: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 1,
  },
  rowChildrenIndented: {
    paddingLeft: 52,
    marginTop: space.sm + 2,
  },
  segmented: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  segmentText: {
    ...type.label,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: "700",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipText: {
    ...type.label,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.textOnAccent,
  },
  field: {
    marginBottom: space.lg,
  },
  fieldLabel: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.xs + 2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: space.sm,
  },
  inputWrapError: {
    borderColor: colors.dangerFill,
  },
  inputWrapDisabled: {
    backgroundColor: colors.surfaceSunken,
  },
  input: {
    flex: 1,
    ...type.body,
    color: colors.text,
    paddingVertical: space.md,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  affix: {
    ...type.body,
    fontWeight: "600",
    color: colors.textMuted,
  },
  fieldHint: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: space.xs,
  },
  fieldError: {
    ...type.caption,
    color: colors.danger,
    marginTop: space.xs,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...type.body,
    fontWeight: "700",
  },
  empty: {
    alignItems: "center",
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.indigoSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  emptyTitle: {
    ...type.headline,
    color: colors.text,
    textAlign: "center",
  },
  emptyMessage: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 300,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
  },
});

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, HIT, radius, shadow, space, type } from "../../constants/dashboardTheme";
import { hapticImpact, PressableScale } from "./primitives";

interface QuickAddSheetProps {
  visible: boolean;
  onClose: () => void;
}

const OPTIONS = [
  {
    key: "loan",
    title: "Add a loan",
    subtitle: "EMI loan or bullet / gold loan",
    icon: "wallet-outline",
    gradient: ["#10b981", "#059669"],
    route: "/add-loan",
  },
  {
    key: "insurance",
    title: "Add an insurance policy",
    subtitle: "Life, health, term, vehicle or property",
    icon: "shield-checkmark-outline",
    gradient: ["#0ea5e9", "#0284c7"],
    route: "/add-insurance",
  },
  {
    key: "transaction",
    title: "Add expense or income",
    subtitle: "Daily spending, repayment or credit",
    icon: "receipt-outline",
    gradient: ["#8b5cf6", "#6d28d9"],
    route: "/add-transaction",
  },
] as const;

export default function QuickAddSheet({ visible, onClose }: QuickAddSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const go = (route: string) => {
    hapticImpact();
    onClose();
    router.push(route as any);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close quick add"
        />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(180)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.lg }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} accessibilityRole="header">
                Quick add
              </Text>
              <Text style={styles.subtitle}>What would you like to record?</Text>
            </View>
            <PressableScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close" haptic={false}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </PressableScale>
          </View>

          <View style={styles.options}>
            {OPTIONS.map((o) => (
              <PressableScale
                key={o.key}
                onPress={() => go(o.route)}
                style={styles.option}
                accessibilityLabel={o.title}
                accessibilityHint={o.subtitle}
                haptic={false}
              >
                <LinearGradient colors={o.gradient} style={styles.optionIcon}>
                  <Ionicons name={o.icon} size={22} color={colors.textOnAccent} />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{o.title}</Text>
                  <Text style={styles.optionSub}>{o.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </PressableScale>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    ...shadow.raised,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
    marginBottom: space.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space.xl,
  },
  title: {
    ...type.title,
    color: colors.text,
  },
  subtitle: {
    ...type.label,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  options: {
    gap: space.md,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md + 2,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
  },
  optionIcon: {
    width: HIT,
    height: HIT,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: {
    ...type.body,
    fontWeight: "700",
    color: colors.text,
  },
  optionSub: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 2,
  },
});

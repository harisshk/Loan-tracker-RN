import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { usePathname, useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useEffect, useMemo } from 'react';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  SlideInLeft,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, HIT, radius, space, type } from '../constants/dashboardTheme';
import { PressableScale } from './dashboard/primitives';

type IconName = keyof typeof Ionicons.glyphMap;

interface DrawerItem {
  label: string;
  icon: IconName;
  activeIcon?: IconName;
  route: string;
  color?: string;
}

// Tab routes live in the (tabs) group, so their URLs have no group prefix.
const NAV_ITEMS: DrawerItem[] = [
  { label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/' },
  { label: 'Loans', icon: 'wallet-outline', activeIcon: 'wallet', route: '/loans' },
  { label: 'Insurance', icon: 'shield-checkmark-outline', activeIcon: 'shield-checkmark', route: '/insurances' },
  { label: 'Spends', icon: 'card-outline', activeIcon: 'card', route: '/spend-tracker' },
  { label: 'EMI analytics', icon: 'analytics-outline', activeIcon: 'analytics', route: '/analytics' },
  { label: 'Payment calendar', icon: 'calendar-outline', activeIcon: 'calendar', route: '/calendar' },
  { label: 'AI Advisor', icon: 'sparkles-outline', activeIcon: 'sparkles', route: '/ai-advisor' },
  { label: 'More & settings', icon: 'grid-outline', activeIcon: 'grid', route: '/settings' },
];

const TOOL_ITEMS: DrawerItem[] = [
  { label: 'Repayment roadmap', icon: 'map-outline', route: '/roadmap', color: colors.pinkFill },
  { label: 'Debt-free calculator', icon: 'flag-outline', route: '/debt-free', color: colors.infoFill },
  { label: 'Financial plan', icon: 'trending-up-outline', route: '/financial-plan', color: colors.primaryFill },
  { label: 'Compare loans', icon: 'git-compare-outline', route: '/compare-loans', color: colors.violetFill },
  { label: 'Maturity alerts', icon: 'timer-outline', route: '/maturity-alerts', color: colors.warningFill },
  { label: 'Backup & restore', icon: 'cloud-upload-outline', route: '/sync', color: colors.heroTextSecondary },
];

const appVersion = Constants.expoConfig?.version;

interface SidePanelDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SidePanelDrawer({ isOpen, onClose }: SidePanelDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.82, 320);

  // Swipe left on the drawer to close it; it follows the finger.
  const dragX = useSharedValue(0);
  useEffect(() => {
    if (isOpen) dragX.set(0);
  }, [isOpen, dragX]);
  const closeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(-10)
        .failOffsetY([-16, 16])
        .onUpdate((e) => {
          dragX.set(Math.min(0, e.translationX));
        })
        .onEnd((e) => {
          if (e.translationX < -drawerWidth * 0.3 || e.velocityX < -600) {
            dragX.set(
              withTiming(-drawerWidth, { duration: 160 }, () => {
                scheduleOnRN(onClose);
              }),
            );
          } else {
            dragX.set(withTiming(0, { duration: 160 }));
          }
        }),
    [drawerWidth, onClose, dragX],
  );
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: 1 + dragX.get() / drawerWidth }));

  const navigateTo = (route: string) => {
    onClose();
    if (route === pathname) return;
    setTimeout(() => {
      router.push(route as any);
    }, 100);
  };

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={styles.backdrop}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        </Animated.View>

        <GestureDetector gesture={closeGesture}>
          <Animated.View style={[styles.dragLayer, dragStyle]}>

        <Animated.View
          entering={SlideInLeft.duration(240)}
          style={[styles.drawer, { width: drawerWidth, paddingTop: Math.max(insets.top, space.lg) }]}
          accessibilityViewIsModal
        >
          {/* Brand */}
          <View style={styles.header}>
            <View style={styles.logo} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Ionicons name="layers" size={20} color={colors.textOnAccent} />
            </View>
            <View style={styles.brandText}>
              <Text style={styles.appName} accessibilityRole="header">
                Velo Flow
              </Text>
              <Text style={styles.appSub}>Loans · Insurance · Spends</Text>
            </View>
            <PressableScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close menu">
              <Ionicons name="close" size={20} color={colors.heroTextSecondary} />
            </PressableScale>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionHeader} accessibilityRole="header">
              Navigate
            </Text>
            {NAV_ITEMS.map((item) => (
              <DrawerRow key={item.route} item={item} active={pathname === item.route} onPress={() => navigateTo(item.route)} />
            ))}

            <View style={styles.sectionDivider} />

            <Text style={styles.sectionHeader} accessibilityRole="header">
              Quick add
            </Text>
            <View style={styles.quickAddRow}>
              <PressableScale
                style={styles.quickAddBtn}
                onPress={() => navigateTo('/add-loan')}
                accessibilityLabel="Add a new loan"
              >
                <Ionicons name="add" size={18} color={colors.heroAccent} />
                <Text style={styles.quickAddText}>New loan</Text>
              </PressableScale>
              <PressableScale
                style={styles.quickAddBtn}
                onPress={() => navigateTo('/add-insurance')}
                accessibilityLabel="Add a new insurance policy"
              >
                <Ionicons name="add" size={18} color={colors.heroAccent} />
                <Text style={styles.quickAddText}>New insurance</Text>
              </PressableScale>
            </View>

            <View style={styles.sectionDivider} />

            <Text style={styles.sectionHeader} accessibilityRole="header">
              Tools
            </Text>
            {TOOL_ITEMS.map((item) => (
              <DrawerRow key={item.route} item={item} active={pathname === item.route} onPress={() => navigateTo(item.route)} />
            ))}
          </ScrollView>

          {appVersion ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
              <Text style={styles.footerText}>Version {appVersion}</Text>
            </View>
          ) : null}
        </Animated.View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function DrawerRow({ item, active, onPress }: { item: DrawerItem; active: boolean; onPress: () => void }) {
  const iconColor = active ? colors.heroAccent : item.color ?? colors.heroTextSecondary;
  return (
    <PressableScale
      style={[styles.row, active && styles.rowActive]}
      onPress={onPress}
      accessibilityLabel={item.label}
      accessibilityHint={active ? 'Current screen' : undefined}
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.rowIcon, active && styles.rowIconActive]}>
        <Ionicons name={active && item.activeIcon ? item.activeIcon : item.icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, active && styles.rowLabelActive]} numberOfLines={1}>
        {item.label}
      </Text>
      {active ? <View style={styles.activeDot} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  dragLayer: {
    height: '100%',
  },
  drawer: {
    height: '100%',
    paddingHorizontal: space.md,
    backgroundColor: colors.heroGradient[0],
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    boxShadow: '4px 0px 24px rgba(2, 6, 23, 0.4)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xs,
    paddingBottom: space.lg,
    marginBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.heroDivider,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  appName: {
    ...type.headline,
    color: colors.heroText,
  },
  appSub: {
    ...type.caption,
    fontWeight: '500',
    color: colors.heroTextMuted,
    marginTop: 1,
  },
  closeBtn: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    backgroundColor: colors.heroChip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  sectionHeader: {
    ...type.overline,
    color: colors.heroTextMuted,
    marginBottom: space.sm,
    marginLeft: space.sm,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.heroDivider,
    marginVertical: space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: HIT + 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  rowActive: {
    backgroundColor: colors.heroChip,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.heroChip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconActive: {
    backgroundColor: 'rgba(52, 211, 153, 0.16)',
  },
  rowLabel: {
    ...type.body,
    flex: 1,
    color: colors.heroTextSecondary,
  },
  rowLabelActive: {
    color: colors.heroText,
    fontWeight: '700',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.heroAccent,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  quickAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: HIT,
    borderRadius: radius.md,
    backgroundColor: colors.heroChip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.heroChipBorder,
  },
  quickAddText: {
    ...type.label,
    color: colors.heroText,
  },
  footer: {
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.heroDivider,
    alignItems: 'center',
  },
  footerText: {
    ...type.caption,
    fontWeight: '500',
    color: colors.heroTextMuted,
  },
});

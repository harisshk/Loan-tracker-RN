import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(width * 0.82, 320);

interface SidePanelDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SidePanelDrawer({ isOpen, onClose }: SidePanelDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const navigateTo = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as any);
    }, 100);
  };

  const navItems = [
    { label: 'Loans', icon: 'wallet-outline', activeIcon: 'wallet', route: '/loans', badge: 'All' },
    { label: 'Insurances', icon: 'shield-checkmark-outline', activeIcon: 'shield-checkmark', route: '/insurances' },
    { label: 'Settings', icon: 'settings-outline', activeIcon: 'settings', route: '/(tabs)/settings' },
    { label: 'Spend Tracker', icon: 'card-outline', activeIcon: 'card', route: '/spend-tracker' },
    { label: 'EMI Analytics', icon: 'analytics-outline', activeIcon: 'analytics', route: '/analytics' },
    { label: 'Payment Calendar', icon: 'calendar-outline', activeIcon: 'calendar', route: '/calendar' },
    { label: 'AI Advisor', icon: 'sparkles-outline', activeIcon: 'sparkles', route: '/ai-advisor' },
  ];

  const toolItems = [
    { label: 'Repayment Roadmap', icon: 'map-outline', route: '/roadmap', color: '#ec4899' },
    { label: 'Debt-Free Calculator', icon: 'flag-outline', route: '/debt-free', color: '#38bdf8' },
    { label: 'Financial Plan', icon: 'trending-up', route: '/financial-plan', color: '#10b981' },
    { label: 'Loan Comparison', icon: 'git-compare-outline', route: '/compare-loans', color: '#a78bfa' },
    { label: 'Maturity Alerts', icon: 'timer-outline', route: '/maturity-alerts', color: '#f59e0b' },
    { label: 'Backup & Restore', icon: 'cloud-upload-outline', route: '/sync', color: '#6366f1' },
  ];

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Backdrop Tap Handler */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        {/* Drawer Body */}
        <LinearGradient colors={['#0f172a', '#1e293b']} style={[styles.drawer, { paddingTop: Math.max(insets.top, 16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Ionicons name="layers" size={20} color="#fff" />
              </View>
              <View>
                <Text style={styles.appName}>Velo Flow</Text>
                <Text style={styles.appSub}>Loan Glass • Elite Edition</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Primary Navigation */}
            <Text style={styles.sectionHeader}>NAVIGATION</Text>
            {navItems.map((item) => {
              const isActive = pathname === item.route || (item.route === '/loans' && pathname === '/loans');
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.navBtn, isActive && styles.navBtnActive]}
                  onPress={() => navigateTo(item.route)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={(isActive ? item.activeIcon : item.icon) as any}
                    size={20}
                    color={isActive ? '#10b981' : '#94a3b8'}
                    style={{ marginRight: 12 }}
                  />
                  <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
                  {item.badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  )}
                  {isActive && <View style={styles.activeDot} />}
                </TouchableOpacity>
              );
            })}

            <View style={styles.sectionDivider} />

            {/* Quick Actions / Shortcuts */}
            <Text style={styles.sectionHeader}>QUICK ACTIONS</Text>
            <View style={styles.quickAddRow}>
              <TouchableOpacity
                style={styles.quickAddBtn}
                onPress={() => navigateTo('/add-loan')}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle" size={18} color="#10b981" />
                <Text style={styles.quickAddText}>New Loan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickAddBtn}
                onPress={() => navigateTo('/add-insurance')}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle" size={18} color="#ec4899" />
                <Text style={styles.quickAddText}>New Insurance</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionDivider} />

            {/* Smart Financial Tools */}
            <Text style={styles.sectionHeader}>SMART TOOLS</Text>
            {toolItems.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={styles.toolBtn}
                onPress={() => navigateTo(item.route)}
                activeOpacity={0.8}
              >
                <View style={[styles.toolIconWrap, { backgroundColor: item.color + '20' }]}>
                  <Ionicons name={item.icon as any} size={16} color={item.color} />
                </View>
                <Text style={styles.toolLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={14} color="#64748b" />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.footerText}>Velo Flow • Smart Finance & Debt Manager</Text>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  appSub: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 14,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 4,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  navBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  navLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  navLabelActive: {
    color: '#10b981',
    fontWeight: '700',
  },
  badge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#818cf8',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 10,
  },
  quickAddText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f8fafc',
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  toolIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toolLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
});

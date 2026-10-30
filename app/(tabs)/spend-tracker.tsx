import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PulseSkeleton } from '../../components/ui/skeleton';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
  runOnJS,
  FadeInDown,
  FadeOutDown,
  type SharedValue,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getTransactions,
  deleteTransaction,
  deleteAllTransactions,
  getBudgetLimit,
  saveBudgetLimit,
  syncWithSupabase,
  syncEmiTransactions,
} from '../../utils/transactions';
import { syncGmailTransactions } from '../../utils/gmail';
import { getLoans } from '../../utils/storage';
import { CATEGORY_ICONS, getCategoryIcon } from '../../constants/categories';
import SidePanelDrawer from '../../components/SidePanelDrawer';
import EdgeSwipeOpener from '../../components/ui/EdgeSwipe';
import {
  Button,
  Card,
  Chip,
  colors,
  Divider,
  EmptyState,
  Field,
  HeaderAction,
  HIT,
  IconBadge,
  ListRow,
  Pill,
  PressableScale,
  ProgressBar,
  radius,
  ScreenHeader,
  SectionHeader,
  Segmented,
  shadow,
  space,
  StatRow,
  StatTile,
  type,
  TAB_BAR_CLEARANCE,
} from '../../components/ui/kit';
import { daysFromToday, formatINR, formatINRCompact, formatPercent } from '../../utils/format';

const { width } = Dimensions.get('window');

// Drag at least this far (px) to trigger an automatic delete on release-less full swipe.
const FULL_SWIPE_THRESHOLD = width * 0.55;

// How long the user can tap "Undo" before a delete is actually committed to the DB.
const UNDO_WINDOW = 4000;

type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'date-desc', label: 'Newest' },
  { id: 'date-asc', label: 'Oldest' },
  { id: 'amount-desc', label: 'Highest amount' },
  { id: 'amount-asc', label: 'Lowest amount' },
];

const TYPE_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'debit', label: 'Spent' },
  { key: 'credit', label: 'Received' },
];

const GRANULARITY_OPTIONS: { key: 'daily' | 'weekly' | 'monthly'; label: string }[] = [
  { key: 'daily', label: 'Days' },
  { key: 'weekly', label: 'Weeks' },
  { key: 'monthly', label: 'Months' },
];

const isCreditTx = (t: any) => (t?.type || '').toLowerCase() === 'credit';

/** Soft tint of a category colour (category colours are 6-digit hex). */
const tint = (hex: string, alpha = '1F') => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : colors.surfaceSunken);

/** Very short rupee label for chart bars: ₹950, ₹12.4k, ₹1.2L. */
const shortINR = (n: number) => {
  if (n >= 1e5) return formatINRCompact(n);
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`;
  return formatINR(n);
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const dayTitle = (d: Date) => {
  const rel = daysFromToday(d);
  if (rel === 0) return 'Today';
  if (rel === -1) return 'Yesterday';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
};

const timeLabel = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0
    ? ''
    : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// Right-side swipe action: a Delete button that grows as you swipe, and
// auto-deletes once the card is dragged past FULL_SWIPE_THRESHOLD.
function SwipeRightAction({
  drag,
  onDelete,
}: {
  drag: SharedValue<number>;
  onDelete: () => void;
}) {
  const fired = useSharedValue(false);

  useAnimatedReaction(
    () => drag.value,
    (cur) => {
      // drag is negative when swiping left.
      if (-cur >= FULL_SWIPE_THRESHOLD && !fired.value) {
        fired.value = true;
        runOnJS(onDelete)();
      } else if (-cur < FULL_SWIPE_THRESHOLD) {
        fired.value = false;
      }
    }
  );

  const animStyle = useAnimatedStyle(() => ({
    width: Math.max(88, -drag.value),
  }));

  return (
    <Animated.View style={[styles.swipeDeleteAction, animStyle]}>
      <PressableScale onPress={onDelete} style={styles.swipeDeleteBtn} accessibilityLabel="Delete transaction">
        <Ionicons name="trash-outline" size={20} color={colors.textOnAccent} />
        <Text style={styles.swipeDeleteText}>Delete</Text>
      </PressableScale>
    </Animated.View>
  );
}

// One transaction inside a day card. Tap edits, long-press or swipe left deletes.
function TxRow({
  item,
  divider,
  showDate,
  onOpen,
  onDelete,
}: {
  item: any;
  divider: boolean;
  showDate: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const cat = getCategoryIcon(item.category);
  const credit = isCreditTx(item);
  const d = item.date ? new Date(item.date) : undefined;
  const validDate = d && !isNaN(d.getTime()) ? d : null;
  const title = item.description || item.category || 'Transaction';

  const meta: string[] = [];
  if (item.description && item.category) meta.push(item.category);
  if (item.mode) meta.push(item.mode);
  if (validDate) {
    const t = timeLabel(validDate);
    const when = showDate
      ? validDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + (t ? `, ${t}` : '')
      : t;
    if (when) meta.push(when);
  }
  if (item.source === 'shortcut') meta.push('Automated');
  if (item.source === 'emi-auto') meta.push('Auto EMI');
  if (item.calculate_budget === false) meta.push('Not in budget');

  const amountText = `${credit ? '+' : ''}${formatINR(item.amount)}`;
  const syncLabel = item.synced ? 'Synced' : 'Not synced';

  return (
    <ReanimatedSwipeable
      friction={1.5}
      rightThreshold={40}
      containerStyle={divider ? styles.txDivider : undefined}
      renderRightActions={(_progress, translation) => (
        <SwipeRightAction drag={translation} onDelete={onDelete} />
      )}
    >
      <PressableScale
        onPress={onOpen}
        onLongPress={onDelete}
        style={styles.txRow}
        accessibilityLabel={`${title}, ${credit ? 'received' : 'spent'} ${formatINR(item.amount)}, ${meta.join(', ')}, ${syncLabel}`}
        accessibilityHint="Opens the transaction to edit. Long press or swipe left to delete."
      >
        <IconBadge name={cat.name as any} color={cat.color} backgroundColor={tint(cat.color)} />
        <View style={styles.txText}>
          <Text style={styles.txTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.txMetaRow}>
            <Text style={styles.txMeta} numberOfLines={1}>
              {meta.join(' · ')}
            </Text>
            <Ionicons
              name={item.synced ? 'cloud-done-outline' : 'cloud-offline-outline'}
              size={12}
              color={item.synced ? colors.textMuted : colors.warning}
            />
          </View>
        </View>
        <Text style={[styles.txAmount, credit && { color: colors.primary }]} numberOfLines={1}>
          {amountText}
        </Text>
      </PressableScale>
    </ReanimatedSwipeable>
  );
}

// Simple vertical bars for the spend trend (replaces the old chart-kit BarChart).
function TrendBars({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <View style={styles.bars}>
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return (
          <View
            key={`${labels[i]}-${i}`}
            style={styles.barCol}
            accessible
            accessibilityLabel={`${labels[i]}: ${formatINR(v)}`}
          >
            <Text style={styles.barValue} numberOfLines={1}>
              {v > 0 ? shortINR(v) : ''}
            </Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { height: `${v > 0 ? Math.max(4, (v / max) * 100) : 0}%` },
                  last && { backgroundColor: colors.indigo },
                ]}
              />
            </View>
            <Text style={[styles.barLabel, last && { color: colors.text }]} numberOfLines={1}>
              {labels[i]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function SpendSkeleton({ topInset }: { topInset: number }) {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset + space.sm }]}>
        <View style={styles.skelHeaderBar}>
          <View />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <PulseSkeleton width={HIT} height={HIT} borderRadius={HIT / 2} />
            <PulseSkeleton width={HIT} height={HIT} borderRadius={HIT / 2} />
            <PulseSkeleton width={HIT} height={HIT} borderRadius={HIT / 2} />
          </View>
        </View>
        <PulseSkeleton width={120} height={30} borderRadius={8} style={{ marginBottom: space.xs }} />
        <PulseSkeleton width={180} height={14} borderRadius={4} style={{ marginBottom: space.xl }} />
        <PulseSkeleton height={52} borderRadius={radius.lg} style={{ marginBottom: space.lg }} />
        <Card>
          <PulseSkeleton width={110} height={14} borderRadius={4} style={{ marginBottom: space.md }} />
          <PulseSkeleton width={200} height={24} borderRadius={6} style={{ marginBottom: space.md }} />
          <PulseSkeleton height={8} borderRadius={4} style={{ marginBottom: space.md }} />
          <PulseSkeleton width={180} height={12} borderRadius={4} />
        </Card>
        <View style={{ height: space.xxl }} />
        <PulseSkeleton width={120} height={18} borderRadius={4} style={{ marginBottom: space.md }} />
        <Card padded={false}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.skelRow, i > 0 && styles.txDivider]}>
              <PulseSkeleton width={40} height={40} borderRadius={13} />
              <View style={{ flex: 1, gap: 6 }}>
                <PulseSkeleton width={130} height={14} borderRadius={4} />
                <PulseSkeleton width={90} height={10} borderRadius={3} />
              </View>
              <PulseSkeleton width={64} height={16} borderRadius={4} />
            </View>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

export default function SpendTracker() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [budgetLimit, setBudgetLimit] = useState(50000);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [limitInput, setLimitInput] = useState('50000');
  const [limitError, setLimitError] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; msg: string; undoId?: any }>({ visible: false, msg: '' });
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Deletes are held here during the undo window, then committed to the DB.
  const pendingDeletes = React.useRef<Map<any, { item: any; timer: ReturnType<typeof setTimeout> }>>(new Map());

  const showToast = (msg: string, undoId?: any) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, msg, undoId });
    toastTimer.current = setTimeout(
      () => setToast({ visible: false, msg: '', undoId: undefined }),
      undoId != null ? UNDO_WINDOW : 2200
    );
  };

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // Flush any deletes still waiting in their undo window so they aren't lost.
    pendingDeletes.current.forEach(({ timer }, id) => {
      clearTimeout(timer);
      deleteTransaction(id).catch(() => {});
    });
    pendingDeletes.current.clear();
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, credit, debit
  const [filterCategory, setFilterCategory] = useState('all');
  const [, setLoansCount] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('date-desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(true);
  const [trendGranularity, setTrendGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const trendChartData = useMemo(() => {
    const debitTxs = transactions.filter((t: any) => {
      const isCredit = (t.type || '').toLowerCase() === 'credit';
      return !isCredit && t.category !== 'Credit Card Bill' && t.calculate_budget !== false;
    });

    const now = new Date();

    if (trendGranularity === 'daily') {
      const labels: string[] = [];
      const values: number[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

        const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        labels.push(label);

        const total = debitTxs.reduce((sum, t) => {
          const txDate = t.date ? new Date(t.date) : undefined;
          if (txDate && txDate >= dayStart && txDate <= dayEnd) {
            return sum + (parseFloat(t.amount) || 0);
          }
          return sum;
        }, 0);

        values.push(total);
      }

      return { labels, values, title: 'Last 7 days' };
    } else if (trendGranularity === 'weekly') {
      const labels: string[] = [];
      const values: number[] = [];

      for (let i = 3; i >= 0; i--) {
        const wEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7, 23, 59, 59, 999);
        const wStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i + 1) * 7 + 1, 0, 0, 0);

        labels.push(`W${4 - i}`);

        const total = debitTxs.reduce((sum, t) => {
          const txDate = t.date ? new Date(t.date) : undefined;
          if (txDate && txDate >= wStart && txDate <= wEnd) {
            return sum + (parseFloat(t.amount) || 0);
          }
          return sum;
        }, 0);

        values.push(total);
      }

      return { labels, values, title: 'Last 4 weeks' };
    } else {
      const labels: string[] = [];
      const values: number[] = [];

      for (let i = 5; i >= 0; i--) {
        const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStart = new Date(mDate.getFullYear(), mDate.getMonth(), 1, 0, 0, 0);
        const mEnd = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0, 23, 59, 59, 999);

        const label = mDate.toLocaleDateString('en-IN', { month: 'short' });
        labels.push(label);

        const total = debitTxs.reduce((sum, t) => {
          const txDate = t.date ? new Date(t.date) : undefined;
          if (txDate && txDate >= mStart && txDate <= mEnd) {
            return sum + (parseFloat(t.amount) || 0);
          }
          return sum;
        }, 0);

        values.push(total);
      }

      return { labels, values, title: 'Last 6 months' };
    }
  }, [transactions, trendGranularity]);
  // Defaults strictly to the current calendar month: from the 1st of the month to the last day of the month.
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  });
  const [picker, setPicker] = useState<null | 'start' | 'end'>(null);
  const [rangeOpen, setRangeOpen] = useState(false);

  const addMonths = (d: Date, n: number) => {
    const r = new Date(d);
    r.setMonth(r.getMonth() + n);
    return r;
  };
  const startOfDay = (d: Date) => { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; };
  const endOfDay = (d: Date) => { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; };
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const onPickDate = (selected?: Date) => {
    const which = picker;
    if (!selected || !which) return;

    if (which === 'start') {
      setStartDate(selected);
      // Keep the window within 6 months.
      if (endDate && endDate > addMonths(selected, 6)) {
        setEndDate(addMonths(selected, 6));
        Alert.alert('Range trimmed', 'The date range is limited to 6 months, so the end date was adjusted.');
      }
      if (endDate && endDate < selected) setEndDate(selected);
      // Automatically switch to 'end' date picking for smooth UX
      setPicker('end');
    } else {
      if (startDate && selected < startDate) {
        Alert.alert('Invalid range', 'The end date cannot be before the start date.');
        return;
      }
      if (startDate && selected > addMonths(startDate, 6)) {
        Alert.alert('Range too large', 'Please select a range of 6 months or less.');
        return;
      }
      setEndDate(selected);
      // Auto-close calendar when 'To' date is chosen
      setPicker(null);
    }
  };

  const clearDateRange = () => {
    setStartDate(null);
    setEndDate(null);
    setPicker(null);
  };

  // Month switcher: the period is in "month mode" when it spans exactly one calendar month.
  const isMonthMode =
    !!startDate &&
    !!endDate &&
    startDate.getDate() === 1 &&
    endDate.getFullYear() === startDate.getFullYear() &&
    endDate.getMonth() === startDate.getMonth() &&
    endDate.getDate() === new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();

  const today = new Date();
  const isCurrentMonthSelected =
    isMonthMode &&
    !!startDate &&
    startDate.getFullYear() === today.getFullYear() &&
    startDate.getMonth() === today.getMonth();

  const setMonth = (base: Date) => {
    setStartDate(new Date(base.getFullYear(), base.getMonth(), 1));
    setEndDate(new Date(base.getFullYear(), base.getMonth() + 1, 0));
    setPicker(null);
  };

  const shiftMonth = (n: number) => {
    const base = isMonthMode && startDate ? startDate : endDate ?? new Date();
    setMonth(new Date(base.getFullYear(), base.getMonth() + n, 1));
  };

  const loadData = async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const txs = await getTransactions();
      const limit = await getBudgetLimit();
      const loans = await getLoans();
      setLoansCount(loans.filter((l: any) => l.status !== 'closed').length);

      // Sort by date descending, excluding any rows mid-undo so they don't flash back.
      const sortedTxs = [...txs]
        .filter((t: any) => !pendingDeletes.current.has(t.id))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(sortedTxs as any);
      setBudgetLimit(limit);
      setLimitInput(String(limit));
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await syncEmiTransactions();
      await loadData(false);
    } finally {
      setRefreshing(false);
    }
  };
  const hasLoadedOnce = React.useRef(false);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        if (!hasLoadedOnce.current) {
          setLoading(true);
        }
        try {
          await syncEmiTransactions();
          if (active) {
            await loadData(false);
            hasLoadedOnce.current = true;
          }
        } catch (e) {
          console.error('Error on focus spend tracker:', e);
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  const handleSync = async () => {
    setIsSyncing(true);

    // 1. Sync from Gmail if connected (this downloads, parses, and auto-uploads to Supabase)
    let gmailCount = 0;
    try {
      const gRes = await syncGmailTransactions();
      if (gRes.success) {
        gmailCount = gRes.count || 0;
      }
    } catch (err) {
      console.warn('Gmail sync failed during main sync flow:', err);
    }

    // 2. Sync with Supabase (merges both SMS, local, and Gmail imports)
    let result: { success: boolean; count?: number; reason?: string };
    try {
      result = await syncWithSupabase();
    } catch (err: any) {
      result = { success: false, reason: err?.message };
    } finally {
      setIsSyncing(false);
    }

    if (result.success) {
      const addedText = gmailCount > 0 ? ` & imported ${gmailCount} Gmail transaction(s)` : '';
      Alert.alert('Sync Successful', `Successfully synced database${addedText}! Total records: ${result.count}`);
      loadData();
    } else {
      Alert.alert('Sync Failed', result.reason || 'Check your Supabase settings in Settings tab.');
    }
  };

  const handleUpdateLimit = async () => {
    const amt = parseFloat(limitInput);
    if (isNaN(amt) || amt <= 0) {
      setLimitError('Enter an amount greater than zero.');
      return;
    }
    setLimitError('');
    await saveBudgetLimit(amt);
    setBudgetLimit(amt);
    setIsEditingLimit(false);
    loadData();
  };

  const cancelEditLimit = () => {
    setLimitInput(String(budgetLimit));
    setLimitError('');
    setIsEditingLimit(false);
  };

  const insertSorted = (item: any) =>
    setTransactions((prev: any) =>
      [...prev, item].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    );

  // Actually delete from the DB once the undo window elapses.
  const commitDelete = async (id: any) => {
    const entry = pendingDeletes.current.get(id);
    pendingDeletes.current.delete(id);
    if (!entry) return;
    try {
      await deleteTransaction(id);
    } catch (e: any) {
      insertSorted(entry.item); // restore on failure
      Alert.alert('Delete Failed', e?.message || 'Could not delete the transaction.');
    }
  };

  const performDelete = (item: any) => {
    const id = item?.id;
    if (id == null || pendingDeletes.current.has(id)) return;
    // Remove instantly; defer the DB write so the user can undo.
    setTransactions((prev: any) => prev.filter((t: any) => t.id !== id));
    const timer = setTimeout(() => commitDelete(id), UNDO_WINDOW);
    pendingDeletes.current.set(id, { item, timer });
    showToast('Transaction deleted', id);
  };

  const undoDelete = (id: any) => {
    const entry = pendingDeletes.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingDeletes.current.delete(id);
    insertSorted(entry.item);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: false, msg: '', undoId: undefined });
  };

  const handleDelete = (item: any) => performDelete(item);

  const handleDeleteAll = () => {
    if (transactions.length === 0) {
      Alert.alert('Info', 'No transactions to delete.');
      return;
    }
    Alert.alert(
      'Delete All Transactions',
      'Are you absolutely sure you want to delete ALL transactions? This will permanently wipe your transaction history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation Required',
              'This action is irreversible. All transaction records will be wiped from Supabase/AsyncStorage. Proceed?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Wipe Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAllTransactions();
                      showToast('All transactions deleted');
                      loadData();
                    } catch {
                      Alert.alert('Error', 'Failed to delete transactions.');
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  // Filter & Search
  const filteredTransactions = transactions.filter((t: any) => {
    const desc = t.description || '';
    const cat = t.category || '';
    const dateObj = t.date ? new Date(t.date) : undefined;

    const matchesSearch = desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          cat.toLowerCase().includes(searchQuery.toLowerCase());
    const isTxCredit = (t.type || '').toLowerCase() === 'credit';
    const matchesFilter = filterType === 'all' ||
                          (filterType === 'credit' ? isTxCredit : !isTxCredit);
    const matchesCategory = filterCategory === 'all' || cat === filterCategory;

    let matchesRange = true;
    if (startDate && (!dateObj || dateObj < startOfDay(startDate))) matchesRange = false;
    if (endDate && (!dateObj || dateObj > endOfDay(endDate))) matchesRange = false;

    return matchesSearch && matchesFilter && matchesCategory && matchesRange;
  });

  const sortedTransactions = useMemo(() => {
    const list = [...filteredTransactions];
    list.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      const amtA = parseFloat(a.amount || 0);
      const amtB = parseFloat(b.amount || 0);

      switch (sortBy) {
        case 'date-asc':
          return dateA - dateB;
        case 'date-desc':
          return dateB - dateA;
        case 'amount-desc':
          return amtB - amtA;
        case 'amount-asc':
          return amtA - amtB;
        default:
          return dateB - dateA;
      }
    });
    return list;
  }, [filteredTransactions, sortBy]);

  // Date-sorted lists are grouped into one card per day; amount-sorted lists stay one ranked card.
  const groupByDay = sortBy === 'date-desc' || sortBy === 'date-asc';
  const groups = useMemo(() => {
    if (!groupByDay) {
      return sortedTransactions.length
        ? [{ key: 'ranked', title: sortBy === 'amount-desc' ? 'Highest first' : 'Lowest first', spent: 0, items: sortedTransactions }]
        : [];
    }
    const out: { key: string; title: string; spent: number; items: any[] }[] = [];
    const index = new Map<string, number>();
    sortedTransactions.forEach((t: any) => {
      const d = t.date ? new Date(t.date) : undefined;
      const valid = d && !isNaN(d.getTime()) ? d : null;
      const key = valid ? dayKey(valid) : 'no-date';
      let i = index.get(key);
      if (i === undefined) {
        i = out.length;
        index.set(key, i);
        out.push({ key, title: valid ? dayTitle(valid) : 'No date', spent: 0, items: [] });
      }
      out[i].items.push(t);
      if (!isCreditTx(t) && t.category !== 'Credit Card Bill') out[i].spent += parseFloat(t.amount || 0) || 0;
    });
    return out;
  }, [sortedTransactions, groupByDay, sortBy]);

  // Summary card totals reflect the selected date range (not the calendar month),
  // so the numbers up top match the period being viewed. Includes ALL debit spends in Outflow.
  const rangeStats = transactions.reduce(
    (acc: { income: number; expenses: number }, t: any) => {
      const dateObj = t.date ? new Date(t.date) : undefined;
      if (startDate && (!dateObj || dateObj < startOfDay(startDate))) return acc;
      if (endDate && (!dateObj || dateObj > endOfDay(endDate))) return acc;
      const amt = parseFloat(t.amount || 0);
      if ((t.type || '').toLowerCase() === 'credit') acc.income += amt;
      else {
        if (t.category !== 'Credit Card Bill') {
          acc.expenses += amt;
        }
      }
      return acc;
    },
    { income: 0, expenses: 0 }
  );
  const rangeBalance = rangeStats.income - rangeStats.expenses;

  // Monthly Budget Spends ONLY (excludes calculate_budget: false)
  const budgetSpentThisMonth = useMemo(() => {
    let bSpent = 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    transactions.forEach((t: any) => {
      const d = new Date(t.date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        const amt = parseFloat(t.amount || 0);
        if (
          (t.type || '').toLowerCase() !== 'credit' &&
          t.category !== 'Credit Card Bill' &&
          t.calculate_budget !== false
        ) {
          bSpent += amt;
        }
      }
    });
    return bSpent;
  }, [transactions]);

  // Top 6 categories of budgeted spends in the current filter, plus the overall total for percentages.
  const spendPieData = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredTransactions.forEach((t: any) => {
      if ((t.type || '').toLowerCase() === 'credit' || t.category === 'Credit Card Bill' || t.calculate_budget === false) return;
      const cat = t.category || 'Other';
      totals[cat] = (totals[cat] || 0) + (parseFloat(t.amount) || 0);
    });

    const all = Object.entries(totals).filter(([, v]) => v > 0);
    const total = all.reduce((s, [, v]) => s + v, 0);
    const rows = all
      .map(([name, population]) => {
        const iconInfo = getCategoryIcon(name);
        return { name, population, color: iconInfo.color as string, icon: iconInfo.name as string };
      })
      .sort((a, b) => b.population - a.population)
      .slice(0, 6);
    return { rows, total };
  }, [filteredTransactions]);

  const rangeLabel =
    startDate || endDate
      ? `${startDate ? fmtDate(startDate) : 'Start'} – ${endDate ? fmtDate(endDate) : 'Today'}`
      : 'All time';

  const periodTitle =
    isMonthMode && startDate
      ? startDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      : startDate || endDate
        ? 'Custom range'
        : 'All time';
  const periodCaption = isCurrentMonthSelected ? 'This month' : startDate || endDate ? rangeLabel : 'Every transaction';

  const isDefaultRange = useMemo(() => {
    if (!startDate || !endDate) return false;
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return startDate.getDate() === 1 &&
           startDate.getMonth() === now.getMonth() &&
           startDate.getFullYear() === now.getFullYear() &&
           endDate.getDate() === lastDay.getDate() &&
           endDate.getMonth() === now.getMonth() &&
           endDate.getFullYear() === now.getFullYear();
  }, [startDate, endDate]);

  const hasActiveFilters =
    filterType !== 'all' || filterCategory !== 'all' || searchQuery !== '' || !isDefaultRange;

  const clearFilters = () => {
    setFilterType('all');
    setFilterCategory('all');
    setSearchQuery('');
    const d = new Date();
    setStartDate(new Date(d.getFullYear(), d.getMonth(), 1));
    setEndDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  };

  const percentUsed = Math.min(100, (budgetSpentThisMonth / Math.max(1, budgetLimit)) * 100);
  const budgetLeft = budgetLimit - budgetSpentThisMonth;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeftInMonth = daysInMonth - today.getDate() + 1;
  const perDayLeft = Math.max(0, budgetLeft) / Math.max(1, daysLeftInMonth);
  const budgetTone = percentUsed >= 100 ? 'critical' : percentUsed >= 90 ? 'warning' : 'ok';
  const budgetBarColor =
    budgetTone === 'critical' ? colors.dangerFill : budgetTone === 'warning' ? colors.warningFill : colors.pinkFill;
  const currentMonthName = today.toLocaleDateString('en-IN', { month: 'long' });

  const advancedFilterCount = (filterCategory !== 'all' ? 1 : 0) + (sortBy !== 'date-desc' ? 1 : 0);
  const trendTotal = trendChartData.values.reduce((a, b) => a + b, 0);

  const ListHeader = (
    <>
      <ScreenHeader
        title="Spends"
        subtitle={`${formatINR(rangeStats.expenses)} spent · ${periodCaption}`}
        actions={
          <>
            <HeaderAction icon="menu-outline" label="Open menu" onPress={() => setIsDrawerOpen(true)} />
            {isSyncing ? (
              <View style={styles.headerBtnBusy} accessible accessibilityLabel="Syncing">
                <ActivityIndicator size="small" color={colors.primaryFill} />
              </View>
            ) : (
              <HeaderAction icon="sync-outline" label="Sync transactions from Gmail and cloud" onPress={handleSync} />
            )}
            <HeaderAction
              icon="add"
              label="Add transaction"
              variant="primary"
              onPress={() => router.push('/add-transaction')}
            />
          </>
        }
      />

      {loadError ? (
        <View style={styles.notice} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
          <Text style={styles.noticeText}>Couldn&apos;t load your latest transactions.</Text>
          <PressableScale onPress={onRefresh} style={styles.noticeAction} accessibilityLabel="Retry loading">
            <Text style={styles.noticeActionText}>Retry</Text>
          </PressableScale>
        </View>
      ) : undefined}

      {/* Month switcher */}
      <View style={styles.monthBar}>
        <PressableScale onPress={() => shiftMonth(-1)} style={styles.monthArrow} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </PressableScale>
        <PressableScale
          onPress={() => setRangeOpen((v) => !v)}
          style={styles.monthCenter}
          accessibilityLabel={`Period: ${periodTitle}, ${periodCaption}`}
          accessibilityHint="Shows period options and a custom date range"
          accessibilityState={{ expanded: rangeOpen }}
        >
          <Text style={styles.monthTitle} numberOfLines={1}>
            {periodTitle}
          </Text>
          <View style={styles.monthCaptionRow}>
            <Text style={styles.monthCaption} numberOfLines={1}>
              {periodCaption}
            </Text>
            <Ionicons name={rangeOpen ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textMuted} />
          </View>
        </PressableScale>
        <PressableScale
          onPress={() => shiftMonth(1)}
          disabled={isCurrentMonthSelected}
          style={[styles.monthArrow, isCurrentMonthSelected && styles.monthArrowDisabled]}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </PressableScale>
      </View>

      {rangeOpen ? (
        <Card style={styles.rangeCard}>
          <View style={styles.chipWrap}>
            <Chip label="This month" selected={isDefaultRange} onPress={() => setMonth(new Date())} />
            <Chip label="All time" selected={!startDate && !endDate} onPress={clearDateRange} />
          </View>
          <View style={styles.dateRangeRow}>
            <PressableScale
              style={[styles.dateBtn, picker === 'start' && styles.dateBtnActive]}
              onPress={() => setPicker(picker === 'start' ? null : 'start')}
              accessibilityLabel={`From date: ${startDate ? fmtDate(startDate) : 'any'}`}
            >
              <Text style={styles.dateBtnCaption}>From</Text>
              <Text style={[styles.dateBtnValue, !startDate && { color: colors.textMuted }]}>
                {startDate ? fmtDate(startDate) : 'Any'}
              </Text>
            </PressableScale>
            <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            <PressableScale
              style={[styles.dateBtn, picker === 'end' && styles.dateBtnActive]}
              onPress={() => setPicker(picker === 'end' ? null : 'end')}
              accessibilityLabel={`To date: ${endDate ? fmtDate(endDate) : 'any'}`}
            >
              <Text style={styles.dateBtnCaption}>To</Text>
              <Text style={[styles.dateBtnValue, !endDate && { color: colors.textMuted }]}>
                {endDate ? fmtDate(endDate) : 'Any'}
              </Text>
            </PressableScale>
          </View>
          <Text style={styles.hint}>Ranges can be up to 6 months long.</Text>

          {picker && (
            <View style={styles.pickerBox}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>
                  {picker === 'start' ? 'Choose start date' : 'Choose end date'}
                </Text>
                <Button label="Done" variant="ghost" onPress={() => setPicker(null)} style={styles.pickerDone} />
              </View>
              <DateTimePicker
                value={(picker === 'start' ? startDate : endDate) || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                minimumDate={picker === 'end' && startDate ? startDate : undefined}
                onChange={(_, selected) => onPickDate(selected)}
              />
            </View>
          )}
        </Card>
      ) : undefined}

      {/* Summary: budget (always the current month) + totals for the selected period */}
      <Card padded={false}>
        <View style={styles.block}>
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>{currentMonthName} budget</Text>
            {budgetTone !== 'ok' ? (
              <Pill
                label={budgetTone === 'critical' ? 'Over budget' : 'Over 90% used'}
                color={budgetTone === 'critical' ? colors.danger : colors.warning}
                backgroundColor={budgetTone === 'critical' ? colors.dangerSoft : colors.warningSoft}
                icon={budgetTone === 'critical' ? 'alert-circle' : 'warning-outline'}
              />
            ) : undefined}
          </View>

          {isEditingLimit ? (
            <View>
              <Field
                label="Monthly budget"
                value={limitInput}
                onChangeText={(v) => {
                  setLimitInput(v);
                  if (limitError) setLimitError('');
                }}
                prefix="₹"
                keyboardType="numeric"
                autoFocus
                error={limitError || undefined}
                hint="Card bill payments and spends marked “not in budget” don't count."
              />
              <View style={styles.editActions}>
                <Button label="Cancel" variant="secondary" onPress={cancelEditLimit} style={{ flex: 1 }} />
                <Button label="Save" icon="checkmark" onPress={handleUpdateLimit} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.bigLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                <Text style={styles.bigValue}>{formatINR(budgetSpentThisMonth)}</Text>
                <Text style={styles.bigOf}> of {formatINR(budgetLimit)}</Text>
              </Text>
              <ProgressBar
                style={{ marginTop: space.md }}
                segments={[{ value: percentUsed, color: budgetBarColor }]}
                accessibilityLabel={`${formatPercent(percentUsed, 0)} of budget used`}
              />
              <View style={styles.budgetFoot}>
                <Text style={[styles.subLine, budgetLeft < 0 && { color: colors.danger }]}>
                  {budgetLeft >= 0
                    ? `${formatINR(budgetLeft)} left · ${formatINR(perDayLeft)}/day for ${daysLeftInMonth} ${daysLeftInMonth === 1 ? 'day' : 'days'}`
                    : `Over by ${formatINR(-budgetLeft)}`}
                </Text>
                <Text style={styles.percentText}>{formatPercent(percentUsed, 0)} used</Text>
              </View>
              <PressableScale
                onPress={() => setIsEditingLimit(true)}
                style={styles.editLink}
                accessibilityLabel={`Edit monthly budget, currently ${formatINR(budgetLimit)}`}
              >
                <Ionicons name="create-outline" size={15} color={colors.indigo} />
                <Text style={styles.linkText}>Edit budget</Text>
              </PressableScale>
            </>
          )}
        </View>
        <Divider style={{ marginHorizontal: space.lg }} />
        <View style={styles.block}>
          <Text style={[styles.blockTitle, { marginBottom: space.md }]} numberOfLines={1}>
            {isCurrentMonthSelected ? 'This month' : startDate || endDate ? rangeLabel : 'All time'}
          </Text>
          <StatRow>
            <StatTile label="Money in" value={formatINR(rangeStats.income)} tone="positive" />
            <StatTile label="Money out" value={formatINR(rangeStats.expenses)} />
            <StatTile
              label="Net"
              value={`${rangeBalance >= 0 ? '+' : ''}${formatINR(rangeBalance)}`}
              tone={rangeBalance >= 0 ? 'positive' : 'critical'}
            />
          </StatRow>
        </View>
      </Card>

      {/* Category breakdown */}
      {spendPieData.rows.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Where it went" />
          <Card padded={false}>
            {spendPieData.rows.map((row, i) => {
              const pct = spendPieData.total > 0 ? (row.population / spendPieData.total) * 100 : 0;
              const active = filterCategory === row.name;
              return (
                <ListRow
                  key={row.name}
                  divider={i > 0}
                  chevron={false}
                  leading={
                    <IconBadge
                      name={row.icon as any}
                      color={row.color}
                      backgroundColor={tint(row.color)}
                      size={36}
                      iconSize={18}
                    />
                  }
                  title={row.name}
                  subtitle={`${formatPercent(pct, 0)} of spends`}
                  value={formatINR(row.population)}
                  valueCaption={active ? 'Filtered' : undefined}
                  onPress={() => setFilterCategory(active ? 'all' : row.name)}
                  accessibilityHint={active ? 'Shows all categories again' : 'Shows only this category below'}
                >
                  <ProgressBar segments={[{ value: pct, color: row.color }]} height={4} />
                </ListRow>
              );
            })}
          </Card>
        </View>
      ) : undefined}

      {/* Spend trend */}
      <View style={styles.section}>
        <SectionHeader
          title="Spend trend"
          actionLabel={chartExpanded ? 'Hide' : 'Show'}
          onAction={() => setChartExpanded((prev) => !prev)}
        />
        {chartExpanded ? (
          <Card>
            <Segmented options={GRANULARITY_OPTIONS} value={trendGranularity} onChange={setTrendGranularity} />
            <View style={styles.trendHead}>
              <Text style={styles.blockTitle}>{trendChartData.title}</Text>
              <Text style={styles.trendTotal}>{formatINR(trendTotal)}</Text>
            </View>
            {trendTotal > 0 ? (
              <TrendBars labels={trendChartData.labels} values={trendChartData.values} />
            ) : (
              <Text style={styles.emptyInline}>No budgeted spends in this period yet.</Text>
            )}
          </Card>
        ) : undefined}
      </View>

      {/* Search & filters */}
      <View style={styles.section}>
        <SectionHeader title="Transactions" count={sortedTransactions.length} />
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              placeholder="Search description or category"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              accessibilityLabel="Search transactions"
              returnKeyType="search"
            />
            {searchQuery !== '' && (
              <PressableScale onPress={() => setSearchQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </PressableScale>
            )}
          </View>
          <PressableScale
            onPress={() => setFiltersOpen((v) => !v)}
            style={[styles.filterBtn, (filtersOpen || advancedFilterCount > 0) && styles.filterBtnActive]}
            accessibilityLabel={`Category and sorting${advancedFilterCount > 0 ? `, ${advancedFilterCount} active` : ''}`}
            accessibilityState={{ expanded: filtersOpen }}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={filtersOpen || advancedFilterCount > 0 ? colors.textOnAccent : colors.text}
            />
            {advancedFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{advancedFilterCount}</Text>
              </View>
            ) : undefined}
          </PressableScale>
        </View>

        <Segmented options={TYPE_OPTIONS} value={filterType} onChange={setFilterType} style={{ marginTop: space.md }} />

        {filtersOpen ? (
          <Card style={{ marginTop: space.md }}>
            <Text style={styles.filterLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {(['all', ...Object.keys(CATEGORY_ICONS).filter((k) => k !== 'Vehicle Spends')] as string[]).map((cat) => (
                <Chip
                  key={cat}
                  label={cat === 'all' ? 'All' : cat}
                  icon={cat !== 'all' ? (getCategoryIcon(cat).name as any) : undefined}
                  selected={filterCategory === cat}
                  onPress={() => setFilterCategory(cat)}
                />
              ))}
            </ScrollView>
            <Text style={[styles.filterLabel, { marginTop: space.lg }]}>Sort by</Text>
            <View style={styles.chipWrap}>
              {SORT_OPTIONS.map((opt) => (
                <Chip key={opt.id} label={opt.label} selected={sortBy === opt.id} onPress={() => setSortBy(opt.id)} />
              ))}
            </View>
          </Card>
        ) : undefined}

        <View style={styles.listMetaRow}>
          <Text style={styles.listMeta} numberOfLines={1}>
            {sortedTransactions.length} {sortedTransactions.length === 1 ? 'transaction' : 'transactions'} · {rangeLabel}
          </Text>
          {hasActiveFilters ? (
            <PressableScale onPress={clearFilters} hitSlop={8} accessibilityLabel="Reset filters" style={styles.resetLink}>
              <Text style={styles.linkText}>Reset</Text>
            </PressableScale>
          ) : undefined}
        </View>
        {sortedTransactions.length > 0 ? (
          <Text style={styles.hint}>Tap to edit · swipe left or long press to delete</Text>
        ) : undefined}
      </View>
    </>
  );

  if (loading) {
    return <SpendSkeleton topInset={insets.top} />;
  }

  const filteredOut = hasActiveFilters && transactions.length > 0;

  return (
    <View style={styles.screen}>
      <SidePanelDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      <EdgeSwipeOpener onOpen={() => setIsDrawerOpen(true)} />
      <FlatList
        data={groups}
        keyExtractor={(g) => g.key}
        renderItem={({ item: group }) => (
          <View style={styles.dayGroup}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle} accessibilityRole="header">
                {group.title}
              </Text>
              {groupByDay && group.spent > 0 ? (
                <Text style={styles.daySpent}>{formatINR(group.spent)} spent</Text>
              ) : undefined}
            </View>
            <Card padded={false} style={styles.dayCard}>
              {group.items.map((item: any, i: number) => (
                <TxRow
                  key={String(item.id)}
                  item={item}
                  divider={i > 0}
                  showDate={!groupByDay}
                  onOpen={() => router.push({ pathname: '/add-transaction', params: { id: item.id } })}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </Card>
          </View>
        )}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <Card style={{ marginTop: space.lg }}>
            {filteredOut ? (
              <>
                <EmptyState
                  icon="funnel-outline"
                  title="No matching transactions"
                  message="Nothing matches these filters. Try another month or reset the filters."
                />
                <Button label="Reset filters" variant="secondary" icon="close" onPress={clearFilters} style={styles.emptyReset} />
              </>
            ) : (
              <EmptyState
                icon="receipt-outline"
                title="No transactions yet"
                message="Add a spend or income manually, or set up iOS Shortcuts to add them automatically."
                actionLabel="Add transaction"
                onAction={() => router.push('/add-transaction')}
              />
            )}
          </Card>
        }
        ListFooterComponent={
          transactions.length > 0 ? (
            <View style={styles.footer}>
              <Button label="Delete all transactions" variant="danger" icon="trash-outline" onPress={handleDeleteAll} />
            </View>
          ) : undefined
        }
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        initialNumToRender={8}
        windowSize={11}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryFill} colors={[colors.primaryFill]} />
        }
      />

      {toast.visible && (
        <Animated.View
          entering={FadeInDown.springify().damping(18)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.toast, { bottom: insets.bottom + 90 }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.toastText}>{toast.msg}</Text>
          {toast.undoId != null && (
            <PressableScale onPress={() => undoDelete(toast.undoId)} style={styles.toastUndoBtn} accessibilityLabel="Undo delete">
              <Ionicons name="arrow-undo" size={14} color={colors.heroAccent} />
              <Text style={styles.toastUndoText}>Undo</Text>
            </PressableScale>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl + space.lg,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  section: { marginTop: space.xxl },

  headerBtnBusy: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    marginBottom: space.lg,
  },
  noticeText: { ...type.label, fontWeight: '500', color: colors.text, flex: 1 },
  noticeAction: { minHeight: HIT, justifyContent: 'center', paddingHorizontal: space.md },
  noticeActionText: { ...type.label, color: colors.danger },

  // Month switcher
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.xs,
    marginBottom: space.lg,
    ...shadow.card,
  },
  monthArrow: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowDisabled: { opacity: 0.3 },
  monthCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: HIT },
  monthTitle: { ...type.headline, color: colors.text },
  monthCaptionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  monthCaption: { ...type.caption, fontWeight: '500', color: colors.textMuted },

  rangeCard: { marginBottom: space.lg },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chipScroll: { gap: space.sm, paddingRight: space.xs },
  dateRangeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  dateBtn: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  dateBtnActive: { borderColor: colors.indigo, backgroundColor: colors.indigoSoft },
  dateBtnCaption: { ...type.caption, fontWeight: '500', color: colors.textMuted },
  dateBtnValue: { ...type.label, color: colors.text, marginTop: 1 },
  hint: { ...type.caption, fontWeight: '500', color: colors.textSecondary, marginTop: space.sm },
  pickerBox: {
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { ...type.label, color: colors.textSecondary },
  pickerDone: { minHeight: HIT, paddingHorizontal: space.md },

  // Summary card
  block: { padding: space.lg },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    gap: space.sm,
    minHeight: 24,
  },
  blockTitle: { ...type.label, color: colors.textSecondary },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: HIT,
    marginTop: space.xs,
    marginBottom: -space.md,
  },
  linkText: { ...type.label, color: colors.indigo },
  editActions: { flexDirection: 'row', gap: space.md },
  bigLine: { color: colors.text },
  bigValue: { ...type.amount, fontSize: 22, lineHeight: 28, color: colors.text },
  bigOf: { ...type.label, fontWeight: '500', color: colors.textMuted },
  budgetFoot: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: space.sm,
  },
  subLine: { ...type.label, fontWeight: '500', color: colors.textSecondary, flex: 1 },
  percentText: { ...type.caption, color: colors.textMuted, marginTop: 1 },

  // Trend
  trendHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: space.lg,
    marginBottom: space.md,
  },
  trendTotal: { ...type.amountSmall, color: colors.text },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  barCol: { flex: 1, alignItems: 'center' },
  barValue: { fontSize: 10, lineHeight: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 3 },
  barTrack: {
    width: '64%',
    height: 112,
    justifyContent: 'flex-end',
    borderRadius: 6,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 6, backgroundColor: 'rgba(79, 70, 229, 0.45)' },
  barLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: colors.textMuted, marginTop: space.xs },
  emptyInline: {
    ...type.label,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: space.xl,
  },

  // Search & filters
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  searchInput: { flex: 1, ...type.body, color: colors.text, paddingVertical: space.sm },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  filterBtnActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.page,
  },
  filterBadgeText: { fontSize: 10, lineHeight: 12, fontWeight: '800', color: colors.textOnAccent },
  filterLabel: { ...type.label, color: colors.textSecondary, marginBottom: space.sm },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    gap: space.sm,
  },
  listMeta: { ...type.caption, fontWeight: '500', color: colors.textSecondary, flex: 1 },
  resetLink: { minHeight: 32, justifyContent: 'center', paddingHorizontal: space.xs },

  // Day groups
  dayGroup: { marginTop: space.lg },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  dayTitle: { ...type.label, color: colors.text },
  daySpent: { ...type.caption, fontWeight: '500', color: colors.textSecondary },
  dayCard: { overflow: 'hidden' },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
    backgroundColor: colors.surface,
  },
  txDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  txText: { flex: 1, minWidth: 0 },
  txTitle: { ...type.body, fontWeight: '700', color: colors.text },
  txMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  txMeta: { ...type.caption, fontWeight: '500', color: colors.textMuted, flexShrink: 1 },
  txAmount: { ...type.amountSmall, color: colors.text, maxWidth: '40%' },

  swipeDeleteAction: {
    backgroundColor: colors.dangerFill,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  swipeDeleteBtn: { flex: 1, width: 88, alignItems: 'center', justifyContent: 'center', gap: 2 },
  swipeDeleteText: { ...type.caption, color: colors.textOnAccent },

  emptyReset: { alignSelf: 'center', marginBottom: space.lg },
  footer: { marginTop: space.xxxl },

  skelHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  skelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
  },

  // Toast
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    minHeight: 52,
    ...shadow.raised,
  },
  toastText: { ...type.label, color: colors.textOnAccent, flex: 1 },
  toastUndoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: HIT,
    paddingHorizontal: space.md,
  },
  toastUndoText: { ...type.label, fontWeight: '700', color: colors.heroAccent },
});

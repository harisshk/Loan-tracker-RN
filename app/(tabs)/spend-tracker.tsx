import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
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
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getTransactions,
  deleteTransaction,
  deleteAllTransactions,
  getBudgetLimit,
  saveBudgetLimit,
  syncWithSupabase,
  classifyOtherTransactionsBatch,
  syncEmiTransactions,
} from '../../utils/transactions';
import { syncGmailTransactions } from '../../utils/gmail';
import { getLoans } from '../../utils/storage';

const { width } = Dimensions.get('window');

const CATEGORY_ICONS = {
  Salary: { name: 'cash-outline', color: '#10b981' },
  Food: { name: 'fast-food-outline', color: '#fb923c' },
  Shopping: { name: 'cart-outline', color: '#ec4899' },
  EMI: { name: 'wallet-outline', color: '#6366f1' },
  Bills: { name: 'receipt-outline', color: '#3b82f6' },
  Investment: { name: 'trending-up-outline', color: '#8b5cf6' },
  Entertainment: { name: 'film-outline', color: '#f43f5e' },
  Travel: { name: 'airplane-outline', color: '#06b6d4' },
  Other: { name: 'cube-outline', color: '#64748b' },
};

// Drag at least this far (px) to trigger an automatic delete on release-less full swipe.
const FULL_SWIPE_THRESHOLD = width * 0.55;

// How long the user can tap "Undo" before a delete is actually committed to the DB.
const UNDO_WINDOW = 4000;

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
      <TouchableOpacity
        onPress={onDelete}
        activeOpacity={0.8}
        style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="trash-outline" size={22} color="#fff" />
        <Text style={styles.swipeDeleteText}>Delete</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function SpendTracker() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [budgetLimit, setBudgetLimit] = useState(50000);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [limitInput, setLimitInput] = useState('50000');
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
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
  const [loansCount, setLoansCount] = useState(0);
  const [isClassifying, setIsClassifying] = useState(false);
  // Banking-style From/To date range (max 6 months). Defaults to the last month:
  // from one month + a day ago (e.g. 16 May when today is 17 Jun) up to today.
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(d.getDate() - 1);
    return d;
  });
  const [endDate, setEndDate] = useState<Date | null>(() => new Date());
  const [picker, setPicker] = useState<null | 'start' | 'end'>(null);

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
    setPicker(Platform.OS === 'ios' ? picker : null);
    if (!selected || !which) return;

    if (which === 'start') {
      setStartDate(selected);
      // Keep the window within 6 months.
      if (endDate && endDate > addMonths(selected, 6)) {
        setEndDate(addMonths(selected, 6));
        Alert.alert('Range trimmed', 'The date range is limited to 6 months, so the end date was adjusted.');
      }
      if (endDate && endDate < selected) setEndDate(selected);
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
    }
  };

  const clearDateRange = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const handleAIClassify = async () => {
    setIsClassifying(true);
    try {
      const res = await classifyOtherTransactionsBatch();
      setIsClassifying(false);
      if (res.success) {
        if (res.scanned > 0) {
          Alert.alert('AI Classification Done', res.reason);
          loadData();
        } else {
          Alert.alert('AI Classification', 'No unclassified "Other" transactions found.');
        }
      } else {
        Alert.alert('AI Classification Failed', res.reason || 'Could not classify.');
      }
    } catch (err: any) {
      setIsClassifying(false);
      Alert.alert('Error', err.message || 'An error occurred.');
    }
  };

  // Financial Stats for the current month — derived from transactions so that
  // optimistic deletes/edits keep the totals correct without a refetch.
  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let inc = 0, exp = 0, emi = 0;
    transactions.forEach((t: any) => {
      const d = new Date(t.date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        const amt = parseFloat(t.amount || 0);
        if ((t.type || '').toLowerCase() === 'credit') {
          inc += amt;
        } else {
          exp += amt;
          if (t.category === 'EMI') emi += amt;
        }
      }
    });
    return { income: inc, expenses: exp, emiPay: emi, balance: inc - exp };
  }, [transactions]);

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
    } catch (e) {
      console.error(e);
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

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        try {
          await syncEmiTransactions();
          if (active) {
            await loadData(false);
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
    const result = await syncWithSupabase();
    setIsSyncing(false);
    
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
      Alert.alert('Invalid Limit', 'Please enter a valid positive number');
      return;
    }
    await saveBudgetLimit(amt);
    setBudgetLimit(amt);
    setIsEditingLimit(false);
    loadData();
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
                      showToast('🗑️ All transactions deleted');
                      loadData();
                    } catch (e) {
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
    const dateObj = t.date ? new Date(t.date) : null;

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

  // Summary card totals reflect the selected date range (not the calendar month),
  // so the numbers up top match the period being viewed.
  const rangeStats = transactions.reduce(
    (acc: { income: number; expenses: number }, t: any) => {
      const dateObj = t.date ? new Date(t.date) : null;
      if (startDate && (!dateObj || dateObj < startOfDay(startDate))) return acc;
      if (endDate && (!dateObj || dateObj > endOfDay(endDate))) return acc;
      const amt = parseFloat(t.amount || 0);
      if ((t.type || '').toLowerCase() === 'credit') acc.income += amt;
      else acc.expenses += amt;
      return acc;
    },
    { income: 0, expenses: 0 }
  );
  const rangeBalance = rangeStats.income - rangeStats.expenses;

  const rangeLabel =
    startDate || endDate
      ? `${startDate ? fmtDate(startDate) : 'Start'} – ${endDate ? fmtDate(endDate) : 'Today'}`
      : 'All time';

  const hasActiveFilters =
    filterType !== 'all' || filterCategory !== 'all' || searchQuery !== '' || !!startDate || !!endDate;

  const clearFilters = () => {
    setFilterType('all');
    setFilterCategory('all');
    setSearchQuery('');
    setStartDate(null);
    setEndDate(null);
  };

  const fc = (amount: any) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`;
  };

  const percentUsed = Math.min(100, (stats.expenses / Math.max(1, budgetLimit)) * 100);

  const renderTxItem = ({ item }: { item: any }) => {
    const categoryDetails = CATEGORY_ICONS[item.category as keyof typeof CATEGORY_ICONS] || CATEGORY_ICONS.Other;
    return (
      <ReanimatedSwipeable
        friction={1.5}
        rightThreshold={40}
        containerStyle={styles.swipeContainer}
        renderRightActions={(_progress, translation) => (
          <SwipeRightAction drag={translation} onDelete={() => performDelete(item)} />
        )}
      >
        <TouchableOpacity
          style={styles.txCard}
          onPress={() => router.push({ pathname: '/add-transaction', params: { id: item.id } })}
          onLongPress={() => handleDelete(item)}
          activeOpacity={0.7}
        >
          <View style={[styles.txIconWrap, { backgroundColor: categoryDetails.color + '18' }]}>
            <Ionicons name={categoryDetails.name as any} size={20} color={categoryDetails.color} />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.txDesc} numberOfLines={2}>
              {item.description || item.category}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Text style={styles.txDate}>
                {new Date(item.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {item.source === 'shortcut' && ' • Automated'}
                {item.source === 'emi-auto' && ' • Auto EMI'}
              </Text>
              <Ionicons
                name={item.synced ? "cloud-done" : "cloud-offline"}
                size={12}
                color={item.synced ? "#10b981" : "#f59e0b"}
                style={{ marginLeft: 2 }}
              />
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={[
                styles.txAmount,
                { color: (item.type || '').toLowerCase() === 'credit' ? '#059669' : '#dc2626' },
              ]}
            >
              {(item.type || '').toLowerCase() === 'credit' ? '+' : '-'}{fc(item.amount)}
            </Text>
            <Text style={styles.txCategory}>{item.category}</Text>
            {item.mode && (
              <View style={[
                styles.modeBadge,
                {
                  backgroundColor: item.mode === 'Credit Card'
                    ? 'rgba(236,72,153,0.08)'
                    : item.mode === 'Cash'
                    ? 'rgba(245,158,11,0.08)'
                    : 'rgba(99,102,241,0.08)',
                  marginTop: 4
                }
              ]}>
                <Text style={[
                  styles.modeBadgeText,
                  {
                    color: item.mode === 'Credit Card'
                      ? '#ec4899'
                      : item.mode === 'Cash'
                      ? '#f59e0b'
                      : '#6366f1'
                  }
                ]}>
                  {item.mode}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </ReanimatedSwipeable>
    );
  };

  const ListHeader = (
    <>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Spend Tracker</Text>
          <TouchableOpacity onPress={handleSync} disabled={isSyncing} style={styles.syncBtn}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#10b981" />
            ) : (
              <Ionicons name="sync-outline" size={24} color="#10b981" />
            )}
          </TouchableOpacity>
        </View>

        {/* Fancy Spend Summary Card */}
        <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.summaryCard}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.subtitle}>Net Balance</Text>
              <Text style={[styles.mainBalance, { color: rangeBalance >= 0 ? '#10b981' : '#f43f5e' }]}>
                {rangeBalance >= 0 ? '+' : ''}{fc(rangeBalance)}
              </Text>
              <Text style={styles.summaryRange}>{rangeLabel}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/add-transaction')} style={styles.addTxBtn}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addTxText}>Add</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <View style={styles.iconLabelRow}>
                <Ionicons name="arrow-down-circle" size={16} color="#10b981" />
                <Text style={styles.statLabel}>Inflow</Text>
              </View>
              <Text style={[styles.statVal, { color: '#10b981' }]}>{fc(rangeStats.income)}</Text>
            </View>
            <View style={styles.statCol}>
              <View style={styles.iconLabelRow}>
                <Ionicons name="arrow-up-circle" size={16} color="#f43f5e" />
                <Text style={styles.statLabel}>Outflow</Text>
              </View>
              <Text style={[styles.statVal, { color: '#f43f5e' }]}>{fc(rangeStats.expenses)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Fancy Budget limit with Progress Ring UI */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget Calculator</Text>
          <BlurView intensity={35} tint="light" style={styles.budgetCard}>
            <View style={styles.budgetHeader}>
              <View>
                <Text style={styles.budgetSubtitle}>MONTHLY LIMIT</Text>
                {isEditingLimit ? (
                  <View style={styles.limitEditRow}>
                    <TextInput
                      style={styles.limitInput}
                      keyboardType="numeric"
                      value={limitInput}
                      onChangeText={setLimitInput}
                      autoFocus
                    />
                    <TouchableOpacity onPress={handleUpdateLimit} style={styles.saveLimitBtn}>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setIsEditingLimit(true)} style={styles.limitTextRow}>
                    <Text style={styles.budgetValue}>{fc(budgetLimit)}</Text>
                    <Ionicons name="create-outline" size={16} color="#64748b" style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.percentageBox}>
                <Text style={[styles.percentText, { color: percentUsed >= 90 ? '#e11d48' : '#ec4899' }]}>
                  {percentUsed.toFixed(0)}% Used
                </Text>
              </View>
            </View>

            {/* Premium Progress Bar */}
            <View style={styles.progressContainer}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${percentUsed}%`,
                    backgroundColor: percentUsed >= 90 ? '#e11d48' : '#ec4899',
                  },
                ]}
              />
            </View>

            <View style={styles.budgetFooter}>
              <Text style={styles.footerText}>
                Remaining Budget: <Text style={{ fontWeight: 'bold', color: budgetLimit - stats.expenses >= 0 ? '#10b981' : '#e11d48' }}>
                  {fc(budgetLimit - stats.expenses)}
                </Text>
              </Text>
            </View>

            {percentUsed >= 90 && (
              <View style={[
                styles.budgetAlertBanner,
                { backgroundColor: percentUsed >= 100 ? 'rgba(225, 29, 72, 0.08)' : 'rgba(217, 119, 6, 0.08)' }
              ]}>
                <Ionicons 
                  name={percentUsed >= 100 ? "alert-circle" : "warning"} 
                  size={16} 
                  color={percentUsed >= 100 ? "#e11d48" : "#d97706"} 
                />
                <Text style={[
                  styles.budgetAlertText,
                  { color: percentUsed >= 100 ? "#e11d48" : "#d97706" }
                ]}>
                  {percentUsed >= 100 
                    ? "🚨 Alert: You have exceeded your monthly budget limit!"
                    : "⚠️ Caution: You have used over 90% of your budget!"
                  }
                </Text>
              </View>
            )}
          </BlurView>
        </View>

        {/* Filters */}
        <View style={styles.filterCard}>
          <View style={styles.filterCardHeader}>
            <Ionicons name="options-outline" size={16} color="#0f172a" />
            <Text style={styles.filterCardTitle}>Filters</Text>
          </View>

          {/* Type */}
          <Text style={styles.filterLabel}>TYPE</Text>
          <View style={styles.filterContainer}>
            {['all', 'credit', 'debit'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.filterBtn, filterType === type && styles.filterBtnActive]}
                onPress={() => setFilterType(type)}
              >
                <Text style={[styles.filterBtnText, filterType === type && styles.filterBtnTextActive]}>
                  {type.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Category */}
          <Text style={[styles.filterLabel, { marginTop: 16 }]}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {(['all', ...Object.keys(CATEGORY_ICONS)] as string[]).map((cat) => {
              const isActive = filterCategory === cat;
              const iconInfo = cat !== 'all' ? CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS] : null;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setFilterCategory(cat)}
                  style={[
                    styles.categoryChip,
                    isActive && { backgroundColor: iconInfo ? iconInfo.color : '#0f172a', borderColor: 'transparent' },
                  ]}
                >
                  {iconInfo && (
                    <Ionicons
                      name={iconInfo.name as any}
                      size={13}
                      color={isActive ? '#fff' : iconInfo.color}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text style={[styles.categoryChipText, isActive && { color: '#fff' }]}>
                    {cat === 'all' ? 'All' : cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Period — Date Range (From / To, max 6 months) */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
            <Text style={[styles.filterLabel, { marginBottom: 0 }]}>DATE RANGE</Text>
            {(startDate || endDate) && (
              <TouchableOpacity onPress={clearDateRange} hitSlop={8}>
                <Text style={styles.clearRangeText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.dateRangeRow}>
            <TouchableOpacity style={styles.dateRangeBtn} onPress={() => setPicker(picker === 'start' ? null : 'start')} activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={16} color="#6366f1" />
              <View>
                <Text style={styles.dateRangeCaption}>From</Text>
                <Text style={[styles.dateRangeValue, !startDate && styles.dateRangeValueMuted]}>
                  {startDate ? fmtDate(startDate) : 'Any'}
                </Text>
              </View>
            </TouchableOpacity>
            <Ionicons name="arrow-forward" size={16} color="#cbd5e1" />
            <TouchableOpacity style={styles.dateRangeBtn} onPress={() => setPicker(picker === 'end' ? null : 'end')} activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={16} color="#ec4899" />
              <View>
                <Text style={styles.dateRangeCaption}>To</Text>
                <Text style={[styles.dateRangeValue, !endDate && styles.dateRangeValueMuted]}>
                  {endDate ? fmtDate(endDate) : 'Any'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <Text style={styles.dateRangeHint}>Range is limited to 6 months</Text>

          {picker && (
            <DateTimePicker
              value={(picker === 'start' ? startDate : endDate) || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              minimumDate={picker === 'end' && startDate ? startDate : undefined}
              onChange={(_, selected) => onPickDate(selected)}
            />
          )}
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search transactions..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Transactions List */}
        <View style={styles.txListContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Transactions History</Text>
            <TouchableOpacity onPress={handleDeleteAll} style={styles.deleteAllBtn} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={18} color="#e11d48" />
            </TouchableOpacity>
          </View>
          <Text style={styles.listMeta}>
            {filteredTransactions.length} {filteredTransactions.length === 1 ? 'transaction' : 'transactions'} · {rangeLabel}
          </Text>
          <TouchableOpacity onPress={handleAIClassify} style={styles.aiClassifyBtn} disabled={isClassifying}>
            {isClassifying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={14} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.aiClassifyBtnText}>AI Classify (20)</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.swipeHint}>Swipe left to delete · pull to refresh</Text>
        </View>
    </>
  );

  if (loading) {
    return (
      <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top, paddingHorizontal: 20 }]}>
          {/* Header */}
          <View style={[styles.header, { marginTop: 10, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <PulseSkeleton width={200} height={34} borderRadius={8} />
            <PulseSkeleton width={32} height={32} borderRadius={16} />
          </View>

          {/* Net Balance Card */}
          <View style={{ backgroundColor: '#0f172a', borderRadius: 28, padding: 24, marginBottom: 20 }}>
            <PulseSkeleton width={80} height={12} borderRadius={4} style={{ opacity: 0.3, backgroundColor: '#fff', marginBottom: 8 }} />
            <PulseSkeleton width={180} height={38} borderRadius={8} style={{ opacity: 0.3, backgroundColor: '#fff', marginBottom: 20 }} />
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 14 }} />
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <View style={{ flex: 1 }}>
                <PulseSkeleton width={60} height={10} borderRadius={4} style={{ opacity: 0.3, backgroundColor: '#fff', marginBottom: 6 }} />
                <PulseSkeleton width={90} height={16} borderRadius={6} style={{ opacity: 0.3, backgroundColor: '#fff' }} />
              </View>
              <View style={{ flex: 1 }}>
                <PulseSkeleton width={60} height={10} borderRadius={4} style={{ opacity: 0.3, backgroundColor: '#fff', marginBottom: 6 }} />
                <PulseSkeleton width={90} height={16} borderRadius={6} style={{ opacity: 0.3, backgroundColor: '#fff' }} />
              </View>
            </View>
          </View>

          {/* Budget Card */}
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
            <PulseSkeleton width={100} height={12} borderRadius={4} style={{ marginBottom: 8 }} />
            <PulseSkeleton width={120} height={24} borderRadius={6} style={{ marginBottom: 16 }} />
            <PulseSkeleton height={8} borderRadius={4} style={{ marginBottom: 12 }} />
            <PulseSkeleton width={160} height={14} borderRadius={4} />
          </View>

          {/* Filters Card */}
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
            <PulseSkeleton width={60} height={14} borderRadius={4} style={{ marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <PulseSkeleton width={80} height={32} borderRadius={16} />
              <PulseSkeleton width={80} height={32} borderRadius={16} />
              <PulseSkeleton width={80} height={32} borderRadius={16} />
            </View>
            <PulseSkeleton width={80} height={14} borderRadius={4} style={{ marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PulseSkeleton width={70} height={28} borderRadius={14} />
              <PulseSkeleton width={70} height={28} borderRadius={14} />
              <PulseSkeleton width={70} height={28} borderRadius={14} />
              <PulseSkeleton width={70} height={28} borderRadius={14} />
            </View>
          </View>

          {/* Recent Spends list preview skeleton */}
          <View style={{ gap: 10, marginBottom: 20 }}>
            {[1, 2, 3].map(i => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
                <PulseSkeleton width={36} height={36} borderRadius={10} style={{ marginRight: 14 }} />
                <View style={{ flex: 1, gap: 6 }}>
                  <PulseSkeleton width={120} height={14} borderRadius={4} />
                  <PulseSkeleton width={80} height={10} borderRadius={3} />
                </View>
                <PulseSkeleton width={65} height={16} borderRadius={4} />
              </View>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item: any) => String(item.id)}
        renderItem={renderTxItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          hasActiveFilters && transactions.length > 0 ? (
            <BlurView intensity={20} tint="light" style={styles.emptyCard}>
              <Ionicons name="funnel-outline" size={40} color="#94a3b8" style={{ marginBottom: 10 }} />
              <Text style={styles.emptyText}>No Matching Transactions</Text>
              <Text style={styles.emptySub}>
                No transactions match your current filters. Try widening the date range or clearing filters.
              </Text>
              <TouchableOpacity onPress={clearFilters} style={styles.clearFiltersBtn} activeOpacity={0.8}>
                <Ionicons name="close" size={15} color="#fff" />
                <Text style={styles.clearFiltersBtnText}>Clear filters</Text>
              </TouchableOpacity>
            </BlurView>
          ) : (
            <BlurView intensity={20} tint="light" style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={40} color="#94a3b8" style={{ marginBottom: 10 }} />
              <Text style={styles.emptyText}>No Transactions Found</Text>
              <Text style={styles.emptySub}>
                Add a credit/debit manually or setup iOS Shortcuts to populate them automatically.
              </Text>
            </BlurView>
          )
        }
        ListFooterComponent={<View style={{ height: 24 }} />}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top, paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        initialNumToRender={12}
        windowSize={11}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" colors={['#7c3aed']} />
        }
      />

      {toast.visible && (
        <Animated.View
          entering={FadeInDown.springify().damping(18)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.toast, { bottom: insets.bottom + 90 }]}
        >
          <Text style={styles.toastText}>{toast.msg}</Text>
          {toast.undoId != null && (
            <TouchableOpacity onPress={() => undoDelete(toast.undoId)} style={styles.toastUndoBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-undo" size={14} color="#a5b4fc" />
              <Text style={styles.toastUndoText}>UNDO</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  syncBtn: { padding: 4 },
  summaryCard: { borderRadius: 24, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  mainBalance: { fontSize: 30, fontWeight: '800' },
  summaryRange: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginTop: 4 },
  listMeta: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginBottom: 10 },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },
  clearFiltersBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  addTxBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ec4899', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  addTxText: { color: '#fff', fontWeight: 'bold', fontSize: 13, marginLeft: 4 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCol: { flex: 1 },
  iconLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 6, fontWeight: '600' },
  statVal: { fontSize: 18, fontWeight: '700' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  budgetCard: { borderRadius: 24, padding: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', overflow: 'hidden' },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  budgetSubtitle: { fontSize: 11, color: '#64748b', fontWeight: '700', letterSpacing: 0.5 },
  budgetValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  limitTextRow: { flexDirection: 'row', alignItems: 'center' },
  limitEditRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  limitInput: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, width: 100, fontSize: 16, fontWeight: 'bold' },
  saveLimitBtn: { backgroundColor: '#10b981', padding: 8, borderRadius: 10, marginLeft: 6 },
  percentageBox: { backgroundColor: 'rgba(236,72,153,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  percentText: { fontSize: 12, fontWeight: '700' },
  progressContainer: { height: 8, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  progressFill: { height: '100%' },
  budgetFooter: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', paddingTop: 10 },
  footerText: { fontSize: 13, color: '#64748b' },
  filterCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  filterCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  filterCardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', letterSpacing: 0.2 },
  filterLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 1, marginBottom: 8 },
  filterContainer: { flexDirection: 'row', gap: 8 },
  filterBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#0f172a' },
  filterBtnText: { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.5 },
  filterBtnTextActive: { color: '#fff' },
  dateRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateRangeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateRangeCaption: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5, marginBottom: 1 },
  dateRangeValue: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  dateRangeValueMuted: { color: '#94a3b8', fontWeight: '600' },
  dateRangeHint: { fontSize: 10, color: '#94a3b8', marginTop: 8 },
  clearRangeText: { fontSize: 12, fontWeight: '700', color: '#6366f1' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a', padding: 0 },
  txListContainer: { marginBottom: 20 },
  emptyCard: { borderRadius: 20, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', overflow: 'hidden' },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 6 },
  emptySub: { fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 18 },
  txCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  txIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txDesc: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginBottom: 2 },
  txDate: { fontSize: 11, color: '#94a3b8' },
  txAmount: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  txCategory: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  modeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  modeBadgeText: { fontSize: 9, fontWeight: '700' },
  aiClassifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 8,
  },
  aiClassifyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  swipeHint: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginBottom: 12,
    marginLeft: 2,
  },
  swipeContainer: {
    borderRadius: 18,
    marginBottom: 10,
  },
  swipeDeleteAction: {
    backgroundColor: '#e11d48',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    marginLeft: 8,
  },
  swipeDeleteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  deleteAllBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(225,29,72,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChip: {
    minWidth: 48,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#0f172a',
    paddingLeft: 20,
    paddingRight: 12,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  toastUndoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(165,180,252,0.15)',
  },
  toastUndoText: {
    color: '#a5b4fc',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  budgetAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.03)',
  },
  budgetAlertText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
});

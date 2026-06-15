import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getTransactions,
  deleteTransaction,
  getBudgetLimit,
  saveBudgetLimit,
  syncWithSupabase,
  classifyOtherTransactionsBatch,
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

export default function SpendTracker() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [budgetLimit, setBudgetLimit] = useState(50000);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [limitInput, setLimitInput] = useState('50000');
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, credit, debit
  const [filterCategory, setFilterCategory] = useState('all');
  const [loansCount, setLoansCount] = useState(0);
  const [isClassifying, setIsClassifying] = useState(false);

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

  // Financial Stats
  const [stats, setStats] = useState({
    income: 0,
    expenses: 0,
    emiPay: 0,
    balance: 0,
  });

  const loadData = async () => {
    try {
      const txs = await getTransactions();
      const limit = await getBudgetLimit();
      const loans = await getLoans();
      setLoansCount(loans.filter((l: any) => l.status !== 'closed').length);

      // Sort by date descending
      const sortedTxs = [...txs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(sortedTxs as any);
      setBudgetLimit(limit);
      setLimitInput(String(limit));

      // Calculate stats for current month
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let inc = 0;
      let exp = 0;
      let emi = 0;

      txs.forEach((t: any) => {
        const d = new Date(t.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          const amt = parseFloat(t.amount || 0);
          const txType = (t.type || '').toLowerCase();
          if (txType === 'credit') {
            inc += amt;
          } else {
            exp += amt;
            if (t.category === 'EMI') {
              emi += amt;
            }
          }
        }
      });

      setStats({
        income: inc,
        expenses: exp,
        emiPay: emi,
        balance: inc - exp,
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);
  useFocusEffect(React.useCallback(() => { loadData(); }, []));

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

  const handleDelete = (id: any) => {
    Alert.alert('Delete Transaction', 'Are you sure you want to delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(id);
          loadData();
        },
      },
    ]);
  };

  // Filter & Search
  const filteredTransactions = transactions.filter((t: any) => {
    const desc = t.description || '';
    const cat = t.category || '';
    const matchesSearch = desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          cat.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' ||
                          (t.type || '').toLowerCase() === filterType.toLowerCase();
    const matchesCategory = filterCategory === 'all' || cat === filterCategory;
    return matchesSearch && matchesFilter && matchesCategory;
  });

  const fc = (amount: any) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`;
  };

  const percentUsed = Math.min(100, (stats.expenses / Math.max(1, budgetLimit)) * 100);

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top, paddingBottom: 24 }]} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Spend Tracker</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity onPress={handleAIClassify} disabled={isClassifying} style={styles.syncBtn}>
              {isClassifying ? (
                <ActivityIndicator size="small" color="#7c3aed" />
              ) : (
                <Ionicons name="sparkles" size={24} color="#7c3aed" />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSync} disabled={isSyncing} style={styles.syncBtn}>
              {isSyncing ? (
                <ActivityIndicator size="small" color="#10b981" />
              ) : (
                <Ionicons name="sync-outline" size={24} color="#10b981" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Fancy Spend Summary Card */}
        <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.summaryCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.subtitle}>Net Monthly Balance</Text>
              <Text style={[styles.mainBalance, { color: stats.balance >= 0 ? '#10b981' : '#f43f5e' }]}>
                {stats.balance >= 0 ? '+' : ''}{fc(stats.balance)}
              </Text>
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
              <Text style={[styles.statVal, { color: '#10b981' }]}>{fc(stats.income)}</Text>
            </View>
            <View style={styles.statCol}>
              <View style={styles.iconLabelRow}>
                <Ionicons name="arrow-up-circle" size={16} color="#f43f5e" />
                <Text style={styles.statLabel}>Outflow</Text>
              </View>
              <Text style={[styles.statVal, { color: '#f43f5e' }]}>{fc(stats.expenses)}</Text>
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
          </BlurView>
        </View>

        {/* Filter Buttons */}
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

        {/* Category Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          {(['all', ...Object.keys(CATEGORY_ICONS)] as string[]).map((cat) => {
            const isActive = filterCategory === cat;
            const iconInfo = cat !== 'all' ? CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS] : null;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setFilterCategory(cat)}
                style={[
                  styles.categoryChip,
                  isActive && { backgroundColor: iconInfo ? iconInfo.color : '#0f172a' },
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Transactions History</Text>
            <TouchableOpacity onPress={handleAIClassify} style={styles.aiClassifyBtn} disabled={isClassifying}>
              {isClassifying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.aiClassifyBtnText}>🪄 AI Classify (10)</Text>
              )}
            </TouchableOpacity>
          </View>
          {filteredTransactions.length === 0 ? (
            <BlurView intensity={20} tint="light" style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={40} color="#94a3b8" style={{ marginBottom: 10 }} />
              <Text style={styles.emptyText}>No Transactions Found</Text>
              <Text style={styles.emptySub}>
                Add a credit/debit manually or setup iOS Shortcuts to populate them automatically.
              </Text>
            </BlurView>
          ) : (
            filteredTransactions.map((item: any) => {
              const categoryDetails = CATEGORY_ICONS[item.category as keyof typeof CATEGORY_ICONS] || CATEGORY_ICONS.Other;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.txCard}
                  onPress={() => router.push({ pathname: '/add-transaction', params: { id: item.id } })}
                  onLongPress={() => handleDelete(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.txIconWrap, { backgroundColor: categoryDetails.color + '18' }]}>
                    <Ionicons name={categoryDetails.name as any} size={20} color={categoryDetails.color} />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.txDesc} numberOfLines={1}>
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
                        { color: (item.type || '').toLowerCase() === 'credit' ? '#10b981' : '#0f172a' },
                      ]}
                    >
                      {(item.type || '').toLowerCase() === 'credit' ? '+' : '-'}{fc(item.amount)}
                    </Text>
                    <Text style={styles.txCategory}>{item.category}</Text>
                    {item.mode && (
                      <View style={[styles.modeBadge, { backgroundColor: item.mode === 'Credit Card' ? 'rgba(236,72,153,0.08)' : 'rgba(99,102,241,0.08)', marginTop: 4 }]}>
                        <Text style={[styles.modeBadgeText, { color: item.mode === 'Credit Card' ? '#ec4899' : '#6366f1' }]}>
                          {item.mode}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
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
  filterContainer: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#0f172a' },
  filterBtnText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  filterBtnTextActive: { color: '#fff' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a', padding: 0 },
  txListContainer: { marginBottom: 20 },
  emptyCard: { borderRadius: 20, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', overflow: 'hidden' },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 6 },
  emptySub: { fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 18 },
  txCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 18, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
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
    backgroundColor: '#7c3aed',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  aiClassifyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
});

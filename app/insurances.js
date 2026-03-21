import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { getInsurances, deleteInsurance } from '../utils/storage';

// ── Sort options ──────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { id: 'nextDue',        label: '📅 Due Soon'    },
  { id: 'premiumDesc',    label: '💰 Premium ↓'   },
  { id: 'premiumAsc',     label: '💰 Premium ↑'   },
  { id: 'annualDesc',     label: '📊 Annual ↓'    },
  { id: 'annualAsc',      label: '📊 Annual ↑'    },
  { id: 'name',           label: '🔤 Name A→Z'    },
];

const INS_TYPE_META = {
  life:     { label: 'Life',     emoji: '❤️',  color: '#e11d48' },
  health:   { label: 'Health',   emoji: '🏥',  color: '#10b981' },
  vehicle:  { label: 'Vehicle',  emoji: '🚗',  color: '#38bdf8' },
  property: { label: 'Property', emoji: '🏠',  color: '#f59e0b' },
  other:    { label: 'Other',    emoji: '📋',  color: '#a78bfa' },
};

export default function Insurances() {
  const router = useRouter();
  const [insurances, setInsurances] = useState([]);
  const [sortId, setSortId]         = useState('nextDue');
  const [refreshing, setRefreshing] = useState(false);

  const loadInsurances = async () => {
    const data = await getInsurances();
    setInsurances(data);
  };

  useEffect(() => { loadInsurances(); }, []);
  useFocusEffect(React.useCallback(() => { loadInsurances(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInsurances();
    setRefreshing(false);
  };

  const handleDelete = (id, name) => {
    Alert.alert(
      'Delete Insurance',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteInsurance(id);
            await loadInsurances();
          },
        },
      ]
    );
  };

  const formatCurrency = (amount) =>
    `₹${parseFloat(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getNextDueDate = (ins) => {
    if (!ins.startDate) return new Date(9999, 0);
    const start = new Date(ins.startDate);
    const today = new Date();
    let step = 12;
    if (ins.frequency === 'monthly')     step = 1;
    if (ins.frequency === 'quarterly')   step = 3;
    if (ins.frequency === 'half-yearly') step = 6;

    let next = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (next < today) next.setMonth(next.getMonth() + step);
    return next;
  };

  const getAnnualPremium = (ins) => {
    const p = parseFloat(ins.premiumAmount) || 0;
    const mult =
      ins.frequency === 'monthly'     ? 12 :
      ins.frequency === 'quarterly'   ? 4  :
      ins.frequency === 'half-yearly' ? 2  : 1;
    return p * mult;
  };

  // ── Sorting ───────────────────────────────────────────────────────────────────
  const sorted = [...insurances].sort((a, b) => {
    switch (sortId) {
      case 'nextDue':     return getNextDueDate(a)  - getNextDueDate(b);
      case 'premiumDesc': return (parseFloat(b.premiumAmount) || 0) - (parseFloat(a.premiumAmount) || 0);
      case 'premiumAsc':  return (parseFloat(a.premiumAmount) || 0) - (parseFloat(b.premiumAmount) || 0);
      case 'annualDesc':  return getAnnualPremium(b) - getAnnualPremium(a);
      case 'annualAsc':   return getAnnualPremium(a) - getAnnualPremium(b);
      case 'name':        return (a.name || '').localeCompare(b.name || '');
      default:            return 0;
    }
  });

  const totalAnnual = insurances.reduce((s, i) => s + getAnnualPremium(i), 0);

  return (
    <LinearGradient
      colors={['#f8fafc', '#f1f5f9', '#e2e8f0']}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButtonWrap}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.headerTitle}>All Insurances</Text>
            <TouchableOpacity onPress={() => router.push('/add-insurance')}>
              <Text style={styles.addButton}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Annual Total Strip */}
        {insurances.length > 0 && (
          <BlurView intensity={15} tint="light" style={styles.totalStrip}>
            <View style={styles.totalStripInner}>
              <Text style={styles.totalStripLabel}>Total Annual Premium</Text>
              <Text style={styles.totalStripValue}>{formatCurrency(totalAnnual)}/yr</Text>
            </View>
          </BlurView>
        )}

        {/* ── Sort Bar ── */}
        {insurances.length > 0 && (
          <BlurView intensity={18} tint="light" style={styles.sortCard}>
            <View style={styles.sortCardInner}>
              <Text style={styles.sortLabel}>SORT BY</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sortRow}
              >
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.sortBtn, sortId === opt.id && styles.sortBtnActive]}
                    onPress={() => setSortId(opt.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.sortBtnText, sortId === opt.id && styles.sortBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </BlurView>
        )}

        {/* Insurance List */}
        {sorted.length === 0 ? (
          <BlurView intensity={15} tint="light" style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Text style={styles.emptyText}>No insurances yet</Text>
              <Text style={styles.emptySubtext}>Tap the + button to add your first policy</Text>
            </View>
          </BlurView>
        ) : (
          sorted.map((ins) => {
            const nextDue   = getNextDueDate(ins);
            const annual    = getAnnualPremium(ins);
            const daysUntil = Math.ceil((nextDue - new Date()) / 86400000);
            const isUrgent  = daysUntil <= 7;
            const isWarning = daysUntil <= 30 && !isUrgent;
            const dueBorder = isUrgent ? '#e11d48' : isWarning ? '#f59e0b' : 'rgba(0,0,0,0.08)';
            const typeMeta  = INS_TYPE_META[ins.insuranceType] || INS_TYPE_META.other;

            return (
              <BlurView
                key={ins.id}
                intensity={20}
                tint="light"
                style={[
                  styles.card,
                  (isUrgent || isWarning) && { borderColor: dueBorder, borderWidth: 1.5 },
                ]}
              >
                <View style={styles.cardContent}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{ins.name}</Text>
                      {ins.insuranceType && (
                        <View style={[styles.typeBadge, { backgroundColor: typeMeta.color + '18' }]}>
                          <Text style={[styles.typeBadgeText, { color: typeMeta.color }]}>
                            {typeMeta.emoji} {typeMeta.label}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.amount}>{formatCurrency(ins.premiumAmount)}</Text>
                    <Text style={styles.amountLabel}>
                      {ins.frequency.charAt(0).toUpperCase() + ins.frequency.slice(1)} Premium
                    </Text>
                  </View>

                  {/* Due date pill */}
                  <View style={[styles.duePill, {
                    backgroundColor: isUrgent
                      ? 'rgba(225,29,72,0.09)'
                      : isWarning
                      ? 'rgba(245,158,11,0.09)'
                      : 'rgba(56,189,248,0.09)',
                  }]}>
                    <Text style={[styles.duePillText, {
                      color: isUrgent ? '#e11d48' : isWarning ? '#f59e0b' : '#38bdf8',
                    }]}>
                      {isUrgent ? '🔴' : isWarning ? '🟡' : '📅'}
                      {'  '}Next Premium:{' '}
                      <Text style={{ fontWeight: '700' }}>{formatDate(nextDue)}</Text>
                      <Text style={{ opacity: 0.65 }}>
                        {'  '}({daysUntil > 0 ? `${daysUntil}d away` : 'Today!'})
                      </Text>
                    </Text>
                  </View>

                  {/* Details */}
                  <View style={styles.details}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Frequency</Text>
                      <Text style={styles.detailValue}>
                        {ins.frequency.charAt(0).toUpperCase() + ins.frequency.slice(1)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Annual Cost</Text>
                      <Text style={[styles.detailValue, { color: '#2563eb' }]}>
                        {formatCurrency(annual)}/yr
                      </Text>
                    </View>
                  </View>

                  <View style={styles.startDateContainer}>
                    <Text style={styles.startDateLabel}>Base Date: {formatDate(ins.startDate)}</Text>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/edit-insurance',
                          params: {
                            id: ins.id,
                            name: ins.name,
                            insuranceType: ins.insuranceType || 'life',
                            premiumAmount: ins.premiumAmount,
                            frequency: ins.frequency,
                            startDate: ins.startDate,
                          },
                        })
                      }
                    >
                      <Text style={styles.editBtnText}>✏️ Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDelete(ins.id, ins.name)}
                    >
                      <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </BlurView>
            );
          })
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },

  header:         { marginBottom: 20 },
  backButtonWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backArrow:      { fontSize: 18, fontWeight: '600', color: '#10b981', lineHeight: 22 },
  backLabel:      { fontSize: 16, fontWeight: '600', color: '#10b981', lineHeight: 22 },
  headerTitle:    { fontSize: 34, fontWeight: '700', color: '#0f172a' },
  addButton:      { fontSize: 18, fontWeight: '600', color: '#10b981' },

  // Total strip
  totalStrip:      { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(37,99,235,0.2)', marginBottom: 14 },
  totalStripInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: 'rgba(37,99,235,0.05)' },
  totalStripLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(15,23,42,0.6)' },
  totalStripValue: { fontSize: 18, fontWeight: '700', color: '#2563eb' },

  // Sort bar
  sortCard:          { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 18 },
  sortCardInner:     { padding: 14 },
  sortLabel:         { fontSize: 10, fontWeight: '700', color: 'rgba(15,23,42,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  sortRow:           { flexDirection: 'row', gap: 8 },
  sortBtn:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', backgroundColor: '#fff' },
  sortBtnActive:     { backgroundColor: 'rgba(37,99,235,0.1)', borderColor: '#2563eb' },
  sortBtnText:       { fontSize: 12, fontWeight: '600', color: 'rgba(15,23,42,0.55)' },
  sortBtnTextActive: { color: '#2563eb' },

  // Cards
  card:        { borderRadius: 30, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  cardContent: { padding: 24 },
  cardHeader:  { marginBottom: 12 },
  name:        { fontSize: 20, fontWeight: '700', color: '#0f172a', flex: 1 },
  amount:      { fontSize: 32, fontWeight: '700', color: '#10b981', marginTop: 6 },
  amountLabel: { fontSize: 11, color: 'rgba(15,23,42,0.45)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2, marginBottom: 4 },

  duePill:     { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  duePillText: { fontSize: 13, lineHeight: 18 },

  typeBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },

  details:    { gap: 10, marginBottom: 16 },
  detailRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel:{ fontSize: 14, color: 'rgba(15,23,42,0.6)' },
  detailValue:{ fontSize: 15, fontWeight: '600', color: '#0f172a' },

  startDateContainer: { paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  startDateLabel:     { fontSize: 12, color: 'rgba(15,23,42,0.4)', marginBottom: 12 },

  actionRow:     { flexDirection: 'row', gap: 10 },
  editBtn:       { flex: 1, backgroundColor: 'rgba(37,99,235,0.08)', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(37,99,235,0.2)' },
  editBtnText:   { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  deleteBtn:     { flex: 1, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },

  emptyCard:    { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  emptyContent: { padding: 48, alignItems: 'center' },
  emptyText:    { fontSize: 20, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: 'rgba(15,23,42,0.6)', textAlign: 'center' },
});

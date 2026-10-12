import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Card,
  Chip,
  colors,
  Divider,
  EmptyState,
  Gap,
  HeaderAction,
  IconBadge,
  kindColors,
  Pill,
  PressableScale,
  Screen,
  ScreenHeader,
  SectionHeader,
  space,
  StatRow,
  StatTile,
  type,
} from '../components/ui/kit';
import { getNextPremiumDate } from '../utils/emiCalculator';
import { daysFromToday, formatDateShort, formatINR, formatINRCompact, formatRelativeDays } from '../utils/format';
import { deleteInsurance, getInsurances } from '../utils/storage';

// ── Sort options ──────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { id: 'nextDue',     label: 'Due soon',       icon: 'calendar-outline' },
  { id: 'premiumDesc', label: 'Highest premium', icon: 'arrow-down-outline' },
  { id: 'premiumAsc',  label: 'Lowest premium',  icon: 'arrow-up-outline' },
  { id: 'annualDesc',  label: 'Highest yearly',  icon: 'trending-up-outline' },
  { id: 'annualAsc',   label: 'Lowest yearly',   icon: 'trending-down-outline' },
  { id: 'name',        label: 'Name A–Z',        icon: 'text-outline' },
];

const INS_TYPE_LABEL = {
  life: 'Life',
  health: 'Health',
  vehicle: 'Vehicle',
  property: 'Property',
  other: 'Other',
};

const FREQUENCY_LABEL = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'half-yearly': 'Half-yearly',
  yearly: 'Yearly',
};

const frequencyLabel = (f) =>
  FREQUENCY_LABEL[f] || (f ? f.charAt(0).toUpperCase() + f.slice(1) : 'Yearly');

/** Tone for the "next premium" pill, so urgency is shown with text and colour. */
const dueTone = (days) => {
  if (days <= 7) return { text: colors.danger, soft: colors.dangerSoft };
  if (days <= 30) return { text: colors.warning, soft: colors.warningSoft };
  return { text: colors.info, soft: colors.infoSoft };
};

export default function Insurances() {
  const router = useRouter();
  const [insurances, setInsurances] = useState([]);
  const [sortId, setSortId]         = useState('nextDue');
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded]         = useState(false);

  const loadInsurances = useCallback(async () => {
    try {
      const data = await getInsurances();
      setInsurances(data);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Runs on first focus too, so no separate mount effect is needed.
  useFocusEffect(
    useCallback(() => {
      loadInsurances();
    }, [loadInsurances]),
  );

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

  const openEdit = (ins) =>
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
    });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getNextDueDate = (ins) =>
    getNextPremiumDate(ins.startDate, ins.frequency) || new Date(9999, 0);

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

  // Soonest upcoming premium across all policies (independent of the chosen sort).
  const nextUp = insurances
    .map((ins) => ({ ins, date: getNextDueDate(ins) }))
    .filter((x) => x.date.getFullYear() !== 9999)
    .sort((a, b) => a.date - b.date)[0];
  const nextUpDays = nextUp ? daysFromToday(nextUp.date) : 0;
  const nextUpTone = dueTone(nextUpDays);

  const subtitle =
    insurances.length > 0
      ? `${insurances.length} polic${insurances.length === 1 ? 'y' : 'ies'} · ${formatINRCompact(totalAnnual)} a year`
      : undefined;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader
        title="Insurance"
        subtitle={subtitle}
        back
        actions={
          <HeaderAction
            icon="add"
            label="Add insurance policy"
            variant="primary"
            onPress={() => router.push('/add-insurance')}
          />
        }
      />

      {!loaded ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryFill} />
        </View>
      ) : insurances.length === 0 ? (
        <Card>
          <EmptyState
            icon="shield-checkmark-outline"
            title="No policies yet"
            message="Add your life, health or vehicle policies to get reminded before each premium is due."
            actionLabel="Add policy"
            onAction={() => router.push('/add-insurance')}
          />
        </Card>
      ) : (
        <>
          {/* Summary */}
          <Card>
            <StatRow>
              <StatTile
                label="Policies"
                value={String(insurances.length)}
                caption="active"
              />
              <StatTile
                label="Yearly premium"
                value={formatINRCompact(totalAnnual)}
                caption={`≈ ${formatINRCompact(totalAnnual / 12)} / month`}
              />
            </StatRow>
            {nextUp ? (
              <>
                <Divider style={styles.summaryDivider} />
                <View
                  style={styles.nextRow}
                  accessible
                  accessibilityLabel={`Next premium: ${nextUp.ins.name}, ${formatINR(nextUp.ins.premiumAmount)}, ${formatDateShort(nextUp.date)}, ${formatRelativeDays(nextUpDays)}`}
                >
                  <View style={styles.nextText}>
                    <Text style={styles.nextLabel}>Next premium</Text>
                    <Text style={styles.nextTitle} numberOfLines={1}>
                      {nextUp.ins.name}
                    </Text>
                    <Text style={styles.nextMeta} numberOfLines={1}>
                      {formatINR(nextUp.ins.premiumAmount)} · {formatDateShort(nextUp.date)}
                    </Text>
                  </View>
                  <Pill
                    label={formatRelativeDays(nextUpDays)}
                    icon="time-outline"
                    color={nextUpTone.text}
                    backgroundColor={nextUpTone.soft}
                    style={styles.nextPill}
                  />
                </View>
              </>
            ) : null}
          </Card>

          <Gap />

          {/* Sort */}
          {insurances.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
              style={styles.sortScroll}
            >
              {SORT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.id}
                  label={opt.label}
                  icon={opt.icon}
                  selected={sortId === opt.id}
                  onPress={() => setSortId(opt.id)}
                />
              ))}
            </ScrollView>
          ) : null}

          <SectionHeader title="Policies" count={sorted.length} />
          <Card padded={false}>
            {sorted.map((ins, i) => (
              <PolicyRow
                key={ins.id}
                ins={ins}
                nextDue={getNextDueDate(ins)}
                annual={getAnnualPremium(ins)}
                first={i === 0}
                onPress={() => openEdit(ins)}
                onLongPress={() => handleDelete(ins.id, ins.name)}
              />
            ))}
          </Card>
          <Text style={styles.footnote}>Tap a policy to edit it. Press and hold to delete.</Text>
        </>
      )}
    </Screen>
  );
}

function PolicyRow({ ins, nextDue, annual, first, onPress, onLongPress }) {
  const kind = kindColors.insurance;
  const hasDate = nextDue.getFullYear() !== 9999;
  const days = hasDate ? daysFromToday(nextDue) : 0;
  const tone = dueTone(days);
  const freq = frequencyLabel(ins.frequency);
  const typeLabel = ins.insuranceType ? INS_TYPE_LABEL[ins.insuranceType] || 'Other' : null;
  const meta = [
    `${freq} · ${formatINR(ins.premiumAmount)}`,
    ins.frequency !== 'yearly' ? `${formatINRCompact(annual)}/yr` : null,
    typeLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, !first && styles.rowDivider]}
      accessibilityLabel={`${ins.name}. ${meta}. ${
        hasDate ? `Next premium ${formatDateShort(nextDue)}, ${formatRelativeDays(days)}` : 'No due date'
      }`}
      accessibilityHint="Opens the policy to edit. Press and hold to delete."
    >
      <IconBadge name={kind.icon} color={kind.text} backgroundColor={kind.soft} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {ins.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.rowTrail}>
        <Text style={styles.rowDate} numberOfLines={1}>
          {hasDate ? formatDateShort(nextDue) : '—'}
        </Text>
        {hasDate ? (
          <Pill label={formatRelativeDays(days)} color={tone.text} backgroundColor={tone.soft} />
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: space.xxxl * 2,
    alignItems: 'center',
  },
  summaryDivider: {
    marginVertical: space.md + 2,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  nextText: {
    flex: 1,
    minWidth: 0,
  },
  nextLabel: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textMuted,
  },
  nextTitle: {
    ...type.body,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  nextMeta: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 1,
  },
  nextPill: {
    alignSelf: 'center',
  },
  sortScroll: {
    marginHorizontal: -space.lg,
    marginBottom: space.xl,
  },
  sortRow: {
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 68,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...type.body,
    fontWeight: '700',
    color: colors.text,
  },
  rowMeta: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
  rowTrail: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowDate: {
    ...type.amountSmall,
    color: colors.text,
  },
  footnote: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: space.md,
  },
});

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  colors,
  EmptyState,
  Field,
  Gap,
  HeaderAction,
  IconBadge,
  ListRow,
  Pill,
  Screen,
  ScreenHeader,
  Segmented,
  space,
  StatRow,
  StatTile,
  type,
} from '../components/ui/kit';
import { countsTowardBalance, parseLocalDate, toLocalISOString } from '../utils/emiCalculator';
import { formatDateWithDay, formatINR, formatINRCompact, formatMonthYear } from '../utils/format';
import { addPayment, getLoans, getPayments } from '../utils/storage';

const PAYMENT_TYPES = [
  { key: 'prepayment', label: 'Prepayment' },
  { key: 'emi', label: 'Regular EMI' },
];

const PAYMENT_TYPE_HINT = {
  prepayment: 'Extra payment that reduces your principal.',
  emi: 'A regular EMI, recorded for history only. It does not change the balance.',
};

/** Display style per payment kind; untagged (older) payments fall back to "Payment". */
const KIND_META = {
  prepayment: { label: 'Prepayment', icon: 'trending-down-outline', text: colors.primary, soft: colors.primarySoft },
  emi: { label: 'EMI', icon: 'card-outline', text: colors.indigo, soft: colors.indigoSoft },
  settlement: { label: 'Settlement', icon: 'checkmark-done-outline', text: colors.violet, soft: colors.violetSoft },
};
const DEFAULT_KIND = { label: 'Payment', icon: 'cash-outline', text: colors.textSecondary, soft: colors.surfaceSunken };

/** Date-only strings ("2026-10-12") are read as local dates; full timestamps as-is. */
const toDisplayDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return parseLocalDate(value);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export default function History() {
  const [payments, setPayments] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loanNames, setLoanNames] = useState({});
  const [loanInfo, setLoanInfo] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    loanId: '',
    amount: '',
    date: toLocalISOString(new Date()),
    kind: 'prepayment',
  });

  const loadData = useCallback(async () => {
    try {
      const paymentsData = await getPayments();
      const loansData = await getLoans();
      setPayments(paymentsData.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)));
      setLoans(loansData.filter(l => l.status !== 'closed'));
      setLoanNames(Object.fromEntries(loansData.map(l => [l.id, l.loanName])));
      setLoanInfo(Object.fromEntries(loansData.map(l => [l.id, l])));
    } finally {
      setLoaded(true);
    }
  }, []);

  // Runs on first focus too, so no separate mount effect is needed.
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddPayment = async () => {
    const parseSafe = (val) => parseFloat(String(val || '0').replace(/,/g, ''));
    const amountVal = parseSafe(newPayment.amount);

    if (!newPayment.loanId || amountVal <= 0) {
      setErrors({
        loanId: newPayment.loanId ? undefined : 'Choose the loan this payment was for',
        amount: amountVal > 0 ? undefined : 'Enter an amount greater than ₹0',
      });
      return;
    }
    setErrors({});

    try {
      setSaving(true);
      const selectedLoan = loans.find(l => l.id === newPayment.loanId);
      await addPayment({
        ...newPayment,
        amount: amountVal,
        loanName: selectedLoan?.loanName || 'Unknown',
      });
      setShowAddPayment(false);
      setNewPayment({
        loanId: '',
        amount: '',
        date: toLocalISOString(new Date()),
        kind: 'prepayment',
      });
      await loadData();
      Alert.alert('Success', 'Payment recorded successfully');
    } catch (_error) {
      Alert.alert('Error', 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const toggleForm = () => {
    setErrors({});
    setShowAddPayment(!showAddPayment);
  };

  const getTotalPaid = () => {
    return payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
  };

  // Older payments have no kind; classify them the same way the loan calculator does.
  const kindOf = (p) => {
    if (p.kind) return p.kind;
    const loan = loanInfo[p.loanId];
    const isBullet = loan?.loanType === 'bullet';
    if (!countsTowardBalance(p, isBullet ? 'bullet' : 'emi', parseFloat(loan?.emiAmount) || 0)) return 'emi';
    return isBullet ? 'settlement' : 'prepayment';
  };

  const totalPrepaid = payments
    .filter((p) => kindOf(p) !== 'emi')
    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  // Group the (already newest-first) payments by calendar month.
  const groups = payments.reduce((acc, payment) => {
    const d = toDisplayDate(payment.paidAt);
    const key = d ? `${d.getFullYear()}-${d.getMonth()}` : 'unknown';
    let group = acc.find((g) => g.key === key);
    if (!group) {
      group = { key, title: d ? formatMonthYear(d) : 'Undated', total: 0, items: [] };
      acc.push(group);
    }
    group.items.push(payment);
    group.total += parseFloat(payment.amount || 0) || 0;
    return acc;
  }, []);

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader
        title="Payment history"
        subtitle="Prepayments and EMIs you've recorded"
        back
        actions={
          <HeaderAction
            icon={showAddPayment ? 'close' : 'add'}
            label={showAddPayment ? 'Cancel recording payment' : 'Record a payment'}
            variant={showAddPayment ? 'plain' : 'primary'}
            onPress={toggleForm}
          />
        }
      />

      {!loaded ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryFill} />
        </View>
      ) : (
        <>
          {/* Summary */}
          <Card>
            <StatRow>
              <StatTile label="Total paid" value={formatINRCompact(getTotalPaid())} caption="all payments" />
              <StatTile
                label="Prepaid"
                value={formatINRCompact(totalPrepaid)}
                caption="towards principal"
                tone={totalPrepaid > 0 ? 'positive' : 'default'}
              />
              <StatTile
                label="Payments"
                value={String(payments.length)}
                caption="recorded"
              />
            </StatRow>
          </Card>

          {/* Add Payment Form */}
          {showAddPayment ? (
            <>
              <Gap />
              <Card>
                <Text style={styles.formTitle} accessibilityRole="header">
                  Record payment
                </Text>

                <Text style={styles.label}>Loan</Text>
                {loans.length === 0 ? (
                  <Text style={styles.hint}>You have no active loans to record a payment against.</Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipScroll}
                    contentContainerStyle={styles.chipRow}
                  >
                    {loans.map((loan) => (
                      <Chip
                        key={loan.id}
                        label={loan.loanName}
                        selected={newPayment.loanId === loan.id}
                        onPress={() => setNewPayment((prev) => ({ ...prev, loanId: loan.id }))}
                      />
                    ))}
                  </ScrollView>
                )}
                {errors.loanId ? <Text style={styles.error}>{errors.loanId}</Text> : null}
                <View style={styles.spacer} />

                <Field
                  label="Amount"
                  prefix="₹"
                  placeholder="0"
                  keyboardType="numeric"
                  value={newPayment.amount}
                  onChangeText={(value) => setNewPayment((prev) => ({ ...prev, amount: value }))}
                  error={errors.amount}
                />

                <Text style={styles.label}>Payment type</Text>
                <Segmented
                  options={PAYMENT_TYPES}
                  value={newPayment.kind}
                  onChange={(kind) => setNewPayment((prev) => ({ ...prev, kind }))}
                />
                <Text style={styles.hint}>{PAYMENT_TYPE_HINT[newPayment.kind]}</Text>

                <View style={styles.formActions}>
                  <Button label="Cancel" variant="secondary" onPress={toggleForm} style={styles.flex} />
                  <Button
                    label="Save payment"
                    icon="checkmark"
                    onPress={handleAddPayment}
                    loading={saving}
                    disabled={loans.length === 0}
                    style={styles.flex}
                  />
                </View>
              </Card>
            </>
          ) : null}

          <Gap />

          {/* Payment List */}
          {payments.length === 0 ? (
            <Card>
              <EmptyState
                icon="receipt-outline"
                title="No payments recorded"
                message="Record prepayments to see how much principal you've cleared early."
                actionLabel={showAddPayment ? undefined : 'Record payment'}
                onAction={showAddPayment ? undefined : toggleForm}
              />
            </Card>
          ) : (
            groups.map((group, gi) => (
              <View key={group.key} style={gi > 0 ? styles.groupGap : null}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle} accessibilityRole="header">
                    {group.title}
                  </Text>
                  <Text style={styles.groupTotal}>{formatINR(group.total)}</Text>
                </View>
                <Card padded={false}>
                  {group.items.map((payment, i) => {
                    const meta = KIND_META[kindOf(payment)] || DEFAULT_KIND;
                    const date = toDisplayDate(payment.paidAt);
                    const name = loanNames[payment.loanId] || 'Loan';
                    return (
                      <ListRow
                        key={payment.id}
                        divider={i > 0}
                        leading={<IconBadge name={meta.icon} color={meta.text} backgroundColor={meta.soft} />}
                        title={name}
                        subtitle={date ? formatDateWithDay(date) : 'No date'}
                        value={formatINR(payment.amount)}
                        accessibilityLabel={`${name}, ${meta.label}, ${formatINR(payment.amount)}, ${
                          date ? formatDateWithDay(date) : 'no date'
                        }`}
                      >
                        <Pill label={meta.label} color={meta.text} backgroundColor={meta.soft} />
                      </ListRow>
                    );
                  })}
                </Card>
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: space.xxxl * 2,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  formTitle: {
    ...type.headline,
    color: colors.text,
    marginBottom: space.lg,
  },
  label: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.xs + 2,
  },
  chipScroll: {
    marginHorizontal: -space.lg,
  },
  chipRow: {
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  spacer: {
    height: space.lg,
  },
  hint: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: space.xs,
  },
  error: {
    ...type.caption,
    color: colors.danger,
    marginTop: space.xs,
  },
  formActions: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xl,
  },
  groupGap: {
    marginTop: space.xxl,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  groupTitle: {
    ...type.headline,
    color: colors.text,
  },
  groupTotal: {
    ...type.label,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

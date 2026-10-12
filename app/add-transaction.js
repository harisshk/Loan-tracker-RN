import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
  Clipboard,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveTransaction, getTransactions, updateTransaction, getBudgetLimit } from '../utils/transactions';
import { getLoans, addPayment } from '../utils/storage';
import { CATEGORIES, getCategoryIcon } from '../constants/categories';
import {
  Button,
  Card,
  Chip,
  colors,
  Field,
  HIT,
  PressableScale,
  radius,
  Screen,
  ScreenHeader,
  Segmented,
  space,
  type as typeScale,
} from '../components/ui/kit';

const TYPE_OPTIONS = [
  { key: 'debit', label: 'Expense' },
  { key: 'credit', label: 'Income' },
];

const MODE_OPTIONS = [
  { key: 'UPI', icon: 'phone-portrait-outline' },
  { key: 'Credit Card', icon: 'card-outline' },
  { key: 'Cash', icon: 'cash-outline' },
];

export default function AddTransaction() {
  const router = useRouter();
  const params = useLocalSearchParams();
  // Normalize timezone space characters back to plus signs in the transaction ID.
  // URL routers decode '+' timezone characters into spaces (e.g., +05:30 becomes ' 05:30').
  const transactionId = params.id ? String(params.id).replace(/ /g, '+') : '';

  const [amount, setAmount] = useState('');
  const [type, setType] = useState('debit'); // debit or credit
  const [category, setCategory] = useState('Other');
  // True once the category came from the user (or an explicit source) rather than the
  // 'Other' default. Without it, saveTransaction() treats a deliberate 'Other' pick as
  // "unset" and re-runs the keyword classifier, so "car wash" silently became Vehicle.
  const [categoryLocked, setCategoryLocked] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mode, setMode] = useState('UPI'); // UPI, Credit Card, or Cash
  const [loans, setLoans] = useState([]);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [calculateBudget, setCalculateBudget] = useState(true);
  const [amountError, setAmountError] = useState('');
  const [loanError, setLoanError] = useState('');
  const [saving, setSaving] = useState(false);
  // Guard so the form is only pre-filled once. useLocalSearchParams() returns a
  // fresh object every render, so without this the effect re-ran on every
  // keystroke and reset the fields back to their original values.
  const initializedRef = React.useRef(false);

  // Fetch loans for EMI classification on mount
  useEffect(() => {
    const fetchLoans = async () => {
      try {
        const loansData = await getLoans();
        setLoans(loansData.filter(l => l.status !== 'closed'));
      } catch (err) {
        console.warn('Failed to load loans:', err);
      }
    };
    fetchLoans();
  }, []);

  // Handle URL Deep Link Params and Edit Mode loading
  useEffect(() => {
    const initData = async () => {
      // Only ever pre-fill the form once (see initializedRef note above).
      if (initializedRef.current) return;

      if (transactionId) {
        const txs = await getTransactions();
        const existingTx = txs.find(t => String(t.id) === transactionId);
        if (existingTx) {
          initializedRef.current = true;
          setAmount(String(existingTx.amount ?? ''));
          // Normalize so the toggle/grid match exactly regardless of stored casing.
          const normalizedType =
            String(existingTx.type || 'debit').trim().toLowerCase() === 'credit' ? 'credit' : 'debit';
          setType(normalizedType);
          const normalizedCategory = CATEGORIES.find(
            (c) => c.toLowerCase() === String(existingTx.category || '').trim().toLowerCase()
          ) || 'Other';
          setCategory(normalizedCategory);
          setCategoryLocked(true);
          setDescription(existingTx.description || '');
          const normalizedMode = ['UPI', 'Credit Card', 'Cash'].find(
            (m) => m.toLowerCase() === String(existingTx.mode || '').trim().toLowerCase()
          ) || 'UPI';
          setMode(normalizedMode);
          if (existingTx.loanId) {
            setSelectedLoanId(existingTx.loanId);
          }
          if (existingTx.date) {
            setDate(new Date(existingTx.date));
          }
          setCalculateBudget(existingTx.calculate_budget !== false);
        } else {
          console.warn('Edit: transaction not found for id', transactionId);
        }
        // Edit mode: never fall through to deep-link prefill.
        return;
      }

      // Deep-link / shortcut create params (only lock in once we actually have some).
      if (params.amount || params.type || params.description || params.category || params.mode) {
        initializedRef.current = true;
      }

      if (params.amount) {
        setAmount(String(params.amount));
      }
      if (params.type && (params.type === 'credit' || params.type === 'debit')) {
        setType(params.type);
      }
      if (params.description) {
        setDescription(String(params.description));
      }
      if (params.category && CATEGORIES.includes(String(params.category))) {
        setCategory(String(params.category));
        setCategoryLocked(true);
      }
      if (params.mode && (String(params.mode) === 'UPI' || String(params.mode) === 'Credit Card' || String(params.mode) === 'Cash')) {
        setMode(String(params.mode));
      }
    };
    initData();
  }, [params]);

  const checkClipboard = async () => {
    try {
      const content = await Clipboard.getString();
      if (!content) return;

      // 1. Check if it's a JSON transaction object
      try {
        const parsed = JSON.parse(content);
        if (parsed.amount && (parsed.type === 'credit' || parsed.type === 'debit')) {
          Alert.alert(
            'Transaction Detected',
            `We found a transaction in your clipboard:\n${parsed.type.toUpperCase()}: ₹${parsed.amount}\nDo you want to auto-fill this?`,
            [
              { text: 'No' },
              {
                text: 'Auto-fill',
                onPress: () => {
                  setAmount(String(parsed.amount));
                  setType(parsed.type);
                  if (parsed.category && CATEGORIES.includes(parsed.category)) {
                    setCategory(parsed.category);
                    setCategoryLocked(true);
                  }
                  if (parsed.description) {
                    setDescription(parsed.description);
                  }
                },
              },
            ]
          );
          return;
        }
      } catch {
        // Not a JSON object, proceed to regex text parsing
      }

      // 2. Check for SMS transaction patterns (e.g., spent Rs 500, received INR 1000)
      const amountRegex = /(?:INR|Rs|Rs\.|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
      const amountMatch = content.match(amountRegex);

      if (amountMatch) {
        const detectedAmount = amountMatch[1].replace(/,/g, '');
        let detectedType = 'debit';
        if (/received|credited|refund|added/i.test(content)) {
          detectedType = 'credit';
        } else if (/spent|debited|paid|transfer|sent/i.test(content)) {
          detectedType = 'debit';
        }

        // Extract merchant/source
        let detectedDesc = '';
        const atRegex = /at\s+([A-Za-z0-9\s]+?)\s+(?:on|using|ref|bal)/i;
        const atMatch = content.match(atRegex);
        if (atMatch) {
          detectedDesc = atMatch[1].trim();
        } else {
          // Fallback, search for standard short description phrases
          detectedDesc = content.substring(0, 30) + '...';
        }

        Alert.alert(
          'Clipboard Text Found',
          `Detected transaction text:\nAmount: ₹${detectedAmount}\nType: ${detectedType.toUpperCase()}\nDo you want to auto-fill this?`,
          [
            { text: 'No' },
            {
              text: 'Auto-fill',
              onPress: () => {
                setAmount(detectedAmount);
                setType(detectedType);
                setDescription(detectedDesc);
                if (detectedType === 'debit') {
                  setCategory('Shopping');
                } else {
                  setCategory('Salary');
                }
                setCategoryLocked(true);
              },
            },
          ]
        );
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  // Clipboard Scanner (only if not editing)
  useEffect(() => {
    if (!transactionId) {
      checkClipboard();
    }
  }, [transactionId]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setAmountError('Enter an amount greater than zero.');
      return;
    }

    if (category === 'EMI' && loans.length > 0 && !selectedLoanId) {
      setLoanError('Choose the loan this EMI was paid towards.');
      return;
    }

    try {
      if (type === 'debit' && !transactionId) {
        try {
          const txs = await getTransactions();
          const budgetLimit = await getBudgetLimit();

          // Compare against the month the expense belongs to (it may be backdated).
          const now = date;
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();

          const existingDebits = txs.filter((t) => {
            const d = new Date(t.date);
            return (t.type || '').toLowerCase() !== 'credit' &&
              t.category !== 'Credit Card Bill' &&
              t.calculate_budget !== false &&
              d.getMonth() === currentMonth && d.getFullYear() === currentYear;
          }).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

          const newTotal = existingDebits + amt;
          const pct = (newTotal / budgetLimit) * 100;

          if (pct >= 90) {
            const warningTitle = pct >= 100 ? 'Budget exceeded' : 'Budget warning';
            const warningMessage = pct >= 100
              ? `This transaction brings your monthly spending to ₹${newTotal.toLocaleString('en-IN')}, which exceeds your monthly budget limit of ₹${budgetLimit.toLocaleString('en-IN')}!`
              : `This transaction brings your monthly spending to ₹${newTotal.toLocaleString('en-IN')} (${Math.round(pct)}% of your monthly budget limit).`;

            const shouldProceed = await new Promise((resolve) => {
              Alert.alert(
                warningTitle,
                warningMessage + "\n\nDo you want to proceed with saving this transaction?",
                [
                  { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Proceed', onPress: () => resolve(true) }
                ]
              );
            });

            if (!shouldProceed) {
              return;
            }
          }
        } catch (budgetErr) {
          console.warn("Budget check failed:", budgetErr);
        }
      }

      const selectedLoan = loans.find(l => l.id === selectedLoanId);
      const txData = {
        amount: amt,
        type,
        category,
        description: description || `${type === 'credit' ? 'Inflow' : 'Outflow'} - ${category}`,
        date: date.toISOString(),
        mode,
        calculate_budget: calculateBudget,
        categoryLocked,
        loanId: category === 'EMI' ? selectedLoanId : undefined,
        loanName: (category === 'EMI' && selectedLoan) ? selectedLoan.loanName : undefined,
      };

      if (transactionId) {
        await updateTransaction({
          id: transactionId,
          ...txData,
        });
      } else {
        await saveTransaction({
          ...txData,
          source: params.amount ? 'shortcut' : 'manual',
        });

        // Record payment in loan history
        if (category === 'EMI' && selectedLoanId && selectedLoan) {
          await addPayment({
            loanId: selectedLoanId,
            loanName: selectedLoan.loanName,
            amount: amt.toString(),
            date: date.toISOString().split('T')[0],
            note: description || `EMI Payment via Spend Tracker`,
            kind: 'emi',
          });
        }
      }
      // Go back to the existing list (preserves scroll position) instead of
      // replacing it with a fresh screen that resets to the top. The list's
      // focus effect refreshes the data so the edit shows up.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/spend-tracker');
      }
    } catch {
      Alert.alert('Error', 'Failed to save transaction');
    }
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await handleSave();
    } finally {
      setSaving(false);
    }
  };

  const onChangeType = (next) => {
    if (next === 'credit') {
      setType('credit');
      if (category === 'EMI') {
        setCategory('Other');
      }
    } else {
      setType('debit');
    }
  };

  const isEdit = !!params.id;
  const isCredit = type === 'credit';
  const dateLabel = date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <Screen
        footer={
          <Button
            label={isEdit ? 'Save changes' : 'Save'}
            icon="checkmark"
            onPress={onSave}
            loading={saving}
          />
        }
      >
        <ScreenHeader
          back
          title={isEdit ? 'Edit transaction' : 'New transaction'}
          subtitle={isEdit ? undefined : 'Log a spend or money you received'}
        />

        <Segmented options={TYPE_OPTIONS} value={type} onChange={onChangeType} />

        {/* Amount */}
        <Card style={[styles.amountCard, !!amountError && styles.amountCardError]}>
          <Text style={styles.label}>{isCredit ? 'Amount received' : 'Amount spent'}</Text>
          <View style={styles.amountRow}>
            <Text style={[styles.currency, isCredit && { color: colors.primary }]}>₹</Text>
            <TextInput
              style={[styles.amountInput, isCredit && { color: colors.primary }]}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(v) => {
                setAmount(v);
                if (amountError) setAmountError('');
              }}
              accessibilityLabel={isCredit ? 'Amount received in rupees' : 'Amount spent in rupees'}
            />
          </View>
          {amountError ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {amountError}
            </Text>
          ) : null}
        </Card>

        <View style={styles.section}>
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Amazon, Salary, Starbucks"
            multiline
            hint="Leave blank to use the category name."
          />
        </View>

        {/* Category */}
        <Text style={styles.sectionLabel}>Category</Text>
        <View style={styles.chipGrid}>
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              icon={getCategoryIcon(cat).name}
              selected={category === cat}
              onPress={() => {
                setCategory(cat);
                setCategoryLocked(true);
                if (loanError) setLoanError('');
              }}
            />
          ))}
        </View>

        {/* Loan picker (only when category is EMI) */}
        {category === 'EMI' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Loan</Text>
            {loans.length > 0 ? (
              <>
                <View style={styles.chipGrid}>
                  {loans.map((loan) => (
                    <Chip
                      key={loan.id}
                      label={loan.loanName}
                      icon="wallet-outline"
                      selected={selectedLoanId === loan.id}
                      onPress={() => {
                        setSelectedLoanId(loan.id);
                        if (loanError) setLoanError('');
                      }}
                    />
                  ))}
                </View>
                {loanError ? (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {loanError}
                  </Text>
                ) : (
                  <Text style={styles.hint}>
                    {transactionId
                      ? 'The EMI stays linked to this loan.'
                      : 'Saving also records this EMI in the loan’s payment history.'}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.hint}>No active loans to link this EMI to.</Text>
            )}
          </View>
        ) : null}

        {/* Payment method (spends only) */}
        {!isCredit ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Paid with</Text>
            <View style={styles.chipGrid}>
              {MODE_OPTIONS.map((m) => (
                <Chip
                  key={m.key}
                  label={m.key}
                  icon={m.icon}
                  selected={mode === m.key}
                  onPress={() => setMode(m.key)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Date + budget */}
        <Card padded={false} style={styles.detailsCard}>
          <PressableScale
            onPress={() => setShowDatePicker((v) => !v)}
            style={styles.detailRow}
            accessibilityLabel={`Date: ${dateLabel}`}
            accessibilityHint="Changes the transaction date"
            accessibilityState={{ expanded: showDatePicker }}
          >
            <View style={styles.detailIcon}>
              <Ionicons name="calendar-outline" size={18} color={colors.indigo} />
            </View>
            <View style={styles.detailText}>
              <Text style={styles.detailTitle}>Date</Text>
              <Text style={styles.detailSub}>{dateLabel}</Text>
            </View>
            <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </PressableScale>
          {showDatePicker && (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, selected) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selected) setDate(selected);
                }}
                maximumDate={new Date()}
              />
            </View>
          )}
          <View style={[styles.detailRow, styles.detailDivider]}>
            <View style={styles.detailIcon}>
              <Ionicons name="pie-chart-outline" size={18} color={colors.indigo} />
            </View>
            <View style={styles.detailText}>
              <Text style={styles.detailTitle}>Count in budget</Text>
              <Text style={styles.detailSub}>Include in monthly budget limits and stats.</Text>
            </View>
            <Switch
              trackColor={{ false: colors.surfaceSunken, true: colors.primaryFill }}
              thumbColor={colors.surface}
              ios_backgroundColor={colors.surfaceSunken}
              onValueChange={setCalculateBudget}
              value={calculateBudget}
              accessibilityLabel="Count in budget"
            />
          </View>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  section: { marginTop: space.xl },
  amountCard: { marginTop: space.lg, marginBottom: space.sm },
  amountCardError: { borderWidth: 1, borderColor: colors.dangerFill },
  label: { ...typeScale.label, color: colors.textSecondary },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  currency: { ...typeScale.display, color: colors.textMuted },
  amountInput: {
    flex: 1,
    ...typeScale.display,
    color: colors.text,
    paddingVertical: space.xs,
    minHeight: HIT,
  },
  error: { ...typeScale.caption, color: colors.danger, marginTop: space.sm },
  hint: { ...typeScale.caption, fontWeight: '500', color: colors.textSecondary, marginTop: space.sm },
  sectionLabel: { ...typeScale.label, color: colors.textSecondary, marginBottom: space.sm },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  detailsCard: { marginTop: space.xxl, overflow: 'hidden' },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
  },
  detailDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.indigoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailText: { flex: 1, minWidth: 0 },
  detailTitle: { ...typeScale.body, fontWeight: '700', color: colors.text },
  detailSub: { ...typeScale.caption, fontWeight: '500', color: colors.textMuted, marginTop: 2 },
  pickerWrap: { paddingHorizontal: space.sm, paddingBottom: space.sm },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Clipboard,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveTransaction, getTransactions, updateTransaction, getBudgetLimit } from '../utils/transactions';
import { getLoans, addPayment } from '../utils/storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CATEGORIES = ['Salary', 'Food', 'Grocery', 'Shopping', 'EMI', 'Bills', 'Investment', 'Entertainment', 'Travel', 'Credit Card Bill', 'Fruits & Vegetables', 'Electronics', 'Milk & Dairy', 'Rent & Housing', 'Health & Medical', 'Insurance', 'Education', 'Gifts & Donations', 'Other'];

export default function AddTransaction() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [amount, setAmount] = useState('');
  const [type, setType] = useState('debit'); // debit or credit
  const [category, setCategory] = useState('Other');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mode, setMode] = useState('UPI'); // UPI, Credit Card, or Cash
  const [loans, setLoans] = useState([]);
  const [selectedLoanId, setSelectedLoanId] = useState('');
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

      if (params.id) {
        const txs = await getTransactions();
        const existingTx = txs.find(t => String(t.id) === String(params.id));
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
        } else {
          console.warn('Edit: transaction not found for id', params.id);
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
      }
      if (params.mode && (String(params.mode) === 'UPI' || String(params.mode) === 'Credit Card' || String(params.mode) === 'Cash')) {
        setMode(String(params.mode));
      }
    };
    initData();
  }, [params]);

  // Clipboard Scanner (only if not editing)
  useEffect(() => {
    if (!params.id) {
      checkClipboard();
    }
  }, [params.id]);

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
      } catch (e) {
        // Not a JSON object, proceed to regex text parsing
      }

      // 2. Check for SMS transaction patterns (e.g., spent Rs 500, received INR 1000)
      const amountRegex = /(?:INR|Rs|Rs\.|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
      const amountMatch = content.match(amountRegex);
      
      if (amountMatch) {
        const detectedAmount = amountMatch[1].replace(/,/g, '');
        const isDebit = /spent|debited|paid|transfer/i.test(content);
        const isCredit = /received|credited|refund/i.test(content);
        
        let detectedType = 'debit';
        if (isCredit && !isDebit) detectedType = 'credit';

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
              },
            },
          ]
        );
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    if (category === 'EMI' && loans.length > 0 && !selectedLoanId) {
      Alert.alert('Error', 'Please select a loan/debt for this EMI payment.');
      return;
    }

    try {
      if (type === 'debit' && !params.id) {
        try {
          const txs = await getTransactions();
          const budgetLimit = await getBudgetLimit();
          
          const now = new Date();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          
          const existingDebits = txs.filter((t) => {
            const d = new Date(t.date);
            return (t.type || '').toLowerCase() !== 'credit' &&
              t.category !== 'Credit Card Bill' &&
              d.getMonth() === currentMonth && d.getFullYear() === currentYear;
          }).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
          
          const newTotal = existingDebits + amt;
          const pct = (newTotal / budgetLimit) * 100;
          
          if (pct >= 90) {
            const warningTitle = pct >= 100 ? "🚨 Budget Exceeded" : "⚠️ Budget Warning";
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
        loanId: category === 'EMI' ? selectedLoanId : undefined,
        loanName: (category === 'EMI' && selectedLoan) ? selectedLoan.loanName : undefined,
      };

      if (params.id) {
        await updateTransaction({
          id: params.id,
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
            note: description || `EMI Payment via Spend Tracker`
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
    } catch (e) {
      Alert.alert('Error', 'Failed to save transaction');
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Math.max(insets.top, 20) + 10 }
          ]}
          keyboardShouldPersistTaps="handled"
        >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{params.id ? 'Edit Transaction' : 'New Transaction'}</Text>
        </View>

        {/* Amount Input Card */}
        <BlurView intensity={30} tint="light" style={styles.card}>
          <Text style={styles.label}>TRANSACTION AMOUNT</Text>
          <View style={styles.amountInputRow}>
            <Text style={styles.currencySymbol}>₹</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
          </View>
        </BlurView>

        {/* Details Form Card */}
        <BlurView intensity={30} tint="light" style={[styles.card, { marginTop: 20 }]}>
          {/* Type Toggle */}
          <Text style={styles.label}>TRANSACTION TYPE</Text>
          <View style={styles.typeContainer}>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'debit' && styles.typeBtnActiveDeb]}
              onPress={() => setType('debit')}
            >
              <Ionicons name="arrow-up" size={16} color={type === 'debit' ? '#fff' : '#ef4444'} />
              <Text style={[styles.typeBtnText, type === 'debit' && styles.typeBtnTextActive]}>Debit (Spent)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'credit' && styles.typeBtnActiveCred]}
              onPress={() => setType('credit')}
            >
              <Ionicons name="arrow-down" size={16} color={type === 'credit' ? '#fff' : '#10b981'} />
              <Text style={[styles.typeBtnText, type === 'credit' && styles.typeBtnTextActive]}>Credit (Received)</Text>
            </TouchableOpacity>
          </View>

          {/* Payment Method Selector */}
          {type === 'debit' && (
            <>
              <Text style={[styles.label, { marginTop: 20 }]}>PAYMENT METHOD</Text>
              <View style={styles.typeContainer}>
                <TouchableOpacity
                  style={[styles.typeBtn, mode === 'UPI' && styles.typeBtnActiveUPI]}
                  onPress={() => setMode('UPI')}
                >
                  <Ionicons name="phone-portrait-outline" size={16} color={mode === 'UPI' ? '#fff' : '#6366f1'} />
                  <Text style={[styles.typeBtnText, mode === 'UPI' && styles.typeBtnTextActive]}>UPI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, mode === 'Credit Card' && styles.typeBtnActiveCard]}
                  onPress={() => setMode('Credit Card')}
                >
                  <Ionicons name="card-outline" size={16} color={mode === 'Credit Card' ? '#fff' : '#ec4899'} />
                  <Text style={[styles.typeBtnText, mode === 'Credit Card' && styles.typeBtnTextActive]}>Credit Card</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, mode === 'Cash' && styles.typeBtnActiveCash]}
                  onPress={() => setMode('Cash')}
                >
                  <Ionicons name="cash-outline" size={16} color={mode === 'Cash' ? '#fff' : '#fb923c'} />
                  <Text style={[styles.typeBtnText, mode === 'Cash' && styles.typeBtnTextActive]}>Cash</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Description */}
          <Text style={[styles.label, { marginTop: 20 }]}>MERCHANT / DESCRIPTION</Text>
          <TextInput
            style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
            placeholder="e.g. Amazon, Salary, Starbucks"
            placeholderTextColor="#94a3b8"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />

          {/* Category Selector */}
          <Text style={[styles.label, { marginTop: 20 }]}>CATEGORY</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryBtn, category === cat && styles.categoryBtnActive]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Select Loan/Debt (only when category is EMI) */}
          {category === 'EMI' && loans.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: 20 }]}>SELECT LOAN / DEBT *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <View style={styles.loanSelector}>
                  {loans.map((loan) => (
                    <TouchableOpacity
                      key={loan.id}
                      style={[
                        styles.loanOption,
                        selectedLoanId === loan.id && styles.loanOptionSelected,
                      ]}
                      onPress={() => setSelectedLoanId(loan.id)}
                    >
                      <Text
                        style={[
                          styles.loanOptionText,
                          selectedLoanId === loan.id && styles.loanOptionTextSelected,
                        ]}
                      >
                        {loan.loanName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          {/* Date Selector */}
          <Text style={[styles.label, { marginTop: 20 }]}>DATE</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={18} color="#6366f1" />
            <Text style={styles.dateBtnText}>
              {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
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
          )}
        </BlurView>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>{params.id ? 'Save Changes' : 'Save Transaction'}</Text>
        </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { marginRight: 16 },
  backText: { color: '#64748b', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  card: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', overflow: 'hidden' },
  label: { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 1, marginBottom: 10 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center' },
  currencySymbol: { fontSize: 40, fontWeight: '800', color: '#0f172a', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 40, fontWeight: '800', color: '#0f172a', padding: 0 },
  typeContainer: { flexDirection: 'row', gap: 10 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderParent: 1, borderColor: 'rgba(0,0,0,0.05)' },
  typeBtnActiveDeb: { backgroundColor: '#e11d48' },
  typeBtnActiveCred: { backgroundColor: '#10b981' },
  typeBtnActiveUPI: { backgroundColor: '#6366f1' },
  typeBtnActiveCard: { backgroundColor: '#ec4899' },
  typeBtnActiveCash: { backgroundColor: '#fb923c' },
  typeBtnText: { fontSize: 13, fontWeight: '700', color: '#334155', marginLeft: 6 },
  typeBtnTextActive: { color: '#fff' },
  input: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 14, padding: 14, fontSize: 15, color: '#0f172a', borderParent: 1, borderColor: 'rgba(0,0,0,0.05)' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.6)', borderParent: 1, borderColor: 'rgba(0,0,0,0.05)' },
  categoryBtnActive: { backgroundColor: '#0f172a' },
  categoryText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  categoryTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#10b981', borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 30, shadowColor: '#10b981', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 14, padding: 14, gap: 10 },
  dateBtnText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  loanSelector: { flexDirection: 'row', gap: 8 },
  loanOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  loanOptionSelected: { backgroundColor: '#10b981', borderColor: '#10b981' },
  loanOptionText: { fontSize: 13, fontWeight: '600', color: 'rgba(15,23,42,0.6)' },
  loanOptionTextSelected: { color: '#ffffff' },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addPayment, updateLoan, saveLoan } from '../utils/storage';

export default function RenewLoan() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const action = params.action; // 'renew' or 'close'

  // Common State
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Close State
  const closingPayment = parseFloat(params.remainingAmount || 0);

  // Renew State
  const remainingInterest = parseFloat(params.remainingInterest || 0);
  const oldPrincipal = parseFloat(params.oldPrincipal || 0);

  const [formData, setFormData] = useState({
    newPrincipal: params.oldPrincipal || '',
    newInterest: params.oldInterestRate || '',
    newTenure: '12',
    startDate: params.oldMaturity || new Date().toISOString().split('T')[0],
  });
  
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [newStartDate, setNewStartDate] = useState(new Date(params.oldMaturity || Date.now()));

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const onDateChange = (event, date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setPaymentDate(date);
    }
  };

  const onNewStartDateChange = (event, date) => {
    setShowStartDatePicker(Platform.OS === 'ios');
    if (date) {
      setNewStartDate(date);
      setFormData(prev => ({ ...prev, startDate: date.toISOString().split('T')[0] }));
    }
  };

  const formatDisplayDate = (date) => {
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const handleClose = async () => {
    if (closingPayment <= 0) {
      Alert.alert('Error', 'Remaining amount is invalid.');
      return;
    }

    try {
      // Log the full payment to close out the loan
      await addPayment({
        loanId: params.id,
        loanName: params.loanName,
        amount: closingPayment.toString(),
        date: paymentDate.toISOString().split('T')[0],
      });

      // Mark the old loan as closed
      await updateLoan(params.id, { status: 'closed' });

      Alert.alert('Success', 'Loan closed successfully!', [
        { text: 'OK', onPress: () => router.replace('/loans') },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to close the loan.');
    }
  };

  const handleRenew = async () => {
    const p = parseFloat(formData.newPrincipal);
    const i = parseFloat(formData.newInterest);
    const t = parseInt(formData.newTenure);

    if (!p || p <= 0) return Alert.alert('Error', 'Enter a valid principal.');
    if (i < 0 || isNaN(i)) return Alert.alert('Error', 'Enter a valid interest rate.');
    if (!t || t <= 0) return Alert.alert('Error', 'Enter a valid tenure.');

    try {
      // 1. Calculate the payment required on the old loan.
      // At minimum, they must pay all outstanding interest to renew.
      // Additionally, if they reduced the principal, they pay the difference.
      let paymentToOldLoan = remainingInterest;
      if (p < oldPrincipal) {
        paymentToOldLoan += (oldPrincipal - p);
      }
      
      // We will record the payment that perfectly clears the old loan so it can be closed.
      // To keep history clean, we formally clear the total old principal + interest.
      // Actually, since emiCalculator relies on `totalExtraPaid` to calculate how much is paid,
      // and we are marking it closed, we need to inject the full payment of old loan so history shows it fully settled.
      const fullSettlementAmount = remainingInterest + oldPrincipal;

      await addPayment({
        loanId: params.id,
        loanName: params.loanName,
        amount: fullSettlementAmount.toString(),
        date: paymentDate.toISOString().split('T')[0],
        note: 'Automatic settlement on renewal/rollover'
      });

      // 2. Close old loan
      await updateLoan(params.id, { status: 'closed' });

      // 3. Create the new loan
      const newLoanName = params.loanName.endsWith('(Renewed)') 
        ? params.loanName 
        : `${params.loanName} (Renewed)`;

      await saveLoan({
        loanName: newLoanName,
        principal: p.toString(),
        interest: i.toString(),
        tenure: t.toString(),
        emiAmount: '0', 
        startDate: formData.startDate,
        loanType: 'bullet',
        status: 'active'
      });

      Alert.alert('Success', 'Loan renewed successfully!', [
        { text: 'OK', onPress: () => router.replace('/loans') },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to renew the loan.');
    }
  };

  const isRenew = action === 'renew';

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{isRenew ? 'Renew Loan' : 'Close Loan'}</Text>
            <Text style={styles.headerSubtitle}>{params.loanName}</Text>
          </View>

          <BlurView intensity={20} tint="light" style={styles.formCard}>
            <View style={styles.formContent}>
              {isRenew ? (
                <>
                  <Text style={styles.infoText}>
                    You must clear your outstanding interest to renew. This will generate a new gold loan for the next term.
                  </Text>
                  
                  <View style={styles.disabledBox}>
                    <Text style={styles.label}>Outstanding Interest Paid Today</Text>
                    <Text style={styles.disabledValue}>{formatCurrency(remainingInterest)}</Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Settlement Date</Text>
                    <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                      <Text style={styles.dateButtonText}>📅 {formatDisplayDate(paymentDate)}</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.divider} />
                  <Text style={styles.sectionTitle}>New Loan Details</Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>New Principal (₹)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={formData.newPrincipal}
                      onChangeText={(val) => handleInputChange('newPrincipal', val)}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>New Interest Rate (%)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={formData.newInterest}
                      onChangeText={(val) => handleInputChange('newInterest', val)}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>New Tenure (months)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={formData.newTenure}
                      onChangeText={(val) => handleInputChange('newTenure', val)}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>New Loan Start Date</Text>
                    <TouchableOpacity style={styles.dateButton} onPress={() => setShowStartDatePicker(true)}>
                      <Text style={styles.dateButtonText}>📅 {formatDisplayDate(newStartDate)}</Text>
                    </TouchableOpacity>
                  </View>

                </>
              ) : (
                <>
                  <Text style={styles.infoText}>
                    You are closing this Bullet Loan by paying off the full Principal and Interest.
                  </Text>
                  <View style={styles.disabledBox}>
                    <Text style={styles.label}>Total Settlement Amount</Text>
                    <Text style={[styles.disabledValue, { color: '#e11d48' }]}>
                      {formatCurrency(closingPayment)}
                    </Text>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Date of Closure</Text>
                    <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                      <Text style={styles.dateButtonText}>📅 {formatDisplayDate(paymentDate)}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </BlurView>

          {showDatePicker && (
            <DateTimePicker
              value={paymentDate} mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onDateChange}
            />
          )}

          {showStartDatePicker && (
            <DateTimePicker
              value={newStartDate} mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onNewStartDateChange}
            />
          )}

          <TouchableOpacity style={isRenew ? styles.saveButton : styles.closeButton} onPress={isRenew ? handleRenew : handleClose}>
            <BlurView intensity={25} tint="light" style={styles.saveBlur}>
              <Text style={[styles.saveButtonText, !isRenew && { color: '#ffffff' }]}>
                {isRenew ? 'Confirm Renewal' : 'Confirm Closure'}
              </Text>
            </BlurView>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  backButton: { fontSize: 16, fontWeight: '600', color: '#10b981', marginBottom: 12 },
  headerTitle: { fontSize: 34, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 16, color: 'rgba(15, 23, 42, 0.6)' },
  formCard: { borderRadius: 30, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)' },
  formContent: { padding: 24, gap: 20 },
  infoText: { fontSize: 14, color: 'rgba(15, 23, 42, 0.6)', lineHeight: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 8 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 4 },
  disabledBox: { padding: 16, backgroundColor: 'rgba(15,23,42,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  disabledValue: { fontSize: 24, fontWeight: '700', color: '#0f172a', marginTop: 4 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: 'rgba(15, 23, 42, 0.8)', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)', borderRadius: 16, padding: 16, fontSize: 16, color: '#0f172a' },
  dateButton: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)', borderRadius: 16, padding: 16 },
  dateButtonText: { fontSize: 16, color: '#0f172a', fontWeight: '500' },
  saveButton: { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' },
  closeButton: { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: '#e11d48', backgroundColor: '#e11d48' },
  saveBlur: { padding: 18, alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  saveButtonText: { fontSize: 18, fontWeight: '700', color: '#10b981' },
});

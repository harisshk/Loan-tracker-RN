import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { saveLoan } from '../utils/storage';
import { calculateEMI } from '../utils/emiCalculator';

export default function AddLoan() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    loanName: '',
    principal: '',
    interest: '',
    emiAmount: '',
    startDate: new Date().toISOString().split('T')[0],
    tenure: '',
    loanType: 'emi'
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calculatedEMI, setCalculatedEMI] = useState(null);

  useEffect(() => {
    if (formData.principal && formData.interest && formData.tenure && formData.loanType === 'emi') {
      const p = parseFloat(String(formData.principal).replace(/,/g, ''));
      const i = parseFloat(formData.interest);
      const t = parseInt(formData.tenure);
      if (p > 0 && i >= 0 && t > 0) {
        const emi = calculateEMI(p, i, t);
        setCalculatedEMI(emi);
      } else {
        setCalculatedEMI(null);
      }
    } else {
      setCalculatedEMI(null);
    }
  }, [formData.principal, formData.interest, formData.tenure, formData.loanType]);

  const handleInputChange = (name, value) => {
    // Sanitize numeric inputs by removing commas (e.g. 1,00,000 -> 100000)
    let sanitizedValue = value;
    if (['principal', 'interest', 'emiAmount', 'tenure'].includes(name)) {
      sanitizedValue = value.replace(/,/g, '');
    }
    setFormData(prev => ({ ...prev, [name]: sanitizedValue }));
  };

  const useCalculatedEMI = () => {
    if (calculatedEMI) {
      setFormData(prev => ({ ...prev, emiAmount: calculatedEMI }));
    }
  };

  const onDateChange = (event, date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
      const formattedDate = date.toISOString().split('T')[0];
      setFormData(prev => ({ ...prev, startDate: formattedDate }));
    }
  };

  const formatDisplayDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const validateForm = () => {
    const parseSafe = (val) => parseFloat(String(val || '').replace(/,/g, ''));
    
    if (!formData.loanName.trim()) {
      Alert.alert('Error', 'Please enter loan name');
      return false;
    }
    if (!formData.principal || parseSafe(formData.principal) <= 0) {
      Alert.alert('Error', 'Please enter valid principal amount');
      return false;
    }
    if (!formData.interest || parseSafe(formData.interest) < 0) {
      Alert.alert('Error', 'Please enter valid interest rate');
      return false;
    }
    if (formData.loanType === 'emi' && (!formData.emiAmount || parseSafe(formData.emiAmount) <= 0)) {
      Alert.alert('Error', 'Please enter valid EMI amount');
      return false;
    }
    if (!formData.tenure || parseInt(String(formData.tenure).replace(/,/g, '')) <= 0) {
      Alert.alert('Error', 'Please enter valid tenure');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      await saveLoan(formData);
      Alert.alert('Success', 'Loan added successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save loan. Please try again.');
    }
  };

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}><Text style={styles.backButton}>← Back</Text></TouchableOpacity>
            <Text style={styles.headerTitle}>Add New Loan</Text>
          </View>

          <BlurView intensity={20} tint="light" style={styles.formCard}>
            <View style={{flexDirection: 'row', gap: 10, padding: 24, paddingBottom: 0}}>
              <TouchableOpacity style={[styles.typeButton, formData.loanType === 'emi' && styles.typeButtonActive]} onPress={() => handleInputChange('loanType', 'emi')}>
                <Text style={[styles.typeButtonText, formData.loanType === 'emi' && styles.typeButtonTextActive]}>Regular EMI</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeButton, formData.loanType === 'bullet' && styles.typeButtonActive]} onPress={() => handleInputChange('loanType', 'bullet')}>
                <Text style={[styles.typeButtonText, formData.loanType === 'bullet' && styles.typeButtonTextActive]}>Bullet / Gold</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Loan Name</Text>
                <TextInput style={styles.input} placeholder="e.g., Home Loan" placeholderTextColor="rgba(15, 23, 42, 0.3)" value={formData.loanName} onChangeText={(v) => handleInputChange('loanName', v)} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Principal Amount (₹)</Text>
                <TextInput style={styles.input} placeholder="e.g., 500000" placeholderTextColor="rgba(15, 23, 42, 0.3)" keyboardType="numeric" value={formData.principal} onChangeText={(v) => handleInputChange('principal', v)} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Interest Rate (%)</Text>
                <TextInput style={styles.input} placeholder="e.g., 8.5" placeholderTextColor="rgba(15, 23, 42, 0.3)" keyboardType="decimal-pad" value={formData.interest} onChangeText={(v) => handleInputChange('interest', v)} />
              </View>

              {formData.loanType === 'emi' && (
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>EMI Amount (₹)</Text>
                    {calculatedEMI && (
                      <TouchableOpacity onPress={useCalculatedEMI} style={styles.calculatedBadge}>
                        <Text style={styles.calculatedText}>Calculated: ₹{parseFloat(calculatedEMI).toLocaleString('en-IN')}</Text>
                        <Text style={styles.useBadgeText}>Use →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput style={styles.input} placeholder="e.g., 15000" placeholderTextColor="rgba(15, 23, 42, 0.3)" keyboardType="numeric" value={formData.emiAmount} onChangeText={(v) => handleInputChange('emiAmount', v)} />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Start Date</Text>
                <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.dateButtonText}>📅 {formatDisplayDate(formData.startDate)}</Text>
                </TouchableOpacity>
                {showDatePicker && <DateTimePicker value={selectedDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onDateChange} />}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tenure (months)</Text>
                <TextInput style={styles.input} placeholder="e.g., 60" placeholderTextColor="rgba(15, 23, 42, 0.3)" keyboardType="numeric" value={formData.tenure} onChangeText={(v) => handleInputChange('tenure', v)} />
              </View>
            </View>
          </BlurView>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <BlurView intensity={25} tint="light" style={styles.saveBlur}><Text style={styles.saveButtonText}>Save Loan</Text></BlurView>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, gap: 15 },
  backButton: { fontSize: 16, fontWeight: '600', color: '#10b981' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  formCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)' },
  formContent: { padding: 24 },
  typeButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(15, 23, 42, 0.05)', borderWidth: 1, borderColor: 'rgba(15, 23, 42, 0.05)' },
  typeButtonActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  typeButtonText: { fontSize: 14, fontWeight: '600', color: 'rgba(15, 23, 42, 0.6)' },
  typeButtonTextActive: { color: '#fff' },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: 'rgba(15, 23, 42, 0.5)', marginBottom: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  input: { backgroundColor: 'rgba(15, 23, 42, 0.03)', borderRadius: 12, paddingHorizontal: 16, height: 50, fontSize: 16, color: '#0f172a', borderWidth: 1, borderColor: 'rgba(15, 23, 42, 0.05)' },
  dateButton: { backgroundColor: 'rgba(15, 23, 42, 0.03)', borderRadius: 12, paddingHorizontal: 16, height: 50, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(15, 23, 42, 0.05)' },
  dateButtonText: { fontSize: 16, color: '#0f172a' },
  calculatedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 4 },
  calculatedText: { fontSize: 11, color: '#10b981', fontWeight: '500' },
  useBadgeText: { fontSize: 11, color: '#10b981', fontWeight: 'bold' },
  saveButton: { marginTop: 30, borderRadius: 16, overflow: 'hidden' },
  saveBlur: { backgroundColor: '#10b981', paddingVertical: 16, alignItems: 'center' },
  saveButtonText: { fontSize: 18, fontWeight: '700', color: '#fff' }
});

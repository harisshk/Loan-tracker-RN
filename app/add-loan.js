import React, { useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import { saveLoan } from '../utils/storage';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function AddLoan() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    loanName: '',
    principal: '',
    interest: '',
    emiAmount: '',
    startDate: new Date().toISOString().split('T')[0],
    tenure: '',
  });
  const [calculatedEMI, setCalculatedEMI] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Calculate EMI automatically when principal, interest, or tenure changes
  useEffect(() => {
    const principal = parseFloat(formData.principal);
    const annualInterest = parseFloat(formData.interest);
    const tenure = parseInt(formData.tenure);

    if (principal > 0 && annualInterest >= 0 && tenure > 0) {
      const monthlyRate = annualInterest / 12 / 100;
      let emi;
      
      if (monthlyRate === 0) {
        emi = principal / tenure;
      } else {
        emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / 
              (Math.pow(1 + monthlyRate, tenure) - 1);
      }
      
      setCalculatedEMI(Math.round(emi).toString());
      
      // Auto-fill EMI if it's empty
      if (!formData.emiAmount) {
        setFormData(prev => ({ ...prev, emiAmount: Math.round(emi).toString() }));
      }
    } else {
      setCalculatedEMI('');
    }
  }, [formData.principal, formData.interest, formData.tenure]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
    if (!formData.loanName.trim()) {
      Alert.alert('Error', 'Please enter loan name');
      return false;
    }
    if (!formData.principal || parseFloat(formData.principal) <= 0) {
      Alert.alert('Error', 'Please enter valid principal amount');
      return false;
    }
    if (!formData.interest || parseFloat(formData.interest) < 0) {
      Alert.alert('Error', 'Please enter valid interest rate');
      return false;
    }
    if (!formData.emiAmount || parseFloat(formData.emiAmount) <= 0) {
      Alert.alert('Error', 'Please enter valid EMI amount');
      return false;
    }
    if (!formData.tenure || parseInt(formData.tenure) <= 0) {
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
    <LinearGradient
      colors={['#0a0a0a', '#1a1a2e', '#16213e']}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add New Loan</Text>
          </View>

          {/* Form */}
          <BlurView intensity={20} tint="dark" style={styles.formCard}>
            <View style={styles.formContent}>
              {/* Loan Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Loan Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Home Loan, Car Loan"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  value={formData.loanName}
                  onChangeText={(value) => handleInputChange('loanName', value)}
                />
              </View>

              {/* Principal */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Principal Amount (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 500000"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  keyboardType="numeric"
                  value={formData.principal}
                  onChangeText={(value) => handleInputChange('principal', value)}
                />
              </View>

              {/* Interest Rate */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Interest Rate (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 8.5"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  keyboardType="decimal-pad"
                  value={formData.interest}
                  onChangeText={(value) => handleInputChange('interest', value)}
                />
              </View>

              {/* EMI Amount */}
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>EMI Amount (₹)</Text>
                  {calculatedEMI && (
                    <TouchableOpacity onPress={useCalculatedEMI} style={styles.calculatedBadge}>
                      <Text style={styles.calculatedText}>
                        Calculated: ₹{parseFloat(calculatedEMI).toLocaleString('en-IN')}
                      </Text>
                      <Text style={styles.useBadgeText}>Use →</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 15000"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  keyboardType="numeric"
                  value={formData.emiAmount}
                  onChangeText={(value) => handleInputChange('emiAmount', value)}
                />
                {calculatedEMI && formData.emiAmount && formData.emiAmount !== calculatedEMI && (
                  <Text style={styles.warningText}>
                    ⚠️ Your EMI differs from calculated EMI
                  </Text>
                )}
              </View>

              {/* Start Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Start Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={styles.dateButtonText}>
                    📅 {formatDisplayDate(formData.startDate)}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange}
                  />
                )}
              </View>

              {/* Tenure */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tenure (months)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 60"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  keyboardType="numeric"
                  value={formData.tenure}
                  onChangeText={(value) => handleInputChange('tenure', value)}
                />
              </View>
            </View>
          </BlurView>

          {/* Save Button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <BlurView intensity={25} tint="dark" style={styles.saveBlur}>
              <Text style={styles.saveButtonText}>Save Loan</Text>
            </BlurView>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ade80',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#ffffff',
  },
  formCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  formContent: {
    padding: 24,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calculatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  calculatedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4ade80',
  },
  useBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4ade80',
  },
  warningText: {
    fontSize: 12,
    color: '#fbbf24',
    marginTop: 4,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
  },
  dateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  saveButton: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  saveBlur: {
    padding: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4ade80',
  },
});

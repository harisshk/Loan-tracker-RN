import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { saveInsurance } from '../utils/storage';
import { scheduleInsuranceReminder } from '../utils/notifications';

export default function AddInsurance() {
  const router = useRouter();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    insuranceType: 'life',
    premiumAmount: '',
    frequency: 'yearly',
    startDate: new Date().toISOString().split('T')[0],
  });

  const handleSave = async () => {
    if (!formData.name || !formData.premiumAmount || !formData.startDate || !formData.frequency) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    try {
      const newInsurance = await saveInsurance(formData);
      Alert.alert('Success', 'Insurance policy saved successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save insurance policy');
    }
  };

  const frequencies = [
    { id: 'yearly', label: 'Yearly' },
    { id: 'half-yearly', label: 'Half-Yearly' },
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'monthly', label: 'Monthly' }
  ];

  const insuranceTypes = [
    { id: 'life',     label: '❤️ Life' },
    { id: 'health',   label: '🏥 Health' },
    { id: 'vehicle',  label: '🚗 Vehicle' },
    { id: 'property', label: '🏠 Property' },
    { id: 'other',    label: '📋 Other' },
  ];

  return (
    <LinearGradient
      colors={['#f8fafc', '#f1f5f9', '#e2e8f0']}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Insurance</Text>
        </View>

        <BlurView intensity={50} tint="light" style={styles.formCard}>
          <View style={styles.formContent}>
            
            {/* Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Policy Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Car Insurance, LIC Term"
                placeholderTextColor="rgba(15, 23, 42, 0.4)"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />
            </View>

            {/* Insurance Type */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Insurance Type *</Text>
              <View style={styles.typeSelectorRow}>
                {insuranceTypes.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.typeButton,
                      formData.insuranceType === t.id && styles.typeButtonActive
                    ]}
                    onPress={() => setFormData({ ...formData, insuranceType: t.id })}
                  >
                    <Text style={[
                      styles.typeButtonText,
                      formData.insuranceType === t.id && styles.typeButtonTextActive
                    ]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Premium Amount */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Premium Amount (₹) *</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="rgba(15, 23, 42, 0.4)"
                keyboardType="numeric"
                value={formData.premiumAmount}
                onChangeText={(text) => setFormData({ ...formData, premiumAmount: text })}
              />
            </View>

            {/* Frequency Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Payment Frequency *</Text>
              <View style={styles.typeSelectorRow}>
                {frequencies.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[
                      styles.typeButton,
                      formData.frequency === f.id && styles.typeButtonActive
                    ]}
                    onPress={() => setFormData({ ...formData, frequency: f.id })}
                  >
                    <Text style={[
                      styles.typeButtonText,
                      formData.frequency === f.id && styles.typeButtonTextActive
                    ]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Start Date */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Start Date / Due Date Base *</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateButtonText}>
                  {new Date(formData.startDate).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </Text>
              </TouchableOpacity>
              <Text style={styles.helperText}>Used to calculate your upcoming premium due dates.</Text>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={new Date(formData.startDate)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) {
                    setFormData({
                      ...formData,
                      startDate: selectedDate.toISOString().split('T')[0],
                    });
                  }
                }}
              />
            )}

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Insurance</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  backButton: { fontSize: 16, fontWeight: '600', color: '#2563eb', marginBottom: 12 },
  headerTitle: { fontSize: 34, fontWeight: '700', color: '#0f172a' },
  formCard: { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)' },
  formContent: { padding: 24, gap: 20 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: 'rgba(15, 23, 42, 0.8)', textTransform: 'uppercase', letterSpacing: 0.5 },
  helperText: { fontSize: 12, color: 'rgba(15, 23, 42, 0.5)' },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)', borderRadius: 16, padding: 16, fontSize: 16, color: '#0f172a' },
  dateButton: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)', borderRadius: 16, padding: 16 },
  dateButtonText: { fontSize: 16, color: '#0f172a' },
  typeSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeButton: { flex: 1, minWidth: '45%', paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.1)', backgroundColor: '#ffffff' },
  typeButtonActive: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10b981' },
  typeButtonText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  typeButtonTextActive: { color: '#10b981' },
  saveButton: { backgroundColor: '#2563eb', borderRadius: 20, padding: 18, alignItems: 'center', marginTop: 10, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveButtonText: { fontSize: 18, fontWeight: '700', color: '#ffffff' }
});

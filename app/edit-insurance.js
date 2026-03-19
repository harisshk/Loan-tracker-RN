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
import { updateInsurance } from '../utils/storage';

export default function EditInsurance() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formData, setFormData] = useState({
    name: params.name || '',
    premiumAmount: params.premiumAmount || '',
    frequency: params.frequency || 'yearly',
    startDate: params.startDate || new Date().toISOString().split('T')[0],
  });

  const frequencies = [
    { id: 'yearly', label: 'Yearly' },
    { id: 'half-yearly', label: 'Half-Yearly' },
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'monthly', label: 'Monthly' },
  ];

  const handleSave = async () => {
    if (!formData.name || !formData.premiumAmount || !formData.startDate || !formData.frequency) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    try {
      await updateInsurance(params.id, formData);
      Alert.alert('Success', 'Insurance policy updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update insurance policy');
    }
  };

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Insurance</Text>
          </View>

          <BlurView intensity={20} tint="light" style={styles.formCard}>
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
                        formData.frequency === f.id && styles.typeButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, frequency: f.id })}
                    >
                      <Text style={[
                        styles.typeButtonText,
                        formData.frequency === f.id && styles.typeButtonTextActive,
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
                      year: 'numeric',
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
                      const y = selectedDate.getFullYear();
                      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const d = String(selectedDate.getDate()).padStart(2, '0');
                      setFormData({ ...formData, startDate: `${y}-${m}-${d}` });
                    }
                  }}
                />
              )}
            </View>
          </BlurView>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Update Insurance</Text>
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
  formCard: { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)', marginBottom: 20 },
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
  saveButton: { backgroundColor: '#2563eb', borderRadius: 20, padding: 18, alignItems: 'center', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveButtonText: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
});

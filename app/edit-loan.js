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
import { updateLoan } from '../utils/storage';

export default function EditLoan() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const loanType = params.loanType || 'emi';
  const isBullet = loanType === 'bullet';

  const [formData, setFormData] = useState({
    loanName: params.loanName || '',
    loanType,
    principal: params.principal ? String(params.principal) : '',
    interest: params.interest ? String(params.interest) : '',
    emiAmount: params.emiAmount ? String(params.emiAmount) : '',
    startDate: params.startDate || new Date().toISOString().split('T')[0],
    tenure: params.tenure ? String(params.tenure) : '',
  });

  const handleInputChange = (field, value) => {
    let sanitizedValue = value;
    if (['principal', 'interest', 'emiAmount', 'tenure'].includes(field)) {
      sanitizedValue = String(value || '').replace(/,/g, '');
    }
    setFormData((prev) => ({ ...prev, [field]: sanitizedValue }));
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
    if (!isBullet && (!formData.emiAmount || parseSafe(formData.emiAmount) <= 0)) {
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
      const dataToSave = { ...formData };
      if (isBullet) {
        dataToSave.emiAmount = '0';
      }
      await updateLoan(params.id, dataToSave);
      Alert.alert('Success', 'Loan updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to update loan. Please try again.');
    }
  };

  return (
    <LinearGradient
      colors={['#f8fafc', '#f1f5f9', '#e2e8f0']}
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
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Edit Loan</Text>
              <View style={[styles.typeBadge, isBullet ? styles.typeBadgeBullet : styles.typeBadgeEmi]}>
                <Text style={[styles.typeBadgeText, isBullet ? styles.typeBadgeTextBullet : styles.typeBadgeTextEmi]}>
                  {isBullet ? '🥇 Bullet / Gold' : '📅 Regular EMI'}
                </Text>
              </View>
            </View>
          </View>

          {/* Form */}
          <BlurView intensity={20} tint="light" style={styles.formCard}>
            <View style={styles.formContent}>
              {/* Loan Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Loan Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Home Loan, Car Loan"
                  placeholderTextColor="rgba(15, 23, 42, 0.3)"
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
                  placeholderTextColor="rgba(15, 23, 42, 0.3)"
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
                  placeholderTextColor="rgba(15, 23, 42, 0.3)"
                  keyboardType="decimal-pad"
                  value={formData.interest}
                  onChangeText={(value) => handleInputChange('interest', value)}
                />
              </View>

              {/* EMI Amount — only for regular EMI loans */}
              {!isBullet && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>EMI Amount (₹)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 15000"
                    placeholderTextColor="rgba(15, 23, 42, 0.3)"
                    keyboardType="numeric"
                    value={formData.emiAmount}
                    onChangeText={(value) => handleInputChange('emiAmount', value)}
                  />
                </View>
              )}

              {/* Bullet Loan Info Banner */}
              {isBullet && (
                <View style={styles.bulletInfoBanner}>
                  <Text style={styles.bulletInfoIcon}>💡</Text>
                  <Text style={styles.bulletInfoText}>
                    Bullet / Gold loans are repaid in a lump sum at maturity — no monthly EMI required.
                  </Text>
                </View>
              )}

              {/* Start Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2026-01-01"
                  placeholderTextColor="rgba(15, 23, 42, 0.3)"
                  value={formData.startDate}
                  onChangeText={(value) => handleInputChange('startDate', value)}
                />
              </View>

              {/* Tenure */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tenure (months)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 60"
                  placeholderTextColor="rgba(15, 23, 42, 0.3)"
                  keyboardType="numeric"
                  value={formData.tenure}
                  onChangeText={(value) => handleInputChange('tenure', value)}
                />
              </View>
            </View>
          </BlurView>

          {/* Save Button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <BlurView intensity={25} tint="light" style={styles.saveBlur}>
              <Text style={styles.saveButtonText}>Update Loan</Text>
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
    color: '#10b981',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#0f172a',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeBadgeEmi: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10b981',
  },
  typeBadgeBullet: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: '#f59e0b',
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  typeBadgeTextEmi: {
    color: '#10b981',
  },
  typeBadgeTextBullet: {
    color: '#d97706',
  },
  formCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  formContent: {
    padding: 24,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#0f172a',
  },
  bulletInfoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 16,
    padding: 16,
  },
  bulletInfoIcon: {
    fontSize: 18,
  },
  bulletInfoText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
    fontWeight: '500',
  },
  saveButton: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  saveBlur: {
    padding: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10b981',
  },
});

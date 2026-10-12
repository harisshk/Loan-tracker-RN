import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  colors,
  Field,
  Gap,
  PressableScale,
  radius,
  Screen,
  ScreenHeader,
  Segmented,
  space,
  type,
} from '../components/ui/kit';
import { parseLocalDate, toLocalISOString } from '../utils/emiCalculator';
import { deleteInsurance, getInsurances, updateInsurance } from '../utils/storage';

const FREQUENCIES = [
  { key: 'yearly', label: 'Yearly' },
  { key: 'half-yearly', label: 'Half-yearly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'monthly', label: 'Monthly' },
];

const INSURANCE_TYPES = [
  { id: 'life',     label: 'Life',     icon: 'heart-outline' },
  { id: 'health',   label: 'Health',   icon: 'medkit-outline' },
  { id: 'vehicle',  label: 'Vehicle',  icon: 'car-outline' },
  { id: 'property', label: 'Property', icon: 'home-outline' },
  { id: 'other',    label: 'Other',    icon: 'document-text-outline' },
];

export default function EditInsurance() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    name: '',
    insuranceType: 'life',
    premiumAmount: '',
    frequency: 'yearly',
    startDate: toLocalISOString(new Date()),
  });

  const loadData = useCallback(async () => {
    // `loading` starts true, so there's no need to set it again here.
    try {
      const allInsurances = await getInsurances();
      const found = allInsurances.find(ins => ins.id === params.id);
      if (found) {
        setFormData({
          name: found.name || '',
          insuranceType: found.insuranceType || 'life',
          premiumAmount: found.premiumAmount ? String(found.premiumAmount) : '',
          frequency: found.frequency || 'yearly',
          startDate: found.startDate || toLocalISOString(new Date()),
        });
      } else {
        // Fallback to params
        setFormData({
          name: params.name || '',
          insuranceType: params.insuranceType || 'life',
          premiumAmount: params.premiumAmount ? String(params.premiumAmount) : '',
          frequency: params.frequency || 'yearly',
          startDate: params.startDate || toLocalISOString(new Date()),
        });
      }
    } catch (e) {
      console.error('Error loading insurance data:', e);
    } finally {
      setLoading(false);
    }
  }, [
    params.id,
    params.name,
    params.insuranceType,
    params.premiumAmount,
    params.frequency,
    params.startDate,
  ]);

  // Runs on first focus (and again only if the screen is re-focused).
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleSave = async () => {
    const sanitizedAmount = String(formData.premiumAmount).replace(/,/g, '');
    if (!formData.name || !sanitizedAmount || parseFloat(sanitizedAmount) <= 0 || !formData.startDate || !formData.frequency) {
      setErrors({
        name: formData.name ? undefined : 'Enter a policy name',
        premiumAmount:
          sanitizedAmount && parseFloat(sanitizedAmount) > 0 ? undefined : 'Enter a premium greater than ₹0',
        startDate: formData.startDate ? undefined : 'Pick a start date',
      });
      return;
    }
    setErrors({});

    try {
      setSaving(true);
      const dataToUpdate = { ...formData, premiumAmount: sanitizedAmount };
      await updateInsurance(params.id, dataToUpdate);
      Alert.alert('Success', 'Insurance policy updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update insurance policy');
    } finally {
      setSaving(false);
    }
  };

  // Same confirmation as the policy list.
  const handleDelete = () => {
    const name = formData.name || params.name || 'this policy';
    Alert.alert(
      'Delete Insurance',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInsurance(params.id);
              router.back();
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'Failed to delete insurance policy');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title="Edit insurance" back />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryFill} />
        </View>
      </Screen>
    );
  }

  const startLabel = parseLocalDate(formData.startDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <Screen
        footer={<Button label="Update insurance" icon="checkmark" onPress={handleSave} loading={saving} />}
      >
        <ScreenHeader title="Edit insurance" subtitle={formData.name || undefined} back />

        <Card>
          <Field
            label="Policy name"
            placeholder="e.g. Car insurance, LIC term"
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
            error={errors.name}
          />

          <Text style={styles.label}>Policy type</Text>
          <View style={styles.chips}>
            {INSURANCE_TYPES.map((t) => (
              <Chip
                key={t.id}
                label={t.label}
                icon={t.icon}
                selected={formData.insuranceType === t.id}
                onPress={() => setFormData({ ...formData, insuranceType: t.id })}
              />
            ))}
          </View>

          <Field
            label="Premium amount"
            prefix="₹"
            placeholder="0"
            keyboardType="numeric"
            value={formData.premiumAmount}
            onChangeText={(text) => setFormData({ ...formData, premiumAmount: text.replace(/,/g, '') })}
            error={errors.premiumAmount}
          />

          <Text style={styles.label}>Premium frequency</Text>
          <Segmented
            options={FREQUENCIES}
            value={formData.frequency}
            onChange={(f) => setFormData({ ...formData, frequency: f })}
            style={styles.segmented}
          />

          <Text style={styles.label}>Start date</Text>
          <PressableScale
            onPress={() => setShowDatePicker(true)}
            style={[styles.dateRow, !!errors.startDate && styles.dateRowError]}
            accessibilityLabel={`Start date, ${startLabel}`}
            accessibilityHint="Opens a date picker"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.dateText}>{startLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </PressableScale>
          <Text style={errors.startDate ? styles.error : styles.hint}>
            {errors.startDate || 'Used to work out your upcoming premium due dates.'}
          </Text>

          {showDatePicker && (
            <DateTimePicker
              value={parseLocalDate(formData.startDate)}
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
        </Card>

        <Gap />

        <Button label="Delete policy" icon="trash-outline" variant="danger" onPress={handleDelete} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.page,
  },
  loading: {
    paddingVertical: space.xxxl * 2,
    alignItems: 'center',
  },
  label: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.xs + 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.lg,
  },
  segmented: {
    marginBottom: space.lg,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  dateRowError: {
    borderColor: colors.dangerFill,
  },
  dateText: {
    ...type.body,
    color: colors.text,
    flex: 1,
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
});

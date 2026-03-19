import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { getInsurances, deleteInsurance } from '../utils/storage';

export default function Insurances() {
  const router = useRouter();
  const [insurances, setInsurances] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadInsurances = async () => {
    const data = await getInsurances();
    setInsurances(data);
  };

  useEffect(() => {
    loadInsurances();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadInsurances();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInsurances();
    setRefreshing(false);
  };

  const handleDelete = (id, name) => {
    Alert.alert(
      'Delete Insurance',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteInsurance(id);
            await loadInsurances();
          },
        },
      ]
    );
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const calculateNextDueDate = (startDate, frequency) => {
    if (!startDate) return null;
    const start = new Date(startDate);
    const today = new Date();
    
    let stepMonths = 12;
    if (frequency === 'yearly') stepMonths = 12;
    else if (frequency === 'half-yearly') stepMonths = 6;
    else if (frequency === 'quarterly') stepMonths = 3;
    else if (frequency === 'monthly') stepMonths = 1;
    
    let nextDue = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (nextDue < today) {
      nextDue.setMonth(nextDue.getMonth() + stepMonths);
    }
    return nextDue;
  };

  return (
    <LinearGradient
      colors={['#f8fafc', '#f1f5f9', '#e2e8f0']}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
             <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <Text style={styles.headerTitle}>All Insurances</Text>
            <TouchableOpacity onPress={() => router.push('/add-insurance')}>
              <Text style={styles.addButton}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {insurances.length === 0 ? (
          <BlurView intensity={15} tint="light" style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Text style={styles.emptyText}>No insurances yet</Text>
              <Text style={styles.emptySubtext}>
                Tap the + button to add your first policy
              </Text>
            </View>
          </BlurView>
        ) : (
          insurances.map((ins) => {
            const nextDue = calculateNextDueDate(ins.startDate, ins.frequency);
            
            return (
              <BlurView
                key={ins.id}
                intensity={20}
                tint="light"
                style={styles.card}
              >
                <TouchableOpacity
                  style={styles.cardContent}
                  onLongPress={() => handleDelete(ins.id, ins.name)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.name}>{ins.name}</Text>
                    <Text style={styles.amount}>
                      {formatCurrency(ins.premiumAmount)}
                    </Text>
                  </View>

                  <View style={styles.details}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Frequency</Text>
                      <Text style={styles.detailValue}>
                        {ins.frequency.charAt(0).toUpperCase() + ins.frequency.slice(1)}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Next Premium Due</Text>
                      <Text style={[styles.detailValue, styles.dueDate]}>
                        {nextDue ? formatDate(nextDue) : 'N/A'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.startDateContainer}>
                    <Text style={styles.startDateLabel}>
                      Base Date: {formatDate(ins.startDate)} (Long press to delete)
                    </Text>
                  </View>
                </TouchableOpacity>
              </BlurView>
            );
          })
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  backButton: { fontSize: 16, fontWeight: '600', color: '#10b981', marginBottom: 12 },
  headerTitle: { fontSize: 34, fontWeight: '700', color: '#0f172a' },
  addButton: { fontSize: 18, fontWeight: '600', color: '#10b981' },
  card: { borderRadius: 30, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)' },
  cardContent: { padding: 24 },
  cardHeader: { marginBottom: 20 },
  name: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  amount: { fontSize: 32, fontWeight: '700', color: '#10b981' },
  details: { gap: 12, marginBottom: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 14, color: 'rgba(15, 23, 42, 0.6)' },
  detailValue: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  dueDate: { color: '#f59e0b' },
  startDateContainer: { paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.1)' },
  startDateLabel: { fontSize: 12, color: 'rgba(15, 23, 42, 0.4)' },
  emptyCard: { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)' },
  emptyContent: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 20, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: 'rgba(15, 23, 42, 0.6)', textAlign: 'center' },
});

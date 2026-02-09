import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { getPayments, addPayment, getLoans } from '../utils/storage';

export default function History() {
  const router = useRouter();
  const [payments, setPayments] = useState([]);
  const [loans, setLoans] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    loanId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  });

  const loadData = async () => {
    const paymentsData = await getPayments();
    const loansData = await getLoans();
    setPayments(paymentsData.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)));
    setLoans(loansData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddPayment = async () => {
    if (!newPayment.loanId || !newPayment.amount) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    try {
      const selectedLoan = loans.find(l => l.id === newPayment.loanId);
      await addPayment({
        ...newPayment,
        loanName: selectedLoan?.loanName || 'Unknown',
      });
      setShowAddPayment(false);
      setNewPayment({
        loanId: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
      });
      await loadData();
      Alert.alert('Success', 'Payment recorded successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to record payment');
    }
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
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

  const getTotalPaid = () => {
    return payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
  };

  return (
    <LinearGradient
      colors={['#0a0a0a', '#1a1a2e', '#16213e']}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Payment History</Text>
          <TouchableOpacity onPress={() => setShowAddPayment(!showAddPayment)}>
            <Text style={styles.addButton}>
              {showAddPayment ? 'Cancel' : '+ Add'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Total Paid Summary */}
        <BlurView intensity={20} tint="dark" style={styles.summaryCard}>
          <View style={styles.cardContent}>
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={styles.summaryAmount}>
              {formatCurrency(getTotalPaid())}
            </Text>
            <Text style={styles.summarySubtext}>
              {payments.length} payment{payments.length !== 1 ? 's' : ''} recorded
            </Text>
          </View>
        </BlurView>

        {/* Add Payment Form */}
        {showAddPayment && (
          <BlurView intensity={20} tint="dark" style={styles.formCard}>
            <View style={styles.formContent}>
              <Text style={styles.formTitle}>Record Payment</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Select Loan</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.loanSelector}>
                    {loans.map((loan) => (
                      <TouchableOpacity
                        key={loan.id}
                        style={[
                          styles.loanOption,
                          newPayment.loanId === loan.id && styles.loanOptionSelected,
                        ]}
                        onPress={() =>
                          setNewPayment((prev) => ({ ...prev, loanId: loan.id }))
                        }
                      >
                        <Text
                          style={[
                            styles.loanOptionText,
                            newPayment.loanId === loan.id && styles.loanOptionTextSelected,
                          ]}
                        >
                          {loan.loanName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Amount (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter amount"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  keyboardType="numeric"
                  value={newPayment.amount}
                  onChangeText={(value) =>
                    setNewPayment((prev) => ({ ...prev, amount: value }))
                  }
                />
              </View>

              <TouchableOpacity style={styles.submitButton} onPress={handleAddPayment}>
                <Text style={styles.submitButtonText}>Record Payment</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        )}

        {/* Payment List */}
        <Text style={styles.sectionTitle}>Recent Payments</Text>

        {payments.length === 0 ? (
          <BlurView intensity={15} tint="dark" style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Text style={styles.emptyText}>No payments recorded</Text>
              <Text style={styles.emptySubtext}>
                Tap the + button to record your first payment
              </Text>
            </View>
          </BlurView>
        ) : (
          payments.map((payment) => (
            <BlurView
              key={payment.id}
              intensity={15}
              tint="dark"
              style={styles.paymentCard}
            >
              <View style={styles.paymentContent}>
                <View style={styles.paymentLeft}>
                  <Text style={styles.paymentLoanName}>{payment.loanName}</Text>
                  <Text style={styles.paymentDate}>
                    {formatDate(payment.paidAt)}
                  </Text>
                </View>
                <Text style={styles.paymentAmount}>
                  {formatCurrency(payment.amount)}
                </Text>
              </View>
            </BlurView>
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#ffffff',
  },
  addButton: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4ade80',
  },
  summaryCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardContent: {
    padding: 24,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryAmount: {
    fontSize: 38,
    fontWeight: '700',
    color: '#4ade80',
    marginBottom: 8,
  },
  summarySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  formCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  formContent: {
    padding: 24,
    gap: 16,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loanSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  loanOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  loanOptionSelected: {
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    borderColor: '#4ade80',
  },
  loanOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  loanOptionTextSelected: {
    color: '#4ade80',
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
  submitButton: {
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ade80',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
  },
  paymentCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  paymentContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  paymentLeft: {
    flex: 1,
  },
  paymentLoanName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  paymentDate: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  paymentAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4ade80',
  },
  emptyCard: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyContent: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
});

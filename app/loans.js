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
import { getLoans, deleteLoan } from '../utils/storage';
import { calculateEMIBreakdown } from '../utils/emiCalculator';

export default function Loans() {
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadLoans = async () => {
    const loansData = await getLoans();
    setLoans(loansData);
  };

  useEffect(() => {
    loadLoans();
  }, []);

  // Reload data when screen comes into focus (after editing loan)
  useFocusEffect(
    React.useCallback(() => {
      loadLoans();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLoans();
    setRefreshing(false);
  };

  const handleDeleteLoan = (loanId, loanName) => {
    Alert.alert(
      'Delete Loan',
      `Are you sure you want to delete "${loanName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteLoan(loanId);
            await loadLoans();
          },
        },
      ]
    );
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

  const calculateNextDueDate = (startDate, tenure) => {
    if (!startDate) return null;
    
    const start = new Date(startDate);
    const today = new Date();
    const monthsDiff = (today.getFullYear() - start.getFullYear()) * 12 + 
                      (today.getMonth() - start.getMonth());
    
    if (monthsDiff >= tenure) return null;
    
    const nextDue = new Date(start);
    nextDue.setMonth(nextDue.getMonth() + monthsDiff + 1);
    return nextDue;
  };

  const calculateRemainingAmount = (loan) => {
    const principal = parseFloat(loan.principal) || 0;
    const interest = parseFloat(loan.interest) || 0;
    const tenure = parseInt(loan.tenure) || 0;
    const emiAmount = parseFloat(loan.emiAmount) || 0;
    
    if (!loan.startDate) return principal;
    
    const startDate = new Date(loan.startDate);
    const today = new Date();
    
    // Calculate base months difference
    let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                        (today.getMonth() - startDate.getMonth());
    
    // If current day >= start day, we've completed this month's payment
    if (today.getDate() >= startDate.getDate()) {
      monthsElapsed += 1;
    }
    
    monthsElapsed = Math.max(0, monthsElapsed);
    
    const breakdown = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount);
    return breakdown.remainingAmount;
  };

  return (
    <LinearGradient
      colors={['#f8fafc', '#f1f5f9', '#e2e8f0']}
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
          <Text style={styles.headerTitle}>All Loans</Text>
          <TouchableOpacity onPress={() => router.push('/add-loan')}>
            <Text style={styles.addButton}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Loans List */}
        {loans.length === 0 ? (
          <BlurView intensity={15} tint="light" style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Text style={styles.emptyText}>No loans yet</Text>
              <Text style={styles.emptySubtext}>
                Tap the + button to add your first loan
              </Text>
            </View>
          </BlurView>
        ) : (
          loans.map((loan) => {
            const nextDue = calculateNextDueDate(loan.startDate, parseInt(loan.tenure));
            const remaining = calculateRemainingAmount(loan);
            
            // Calculate payments made
            const startDate = new Date(loan.startDate);
            const today = new Date();
            
            // Calculate base months difference
            let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                                (today.getMonth() - startDate.getMonth());
            
            // If current day >= start day, we've completed this month's payment
            if (today.getDate() >= startDate.getDate()) {
              monthsElapsed += 1;
            }
            
            monthsElapsed = Math.max(0, monthsElapsed);
            const paymentsMade = Math.min(monthsElapsed, parseInt(loan.tenure));
            
            return (
              <BlurView
                key={loan.id}
                intensity={20}
                tint="light"
                style={[styles.loanCard, loan.status === 'closed' && { opacity: 0.6 }]}
              >
                <TouchableOpacity
                  style={styles.cardContent}
                  onPress={() => router.push({
                    pathname: '/loan-detail',
                    params: {
                      id: loan.id,
                      loanName: loan.loanName,
                      principal: loan.principal,
                      interest: loan.interest,
                      emiAmount: loan.emiAmount,
                      tenure: loan.tenure,
                      startDate: loan.startDate,
                      loanType: loan.loanType || 'emi',
                    },
                  })}
                  onLongPress={() => handleDeleteLoan(loan.id, loan.loanName)}
                  activeOpacity={0.7}
                >
                  {/* Loan card contents */}
                  <View style={styles.loanHeader}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8}}>
                      <Text style={styles.loanName}>{loan.loanName}</Text>
                      {loan.loanType === 'bullet' && (
                        <View style={{backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8}}>
                          <Text style={{fontSize: 10, fontWeight: '700', color: '#f59e0b'}}>BULLET</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.loanAmount}>
                      {formatCurrency(remaining)}
                    </Text>
                  </View>

                  <View style={styles.loanDetails}>
                    {loan.loanType === 'bullet' ? (
                      <>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Lump Sum Due</Text>
                          <Text style={[styles.detailValue, {color: '#f59e0b'}]}>
                            {formatCurrency(remaining)}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Interest Rate</Text>
                          <Text style={styles.detailValue}>{loan.interest}%</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Matures On</Text>
                          <Text style={[styles.detailValue, styles.dueDate]}>
                            {(() => {
                              const m = new Date(loan.startDate);
                              m.setMonth(m.getMonth() + parseInt(loan.tenure));
                              return formatDate(m);
                            })()}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>EMI Amount</Text>
                          <Text style={styles.detailValue}>
                            {formatCurrency(loan.emiAmount)}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Interest Rate</Text>
                          <Text style={styles.detailValue}>{loan.interest}%</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Progress</Text>
                          <Text style={styles.detailValue}>
                            {paymentsMade} / {loan.tenure} EMIs
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Next Due</Text>
                          <Text style={[styles.detailValue, styles.dueDate]}>
                            {nextDue ? formatDate(nextDue) : 'Completed'}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>

                  <View style={styles.startDateContainer}>
                    <Text style={styles.startDateLabel}>
                      Started: {formatDate(loan.startDate)}
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
    color: '#0f172a',
  },
  addButton: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10b981',
  },
  loanCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  cardContent: {
    padding: 24,
  },
  loanHeader: {
    marginBottom: 20,
  },
  loanName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  loanAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#10b981',
  },
  loanDetails: {
    gap: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  dueDate: {
    color: '#f59e0b',
  },
  startDateContainer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  startDateLabel: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.4)',
  },
  emptyCard: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  emptyContent: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.6)',
    textAlign: 'center',
  },
});

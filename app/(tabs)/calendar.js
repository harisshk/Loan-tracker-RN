import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { getLoans, getPayments, getInsurances } from '../../utils/storage';
import { getTransactions } from '../../utils/transactions';
import { calculateEMIBreakdown } from '../../utils/emiCalculator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCategoryIcon } from '../../constants/categories';

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [spends, setSpends] = useState([]);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [showSpendDetails, setShowSpendDetails] = useState(false);

  const toLocalISOString = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const parseDateToLocal = (dateStr) => {
    if (!dateStr) return new Date();
    if (dateStr.length >= 10 && dateStr.substring(0, 10).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parts = dateStr.substring(0, 10).split('-');
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(dateStr);
  };

  // Default to current month using local timezone
  const todayDateString = toLocalISOString(new Date());
  const [selectedDate, setSelectedDate] = useState(todayDateString);
  const [currentMonthStr, setCurrentMonthStr] = useState(todayDateString.slice(0, 7));

  useFocusEffect(
    useCallback(() => {
      setFocusTrigger((prev) => prev + 1);
    }, [])
  );

  const loadData = async (month) => {
    try {
      const loansData = await getLoans();
      const paymentsData = await getPayments();
      const insurancesData = await getInsurances();
      setLoans(loansData || []);
      setPayments(paymentsData || []);
      setInsurances(insurancesData || []);

      const spendsData = await getTransactions(month);
      setSpends(spendsData || []);
    } catch (e) {
      console.error('Error loading calendar data:', e);
    }
  };

  useEffect(() => {
    loadData(currentMonthStr);
  }, [currentMonthStr, focusTrigger]);

  const scheduleMap = useMemo(() => {
    const map = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    loans.forEach((loan) => {
      const principal = parseFloat(loan.principal) || 0;
      const interest = parseFloat(loan.interest) || 0;
      const tenure = parseInt(loan.tenure) || 0;
      const loanType = loan.loanType || 'emi';
      const emiAmount = parseFloat(loan.emiAmount) || 0;
      const extraPayments = payments.filter((p) => p.loanId === loan.id);
      
      const startDate = parseDateToLocal(loan.startDate);
      let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                          (today.getMonth() - startDate.getMonth());
      if (today.getDate() >= startDate.getDate()) monthsElapsed += 1;
      monthsElapsed = Math.max(0, monthsElapsed);

      const breakdown = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount, loanType, extraPayments);

      if (loanType === 'emi') {
        for (let m = 0; m < tenure; m++) {
          const due = new Date(startDate.getFullYear(), startDate.getMonth() + m, startDate.getDate());
          const dateStr = toLocalISOString(due);
          
          const isPaid = m < monthsElapsed;
          
          if (!map[dateStr]) map[dateStr] = [];
          map[dateStr].push({
            loanId: loan.id,
            loanName: loan.loanName,
            amount: emiAmount,
            type: 'emi',
            isPaid: isPaid,
            date: due
          });
        }
      } else if (loanType === 'bullet') {
        const maturityDate = new Date(startDate.getFullYear(), startDate.getMonth() + tenure, startDate.getDate());
        const dateStr = toLocalISOString(maturityDate);
        
        const isPaid = breakdown.paymentsMade > 0 || breakdown.remainingAmount <= 0;
        
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({
          loanId: loan.id,
          loanName: loan.loanName,
          amount: breakdown.totalAmount, 
          type: 'bullet',
          isPaid: isPaid,
          date: maturityDate
        });
      }
    });

    // Process Insurances
    insurances.forEach((ins) => {
      const startDate = parseDateToLocal(ins.startDate);
      const premium = parseFloat(ins.premiumAmount) || 0;
      const freq = ins.frequency;
      
      let monthsToProject = 60;
      let stepMonths = 12;
      
      if (freq === 'yearly') stepMonths = 12;
      else if (freq === 'half-yearly') stepMonths = 6;
      else if (freq === 'quarterly') stepMonths = 3;
      else if (freq === 'monthly') stepMonths = 1;
      
      for (let m = 0; m <= monthsToProject; m += stepMonths) {
        const due = new Date(startDate.getFullYear(), startDate.getMonth() + m, startDate.getDate());
        const dateStr = toLocalISOString(due);
        
        const isPaid = due < today;
        
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({
          loanId: ins.id,
          loanName: ins.name,
          amount: premium,
          type: 'insurance',
          frequency: freq,
          isPaid: isPaid,
          date: due
        });
      }
    });

    // Process Spends for the month
    spends.forEach((spend) => {
      const date = parseDateToLocal(spend.date);
      const dateStr = toLocalISOString(date);
      const isCredit = (spend.type || '').toLowerCase() === 'credit';

      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push({
        id: spend.id,
        loanName: spend.description || (isCredit ? 'Received' : 'Spend'),
        amount: spend.amount,
        type: isCredit ? 'credit_tx' : 'spend',
        category: spend.category || 'Other',
        isPaid: true,
        date: date
      });
    });

    return map;
  }, [loans, payments, insurances, spends]);

  // Get items specifically for the selected date alone
  const dayItems = useMemo(() => {
    return scheduleMap[selectedDate] || [];
  }, [scheduleMap, selectedDate]);

  // Separate day items by category
  const { spendItems, creditItems, billItems, dailySummary } = useMemo(() => {
    const spendItems = [];
    const creditItems = [];
    const billItems = [];
    let spend = 0;
    let credit = 0;
    let bills = 0;

    dayItems.forEach((item) => {
      const amt = parseFloat(item.amount) || 0;
      if (item.type === 'spend') {
        spendItems.push(item);
        spend += amt;
      } else if (item.type === 'credit_tx') {
        creditItems.push(item);
        credit += amt;
      } else {
        billItems.push(item);
        bills += amt;
      }
    });

    return { spendItems, creditItems, billItems, dailySummary: { spend, credit, bills } };
  }, [dayItems]);

  const markedDates = useMemo(() => {
    const marks = {};
    Object.keys(scheduleMap).forEach((date) => {
      const dayItems = scheduleMap[date];
      const hasPending = dayItems.some((i) => !i.isPaid);
      const hasSpend = dayItems.some((i) => i.type === 'spend');
      
      if (hasPending) {
        marks[date] = {
          marked: true,
          dotColor: '#f59e0b',
        };
      } else if (hasSpend) {
        marks[date] = {
          marked: true,
          dotColor: '#ef4444',
        };
      } else {
        marks[date] = {
          marked: true,
          dotColor: '#10b981',
        };
      }
    });
    
    if (selectedDate) {
      if (marks[selectedDate]) {
        marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: 'rgba(15, 23, 42, 0.1)' };
      } else {
        marks[selectedDate] = { selected: true, selectedColor: 'rgba(15, 23, 42, 0.1)' };
      }
    }
    return marks;
  }, [scheduleMap, selectedDate]);

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`;
  };

  const handleMonthChange = (month) => {
    setCurrentMonthStr(month.dateString.slice(0, 7));
  };

  const selectedDateObj = parseDateToLocal(selectedDate);
  const readableDay = selectedDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 20) + 10 }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Calendar Schedule</Text>
          <Text style={styles.headerSubtitle}>View and track your monthly payments & spends</Text>
        </View>

        <BlurView intensity={20} tint="light" style={styles.calendarCard}>
          <Calendar
            current={selectedDate}
            onDayPress={(day) => {
              setSelectedDate(day.dateString);
              setCurrentMonthStr(day.dateString.slice(0, 7));
              setShowSpendDetails(false);
            }}
            onMonthChange={handleMonthChange}
            markedDates={markedDates}
            theme={{
              calendarBackground: 'transparent',
              textSectionTitleColor: 'rgba(15, 23, 42, 0.6)',
              selectedDayBackgroundColor: 'rgba(15, 23, 42, 0.1)',
              selectedDayTextColor: '#0f172a',
              todayTextColor: '#2563eb',
              dayTextColor: '#0f172a',
              textDisabledColor: 'rgba(15, 23, 42, 0.2)',
              arrowColor: '#0f172a',
              monthTextColor: '#0f172a',
              textDayFontWeight: '500',
              textMonthFontWeight: '700',
              textDayHeaderFontWeight: '600',
            }}
          />
        </BlurView>

        <View style={styles.agendaContainer}>
          <Text style={styles.agendaTitle}>
            Schedule for {readableDay}
          </Text>

          {dayItems.length === 0 ? (
            <BlurView intensity={15} tint="light" style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={32} color="#94a3b8" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyText}>No events, payments, or spends recorded on this day.</Text>
            </BlurView>
          ) : (
            <>
              {/* Total Day Spend Card */}
              {dailySummary.spend > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <TouchableOpacity
                    style={styles.txCard}
                    onPress={() => setShowSpendDetails(!showSpendDetails)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.txIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                      <Ionicons name="wallet-outline" size={20} color="#ef4444" />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.txDesc} numberOfLines={1}>
                        Total Day Spend
                      </Text>
                      <Text style={styles.txDate}>
                        {spendItems.length} transaction{spendItems.length > 1 ? 's' : ''} · Tap to {showSpendDetails ? 'hide' : 'expand'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.txAmount, { color: '#dc2626' }]}>
                        -{formatCurrency(dailySummary.spend)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.txCategory}>Outflow</Text>
                        <Ionicons
                          name={showSpendDetails ? 'chevron-up' : 'chevron-down'}
                          size={12}
                          color="#64748b"
                          style={{ marginLeft: 3 }}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Optional expanded list of individual spends */}
                  {showSpendDetails && (
                    <View style={{ gap: 8, marginTop: 8, paddingLeft: 12 }}>
                      {spendItems.map((item, idx) => {
                        const catInfo = getCategoryIcon(item.category);
                        return (
                          <TouchableOpacity
                            key={item.id || idx}
                            style={styles.txCardCompact}
                            onPress={() => router.push({ pathname: '/add-transaction', params: { id: item.id } })}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.txIconWrapSmall, { backgroundColor: catInfo.color + '18' }]}>
                              <Ionicons name={catInfo.name} size={16} color={catInfo.color} />
                            </View>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={styles.txDescCompact} numberOfLines={1}>
                                {item.loanName || item.category}
                              </Text>
                              <Text style={styles.txDateCompact}>{item.category}</Text>
                            </View>
                            <Text style={[styles.txAmountCompact, { color: '#dc2626' }]}>
                              -{formatCurrency(item.amount)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* Total Day Inflow Card */}
              {dailySummary.credit > 0 && (
                <View style={[styles.txCard, { marginBottom: 10 }]}>
                  <View style={[styles.txIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                    <Ionicons name="cash-outline" size={20} color="#10b981" />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.txDesc} numberOfLines={1}>Total Day Inflow</Text>
                    <Text style={styles.txDate}>{creditItems.length} credit transaction(s)</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.txAmount, { color: '#059669' }]}>
                      +{formatCurrency(dailySummary.credit)}
                    </Text>
                    <Text style={styles.txCategory}>Inflow</Text>
                  </View>
                </View>
              )}

              {/* Bills, EMIs, Insurances */}
              {billItems.map((item, index) => {
                const isPaid = item.isPaid;
                const iconName = item.type === 'insurance' ? 'shield-checkmark-outline' : item.type === 'bullet' ? 'trending-up-outline' : 'wallet-outline';
                const iconColor = item.type === 'insurance' ? '#eab308' : item.type === 'bullet' ? '#8b5cf6' : '#6366f1';
                const categoryLabel = item.type === 'insurance' ? 'Insurance' : item.type === 'bullet' ? 'Bullet' : 'EMI';

                return (
                  <View key={index} style={[styles.txCard, { marginBottom: 10 }]}>
                    <View style={[styles.txIconWrap, { backgroundColor: iconColor + '18' }]}>
                      <Ionicons name={iconName} size={20} color={iconColor} />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.txDesc} numberOfLines={1}>
                        {item.loanName}
                      </Text>
                      <Text style={styles.txDate}>
                        {item.type === 'insurance' ? `${(item.frequency || '').toUpperCase()} PREMIUM` : item.type === 'bullet' ? 'Bullet Repayment' : 'Monthly EMI'}
                        {isPaid ? ' · Completed' : ' · Due'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.txAmount, { color: isPaid ? '#10b981' : '#f59e0b' }]}>
                        {formatCurrency(item.amount)}
                      </Text>
                      <View style={[
                        styles.modeBadge,
                        { backgroundColor: isPaid ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', marginTop: 2 }
                      ]}>
                        <Text style={[styles.modeBadgeText, { color: isPaid ? '#10b981' : '#f59e0b' }]}>
                          {categoryLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  headerTitle: { fontSize: 34, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 14, color: 'rgba(15, 23, 42, 0.6)', marginTop: 4 },
  calendarCard: { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)', marginBottom: 24, paddingBottom: 10 },
  agendaContainer: { gap: 4 },
  agendaTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 12, marginTop: 8 },
  emptyCard: { padding: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.04)' },
  emptyText: { color: 'rgba(15, 23, 42, 0.5)', fontSize: 13, textAlign: 'center' },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txDesc: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginBottom: 2 },
  txDate: { fontSize: 11, color: '#94a3b8' },
  txAmount: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  txCategory: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  txCardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  txIconWrapSmall: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  txDescCompact: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  txDateCompact: { fontSize: 10, color: '#94a3b8' },
  txAmountCompact: { fontSize: 14, fontWeight: '700' },
  modeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  modeBadgeText: { fontSize: 9, fontWeight: '700' },
});

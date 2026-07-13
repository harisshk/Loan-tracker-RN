import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { getLoans, getPayments, getInsurances } from '../../utils/storage';
import { getTransactions } from '../../utils/transactions';
import { calculateEMIBreakdown } from '../../utils/emiCalculator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [spends, setSpends] = useState([]);
  const [focusTrigger, setFocusTrigger] = useState(0);

  const toLocalISOString = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const parseDateToLocal = (dateStr) => {
    if (!dateStr) return new Date();
    // If it's a date-only string like YYYY-MM-DD
    if (dateStr.length >= 10 && dateStr.substring(0, 10).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parts = dateStr.substring(0, 10).split('-');
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(dateStr);
  };

  // Default to current month using local timezone
  const todayDateString = toLocalISOString(new Date());
  const [selectedDate, setSelectedDate] = useState(todayDateString);
  const [currentMonthStr, setCurrentMonthStr] = useState(todayDateString.slice(0, 7)); // e.g. "2023-01"

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

    // Process Insurances (Project for the next 5 years to keep it fast)
    insurances.forEach((ins) => {
      const startDate = parseDateToLocal(ins.startDate);
      const premium = parseFloat(ins.premiumAmount) || 0;
      const freq = ins.frequency; // 'yearly', 'half-yearly', 'quarterly', 'monthly'
      
      let monthsToProject = 60; // 5 years forward
      let stepMonths = 12;
      
      if (freq === 'yearly') stepMonths = 12;
      else if (freq === 'half-yearly') stepMonths = 6;
      else if (freq === 'quarterly') stepMonths = 3;
      else if (freq === 'monthly') stepMonths = 1;
      
      for (let m = 0; m <= monthsToProject; m += stepMonths) {
        const due = new Date(startDate.getFullYear(), startDate.getMonth() + m, startDate.getDate());
        const dateStr = toLocalISOString(due);
        
        // Very basic "isPaid" logic: if the due date is in the past, assume paid
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

  // Compute daily summary: spend, inflow, and bills/EMIs
  const dailySummary = useMemo(() => {
    let spend = 0;
    let credit = 0;
    let bills = 0;

    dayItems.forEach((item) => {
      const amt = parseFloat(item.amount) || 0;
      if (item.type === 'spend') {
        spend += amt;
      } else if (item.type === 'credit_tx') {
        credit += amt;
      } else if (['emi', 'bullet', 'insurance'].includes(item.type)) {
        bills += amt;
      }
    });

    return { spend, credit, bills };
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
          dotColor: '#f59e0b', // Yellow/Orange for pending
        };
      } else if (hasSpend) {
        marks[date] = {
          marked: true,
          dotColor: '#ef4444', // Red for spend
        };
      } else {
        marks[date] = {
          marked: true,
          dotColor: '#10b981', // Green for completed/paid
        };
      }
    });
    
    // Highlight currently selected date lightly
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
            Schedules on {readableDay}
          </Text>

          {dayItems.length > 0 && (
            <BlurView intensity={30} tint="light" style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Spend</Text>
                  <Text style={[styles.summaryValue, styles.spendText]}>
                    {formatCurrency(dailySummary.spend)}
                  </Text>
                </View>
                {dailySummary.bills > 0 && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Bills & EMIs</Text>
                      <Text style={[styles.summaryValue, styles.billsText]}>
                        {formatCurrency(dailySummary.bills)}
                      </Text>
                    </View>
                  </>
                )}
                {dailySummary.credit > 0 && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Inflow</Text>
                      <Text style={[styles.summaryValue, styles.creditText]}>
                        {formatCurrency(dailySummary.credit)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </BlurView>
          )}

          {dayItems.length === 0 ? (
            <BlurView intensity={15} tint="light" style={styles.emptyCard}>
              <Text style={styles.emptyText}>No events, payments, or spends recorded on this day.</Text>
            </BlurView>
          ) : (
            dayItems.map((item, index) => {
              return (
                <BlurView 
                  key={index} 
                  intensity={item.isPaid ? 10 : 25} 
                  tint="light" 
                  style={[
                    styles.agendaCard, 
                    item.type === 'spend' ? styles.agendaCardSpend : 
                    item.type === 'credit_tx' ? styles.agendaCardCredit : 
                    (item.isPaid ? styles.agendaCardPaid : styles.agendaCardPending),
                    styles.agendaCardSelected
                  ]}
                >
                  <View style={styles.agendaLeft}>
                    <View style={styles.agendaDateRow}>
                      <Text style={styles.agendaDate}>
                        {item.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Text>
                      <View style={[
                        styles.statusBadge, 
                        item.type === 'spend' ? styles.badgeSpend : 
                        item.type === 'credit_tx' ? styles.badgeCredit :
                        (item.isPaid ? styles.badgePaid : styles.badgePending)
                      ]}>
                        <Text style={[
                          styles.badgeText, 
                          item.type === 'spend' ? styles.badgeTextSpend : 
                          item.type === 'credit_tx' ? styles.badgeTextCredit :
                          (item.isPaid ? styles.badgeTextPaid : styles.badgeTextPending)
                        ]}>
                          {item.type === 'spend' ? '💸 SPEND' : 
                           item.type === 'credit_tx' ? '📥 INWARD' : 
                           (item.isPaid ? '✓ COMPLETED' : '⏳ PENDING')}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.agendaLoanName}>{item.loanName}</Text>
                    <Text style={styles.agendaType}>
                      {item.type === 'bullet' ? 'Bullet Repayment Due' : 
                       item.type === 'insurance' ? `${item.frequency.toUpperCase()} PREMIUM` :
                       item.type === 'spend' ? `SPEND • ${item.category.toUpperCase()}` :
                       item.type === 'credit_tx' ? `INWARD • ${item.category.toUpperCase()}` :
                       'Monthly EMI'}
                    </Text>
                  </View>
                  <Text style={[
                    styles.agendaAmount, 
                    item.type === 'spend' ? styles.amountSpend : 
                    item.type === 'credit_tx' ? styles.amountCredit :
                    (item.isPaid ? styles.amountPaid : styles.amountPending)
                  ]}>
                    {item.type === 'spend' ? `-${formatCurrency(item.amount)}` : 
                     item.type === 'credit_tx' ? `+${formatCurrency(item.amount)}` : 
                     formatCurrency(item.amount)}
                  </Text>
                </BlurView>
              );
            })
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
  agendaContainer: { gap: 12 },
  agendaTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 12, marginTop: 8 },
  emptyCard: { padding: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.04)' },
  emptyText: { color: 'rgba(15, 23, 42, 0.5)', fontSize: 14 },
  
  agendaCard: { 
    padding: 20, 
    borderRadius: 20, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderWidth: 1,
    backgroundColor: '#ffffff'
  },
  agendaCardPending: {
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  agendaCardPaid: {
    borderColor: 'rgba(16, 185, 129, 0.2)',
    opacity: 0.8,
  },
  agendaCardSpend: {
    borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  agendaCardCredit: {
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  agendaCardSelected: {
    borderColor: 'rgba(0, 0, 0, 0.2)',
    backgroundColor: '#f8fafc',
  },
  
  agendaLeft: { flex: 1 },
  agendaDateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  agendaDate: { fontSize: 16, color: '#38bdf8', fontWeight: '800', width: 64 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgePaid: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  badgePending: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  badgeSpend: { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
  badgeCredit: { backgroundColor: 'rgba(16, 185, 129, 0.12)' },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  badgeTextPaid: { color: '#10b981' },
  badgeTextPending: { color: '#f59e0b' },
  badgeTextSpend: { color: '#ef4444' },
  badgeTextCredit: { color: '#10b981' },
  
  agendaLoanName: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  agendaType: { fontSize: 12, color: 'rgba(15, 23, 42, 0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  agendaAmount: { fontSize: 24, fontWeight: '700' },
  amountPending: { color: '#f59e0b' },
  amountPaid: { color: '#10b981' },
  amountSpend: { color: '#ef4444' },
  amountCredit: { color: '#10b981' },
  
  summaryCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  spendText: {
    color: '#ef4444',
  },
  billsText: {
    color: '#f59e0b',
  },
  creditText: {
    color: '#10b981',
  },
});

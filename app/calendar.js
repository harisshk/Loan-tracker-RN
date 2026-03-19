import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { getLoans, getPayments, getInsurances } from '../utils/storage';
import { calculateEMIBreakdown } from '../utils/emiCalculator';

export default function CalendarScreen() {
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [insurances, setInsurances] = useState([]);

  // Default to current month
  const todayDateString = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayDateString);
  const [currentMonthStr, setCurrentMonthStr] = useState(todayDateString.slice(0, 7)); // e.g. "2023-01"
  
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const loansData = await getLoans();
    const paymentsData = await getPayments();
    const insurancesData = await getInsurances();
    setLoans(loansData);
    setPayments(paymentsData);
    setInsurances(insurancesData);
  };

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
      
      const startDate = new Date(loan.startDate);
      let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                          (today.getMonth() - startDate.getMonth());
      if (today.getDate() >= startDate.getDate()) monthsElapsed += 1;
      monthsElapsed = Math.max(0, monthsElapsed);

      const breakdown = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount, loanType, extraPayments);

      if (loanType === 'emi') {
        for (let m = 0; m < tenure; m++) {
          const due = new Date(startDate.getFullYear(), startDate.getMonth() + m, startDate.getDate());
          const dateStr = due.toISOString().split('T')[0];
          
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
        const dateStr = maturityDate.toISOString().split('T')[0];
        
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
      const startDate = new Date(ins.startDate);
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
        const dateStr = due.toISOString().split('T')[0];
        
        // Very basic "isPaid" logic: if the due date is in the past, assume paid. (User can log actual payments later if built)
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

    return map;
  }, [loans, payments, insurances]);

  // Get items specifically for the selected month to show all month schedules
  const monthItems = useMemo(() => {
    const items = [];
    Object.keys(scheduleMap).forEach(dateStr => {
      if (dateStr.startsWith(currentMonthStr)) {
        items.push(...scheduleMap[dateStr]);
      }
    });
    // Sort chronologically
    return items.sort((a, b) => a.date - b.date);
  }, [scheduleMap, currentMonthStr]);

  const markedDates = useMemo(() => {
    const marks = {};
    Object.keys(scheduleMap).forEach((date) => {
      const dayItems = scheduleMap[date];
      // If there is any item not paid, mark pending (orange), otherwise paid (green)
      const hasPending = dayItems.some(i => !i.isPaid);
      const dotColor = hasPending ? '#f59e0b' : '#10b981';
      
      marks[date] = {
        marked: true,
        dotColor: dotColor,
      };
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

  // Convert currentMonthStr "YYYY-MM" to readable label
  const monthDate = new Date(currentMonthStr + '-01');
  const readableMonth = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Calendar Schedule</Text>
          <Text style={styles.headerSubtitle}>View and track your monthly payments</Text>
        </View>

        <BlurView intensity={20} tint="light" style={styles.calendarCard}>
          <Calendar
            current={selectedDate}
            onDayPress={(day) => {
              setSelectedDate(day.dateString);
              // Also ensure we are looking at the right month if tapped from a different month
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
            Schedules in {readableMonth}
          </Text>

          {monthItems.length === 0 ? (
            <BlurView intensity={15} tint="light" style={styles.emptyCard}>
              <Text style={styles.emptyText}>No payments due this month.</Text>
            </BlurView>
          ) : (
            monthItems.map((item, index) => {
              const isSelectedDay = item.date.toISOString().split('T')[0] === selectedDate;
              return (
                <BlurView 
                  key={index} 
                  intensity={item.isPaid ? 10 : 25} 
                  tint="light" 
                  style={[
                    styles.agendaCard, 
                    item.isPaid ? styles.agendaCardPaid : styles.agendaCardPending,
                    isSelectedDay && styles.agendaCardSelected
                  ]}
                >
                  <View style={styles.agendaLeft}>
                    <View style={styles.agendaDateRow}>
                      <Text style={styles.agendaDate}>
                        {item.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Text>
                      <View style={[styles.statusBadge, item.isPaid ? styles.badgePaid : styles.badgePending]}>
                        <Text style={[styles.badgeText, item.isPaid ? styles.badgeTextPaid : styles.badgeTextPending]}>
                          {item.isPaid ? '✓ COMPLETED' : '⏳ PENDING'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.agendaLoanName}>{item.loanName}</Text>
                    <Text style={styles.agendaType}>
                      {item.type === 'bullet' ? 'Bullet Repayment Due' : 
                       item.type === 'insurance' ? `${item.frequency.toUpperCase()} PREMIUM` :
                       'Monthly EMI'}
                    </Text>
                  </View>
                  <Text style={[styles.agendaAmount, item.isPaid ? styles.amountPaid : styles.amountPending]}>
                    {formatCurrency(item.amount)}
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
  backButton: { fontSize: 16, fontWeight: '600', color: '#2563eb', marginBottom: 12 },
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
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  badgeTextPaid: { color: '#10b981' },
  badgeTextPending: { color: '#f59e0b' },
  
  agendaLoanName: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  agendaType: { fontSize: 12, color: 'rgba(15, 23, 42, 0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  agendaAmount: { fontSize: 24, fontWeight: '700' },
  amountPending: { color: '#f59e0b' },
  amountPaid: { color: '#10b981' },
});

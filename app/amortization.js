import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

export default function AmortizationSchedule() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  
  // Parse loan data from params
  const loan = {
    loanName: params.loanName,
    principal: parseFloat(params.principal) || 0,
    interest: parseFloat(params.interest) || 0,
    emiAmount: parseFloat(params.emiAmount) || 0,
    tenure: parseInt(params.tenure) || 0,
    startDate: params.startDate,
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric',
    });
  };

  // Calculate months elapsed
  const startDate = new Date(loan.startDate);
  const today = new Date();
  
  let monthsElapsed = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                      (today.getMonth() - startDate.getMonth());
  
  if (today.getDate() >= startDate.getDate()) {
    monthsElapsed += 1;
  }
  
  monthsElapsed = Math.max(0, monthsElapsed);

  // Generate amortization schedule
  const generateSchedule = () => {
    const monthlyRate = loan.interest / 12 / 100;
    const schedule = [];
    let remainingPrincipal = loan.principal;

    for (let month = 1; month <= loan.tenure; month++) {
      const interestForMonth = remainingPrincipal * monthlyRate;
      const principalForMonth = loan.emiAmount - interestForMonth;
      
      const paymentDate = new Date(startDate);
      paymentDate.setMonth(paymentDate.getMonth() + month - 1);
      
      schedule.push({
        month,
        date: paymentDate,
        emi: loan.emiAmount,
        interest: interestForMonth,
        principal: principalForMonth,
        remainingPrincipal: remainingPrincipal - principalForMonth,
        isPaid: month <= monthsElapsed,
      });
      
      remainingPrincipal -= principalForMonth;
    }

    return schedule;
  };

  const schedule = generateSchedule();
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleExportCSV = async () => {
    try {
      let csvContent = `Month,Date,Principal (Rs),Interest (Rs),EMI (Rs),Remaining Balance (Rs),Status\n`;
      schedule.forEach((row) => {
        csvContent += `${row.month},${formatDate(row.date)},${row.principal.toFixed(2)},${row.interest.toFixed(2)},${row.emi.toFixed(2)},${row.remainingPrincipal.toFixed(2)},${row.isPaid ? 'Paid' : 'Pending'}\n`;
      });
      
      const fileUri = FileSystem.documentDirectory + `Loan_Schedule_${loan.loanName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Success', `File saved to ${fileUri}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export schedule');
      console.error(error);
    }
  };

  const handleExportHTML = async () => {
    try {
      let rows = '';
      schedule.forEach((row) => {
        rows += `
          <tr class="${row.isPaid ? 'paid' : ''}">
            <td>${row.month}</td>
            <td>${formatDate(row.date)}</td>
            <td class="amount principal">${formatCurrency(row.principal)}</td>
            <td class="amount interest">${formatCurrency(row.interest)}</td>
            <td class="amount">${formatCurrency(row.emi)}</td>
            <td class="amount balance">${formatCurrency(row.remainingPrincipal)}</td>
            <td><span class="badge ${row.isPaid ? 'badge-paid' : 'badge-pending'}">${row.isPaid ? 'Paid' : 'Pending'}</span></td>
          </tr>
        `;
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Amortization Schedule - ${loan.loanName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #0f172a; background-color: #f8fafc; }
            h1 { font-size: 24px; font-weight: 800; margin-bottom: 4px; color: #0f172a; }
            h2 { font-size: 14px; font-weight: 600; color: #64748b; margin-top: 0; margin-bottom: 24px; }
            .stats { display: flex; gap: 16px; margin-bottom: 24px; }
            .stat-card { flex: 1; padding: 16px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; }
            .stat-label { font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; font-weight: 700; letter-spacing: 0.5px; }
            .stat-value { font-size: 18px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
            th { background-color: #f1f5f9; padding: 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
            td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; font-weight: 500; }
            tr.paid { background-color: rgba(16, 185, 129, 0.02); }
            .amount { text-align: right; }
            .principal { color: #10b981; }
            .interest { color: #f59e0b; }
            .balance { color: #e11d48; font-weight: 600; }
            .badge { display: inline-block; padding: 4px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
            .badge-paid { background-color: rgba(16, 185, 129, 0.1); color: #10b981; }
            .badge-pending { background-color: rgba(100, 116, 139, 0.1); color: #64748b; }
            @media print {
              body { background-color: white; padding: 0; }
              .stat-card { border: 1px solid #cbd5e1; }
              table { border: 1px solid #cbd5e1; page-break-inside: auto; }
              tr { page-break-inside: avoid; page-break-after: auto; }
            }
          </style>
        </head>
        <body>
          <h1>Payment Amortization Schedule</h1>
          <h2>Loan: ${loan.loanName}</h2>
          <div class="stats">
            <div class="stat-card">
              <div class="stat-label">Principal Amount</div>
              <div class="stat-value">${formatCurrency(loan.principal)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Interest Rate</div>
              <div class="stat-value">${loan.interest}% p.a.</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Monthly EMI</div>
              <div class="stat-value">${formatCurrency(loan.emiAmount)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Tenure</div>
              <div class="stat-value">${loan.tenure} Months</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Due Date</th>
                <th class="amount">Principal</th>
                <th class="amount">Interest</th>
                <th class="amount">EMI</th>
                <th class="amount">Remaining Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const fileUri = FileSystem.documentDirectory + `Loan_Schedule_${loan.loanName.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
      await FileSystem.writeAsStringAsync(fileUri, htmlContent, { encoding: 'utf8' });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Success', `File saved to ${fileUri}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export HTML schedule');
      console.error(error);
    }
  };

  return (
    <LinearGradient
      colors={['#f8fafc', '#f1f5f9', '#e2e8f0']}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#10b981"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment Schedule</Text>
          <Text style={styles.headerSubtitle}>{loan.loanName}</Text>
        </View>

        {/* Summary Card */}
        <BlurView intensity={20} tint="light" style={styles.summaryCard}>
          <View style={styles.cardContent}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Monthly EMI</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(loan.emiAmount)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Payments Made</Text>
                <Text style={[styles.summaryValue, { color: '#10b981' }]}>
                  {monthsElapsed} / {loan.tenure}
                </Text>
              </View>
            </View>
          </View>
        </BlurView>

        <TouchableOpacity style={styles.exportButton} onPress={handleExportCSV}>
          <BlurView intensity={25} tint="light" style={styles.exportBlur}>
            <Text style={styles.exportButtonText}>📥 Export to CSV / Excel</Text>
          </BlurView>
        </TouchableOpacity>

        <TouchableOpacity style={styles.printButton} onPress={handleExportHTML}>
          <BlurView intensity={25} tint="light" style={styles.printBlur}>
            <Text style={styles.printButtonText}>🖨️ Export to Printable Document (HTML/PDF)</Text>
          </BlurView>
        </TouchableOpacity>

        {/* Schedule Table Header */}
        <BlurView intensity={25} tint="light" style={styles.tableHeader}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableHeaderText, styles.colMonth]}>Month</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>Principal</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>Interest</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>EMI</Text>
            <Text style={[styles.tableHeaderText, styles.colBalance]}>Balance</Text>
          </View>
        </BlurView>

        {/* Schedule Table Rows */}
        {schedule.map((row, index) => (
          <BlurView
            key={row.month}
            intensity={row.isPaid ? 18 : 12}
            tint="light"
            style={[
              styles.tableRowContainer,
              row.isPaid && styles.paidRow,
              index === schedule.length - 1 && styles.lastRow,
            ]}
          >
            <View style={styles.tableRow}>
              <View style={[styles.colMonth, { flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.monthText}>{row.month}</Text>
                  {row.isPaid && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={{ fontSize: 10, color: 'rgba(15, 23, 42, 0.6)' }}>
                  {formatDate(row.date)}
                </Text>
              </View>
              <Text style={[styles.tableText, styles.colAmount, styles.principalText]}>
                {formatCurrency(row.principal)}
              </Text>
              <Text style={[styles.tableText, styles.colAmount, styles.interestText]}>
                {formatCurrency(row.interest)}
              </Text>
              <Text style={[styles.tableText, styles.colAmount]}>
                {formatCurrency(row.emi)}
              </Text>
              <Text style={[styles.tableText, styles.colBalance, styles.balanceText]}>
                {formatCurrency(row.remainingPrincipal)}
              </Text>
            </View>
          </BlurView>
        ))}
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
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(15, 23, 42, 0.6)',
  },
  summaryCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  cardContent: {
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.6)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  exportButton: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    marginBottom: 24,
  },
  exportBlur: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#38bdf8',
  },
  tableHeader: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 2,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tableRowContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 1,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  paidRow: {
    borderColor: 'rgba(16, 185, 129, 0.15)',
    backgroundColor: 'rgba(16, 185, 129, 0.02)',
  },
  lastRow: {
    marginBottom: 20,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(15, 23, 42, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  colMonth: {
    width: 75,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  colAmount: {
    flex: 1,
    textAlign: 'right',
  },
  colBalance: {
    flex: 1.2,
    textAlign: 'right',
  },
  monthText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  checkMark: {
    fontSize: 10,
    color: '#10b981',
  },
  principalText: {
    color: '#10b981',
  },
  interestText: {
    color: '#f59e0b',
  },
  balanceText: {
    color: '#e11d48',
    fontWeight: '600',
  },
  printButton: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    marginBottom: 24,
  },
  printBlur: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  printButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
  },
});

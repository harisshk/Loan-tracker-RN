import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  colors,
  EmptyState,
  HIT,
  Pill,
  PressableScale,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  space,
  StatRow,
  StatTile,
  type,
} from "../components/ui/kit";
import {
  countsTowardBalance,
  getBulletMaturityDate,
  getInstalmentDate,
  getMonthsElapsed,
  getPaymentDate,
  parseLocalDate,
  toLocalISOString,
} from "../utils/emiCalculator";
import { formatDateShort, formatINR, formatPercent } from "../utils/format";
import { getLoans, getPayments } from "../utils/storage";

/** Group rows by calendar year once the schedule is longer than a year. */
const GROUP_THRESHOLD = 12;

export default function AmortizationSchedule() {
  const params = useLocalSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState(null);
  const [payments, setPayments] = useState([]);
  // Years the user expanded / collapsed (flips the default for that year).
  const [toggledYears, setToggledYears] = useState({});

  const loadData = useCallback(
    () =>
      getLoans()
        .then((allLoans) =>
          getPayments().then((allPayments) => {
            const found = allLoans.find((l) => l.id === params.id);
            if (found) {
              setLoan(found);
            } else {
              // Fallback to params
              setLoan({
                loanName: params.loanName || "Loan Schedule",
                loanType: params.loanType || "emi",
                principal: parseFloat(params.principal) || 0,
                interest: parseFloat(params.interest) || 0,
                emiAmount: parseFloat(params.emiAmount) || 0,
                tenure: parseInt(params.tenure) || 0,
                startDate: params.startDate || toLocalISOString(new Date()),
              });
            }
            setPayments(allPayments.filter((p) => p.loanId === params.id));
          }),
        )
        .catch((e) => {
          console.error("Error loading loan schedule:", e);
        })
        .finally(() => {
          setLoading(false);
        }),
    [
      params.id,
      params.loanName,
      params.loanType,
      params.principal,
      params.interest,
      params.emiAmount,
      params.tenure,
      params.startDate,
    ],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const formatDate = (dateStringOrDate) => {
    if (!dateStringOrDate) return "N/A";
    const date =
      dateStringOrDate instanceof Date
        ? dateStringOrDate
        : parseLocalDate(dateStringOrDate);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <Screen>
        <ScreenHeader back title="Schedule" subtitle={params.loanName} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryFill} />
          <Text style={styles.loadingText}>Building schedule…</Text>
        </View>
      </Screen>
    );
  }

  if (!loan) {
    return (
      <Screen>
        <ScreenHeader back title="Schedule" subtitle={params.loanName} />
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load this schedule"
          message="Check your connection and try again."
        />
        <Button
          label="Try again"
          variant="secondary"
          icon="refresh"
          onPress={loadData}
          style={styles.retry}
        />
      </Screen>
    );
  }

  const isBullet = (loan.loanType || params.loanType) === "bullet";

  // EMIs whose due date (clamped to month end for 29th-31st starts) has arrived
  const monthsElapsed = getMonthsElapsed(loan.startDate, new Date());

  const bulletRenewalDate = isBullet
    ? getBulletMaturityDate(loan.startDate, loan.tenure)
    : null;
  const bulletMonthlyInterest = isBullet
    ? (loan.principal * (loan.interest / 100)) / 12
    : 0;
  const bulletTotalInterest = isBullet
    ? loan.principal * (loan.interest / 100) * (loan.tenure / 12)
    : 0;
  const bulletMaturityAmount = isBullet
    ? loan.principal + bulletTotalInterest
    : 0;

  // Generate schedule (bullet monthly interest breakdown or reducing balance EMI schedule)
  const generateSchedule = () => {
    const schedule = [];

    if (isBullet) {
      const monthlyInterest = bulletMonthlyInterest;
      for (let month = 1; month <= loan.tenure; month++) {
        const isLast = month === loan.tenure;
        // In banking & gold loans, monthly period ends on day - 1
        const paymentDate = isLast
          ? bulletRenewalDate
          : getBulletMaturityDate(loan.startDate, month);

        const principalForMonth = isLast ? loan.principal : 0;
        const interestForMonth = monthlyInterest;
        const totalDueForMonth = principalForMonth + interestForMonth;
        const remainingPrincipal = isLast ? 0 : loan.principal;

        schedule.push({
          month,
          date: paymentDate,
          emi: totalDueForMonth,
          interest: interestForMonth,
          principal: principalForMonth,
          remainingPrincipal,
          isPaid: month <= monthsElapsed,
          isLast,
        });
      }
      return schedule;
    }

    // Regular reducing balance EMI (same rules as calculateEMIBreakdown)
    const principal = parseFloat(loan.principal) || 0;
    const tenure = parseInt(loan.tenure) || 0;
    const monthlyRate = loan.interest / 12 / 100;
    const emi =
      parseFloat(loan.emiAmount) ||
      (monthlyRate === 0
        ? principal / tenure
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
          (Math.pow(1 + monthlyRate, tenure) - 1));
    let remainingPrincipal = principal;

    // Counted prepayments apply right after the last EMI due on or before their
    // date (future-dated ones at the current point), cascading into later EMIs.
    const prepayments = payments
      .filter((p) => countsTowardBalance(p, "emi", emi))
      .map((p) => {
        const afterEmi = getMonthsElapsed(
          loan.startDate,
          parseLocalDate(getPaymentDate(p)),
        );
        return {
          amount: parseFloat(String(p.amount).replace(/,/g, "")) || 0,
          afterEmi: Number.isFinite(afterEmi)
            ? Math.min(afterEmi, monthsElapsed)
            : monthsElapsed,
        };
      });
    const applyPrepaymentsAfter = (m) => {
      prepayments.forEach((p) => {
        if (p.afterEmi !== m || remainingPrincipal <= 0.01) return;
        remainingPrincipal -= Math.min(remainingPrincipal, p.amount);
      });
    };

    applyPrepaymentsAfter(0);
    for (
      let month = 1;
      month <= tenure && remainingPrincipal > 0.01;
      month++
    ) {
      const interestForMonth = remainingPrincipal * monthlyRate;
      const principalForMonth = Math.max(
        0,
        Math.min(remainingPrincipal, emi - interestForMonth),
      );

      remainingPrincipal -= principalForMonth;
      if (month <= monthsElapsed) applyPrepaymentsAfter(month);

      schedule.push({
        month,
        date: getInstalmentDate(loan.startDate, month),
        // Final EMI is smaller when prepayments close the loan early
        emi: Math.min(emi, interestForMonth + principalForMonth),
        interest: interestForMonth,
        principal: principalForMonth,
        remainingPrincipal: Math.max(0, remainingPrincipal),
        isPaid: month <= monthsElapsed,
        isLast: month === tenure || remainingPrincipal <= 0.01,
      });
    }

    return schedule;
  };

  const schedule = generateSchedule();
  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleExportCSV = async () => {
    try {
      let csvContent = isBullet
        ? `Month,Due Date,Principal Due (Rs),Monthly Interest (Rs),Total Monthly Due (Rs),Remaining Principal (Rs),Status\n`
        : `Month,Date,Principal (Rs),Interest (Rs),EMI (Rs),Remaining Balance (Rs),Status\n`;

      schedule.forEach((row) => {
        const statusLabel = row.isLast
          ? row.isPaid
            ? "Matured / Settled"
            : "Renewal Due"
          : row.isPaid
            ? "Accrued / Paid"
            : "Pending";

        csvContent += `${row.month},${formatDate(row.date)},${row.principal.toFixed(2)},${row.interest.toFixed(2)},${row.emi.toFixed(2)},${row.remainingPrincipal.toFixed(2)},${statusLabel}\n`;
      });

      const fileUri =
        FileSystem.documentDirectory +
        `Loan_Schedule_${loan.loanName.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: "utf8",
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Success", `File saved to ${fileUri}`);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to export schedule");
      console.error(error);
    }
  };

  const handleExportHTML = async () => {
    try {
      let rows = "";
      schedule.forEach((row) => {
        const statusBadge = row.isLast
          ? `<span class="badge ${row.isPaid ? "badge-paid" : "badge-renewal"}">${row.isPaid ? "Matured" : "Renewal Due"}</span>`
          : `<span class="badge ${row.isPaid ? "badge-paid" : "badge-pending"}">${row.isPaid ? "Paid" : "Pending"}</span>`;

        rows += `
          <tr class="${row.isPaid ? "paid" : ""} ${row.isLast ? "renewal-row" : ""}">
            <td>${row.isLast ? `🎯 ${row.month} (Final)` : row.month}</td>
            <td>${formatDate(row.date)}</td>
            <td class="amount principal">${formatCurrency(row.principal)}</td>
            <td class="amount interest">${formatCurrency(row.interest)}</td>
            <td class="amount font-bold">${formatCurrency(row.emi)}</td>
            <td class="amount balance">${formatCurrency(row.remainingPrincipal)}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${isBullet ? "Bullet Loan Interest & Maturity Schedule" : "Payment Amortization Schedule"} - ${loan.loanName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #0f172a; background-color: #f8fafc; }
            h1 { font-size: 24px; font-weight: 800; margin-bottom: 4px; color: #0f172a; }
            h2 { font-size: 14px; font-weight: 600; color: #64748b; margin-top: 0; margin-bottom: 24px; }
            .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
            .stat-card { flex: 1; min-width: 140px; padding: 16px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; }
            .stat-label { font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; font-weight: 700; letter-spacing: 0.5px; }
            .stat-value { font-size: 18px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
            th { background-color: #f1f5f9; padding: 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
            td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; font-weight: 500; }
            tr.paid { background-color: rgba(16, 185, 129, 0.02); }
            tr.renewal-row { background-color: rgba(245, 158, 11, 0.05); font-weight: 600; }
            .amount { text-align: right; }
            .principal { color: #10b981; }
            .interest { color: #f59e0b; }
            .balance { color: #e11d48; font-weight: 600; }
            .font-bold { font-weight: 700; }
            .badge { display: inline-block; padding: 4px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
            .badge-paid { background-color: rgba(16, 185, 129, 0.1); color: #10b981; }
            .badge-pending { background-color: rgba(100, 116, 139, 0.1); color: #64748b; }
            .badge-renewal { background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; }
            @media print {
              body { background-color: white; padding: 0; }
              .stat-card { border: 1px solid #cbd5e1; }
              table { border: 1px solid #cbd5e1; page-break-inside: auto; }
              tr { page-break-inside: avoid; page-break-after: auto; }
            }
          </style>
        </head>
        <body>
          <h1>${isBullet ? "Bullet Loan Interest & Maturity Schedule" : "Payment Amortization Schedule"}</h1>
          <h2>Loan: ${loan.loanName} ${isBullet ? "(Bullet / Gold Loan)" : ""}</h2>
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
              <div class="stat-label">${isBullet ? "Monthly Interest" : "Monthly EMI"}</div>
              <div class="stat-value">${formatCurrency(isBullet ? bulletMonthlyInterest : loan.emiAmount)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">${isBullet ? "Renewal Date" : "Tenure"}</div>
              <div class="stat-value">${isBullet ? formatDate(bulletRenewalDate) : `${loan.tenure} Months`}</div>
            </div>
            ${
              isBullet
                ? `
            <div class="stat-card">
              <div class="stat-label">Lump Sum at Maturity</div>
              <div class="stat-value" style="color: #e11d48;">${formatCurrency(bulletMaturityAmount)}</div>
            </div>`
                : ""
            }
          </div>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Due Date</th>
                <th class="amount">${isBullet ? "Principal Due" : "Principal"}</th>
                <th class="amount">${isBullet ? "Monthly Interest" : "Interest"}</th>
                <th class="amount">${isBullet ? "Total Due" : "EMI"}</th>
                <th class="amount">${isBullet ? "Remaining Principal" : "Remaining Balance"}</th>
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

      const fileUri =
        FileSystem.documentDirectory +
        `Loan_Schedule_${loan.loanName.replace(/[^a-zA-Z0-9]/g, "_")}.html`;
      await FileSystem.writeAsStringAsync(fileUri, htmlContent, {
        encoding: "utf8",
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Success", `File saved to ${fileUri}`);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to export HTML schedule");
      console.error(error);
    }
  };

  // ── Presentation ──────────────────────────────────────────────────────────
  const paymentsMade = Math.min(monthsElapsed, loan.tenure);
  const tenureMonths = parseInt(loan.tenure) || 0;
  const progressPct = tenureMonths > 0 ? (paymentsMade / tenureMonths) * 100 : 0;
  const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);
  const currentIndex = schedule.findIndex((row) => !row.isPaid);
  const lastRow = schedule[schedule.length - 1];
  const monthlyEmi = parseFloat(loan.emiAmount) || (schedule[0] ? schedule[0].emi : 0);

  const grouped = schedule.length > GROUP_THRESHOLD;
  const groups = grouped
    ? schedule.reduce((acc, row, index) => {
        const year = row.date.getFullYear();
        const last = acc[acc.length - 1];
        if (last && last.year === year) {
          last.items.push({ row, index });
        } else {
          acc.push({ year, items: [{ row, index }] });
        }
        return acc;
      }, [])
    : [{ year: null, items: schedule.map((row, index) => ({ row, index })) }];

  const statusFor = (row, index) => {
    if (isBullet && row.isLast) return row.isPaid ? "Matured" : "Maturity due";
    if (row.isPaid) return isBullet ? "Accrued" : "Paid";
    if (index === currentIndex) return "Next";
    return null;
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader
        back
        title={isBullet ? "Interest schedule" : "Payment schedule"}
        subtitle={`${loan.loanName}${isBullet ? " · Bullet / gold loan" : ""}`}
      />

      {/* Summary */}
      <Card>
        {isBullet ? (
          <StatRow>
            <StatTile label="Monthly interest" value={formatINR(bulletMonthlyInterest)} />
            <StatTile label="Due at maturity" value={formatINR(bulletMaturityAmount)} />
            <StatTile label="Months elapsed" value={`${paymentsMade} / ${loan.tenure}`} />
          </StatRow>
        ) : (
          <StatRow>
            <StatTile label="Monthly EMI" value={formatINR(monthlyEmi)} />
            <StatTile label="Total interest" value={formatINR(totalInterest)} />
            <StatTile label="Payments made" value={`${paymentsMade} / ${loan.tenure}`} />
          </StatRow>
        )}
        <ProgressBar
          segments={[{ value: progressPct, color: colors.primaryFill }]}
          height={6}
          style={styles.progress}
          accessibilityLabel={`${formatPercent(progressPct, 0)} of tenure complete`}
        />
        <View style={styles.progressMeta}>
          <Text style={styles.progressText}>{formatPercent(progressPct, 0)} of tenure</Text>
          <Text style={styles.progressText}>
            {isBullet
              ? `Renewal ${formatDate(bulletRenewalDate)}`
              : lastRow
                ? `Last EMI ${formatDate(lastRow.date)}`
                : ""}
          </Text>
        </View>
      </Card>

      {/* Export */}
      <View style={styles.actions}>
        <Button
          label="Export CSV"
          icon="download-outline"
          variant="secondary"
          onPress={handleExportCSV}
          style={styles.actionBtn}
        />
        <Button
          label="Print / PDF"
          icon="print-outline"
          variant="secondary"
          onPress={handleExportHTML}
          style={styles.actionBtn}
        />
      </View>

      {/* Schedule */}
      <SectionHeader
        title={isBullet ? "Interest & maturity" : "Amortization"}
        count={schedule.length}
        style={styles.sectionGap}
      />
      {schedule.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar-outline"
            title="No schedule to show"
            message="Set a tenure on this loan to see its month-by-month breakdown."
          />
        </Card>
      ) : (
        <>
          <View style={styles.legend}>
            <LegendItem icon="checkmark-circle" color={colors.primaryFill} label={isBullet ? "Accrued" : "Paid"} />
            <LegendItem icon="ellipse" color={colors.indigo} label="Next due" />
            {isBullet ? <LegendItem icon="flag" color={colors.warningFill} label="Maturity" /> : null}
          </View>
          {groups.map((group) => {
            const allPaid = group.items.every(({ row }) => row.isPaid);
            const hasCurrent = group.items.some(({ index }) => index === currentIndex);
            const key = group.year ?? "all";
            const expanded = !grouped || (!allPaid !== !!toggledYears[key]);
            const groupInterest = group.items.reduce((sum, { row }) => sum + row.interest, 0);
            return (
              <Card key={key} padded={false} style={styles.groupCard}>
                {grouped ? (
                  <PressableScale
                    onPress={() => setToggledYears((prev) => ({ ...prev, [key]: !prev[key] }))}
                    style={styles.groupHeader}
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${group.year}, ${group.items.length} ${isBullet ? "months" : "payments"}, ${formatINR(groupInterest)} interest${allPaid ? ", all paid" : ""}`}
                    accessibilityHint={expanded ? "Collapses this year" : "Expands this year"}
                  >
                    <View style={styles.groupText}>
                      <Text style={styles.groupYear} accessibilityRole="header">
                        {group.year}
                      </Text>
                      <Text style={styles.groupMeta}>
                        {group.items.length} {isBullet ? "months" : "payments"} · {formatINR(groupInterest)} interest
                      </Text>
                    </View>
                    {allPaid ? (
                      <Pill label={isBullet ? "Accrued" : "Paid"} icon="checkmark" color={colors.primary} backgroundColor={colors.primarySoft} />
                    ) : hasCurrent ? (
                      <Pill label="In progress" color={colors.indigo} backgroundColor={colors.indigoSoft} />
                    ) : null}
                    <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
                  </PressableScale>
                ) : null}

                {expanded ? (
                  <>
                    <View style={[styles.colHeader, grouped && styles.rowDivider]}>
                      <Text style={[styles.colLabel, styles.colWhen]}>Due</Text>
                      <Text style={[styles.colLabel, styles.colAmount]}>Principal</Text>
                      <Text style={[styles.colLabel, styles.colAmount]}>Interest</Text>
                      <Text style={[styles.colLabel, styles.colAmount]}>Balance</Text>
                    </View>
                    {group.items.map(({ row, index }) => (
                      <ScheduleRow
                        key={row.month}
                        row={row}
                        date={grouped ? formatDateShort(row.date) : formatDate(row.date)}
                        fullDate={formatDate(row.date)}
                        status={statusFor(row, index)}
                        isCurrent={index === currentIndex}
                        isMaturity={isBullet && row.isLast}
                        emiLabel={isBullet ? (row.isLast ? "Lump sum due" : "Monthly interest") : "EMI"}
                      />
                    ))}
                  </>
                ) : null}
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

function LegendItem({ icon, color, label }) {
  return (
    <View style={styles.legendItem}>
      <Ionicons name={icon} size={icon === "ellipse" ? 9 : 13} color={color} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function ScheduleRow({ row, date, fullDate, status, isCurrent, isMaturity, emiLabel }) {
  const muted = row.isPaid && !isMaturity;
  const amountStyle = [styles.amount, muted && styles.amountMuted];
  return (
    <View
      style={[
        styles.row,
        styles.rowDivider,
        muted && styles.rowPaid,
        isCurrent && styles.rowCurrent,
        isMaturity && styles.rowMaturity,
      ]}
      accessible
      accessibilityLabel={`Month ${row.month}, ${fullDate}${status ? `, ${status}` : ""}. ${emiLabel} ${formatINR(row.emi)}. Principal ${formatINR(row.principal)}, interest ${formatINR(row.interest)}, balance ${formatINR(row.remainingPrincipal)}`}
    >
      <View style={styles.colWhen}>
        <Text style={[styles.rowDate, muted && styles.amountMuted]} numberOfLines={1}>
          {date}
        </Text>
        <View style={styles.rowMetaLine}>
          {isMaturity ? (
            <Ionicons name="flag" size={11} color={colors.warningFill} />
          ) : row.isPaid ? (
            <Ionicons name="checkmark-circle" size={12} color={colors.primaryFill} />
          ) : isCurrent ? (
            <Ionicons name="ellipse" size={8} color={colors.indigo} />
          ) : null}
          <Text
            style={[
              styles.rowMeta,
              isCurrent && styles.rowMetaCurrent,
              isMaturity && styles.rowMetaMaturity,
            ]}
            numberOfLines={1}
          >
            #{row.month}
            {status ? ` · ${status}` : ""}
          </Text>
        </View>
      </View>
      <Text style={[amountStyle, styles.colAmount]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {formatINR(row.principal)}
      </Text>
      <Text style={[amountStyle, styles.colAmount]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {formatINR(row.interest)}
      </Text>
      <Text
        style={[amountStyle, styles.colAmount, styles.balance]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {formatINR(row.remainingPrincipal)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    paddingVertical: space.xxxl,
    gap: space.sm,
  },
  loadingText: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  retry: {
    alignSelf: "center",
  },
  progress: {
    marginTop: space.lg,
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.md,
    marginTop: space.sm,
  },
  progressText: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: space.md,
    marginTop: space.lg,
  },
  actionBtn: {
    flex: 1,
    paddingHorizontal: space.md,
  },
  sectionGap: {
    marginTop: space.xxl,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.lg,
    marginBottom: space.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
  },
  legendText: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  groupCard: {
    marginBottom: space.md,
    paddingBottom: space.xs,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: HIT + 12,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  groupText: {
    flex: 1,
    minWidth: 0,
  },
  groupYear: {
    ...type.headline,
    color: colors.text,
  },
  groupMeta: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 2,
  },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  colLabel: {
    ...type.overline,
    fontSize: 10,
    color: colors.textMuted,
  },
  colWhen: {
    flex: 1.25,
    minWidth: 0,
  },
  colAmount: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowPaid: {
    backgroundColor: colors.surfaceMuted,
  },
  rowCurrent: {
    backgroundColor: colors.indigoSoft,
    borderLeftColor: colors.indigo,
  },
  rowMaturity: {
    backgroundColor: colors.warningSoft,
    borderLeftColor: colors.warningFill,
  },
  rowDate: {
    ...type.label,
    fontWeight: "700",
    color: colors.text,
  },
  rowMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  rowMeta: {
    ...type.caption,
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
  },
  rowMetaCurrent: {
    color: colors.indigo,
    fontWeight: "700",
  },
  rowMetaMaturity: {
    color: colors.warning,
    fontWeight: "700",
  },
  amount: {
    ...type.label,
    fontVariant: ["tabular-nums"],
    color: colors.text,
  },
  amountMuted: {
    color: colors.textSecondary,
  },
  balance: {
    fontWeight: "700",
    flex: 1.3,
  },
});

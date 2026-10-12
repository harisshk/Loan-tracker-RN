import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Calendar } from "react-native-calendars";
import {
  Card,
  colors,
  EmptyState,
  Gap,
  IconBadge,
  kindColors,
  ListRow,
  Pill,
  Screen,
  ScreenHeader,
  SectionHeader,
  space,
  StatRow,
  StatTile,
  type,
} from "../../components/ui/kit";
import { getCategoryIcon } from "../../constants/categories";
import {
  addMonthsClamped,
  calculateEMIBreakdown,
  getBulletMaturityDate,
  getInstalmentDate,
  getMonthsElapsed,
  getPremiumStepMonths,
} from "../../utils/emiCalculator";
import { formatDateWithDay, formatINR, formatMonthYear } from "../../utils/format";
import { getInsurances, getLoans, getPayments } from "../../utils/storage";
import { getTransactions } from "../../utils/transactions";

const toLocalISOString = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseDateToLocal = (dateStr) => {
  if (!dateStr) return new Date();
  if (
    dateStr.length >= 10 &&
    dateStr.substring(0, 10).match(/^\d{4}-\d{2}-\d{2}$/)
  ) {
    const parts = dateStr.substring(0, 10).split("-");
    return new Date(
      parseInt(parts[0]),
      parseInt(parts[1]) - 1,
      parseInt(parts[2]),
    );
  }
  return new Date(dateStr);
};

const formatCurrency = (amount) => formatINR(parseFloat(amount || 0));

/** Calendar dot colours, one per kind of item (legend below the calendar). */
const DOTS = {
  emi: { key: "emi", color: kindColors.emi.fill, label: "EMI" },
  bullet: { key: "bullet", color: kindColors.bullet.fill, label: "Bullet" },
  insurance: { key: "insurance", color: kindColors.insurance.fill, label: "Insurance" },
  spend: { key: "spend", color: colors.pinkFill, label: "Spend" },
  credit_tx: { key: "credit_tx", color: colors.primaryFill, label: "Received" },
};
const DOT_ORDER = ["emi", "bullet", "insurance", "spend", "credit_tx"];

const billMeta = (item) => {
  if (item.type === "insurance") {
    const freq = item.frequency || "";
    const label = freq ? `${freq.charAt(0).toUpperCase()}${freq.slice(1)} premium` : "Premium";
    return { kind: kindColors.insurance, label, short: "Insurance" };
  }
  if (item.type === "bullet") {
    return { kind: kindColors.bullet, label: "Bullet repayment", short: "Bullet" };
  }
  return { kind: kindColors.emi, label: "Monthly EMI", short: "EMI" };
};

export default function CalendarScreen() {
  const router = useRouter();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [spends, setSpends] = useState([]);
  const [showSpendDetails, setShowSpendDetails] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);

  // Default to current month using local timezone
  const todayDateString = toLocalISOString(new Date());
  const [selectedDate, setSelectedDate] = useState(todayDateString);
  const [currentMonthStr, setCurrentMonthStr] = useState(
    todayDateString.slice(0, 7),
  );

  const loadData = useCallback(async (month) => {
    try {
      const loansData = await getLoans();
      const paymentsData = await getPayments();
      const insurancesData = await getInsurances();
      setLoans(loansData || []);
      setPayments(paymentsData || []);
      setInsurances(insurancesData || []);

      const spendsData = await getTransactions(month);
      setSpends(spendsData || []);
      setLoadError(false);
    } catch (e) {
      console.error("Error loading calendar data:", e);
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Reload whenever the screen gains focus or the visible month changes
  useFocusEffect(
    useCallback(() => {
      loadData(currentMonthStr);
    }, [loadData, currentMonthStr]),
  );

  const scheduleMap = useMemo(() => {
    const map = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    loans.forEach((loan) => {
      const principal = parseFloat(loan.principal) || 0;
      const interest = parseFloat(loan.interest) || 0;
      const tenure = parseInt(loan.tenure) || 0;
      const loanType = loan.loanType || "emi";
      const emiAmount = parseFloat(loan.emiAmount) || 0;
      const extraPayments = payments.filter((p) => p.loanId === loan.id);

      const monthsElapsed = getMonthsElapsed(loan.startDate, today);

      const breakdown = calculateEMIBreakdown(
        principal,
        interest,
        tenure,
        monthsElapsed,
        emiAmount,
        loanType,
        extraPayments,
        loan.startDate,
      );

      if (loanType === "emi") {
        for (let m = 0; m < tenure; m++) {
          // EMI #(m + 1), clamped to month end for 29th-31st start dates
          const due = getInstalmentDate(loan.startDate, m + 1);
          const dateStr = toLocalISOString(due);

          const isPaid = m < monthsElapsed;

          if (!map[dateStr]) map[dateStr] = [];
          map[dateStr].push({
            loanId: loan.id,
            loanName: loan.loanName,
            amount: emiAmount,
            type: "emi",
            isPaid: isPaid,
            date: due,
          });
        }
      } else if (loanType === "bullet") {
        const maturityDate = getBulletMaturityDate(loan.startDate, tenure);
        const dateStr = toLocalISOString(maturityDate);

        const isPaid =
          breakdown.paymentsMade > 0 || breakdown.remainingAmount <= 0;

        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({
          loanId: loan.id,
          loanName: loan.loanName,
          amount: breakdown.totalAmount,
          type: "bullet",
          isPaid: isPaid,
          date: maturityDate,
        });
      }
    });

    // Process Insurances
    insurances.forEach((ins) => {
      const startDate = parseDateToLocal(ins.startDate);
      const premium = parseFloat(ins.premiumAmount) || 0;
      const freq = ins.frequency;

      let monthsToProject = 60;
      const stepMonths = getPremiumStepMonths(freq);

      for (let m = 0; m <= monthsToProject; m += stepMonths) {
        // start + n × step months, clamped to month end
        const due = addMonthsClamped(startDate, m);
        const dateStr = toLocalISOString(due);

        const isPaid = due < today;

        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({
          loanId: ins.id,
          loanName: ins.name,
          amount: premium,
          type: "insurance",
          frequency: freq,
          isPaid: isPaid,
          date: due,
        });
      }
    });

    // Process Spends for the month
    spends.forEach((spend) => {
      const date = parseDateToLocal(spend.date);
      const dateStr = toLocalISOString(date);
      const isCredit = (spend.type || "").toLowerCase() === "credit";

      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push({
        id: spend.id,
        loanName: spend.description || (isCredit ? "Received" : "Spend"),
        amount: spend.amount,
        type: isCredit ? "credit_tx" : "spend",
        category: spend.category || "Other",
        isPaid: true,
        date: date,
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
      if (item.type === "spend") {
        spendItems.push(item);
        spend += amt;
      } else if (item.type === "credit_tx") {
        creditItems.push(item);
        credit += amt;
      } else {
        billItems.push(item);
        bills += amt;
      }
    });

    return {
      spendItems,
      creditItems,
      billItems,
      dailySummary: { spend, credit, bills },
    };
  }, [dayItems]);

  // Totals for the visible month (summary card)
  const monthSummary = useMemo(() => {
    let scheduled = 0;
    let stillDue = 0;
    let spent = 0;
    let billCount = 0;
    Object.keys(scheduleMap).forEach((date) => {
      if (!date.startsWith(currentMonthStr)) return;
      scheduleMap[date].forEach((item) => {
        const amt = parseFloat(item.amount) || 0;
        if (item.type === "spend") {
          spent += amt;
        } else if (item.type !== "credit_tx") {
          scheduled += amt;
          billCount += 1;
          if (!item.isPaid) stillDue += amt;
        }
      });
    });
    return { scheduled, stillDue, spent, billCount };
  }, [scheduleMap, currentMonthStr]);

  const markedDates = useMemo(() => {
    const marks = {};
    Object.keys(scheduleMap).forEach((date) => {
      const kinds = new Set(scheduleMap[date].map((i) => i.type));
      const dots = DOT_ORDER.filter((k) => kinds.has(k)).map((k) => ({
        key: DOTS[k].key,
        color: DOTS[k].color,
        selectedDotColor: colors.textOnAccent,
      }));
      marks[date] = { dots };
    });

    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] || { dots: [] }),
        selected: true,
        selectedColor: colors.text,
        selectedTextColor: colors.textOnAccent,
      };
    }
    return marks;
  }, [scheduleMap, selectedDate]);

  const handleMonthChange = (month) => {
    setCurrentMonthStr(month.dateString.slice(0, 7));
  };

  const jumpToToday = () => {
    setSelectedDate(todayDateString);
    setCurrentMonthStr(todayDateString.slice(0, 7));
    setShowSpendDetails(false);
    setCalendarKey((k) => k + 1);
  };

  const selectedDateObj = parseDateToLocal(selectedDate);
  const isToday = selectedDate === todayDateString;
  const showTodayAction =
    !isToday || currentMonthStr !== todayDateString.slice(0, 7);
  const monthLabel = formatMonthYear(parseDateToLocal(`${currentMonthStr}-01`));
  const agendaTitle = `${isToday ? "Today · " : ""}${formatDateWithDay(selectedDateObj)}`;

  return (
    <Screen>
      <ScreenHeader
        title="Calendar"
        subtitle="EMIs, premiums and spends by day"
      />

      {/* ── Month summary ─────────────────────────────────────── */}
      <SectionHeader
        title={monthLabel}
        actionLabel="Today"
        onAction={showTodayAction ? jumpToToday : undefined}
      />
      <Card>
        {loaded ? (
          <StatRow>
            <StatTile
              label="Scheduled"
              value={formatCurrency(monthSummary.scheduled)}
              caption={`${monthSummary.billCount} payment${monthSummary.billCount === 1 ? "" : "s"}`}
            />
            <StatTile
              label="Still due"
              value={formatCurrency(monthSummary.stillDue)}
              tone={monthSummary.stillDue > 0 ? "warning" : "positive"}
              caption={monthSummary.stillDue > 0 ? "Upcoming" : "All cleared"}
            />
            <StatTile
              label="Spent"
              value={formatCurrency(monthSummary.spent)}
              caption="From spend log"
            />
          </StatRow>
        ) : (
          <View style={styles.summaryLoading}>
            <ActivityIndicator color={colors.primaryFill} />
          </View>
        )}
      </Card>

      <Gap size={space.lg} />

      {/* ── Calendar ──────────────────────────────────────────── */}
      <Card padded={false} style={styles.calendarCard}>
        <Calendar
          key={`calendar-${calendarKey}`}
          current={selectedDate}
          onDayPress={(day) => {
            setSelectedDate(day.dateString);
            setCurrentMonthStr(day.dateString.slice(0, 7));
            setShowSpendDetails(false);
          }}
          onMonthChange={handleMonthChange}
          markingType="multi-dot"
          markedDates={markedDates}
          enableSwipeMonths
          style={styles.calendar}
          theme={{
            calendarBackground: colors.surface,
            textSectionTitleColor: colors.textMuted,
            selectedDayBackgroundColor: colors.text,
            selectedDayTextColor: colors.textOnAccent,
            todayTextColor: colors.indigo,
            dayTextColor: colors.text,
            textDisabledColor: "rgba(15, 23, 42, 0.25)",
            arrowColor: colors.text,
            monthTextColor: colors.text,
            textDayFontSize: 15,
            textMonthFontSize: 17,
            textDayHeaderFontSize: 12,
            textDayFontWeight: "500",
            textMonthFontWeight: "700",
            textDayHeaderFontWeight: "600",
          }}
        />
        <View style={styles.legend}>
          {DOT_ORDER.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: DOTS[k].color }]} />
              <Text style={styles.legendText}>{DOTS[k].label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Gap />

      {/* ── Selected-day agenda ───────────────────────────────── */}
      <SectionHeader title={agendaTitle} count={loaded ? dayItems.length : undefined} />

      {!loaded ? (
        <Card>
          <View style={styles.agendaLoading}>
            <ActivityIndicator color={colors.primaryFill} />
          </View>
        </Card>
      ) : loadError && dayItems.length === 0 ? (
        <Card>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load your schedule"
            message="Switch tabs and come back to try again."
          />
        </Card>
      ) : dayItems.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar-outline"
            title="Nothing on this day"
            message="No EMIs, premiums or spends recorded. Pick a day with a dot to see what's scheduled."
          />
        </Card>
      ) : (
        <Card padded={false}>
          {/* Bills, EMIs, Insurances */}
          {billItems.map((item, index) => {
            const meta = billMeta(item);
            const status = item.isPaid ? "Paid" : "Due";
            return (
              <ListRow
                key={`${item.type}-${item.loanId}-${index}`}
                divider={index > 0}
                leading={
                  <IconBadge
                    name={meta.kind.icon}
                    color={meta.kind.text}
                    backgroundColor={meta.kind.soft}
                  />
                }
                title={item.loanName}
                subtitle={meta.label}
                value={formatCurrency(item.amount)}
                onPress={() =>
                  item.type === "insurance"
                    ? router.push("/insurances")
                    : router.push({
                        pathname: "/loan-detail",
                        params: { id: item.loanId },
                      })
                }
                accessibilityLabel={`${item.loanName}, ${meta.label}, ${formatCurrency(item.amount)}, ${status}`}
                accessibilityHint={
                  item.type === "insurance"
                    ? "Opens insurance policies"
                    : "Opens loan details"
                }
              >
                <Pill
                  label={status}
                  icon={item.isPaid ? "checkmark-circle" : "time-outline"}
                  color={item.isPaid ? colors.primary : colors.warning}
                  backgroundColor={item.isPaid ? colors.primarySoft : colors.warningSoft}
                />
              </ListRow>
            );
          })}

          {/* Day spend total, expandable into individual spends */}
          {dailySummary.spend > 0 ? (
            <>
              <ListRow
                divider={billItems.length > 0}
                leading={
                  <IconBadge
                    name="wallet-outline"
                    color={colors.pink}
                    backgroundColor={colors.pinkSoft}
                  />
                }
                title="Spent"
                subtitle={`${spendItems.length} transaction${spendItems.length > 1 ? "s" : ""} · ${showSpendDetails ? "Hide" : "Show"} details`}
                value={`-${formatCurrency(dailySummary.spend)}`}
                valueColor={colors.danger}
                chevron={false}
                onPress={() => setShowSpendDetails(!showSpendDetails)}
                accessibilityLabel={`Spent ${formatCurrency(dailySummary.spend)} across ${spendItems.length} transaction${spendItems.length > 1 ? "s" : ""}`}
                accessibilityHint={
                  showSpendDetails
                    ? "Hides the individual transactions"
                    : "Shows the individual transactions"
                }
              />
              {showSpendDetails
                ? spendItems.map((item, idx) => {
                    const catInfo = getCategoryIcon(item.category);
                    return (
                      <ListRow
                        key={item.id || idx}
                        divider
                        leading={
                          <View style={styles.subLeading}>
                            <IconBadge
                              name={catInfo.name}
                              color={catInfo.color}
                              backgroundColor={catInfo.color + "18"}
                              size={32}
                              iconSize={16}
                            />
                          </View>
                        }
                        title={item.loanName || item.category}
                        subtitle={item.category}
                        value={`-${formatCurrency(item.amount)}`}
                        valueColor={colors.danger}
                        onPress={() =>
                          router.push({
                            pathname: "/add-transaction",
                            params: { id: item.id },
                          })
                        }
                        accessibilityHint="Opens the transaction"
                      />
                    );
                  })
                : null}
            </>
          ) : null}

          {/* Day inflow total */}
          {dailySummary.credit > 0 ? (
            <ListRow
              divider={billItems.length > 0 || dailySummary.spend > 0}
              leading={
                <IconBadge
                  name="cash-outline"
                  color={colors.primary}
                  backgroundColor={colors.primarySoft}
                />
              }
              title="Received"
              subtitle={`${creditItems.length} credit transaction${creditItems.length > 1 ? "s" : ""}`}
              value={`+${formatCurrency(dailySummary.credit)}`}
              valueColor={colors.primary}
            />
          ) : null}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryLoading: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarCard: {
    overflow: "hidden",
    paddingTop: space.sm,
  },
  calendar: {
    paddingHorizontal: space.xs,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    marginTop: space.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...type.caption,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  agendaLoading: {
    paddingVertical: space.xxl,
    alignItems: "center",
  },
  subLeading: {
    width: 40,
    alignItems: "center",
  },
});

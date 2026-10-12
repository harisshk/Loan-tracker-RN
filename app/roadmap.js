import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Share,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Card,
  Chip,
  colors,
  EmptyState,
  HeaderAction,
  ListRow,
  Pill,
  radius,
  Screen,
  ScreenHeader,
  SectionHeader,
  shadow,
  space,
  type,
} from '../components/ui/kit';
import { getLoans, getPayments, calculateLoanStats } from '../utils/storage';
import {
  calculateEMIBreakdown,
  getInstalmentDate,
  getMonthsElapsed,
  parseLocalDate,
} from '../utils/emiCalculator';

const parseSafe = (val) => parseFloat(String(val || '0').replace(/,/g, ''));
const fc = (v) => `₹${Math.round(parseSafe(v)).toLocaleString('en-IN')}`;

export default function RepaymentRoadmap() {
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState('all');
  const [loaded, setLoaded] = useState(false);
  // Label of the current calendar month, used to tag the first schedule row
  const [thisMonthLabel] = useState(() =>
    new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
  );

  const loadData = useCallback(async () => {
    try {
      const loansData = await getLoans();
      const paymentsData = await getPayments();
      setLoans(loansData.filter((l) => l.status !== 'closed'));
      setPayments(paymentsData);
    } catch (e) {
      console.error('Error loading roadmap data:', e);
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // Dashboard-synced loan statistics (100% exact match)
  const stats = useMemo(() => {
    return calculateLoanStats(loans, payments);
  }, [loans, payments]);

  // Generate Month-by-Month Projection Schedule aware of today's paid EMIs
  const roadmapData = useMemo(() => {
    if (!loans || loans.length === 0) return { months: [], totalInterest: 0, debtFreeDate: 'N/A' };

    const targetLoans = selectedLoanId === 'all' 
      ? loans 
      : loans.filter((l) => l.id === selectedLoanId);

    if (targetLoans.length === 0) return { months: [], totalInterest: 0, debtFreeDate: 'N/A' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startYear = today.getFullYear();
    const startMonth = today.getMonth(); // 0-indexed (e.g. Sep = 8)

    // Calculate current remaining principal for each active loan RIGHT NOW
    const activeLoans = targetLoans.map((l) => {
      const principal = parseSafe(l.principal);
      const interest = parseSafe(l.interest);
      const emiAmount = parseSafe(l.emiAmount);
      const tenure = parseInt(String(l.tenure || '0').replace(/,/g, '')) || 0;
      const loanType = l.loanType || 'emi';
      const startDate = l.startDate ? parseLocalDate(l.startDate) : new Date(today);

      // EMIs whose due date has arrived (today inclusive, due day clamped to month end)
      const elapsed = getMonthsElapsed(startDate, today);

      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const breakdown = calculateEMIBreakdown(principal, interest, tenure, elapsed, emiAmount, loanType, loanPayments, startDate);

      const remainingPrincipal = breakdown.remainingPrincipalAmount;
      const remainingTenure = Math.max(0, tenure - Math.min(elapsed, tenure));
      const monthlyRate = interest / 12 / 100;

      return {
        id: l.id,
        loanName: l.loanName || 'Loan',
        loanType,
        startDate,
        emisPaid: elapsed,
        monthlyRate,
        annualInterest: interest,
        emiAmount: breakdown.emi > 0 ? breakdown.emi : emiAmount,
        remainingPrincipal,
        tenureRemaining: remainingTenure,
        closed: remainingPrincipal <= 0.01 || remainingTenure <= 0,
      };
    });

    const months = [];
    let cumulativeInterest = 0;
    let monthIdx = 0;
    const MAX_MONTHS = 240; // 20-year max projection limit

    const emiLoansCount = activeLoans.filter((l) => l.loanType === 'emi').length;

    // Month-by-Month loop: Project upcoming EMI payments for EMI loans
    while (
      (emiLoansCount > 0 ? activeLoans.some((l) => l.loanType === 'emi' && !l.closed) : monthIdx < 12) &&
      monthIdx < MAX_MONTHS
    ) {
      const currentProjDate = new Date(startYear, startMonth + monthIdx, 1);
      const monthLabel = currentProjDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      const fullMonthLabel = currentProjDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

      let emiPrincipal = 0;
      let emiInterest = 0;
      const activePayingDueDates = [];

      // Instalment number of a loan that falls in this calendar month
      const instalmentInMonth = (l) =>
        (currentProjDate.getFullYear() - l.startDate.getFullYear()) * 12 +
        (currentProjDate.getMonth() - l.startDate.getMonth()) + 1;

      // Deduct EMI payments for active EMI loans due in this cycle
      activeLoans.forEach((l) => {
        if (l.closed || l.loanType === 'bullet') return; // Ignore bullet loan principal

        // Only deduct EMIs that are STILL UPCOMING (already paid this month, or not started yet)
        const k = instalmentInMonth(l);
        if (k <= l.emisPaid) return;
        l.emisPaid = k;

        const iPaid = l.remainingPrincipal * l.monthlyRate;
        const emi = l.emiAmount;
        const pPaid = Math.min(l.remainingPrincipal, Math.max(0, emi - iPaid));

        l.remainingPrincipal = Math.max(0, l.remainingPrincipal - pPaid);
        l.tenureRemaining -= 1;

        if (l.remainingPrincipal <= 0.01 || l.tenureRemaining <= 0) {
          l.remainingPrincipal = 0;
          l.closed = true;
        }

        emiPrincipal += pPaid;
        emiInterest += iPaid;
        activePayingDueDates.push(getInstalmentDate(l.startDate, k));
      });

      // Format Due Date for this card
      let dueDateObj = new Date(startYear, startMonth + monthIdx, 10);
      if (selectedLoanId !== 'all' && targetLoans.length === 1 && targetLoans[0].startDate) {
        dueDateObj = getInstalmentDate(activeLoans[0].startDate, instalmentInMonth(activeLoans[0]));
      } else if (activePayingDueDates.length > 0) {
        dueDateObj = activePayingDueDates[0];
      }

      const formattedDueDate = dueDateObj.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      // If in current month and all loans were already paid, skip to month 1
      if (monthIdx === 0 && emiPrincipal === 0 && emiInterest === 0) {
        monthIdx++;
        continue;
      }

      cumulativeInterest += emiInterest;
      const endingOutstanding = activeLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);

      months.push({
        monthIndex: months.length + 1,
        monthLabel,
        fullMonthLabel,
        formattedDueDate,
        totalPrincipal: emiPrincipal,
        totalInterest: emiInterest,
        totalEMIPaid: emiPrincipal + emiInterest,
        endingOutstanding,
      });

      monthIdx++;
    }

    const debtFreeMonth = months.length > 0 ? months[months.length - 1].fullMonthLabel : 'N/A';

    return {
      months,
      totalInterest: cumulativeInterest,
      debtFreeDate: debtFreeMonth,
    };
  }, [loans, payments, selectedLoanId]);

  const handleShareRoadmap = async () => {
    try {
      let report = `📊 REPAYMENT ROADMAP & PROJECTION REPORT\n`;
      report += `----------------------------------------\n`;
      report += `Outstanding Principal: ${fc(stats.totalPrincipalPending)}\n`;
      report += `Projected EMI Payoff Target: ${roadmapData.debtFreeDate}\n\n`;
      report += `MONTHLY REPAYMENT SCHEDULE:\n`;

      roadmapData.months.slice(0, 36).forEach((m) => {
        report += `M${m.monthIndex} (${m.formattedDueDate}) | EMI: ${fc(m.totalEMIPaid)} (Prin: ${fc(m.totalPrincipal)}, Int: ${fc(m.totalInterest)}) | Pending Bal: ${fc(m.endingOutstanding)}\n`;
      });

      if (roadmapData.months.length > 36) {
        report += `... and ${roadmapData.months.length - 36} more months to full EMI payoff.\n`;
      }

      await Share.share({
        title: 'Repayment Roadmap Projection',
        message: report,
      });
    } catch (_err) {
      Alert.alert('Error', 'Failed to share roadmap.');
    }
  };

  const months = roadmapData.months;
  const principalLeft =
    selectedLoanId === 'all'
      ? stats.totalPrincipalPending
      : months.length > 0
        ? months[0].endingOutstanding + months[0].totalPrincipal
        : 0;

  // Group the schedule into calendar years so long tenures stay scannable.
  const yearGroups = months.reduce((groups, m) => {
    const year = String(m.monthLabel).split(' ').pop();
    const last = groups[groups.length - 1];
    if (last && last.year === year) {
      last.items.push(m);
    } else {
      groups.push({ year, items: [m] });
    }
    return groups;
  }, []);

  return (
    <Screen onRefresh={loadData} refreshing={refreshing}>
      <ScreenHeader
        back
        title="Repayment roadmap"
        subtitle="Your EMIs, month by month"
        actions={<HeaderAction icon="share-outline" label="Share roadmap" onPress={handleShareRoadmap} />}
      />

      {!loaded ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primaryFill} />
        </View>
      ) : (
        <>
          {loans.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
            >
              <Chip
                label={`All loans (${loans.length})`}
                selected={selectedLoanId === 'all'}
                onPress={() => setSelectedLoanId('all')}
              />
              {loans.map((l) => (
                <Chip
                  key={l.id}
                  label={l.loanName || 'Loan'}
                  selected={selectedLoanId === l.id}
                  onPress={() => setSelectedLoanId(l.id)}
                />
              ))}
            </ScrollView>
          ) : null}

          {months.length === 0 ? (
            <Card>
              <EmptyState
                icon="checkmark-circle-outline"
                title="Nothing to project"
                message="You're debt-free or have no active loans to project."
              />
            </Card>
          ) : (
            <>
              <View style={styles.heroCard}>
                <LinearGradient
                  colors={colors.heroGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.hero}
                >
                  <Text style={styles.heroOverline}>EMIs paid off by</Text>
                  <Text
                    style={styles.heroValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {roadmapData.debtFreeDate || 'N/A'}
                  </Text>
                  <Text style={styles.heroSub}>
                    {months.length} month{months.length === 1 ? '' : 's'} to go
                  </Text>

                  <View style={styles.heroStats}>
                    <View
                      style={styles.heroStat}
                      accessible
                      accessibilityLabel={`Principal left: ${fc(principalLeft)}`}
                    >
                      <Text style={styles.heroStatLabel}>Principal left</Text>
                      <Text
                        style={styles.heroStatValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        {fc(principalLeft)}
                      </Text>
                    </View>
                    <View style={styles.heroStatDivider} />
                    <View
                      style={styles.heroStat}
                      accessible
                      accessibilityLabel={`Interest ahead on EMIs: ${fc(roadmapData.totalInterest)}`}
                    >
                      <Text style={styles.heroStatLabel}>Interest ahead</Text>
                      <Text
                        style={styles.heroStatValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        {fc(roadmapData.totalInterest)}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              <SectionHeader title="Month by month" count={months.length} style={styles.sectionGap} />
              {yearGroups.map((group, gi) => {
                const yearEnd = group.items[group.items.length - 1];
                return (
                  <View key={group.year} style={gi > 0 ? styles.yearGap : null}>
                    <View style={styles.yearHead}>
                      <Text style={styles.yearTitle} accessibilityRole="header">
                        {group.year}
                      </Text>
                      <Text style={styles.yearCaption} numberOfLines={1}>
                        {fc(yearEnd.endingOutstanding)} left after {yearEnd.monthLabel.split(' ')[0]}
                      </Text>
                    </View>
                    <Card padded={false} style={styles.listCard}>
                      {group.items.map((item, i) => (
                        <MonthRow
                          key={item.monthIndex}
                          item={item}
                          divider={i > 0}
                          isNext={gi === 0 && i === 0}
                          thisMonth={thisMonthLabel}
                        />
                      ))}
                    </Card>
                  </View>
                );
              })}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

// ── Month row ─────────────────────────────────────────────────────────────────

function MonthRow({ item, divider, isNext, thisMonth }) {
  const monthShort = String(item.monthLabel).split(' ')[0];
  const nextLabel = item.monthLabel === thisMonth ? 'This month' : 'Up next';

  return (
    <View style={isNext ? styles.rowHighlight : null}>
      <ListRow
        divider={divider}
        leading={
          <View style={[styles.monthTile, isNext && styles.monthTileActive]}>
            <Text style={[styles.monthTileText, isNext && styles.monthTileTextActive]}>{monthShort}</Text>
            <Text style={[styles.monthTileIndex, isNext && styles.monthTileTextActive]}>M{item.monthIndex}</Text>
          </View>
        }
        title={`EMIs ${fc(item.totalEMIPaid)}`}
        subtitle={`Due ${item.formattedDueDate} · ${fc(item.totalPrincipal)} principal + ${fc(item.totalInterest)} interest`}
        value={fc(item.endingOutstanding)}
        valueCaption="left after"
        accessibilityLabel={`${isNext ? `${nextLabel}, ` : ''}${item.fullMonthLabel}: EMIs ${fc(item.totalEMIPaid)}, due ${item.formattedDueDate}, ${fc(item.totalPrincipal)} principal and ${fc(item.totalInterest)} interest, ${fc(item.endingOutstanding)} principal left after`}
      >
        {isNext ? (
          <Pill label={nextLabel} icon="time-outline" color={colors.primary} backgroundColor={colors.surface} />
        ) : null}
      </ListRow>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: space.xxxl * 2,
    alignItems: 'center',
  },
  chipScroll: {
    marginHorizontal: -space.lg,
    marginBottom: space.xl,
    flexGrow: 0,
  },
  chipRow: {
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  heroCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.hero,
  },
  hero: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg + 2,
    paddingBottom: space.lg,
  },
  heroOverline: {
    ...type.overline,
    color: colors.heroTextSecondary,
  },
  heroValue: {
    ...type.display,
    color: colors.heroText,
    marginTop: space.sm,
  },
  heroSub: {
    ...type.label,
    fontWeight: '500',
    color: colors.heroTextSecondary,
    marginTop: space.xs,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.heroDivider,
  },
  heroStat: {
    flex: 1,
    minWidth: 0,
  },
  heroStatDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.heroDivider,
    marginHorizontal: space.md,
  },
  heroStatLabel: {
    ...type.caption,
    fontWeight: '500',
    color: colors.heroTextMuted,
  },
  heroStatValue: {
    ...type.amount,
    color: colors.heroText,
    marginTop: 2,
  },
  sectionGap: {
    marginTop: space.xxl,
  },
  yearGap: {
    marginTop: space.xl,
  },
  yearHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  yearTitle: {
    ...type.label,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  yearCaption: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  listCard: {
    overflow: 'hidden',
  },
  rowHighlight: {
    backgroundColor: colors.primarySoft,
  },
  monthTile: {
    width: 40,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTileActive: {
    backgroundColor: colors.primary,
  },
  monthTileText: {
    ...type.label,
    fontWeight: '800',
    color: colors.text,
  },
  monthTileIndex: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  monthTileTextActive: {
    color: colors.textOnAccent,
  },
});

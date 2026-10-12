import { Ionicons } from '@expo/vector-icons';
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Button,
  Card,
  Chip,
  colors,
  Divider,
  EmptyState,
  Field,
  HeaderAction,
  IconBadge,
  kindColors,
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
} from '../components/ui/kit';
import { getLoans, getInsurances, getPayments, getFinancialPlanSettings, saveFinancialPlanSettings } from '../utils/storage';
import { generateFinancialPlan } from '../utils/financialPlanner';
import { formatINR } from '../utils/format';

const PLAN_SETTINGS_KEY = '@financial_plan_settings';

const STATUS_META = {
  comfortable: { text: colors.primary, soft: colors.primarySoft, label: 'Comfortable', icon: 'checkmark-circle-outline' },
  tight:       { text: colors.warning, soft: colors.warningSoft, label: 'Tight',       icon: 'alert-circle-outline' },
  critical:    { text: colors.danger,  soft: colors.dangerSoft,  label: 'Critical',    icon: 'warning-outline' },
};

const DURATIONS = [6, 12, 18, 24, 36];

const fc = (v) => formatINR(v);

/** Planner notes may start with an emoji; the icon next to them already carries that meaning. */
const cleanNote = (n) => String(n).replace(/^[^A-Za-z0-9₹]+/, '');

// Emergency runway tone: 6+ months strong, under 2 vulnerable, otherwise stable.
const runwayMeta = (runway) =>
  runway >= 6
    ? { label: 'Strong', text: colors.primary, soft: colors.primarySoft, fill: colors.primaryFill, icon: 'shield-checkmark-outline' }
    : runway < 2
      ? { label: 'Vulnerable', text: colors.danger, soft: colors.dangerSoft, fill: colors.dangerFill, icon: 'warning-outline' }
      : { label: 'Stable', text: colors.warning, soft: colors.warningSoft, fill: colors.warningFill, icon: 'shield-half-outline' };

// ── Setup Form ────────────────────────────────────────────────────────────────
function SetupForm({ initial, insuranceMonthly, onSubmit, header }) {
  const [salary, setSalary]         = useState(initial?.salary     || '');
  const [rent, setRent]             = useState(initial?.rent       || '');
  const [expenses, setExpenses]     = useState(initial?.expenses   || '');
  const [minSave, setMinSave]       = useState(initial?.minSave    || '');
  const [months, setMonths]         = useState(String(initial?.months ?? 12));
  const [incomeEvents, setIncomeEvents] = useState(initial?.incomeEvents || []);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [evMonth, setEvMonth]  = useState('');
  const [evSalary, setEvSalary] = useState('');
  const [evRent, setEvRent]   = useState('');
  const [errors, setErrors] = useState({});

  const addEvent = () => {
    const mo = parseInt(evMonth);
    if (!mo || mo < 1 || mo > 36) { Alert.alert('Invalid', 'Month must be 1–36.'); return; }
    if (!evSalary && !evRent)     { Alert.alert('Required', 'Enter new salary or rent.'); return; }
    const ev = { fromMonth: mo };
    if (evSalary) ev.salaryMonthly = parseFloat(evSalary);
    if (evRent)   ev.rentMonthly   = parseFloat(evRent);
    setIncomeEvents(prev =>
      [...prev.filter(e => e.fromMonth !== mo), ev].sort((a, b) => a.fromMonth - b.fromMonth)
    );
    setEvMonth(''); setEvSalary(''); setEvRent('');
    setShowAddEvent(false);
  };

  // Update a field and clear its inline error.
  const edit = (setter, key) => (v) => {
    setter(v);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleGenerate = () => {
    const parseNum = (v) => parseFloat(String(v || 0).replace(/,/g, ''));
    const s = parseNum(salary);
    const e = parseNum(expenses);
    const ms = parseNum(minSave);
    const mo = parseInt(months);
    const next = {};
    if (!s || s <= 0) next.salary = 'Enter your monthly salary';
    if (!e || e <= 0) next.expenses = 'Enter your monthly living expenses';
    if (!ms || ms <= 0) next.minSave = 'Enter how much you want to save each month';
    if (Object.keys(next).length > 0) { setErrors(next); return; }
    onSubmit({ salary: s, rent: parseNum(rent) || 0, expenses: e, minSave: ms, months: mo, incomeEvents });
  };

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <Screen
        footer={
          <View>
            {hasErrors ? (
              <Text style={styles.footerError} accessibilityLiveRegion="polite">
                Check the highlighted fields
              </Text>
            ) : null}
            <Button label="Generate plan" icon="trending-up" onPress={handleGenerate} />
          </View>
        }
      >
        {header}

        <Card padded={false}>
          <View style={styles.autoRow} accessible accessibilityLabel={`Insurance premiums, fetched from your policies: ${fc(insuranceMonthly)} per month`}>
            <IconBadge
              name={kindColors.insurance.icon}
              color={kindColors.insurance.text}
              backgroundColor={kindColors.insurance.soft}
            />
            <View style={styles.autoText}>
              <Text style={styles.autoTitle}>Insurance premiums</Text>
              <Text style={styles.autoSub}>Fetched from your policies</Text>
            </View>
            <Text style={styles.autoValue} numberOfLines={1}>{fc(insuranceMonthly)}/mo</Text>
          </View>
        </Card>

        <SectionHeader title="Your monthly numbers" style={styles.sectionGap} />
        <Card style={styles.formCard}>
          <Field
            label="Monthly salary"
            prefix="₹"
            value={String(salary)}
            onChangeText={edit(setSalary, 'salary')}
            placeholder="120000"
            keyboardType="numeric"
            error={errors.salary}
          />
          <Field
            label="Rental income"
            prefix="₹"
            value={String(rent)}
            onChangeText={setRent}
            placeholder="15000"
            keyboardType="numeric"
            hint="Optional"
          />
          <Field
            label="Living expenses"
            prefix="₹"
            value={String(expenses)}
            onChangeText={edit(setExpenses, 'expenses')}
            placeholder="40000"
            keyboardType="numeric"
            error={errors.expenses}
          />
          <Field
            label="Minimum savings"
            prefix="₹"
            value={String(minSave)}
            onChangeText={edit(setMinSave, 'minSave')}
            placeholder="15000"
            keyboardType="numeric"
            error={errors.minSave}
            hint="Set aside every month before any extra loan payments"
          />

          <Text style={styles.durationLabel}>Plan duration</Text>
          <View style={styles.chips}>
            {DURATIONS.map((m) => (
              <Chip
                key={m}
                label={`${m} months`}
                selected={months === String(m)}
                onPress={() => setMonths(String(m))}
              />
            ))}
          </View>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

// ── Month Row ─────────────────────────────────────────────────────────────────
const MonthRow = React.memo(function MonthRow({ data, index, divider }) {
  const [expanded, setExpanded] = useState(index === 0);
  const meta = STATUS_META[data.status];

  return (
    <View style={divider ? styles.rowDivider : null}>
      <PressableScale
        style={styles.monthHeader}
        onPress={() => setExpanded(e => !e)}
        accessibilityState={{ expanded }}
        accessibilityLabel={`Month ${data.month}, ${data.monthLabel}, ${meta.label}, ${fc(data.savings)} saved`}
        accessibilityHint={expanded ? 'Hides the breakdown' : 'Shows the breakdown'}
      >
        <View style={[styles.monthBadge, { backgroundColor: meta.soft }]}>
          <Text style={[styles.monthBadgeText, { color: meta.text }]}>{data.month}</Text>
        </View>
        <View style={styles.monthText}>
          <Text style={styles.monthLabel} numberOfLines={1}>{data.monthLabel}</Text>
          <View style={styles.statusLine}>
            <Ionicons name={meta.icon} size={13} color={meta.text} />
            <Text style={[styles.statusText, { color: meta.text }]}>{meta.label}</Text>
          </View>
        </View>
        <View style={styles.monthTrail}>
          <Text style={styles.monthSavings} numberOfLines={1}>+{fc(data.savings)}</Text>
          <Text style={styles.monthSavingsLabel}>saved</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </PressableScale>

      {expanded && (
        <View style={styles.monthBody}>
          <Text style={styles.bodyOverline}>Income and costs</Text>
          <DetailRow label="Salary" value={fc(data.salaryMonthly)} />
          {data.rentMonthly > 0 && <DetailRow label="Rent" value={`+ ${fc(data.rentMonthly)}`} />}
          <DetailRow label="Total income" value={fc(data.income)} bold color={colors.primary} />
          <Divider style={styles.bodyDivider} />
          <DetailRow label="EMI total" value={`- ${fc(data.emiTotal)}`} />
          <DetailRow label="Insurance" value={`- ${fc(data.insuranceMonthly)}`} />
          <DetailRow label="Living expenses" value={`- ${fc(data.expenses)}`} />
          <DetailRow
            label="Available"
            value={fc(data.available)}
            bold
            color={data.available >= 0 ? colors.primary : colors.danger}
          />

          <Text style={[styles.bodyOverline, styles.bodyOverlineGap]}>Strategy</Text>
          <DetailRow label="Saved this month" value={fc(data.savings)} bold color={colors.primary} />
          <DetailRow
            label="Extra loan budget"
            value={fc(data.loanBudget)}
            color={data.loanBudget > 0 ? colors.info : colors.textMuted}
          />

          {data.notes.map((n, i) => (
            <View key={i} style={styles.note}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
              <Text style={styles.noteText}>{cleanNote(n)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

function DetailRow({ label, value, bold, color }) {
  return (
    <View style={styles.detailRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, bold && styles.detailValueBold, color && { color }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Main Controller ─────────────────────────────────────────────────────────────
export default function FinancialPlan() {
  const [loading, setLoading]       = useState(true);
  const [showSetup, setShowSetup]   = useState(false);
  const [settings, setSettings]     = useState(null);
  const [loans, setLoans]           = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [payments, setPayments]     = useState([]);

  const loadAll = useCallback(async () => {
    try {
      const l = await getLoans();
      const i = await getInsurances();
      const p = await getPayments();
      const s = await getFinancialPlanSettings();
      setLoans(l); setInsurances(i); setPayments(p);
      if (s) { setSettings(s); setShowSetup(false); }
      else { setShowSetup(true); }
    } catch (e) {
      console.error('Error loading financial plan:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const insuranceMonthly = useMemo(() => {
    let annual = 0;
    insurances.forEach(ins => {
      const p = parseFloat(String(ins.premiumAmount).replace(/,/g, '')) || 0;
      const m = ins.frequency === 'monthly' ? 12 : ins.frequency === 'quarterly' ? 4 : ins.frequency === 'half-yearly' ? 2 : 1;
      annual += p * m;
    });
    return annual / 12;
  }, [insurances]);

  const plan = useMemo(() => {
    if (!settings) return null;
    return generateFinancialPlan({
      loans, insurances, payments,
      salaryMonthly: settings.salary,
      rentMonthly: settings.rent,
      livingExpensesMonthly: settings.expenses,
      minimumSavings: settings.minSave,
      months: settings.months ?? 12,
      incomeEvents: settings.incomeEvents ?? [],
    });
  }, [settings, loans, insurances, payments]);

  const planStats = useMemo(() => {
    if (!plan || plan.length === 0) return null;
    const totalSavings = plan.reduce((s, m) => s + (m.savings || 0), 0);
    const totalExtra   = plan.reduce((s, m) => s + (m.loanBudget || 0), 0);
    const lastMonth    = plan[plan.length - 1];

    // Resilience Score (Current state vs Final state)
    const initialCosts = (plan[0].emiTotal || 0) + (plan[0].insuranceMonthly || 0) + (plan[0].expenses || 0);
    const runway = (lastMonth?.emergencyFund || 0) / Math.max(1, initialCosts);

    return {
      savingsCap: totalSavings,
      extraPaid: totalExtra,
      interestSaved: lastMonth?.totalInterestSaved || 0,
      finalFund: lastMonth?.emergencyFund || 0,
      clearedPrincipal: plan.reduce((s, m) => s + (m.loanPayments || []).reduce((ps, lp) => ps + (lp.payment || 0), 0), 0),
      runway: isNaN(runway) ? 0 : runway,
    };
  }, [plan]);

  const handleReset = () => {
    Alert.alert('Reset', 'Start fresh?', [{ text: 'Cancel' }, { text: 'Reset', onPress: () => { saveFinancialPlanSettings(null); setSettings(null); setShowSetup(true); } }]);
  };

  const header = (
    <ScreenHeader
      back
      title="Financial plan"
      subtitle={showSetup ? 'Your income and costs, used to build the plan' : 'Month-by-month savings and extra loan payments'}
      actions={
        plan ? (
          <HeaderAction
            icon={showSetup ? 'list-outline' : 'options-outline'}
            label={showSetup ? 'View plan' : 'Edit settings'}
            onPress={() => setShowSetup(!showSetup)}
          />
        ) : null
      }
    />
  );

  if (loading) {
    return (
      <Screen>
        {header}
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primaryFill} />
        </View>
      </Screen>
    );
  }

  if (showSetup) {
    return (
      <SetupForm
        initial={settings}
        insuranceMonthly={insuranceMonthly}
        header={header}
        onSubmit={(v) => { saveFinancialPlanSettings(v); setSettings(v); setShowSetup(false); }}
      />
    );
  }

  const runway = planStats ? runwayMeta(planStats.runway) : null;

  return (
    <Screen>
      {header}

      {plan && planStats ? (
        <>
          <Card>
            <Text style={styles.overline}>Over the next {plan.length} months</Text>
            <StatRow style={styles.summaryStats}>
              <StatTile label="Principal cleared" value={fc(planStats.clearedPrincipal)} />
              <StatTile label="Interest saved" value={fc(planStats.interestSaved)} tone="positive" />
              <StatTile label="Emergency fund" value={fc(planStats.finalFund)} />
            </StatRow>
          </Card>

          {/* Resilience stress test */}
          <SectionHeader title="Stress test" style={styles.sectionGap} />
          <Card>
            <View style={styles.runwayTop}>
              <View style={styles.runwayText}>
                <Text style={styles.runwayLabel}>Emergency runway</Text>
                <Text style={[styles.runwayValue, { color: runway.text }]}>
                  {planStats.runway.toFixed(1)} months
                </Text>
              </View>
              <Pill label={runway.label} icon={runway.icon} color={runway.text} backgroundColor={runway.soft} />
            </View>
            <ProgressBar
              segments={[{ value: Math.min(100, (planStats.runway / 6) * 100), color: runway.fill }]}
              style={styles.runwayBar}
              accessibilityLabel={`${planStats.runway.toFixed(1)} of 6 months runway`}
            />
            <Text style={styles.runwayGoal}>Goal: 6 months of fixed costs</Text>
            <Text style={styles.runwayInsight}>
              {planStats.runway >= 6
                ? 'You have a solid buffer. You could cover 6+ months without income.'
                : planStats.runway < 2
                ? 'Your buffer is low. A sudden loss of income would become critical within 2 months.'
                : "You're getting there. Aim for 6 months of runway."}
            </Text>
          </Card>

          <SectionHeader title="Monthly plan" count={plan.length} style={styles.sectionGap} />
          <Card padded={false} style={styles.listCard}>
            {plan.map((m, i) => <MonthRow key={i} data={m} index={i} divider={i > 0} />)}
          </Card>

          <Button
            label="Reset plan"
            variant="danger"
            icon="refresh"
            onPress={handleReset}
            style={styles.resetBtn}
          />
        </>
      ) : (
        <Card>
          <EmptyState
            icon="calculator-outline"
            title="No plan to show yet"
            message="Add your income and costs to build a month-by-month plan."
            actionLabel="Set up plan"
            onAction={() => setShowSetup(true)}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  loadingWrap: { paddingVertical: space.xxxl * 2, alignItems: 'center' },
  sectionGap: { marginTop: space.xxl },
  overline: { ...type.overline, color: colors.textMuted },
  footerError: {
    ...type.caption,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: space.sm,
  },

  // Setup
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
  },
  autoText: { flex: 1, minWidth: 0 },
  autoTitle: { ...type.body, fontWeight: '700', color: colors.text },
  autoSub: { ...type.caption, fontWeight: '500', color: colors.textMuted, marginTop: 2 },
  autoValue: { ...type.amountSmall, color: colors.text },
  formCard: { paddingBottom: space.lg },
  durationLabel: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },

  // Summary
  summaryStats: { marginTop: space.md },

  // Stress test
  runwayTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  runwayText: { flex: 1, minWidth: 0 },
  runwayLabel: { ...type.label, color: colors.textSecondary },
  runwayValue: { ...type.title, fontVariant: ['tabular-nums'], marginTop: 2 },
  runwayBar: { marginTop: space.md },
  runwayGoal: { ...type.caption, fontWeight: '500', color: colors.textMuted, marginTop: space.xs + 2 },
  runwayInsight: { ...type.label, fontWeight: '500', color: colors.textSecondary, marginTop: space.md },

  // Monthly plan
  listCard: { overflow: 'hidden' },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
  },
  monthBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBadgeText: { ...type.headline, fontVariant: ['tabular-nums'] },
  monthText: { flex: 1, minWidth: 0 },
  monthLabel: { ...type.body, fontWeight: '700', color: colors.text },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusText: { ...type.caption },
  monthTrail: { alignItems: 'flex-end', maxWidth: '40%' },
  monthSavings: { ...type.amountSmall, color: colors.primary },
  monthSavingsLabel: { ...type.caption, fontWeight: '500', color: colors.textMuted, marginTop: 1 },
  monthBody: {
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    padding: space.md,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  bodyOverline: { ...type.overline, color: colors.textMuted, marginBottom: space.xs },
  bodyOverlineGap: { marginTop: space.md },
  bodyDivider: { marginVertical: space.xs },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 3,
  },
  detailLabel: { ...type.label, fontWeight: '500', color: colors.textSecondary, flex: 1 },
  detailValue: { ...type.label, color: colors.text, fontVariant: ['tabular-nums'] },
  detailValueBold: { fontWeight: '800' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.md,
    padding: space.sm + 2,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
  },
  noteText: { ...type.caption, color: colors.danger, flex: 1 },

  resetBtn: { marginTop: space.xxl },
});

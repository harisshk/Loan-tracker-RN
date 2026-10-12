import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Card,
  colors,
  Divider,
  Field,
  IconBadge,
  Pill,
  Screen,
  ScreenHeader,
  space,
  StatRow,
  StatTile,
  type,
} from '../components/ui/kit';
import { formatINR } from '../utils/format';

const fc = (v) => formatINR(v);

/** Width at which the two offers sit side by side instead of stacking. */
const WIDE_BREAKPOINT = 600;

export default function Compare() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  // Offer A
  const [p1, setP1] = useState('1000000');
  const [i1, setI1] = useState('9');
  const [t1, setT1] = useState('120');

  // Offer B
  const [p2, setP2] = useState('1000000');
  const [i2, setI2] = useState('8.5');
  const [t2, setT2] = useState('120');

  const calc = (p, r, t) => {
    const clean = (v) => String(v ?? '').replace(/[^0-9.]/g, '');
    const princ = parseFloat(clean(p)) || 0;
    const rate  = parseFloat(clean(r)) || 0;
    const tenure = Math.round(parseFloat(clean(t)) || 0);
    if (princ <= 0 || tenure <= 0 || rate < 0) {
      return { emi: 0, total: 0, interest: 0, valid: false };
    }

    const monthlyRate = rate / 12 / 100;
    const emi = monthlyRate === 0
      ? princ / tenure
      : (princ * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1);
    const total = emi * tenure;
    return { emi, total, interest: total - princ, valid: true };
  };

  const a = useMemo(() => calc(p1, i1, t1), [p1, i1, t1]);
  const b = useMemo(() => calc(p2, i2, t2), [p2, i2, t2]);

  const diff = {
    emi: Math.abs(a.emi - b.emi),
    total: Math.abs(a.total - b.total),
    interest: Math.abs(a.interest - b.interest),
    winner: !a.valid || !b.valid
      ? null
      : Math.round(a.total) === Math.round(b.total)
        ? 'tie'
        : a.total < b.total ? 'A' : 'B',
  };

  const hasWinner = diff.winner === 'A' || diff.winner === 'B';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <Screen>
        <ScreenHeader
          back
          title="Compare loans"
          subtitle="See which of two offers costs you less overall"
        />

        <View style={[styles.offers, wide && styles.offersWide]}>
          <OfferCard
            name="A"
            result={a}
            cheaper={diff.winner === 'A'}
            principal={p1}
            rate={i1}
            tenure={t1}
            onPrincipal={setP1}
            onRate={setI1}
            onTenure={setT1}
            wide={wide}
          />
          <OfferCard
            name="B"
            result={b}
            cheaper={diff.winner === 'B'}
            principal={p2}
            rate={i2}
            tenure={t2}
            onPrincipal={setP2}
            onRate={setI2}
            onTenure={setT2}
            wide={wide}
          />
        </View>

        <Card style={styles.verdict}>
          <View style={styles.verdictHead}>
            <IconBadge
              name={hasWinner ? 'trophy-outline' : diff.winner === 'tie' ? 'git-compare-outline' : 'create-outline'}
              color={hasWinner ? colors.primary : colors.indigo}
              backgroundColor={hasWinner ? colors.primarySoft : colors.indigoSoft}
            />
            <View style={styles.verdictText}>
              <Text style={styles.overline}>Verdict</Text>
              <Text style={styles.verdictTitle} accessibilityRole="header">
                {diff.winner === null
                  ? 'Enter both offers to compare'
                  : diff.winner === 'tie'
                    ? 'Both offers cost the same'
                    : `Offer ${diff.winner} is cheaper`}
              </Text>
            </View>
          </View>

          {hasWinner ? (
            <Text style={styles.verdictSaving}>
              You save <Text style={styles.verdictSavingAmount}>{fc(diff.total)}</Text> in total
              outflow with Offer {diff.winner}.
            </Text>
          ) : null}

          {diff.winner !== null ? (
            <>
              <Divider style={styles.verdictDivider} />
              <DiffRow label="EMI difference" value={`${fc(diff.emi)}/mo`} />
              <DiffRow label="Interest difference" value={fc(diff.interest)} />
              <DiffRow label="Total outflow difference" value={fc(diff.total)} />
            </>
          ) : null}
        </Card>

        <View style={styles.tip}>
          <Ionicons name="bulb-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.tipText}>
            A lower EMI can still cost more overall if the tenure is longer. Compare the total payable,
            not just the EMI.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function OfferCard({
  name,
  result,
  cheaper,
  principal,
  rate,
  tenure,
  onPrincipal,
  onRate,
  onTenure,
  wide,
}) {
  return (
    <Card style={[styles.offerCard, wide && styles.offerCardWide, cheaper && styles.offerCardCheaper]}>
      <View style={styles.offerHead}>
        <Text style={styles.offerTitle} accessibilityRole="header">
          Offer {name}
        </Text>
        {cheaper ? (
          <Pill label="Cheaper" icon="checkmark-circle" color={colors.primary} backgroundColor={colors.primarySoft} />
        ) : null}
      </View>

      <Field
        label="Principal"
        prefix="₹"
        value={principal}
        onChangeText={onPrincipal}
        placeholder="1000000"
        keyboardType="numeric"
      />
      <Field
        label="Interest rate"
        suffix="% p.a."
        value={rate}
        onChangeText={onRate}
        placeholder="8.5"
        keyboardType="decimal-pad"
      />
      <Field
        label="Tenure"
        suffix="months"
        value={tenure}
        onChangeText={onTenure}
        placeholder="120"
        keyboardType="numeric"
      />

      <Divider style={styles.offerDivider} />

      {result.valid ? (
        <StatRow>
          <StatTile label="EMI" value={fc(result.emi)} caption="per month" />
          <StatTile label="Interest" value={fc(result.interest)} caption="total" />
          <StatTile
            label="Payable"
            value={fc(result.total)}
            caption="total"
            tone={cheaper ? 'positive' : 'default'}
          />
        </StatRow>
      ) : (
        <Text style={styles.invalidText} accessibilityLiveRegion="polite">
          Enter a principal and tenure above zero to see the EMI.
        </Text>
      )}
    </Card>
  );
}

function DiffRow({ label, value }) {
  return (
    <View style={styles.diffRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.diffLabel}>{label}</Text>
      <Text style={styles.diffValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  offers: {
    gap: space.lg,
  },
  offersWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  offerCard: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  offerCardWide: {
    flex: 1,
    minWidth: 0,
  },
  offerCardCheaper: {
    borderColor: colors.primaryFill,
  },
  offerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
    marginBottom: space.md,
  },
  offerTitle: {
    ...type.headline,
    color: colors.text,
  },
  offerDivider: {
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  invalidText: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textMuted,
  },
  verdict: {
    marginTop: space.xxl,
  },
  verdictHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  verdictText: {
    flex: 1,
    minWidth: 0,
  },
  overline: {
    ...type.overline,
    color: colors.textMuted,
  },
  verdictTitle: {
    ...type.headline,
    color: colors.text,
    marginTop: 2,
  },
  verdictSaving: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: space.md,
  },
  verdictSavingAmount: {
    ...type.amountSmall,
    color: colors.primary,
  },
  verdictDivider: {
    marginVertical: space.md,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.xs + 2,
  },
  diffLabel: {
    ...type.label,
    fontWeight: '500',
    color: colors.textSecondary,
    flex: 1,
  },
  diffValue: {
    ...type.amountSmall,
    color: colors.text,
    flexShrink: 0,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.xxl,
    paddingHorizontal: space.xs,
  },
  tipText: {
    ...type.caption,
    fontWeight: '500',
    color: colors.textSecondary,
    flex: 1,
  },
});

import React, { useState, useCallback } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { getLoans, getPayments, getInsurances } from '../utils/storage';
import { calculateEMIBreakdown } from '../utils/emiCalculator';

const fc = (v) =>
  `₹${parseFloat(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const fd = (date) =>
  new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

function urgencyMeta(days) {
  if (days < 0)   return { label: 'Matured',   color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: '⬜', ring: '#64748b' };
  if (days <= 30) return { label: 'Critical',  color: '#e11d48', bg: 'rgba(225,29,72,0.1)',   icon: '🔴', ring: '#e11d48' };
  if (days <= 90) return { label: 'Warning',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: '🟡', ring: '#f59e0b' };
  if (days <= 180)return { label: 'Upcoming',  color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  icon: '🔵', ring: '#38bdf8' };
  return            { label: 'Safe',       color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: '🟢', ring: '#10b981' };
}

// Animated countdown ring (pure RN, no Animated API needed — just a styled arc approximation)
function CountdownRing({ days, totalDays, color, size = 100 }) {
  const pct = totalDays > 0 ? Math.max(0, Math.min(1, days / totalDays)) : 0;
  const ringThickness = 10;
  const r = (size - ringThickness) / 2;

  // We fake the ring with two half-circle views
  const rotateDeg = Math.round((1 - pct) * 360);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background ring */}
      <View style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        borderWidth: ringThickness, borderColor: 'rgba(0,0,0,0.08)',
      }} />
      {/* Progress arc — approximate with a conic-like border trick */}
      <View style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        borderWidth: ringThickness,
        borderTopColor: color,
        borderRightColor: pct > 0.25 ? color : 'transparent',
        borderBottomColor: pct > 0.5 ? color : 'transparent',
        borderLeftColor: pct > 0.75 ? color : 'transparent',
        transform: [{ rotate: '-90deg' }],
      }} />
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: days < 0 ? 12 : 22, fontWeight: '800', color }}>
          {days < 0 ? 'Done' : days > 999 ? `${Math.floor(days / 30)}mo` : days}
        </Text>
        {days >= 0 && <Text style={{ fontSize: 9, color: 'rgba(15,23,42,0.4)', marginTop: -2 }}>days</Text>}
      </View>
    </View>
  );
}

export default function MaturityAlerts() {
  const router = useRouter();
  const [bulletLoans, setBulletLoans]   = useState([]);
  const [nearingEMIs, setNearingEMIs]   = useState([]);
  const [refreshing, setRefreshing]     = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const loadData = useCallback(async () => {
    const loans    = await getLoans();
    const payments = await getPayments();

    const bullets = [];
    const nearEMI = [];

    loans.filter(l => l.status !== 'closed').forEach(loan => {
      const principal  = parseFloat(loan.principal)  || 0;
      const interest   = parseFloat(loan.interest)   || 0;
      const tenure     = parseInt(loan.tenure)        || 0;
      const emiAmount  = parseFloat(loan.emiAmount)   || 0;
      const loanType   = loan.loanType || 'emi';
      const start      = new Date(loan.startDate);

      if (loanType === 'bullet') {
        const maturity = new Date(start.getFullYear(), start.getMonth() + tenure, start.getDate());
        const daysLeft = Math.ceil((maturity - today) / 86400000);

        let monthsElapsed = (today.getFullYear() - start.getFullYear()) * 12 +
          (today.getMonth() - start.getMonth());
        if (today.getDate() >= start.getDate()) monthsElapsed++;
        monthsElapsed = Math.max(0, monthsElapsed);

        const extraPayments = payments.filter(p => p.loanId === loan.id);
        const bd = calculateEMIBreakdown(principal, interest, tenure, monthsElapsed, emiAmount, 'bullet', extraPayments);

        // Monthly savings needed to accumulate remaining amount
        const monthsRemaining = Math.max(1, Math.ceil((maturity - today) / (1000 * 60 * 60 * 24 * 30.44)));
        const monthlySavingsNeeded = bd.remainingAmount / monthsRemaining;

        bullets.push({
          loan,
          maturity,
          daysLeft,
          totalDays: tenure * 30,
          dueAmount: bd.remainingAmount,
          principal: bd.remainingPrincipalAmount,
          interest: bd.remainingInterestAmount,
          totalInterest: bd.totalInterest,
          monthsRemaining,
          monthlySavingsNeeded,
          extraPayments,
        });
      } else {
        // EMI loans nearing end (last 3 EMIs)
        const emisDone = Math.min(
          Math.max(0,
            (today.getFullYear() - start.getFullYear()) * 12 +
            (today.getMonth() - start.getMonth()) +
            (today.getDate() >= start.getDate() ? 1 : 0)
          ),
          tenure
        );
        const remaining = tenure - emisDone;
        if (remaining > 0 && remaining <= 6) {
          const endDate = new Date(start.getFullYear(), start.getMonth() + tenure, start.getDate());
          const extraPayments = payments.filter(p => p.loanId === loan.id);
          const bd = calculateEMIBreakdown(principal, interest, tenure, emisDone, emiAmount, 'emi', extraPayments);
          nearEMI.push({
            loan,
            endDate,
            emisLeft: remaining,
            remainingAmount: bd.remainingPrincipalAmount,
            monthlyEMI: emiAmount,
          });
        }
      }
    });

    // Sort by urgency
    bullets.sort((a, b) => a.daysLeft - b.daysLeft);
    nearEMI.sort((a, b) => a.emisLeft - b.emisLeft);

    setBulletLoans(bullets);
    setNearingEMIs(nearEMI);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Total exposure
  const totalExposure = bulletLoans.reduce((s, b) => s + b.dueAmount, 0);
  const criticalCount = bulletLoans.filter(b => b.daysLeft <= 30).length;

  return (
    <LinearGradient colors={['#fff7ed', '#fef3c7', '#f8fafc']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>⏰ Maturity Alerts</Text>
          <Text style={styles.headerSub}>Bullet loan countdowns & EMI endings</Text>
        </View>

        {/* Total exposure banner */}
        {bulletLoans.length > 0 && (
          <BlurView intensity={20} tint="light" style={styles.exposureBanner}>
            <View style={styles.exposureBannerInner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exposureLabel}>Total Bullet Loan Exposure</Text>
                <Text style={styles.exposureAmount}>{fc(totalExposure)}</Text>
                <Text style={styles.exposureSub}>{bulletLoans.length} active bullet loan{bulletLoans.length !== 1 ? 's' : ''}{criticalCount > 0 ? ` · ${criticalCount} critical` : ''}</Text>
              </View>
              {criticalCount > 0 && (
                <View style={styles.alertBadge}>
                  <Text style={styles.alertBadgeText}>⚠️ {criticalCount}</Text>
                </View>
              )}
            </View>
          </BlurView>
        )}

        {/* Bullet loan cards */}
        {bulletLoans.length === 0 ? (
          <BlurView intensity={15} tint="light" style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyText}>No bullet loans</Text>
            <Text style={styles.emptySub}>You have no active bullet / gold loans</Text>
          </BlurView>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Bullet / Gold Loans</Text>
            {bulletLoans.map((item, i) => {
              const meta = urgencyMeta(item.daysLeft);
              return (
                <BlurView
                  key={item.loan.id}
                  intensity={20}
                  tint="light"
                  style={[styles.card, { borderColor: meta.ring + '50' }]}
                >
                  <View style={styles.cardInner}>
                    {/* Top row: ring + info */}
                    <View style={styles.cardTop}>
                      <CountdownRing
                        days={item.daysLeft}
                        totalDays={item.totalDays}
                        color={meta.color}
                        size={90}
                      />
                      <View style={{ flex: 1, marginLeft: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={styles.loanName} numberOfLines={1}>{item.loan.loanName}</Text>
                          <View style={[styles.urgencyBadge, { backgroundColor: meta.bg }]}>
                            <Text style={[styles.urgencyBadgeText, { color: meta.color }]}>
                              {meta.icon} {meta.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.maturityDate}>Matures: {fd(item.maturity)}</Text>
                        <Text style={[styles.dueAmt, { color: meta.color }]}>{fc(item.dueAmount)}</Text>
                        <Text style={styles.dueAmtLabel}>Total Due at Maturity</Text>
                      </View>
                    </View>

                    {/* Detail grid */}
                    <View style={[styles.detailGrid, { borderTopColor: meta.ring + '30' }]}>
                      <DetailTile label="Principal" value={fc(item.principal)} />
                      <DetailTile label="Interest Due" value={fc(item.interest)} color="#f59e0b" />
                      <DetailTile label="Months Left" value={`${item.monthsRemaining} mo`} />
                      <DetailTile
                        label="Save/Month"
                        value={fc(item.monthlySavingsNeeded)}
                        color={meta.color}
                        bold
                      />
                    </View>

                    {/* Savings strategy hint */}
                    <View style={[styles.hintBox, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.hintText, { color: meta.color }]}>
                        💡 To cover this loan at maturity, set aside{' '}
                        <Text style={{ fontWeight: '700' }}>{fc(item.monthlySavingsNeeded)}/month</Text>
                        {' '}for the next{' '}
                        <Text style={{ fontWeight: '700' }}>{item.monthsRemaining} months</Text>
                      </Text>
                    </View>
                  </View>
                </BlurView>
              );
            })}
          </>
        )}

        {/* EMI loans nearing end */}
        {nearingEMIs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 8 }]}>EMI Loans Nearing Completion 🏁</Text>
            {nearingEMIs.map((item) => (
              <BlurView
                key={item.loan.id}
                intensity={20}
                tint="light"
                style={[styles.card, { borderColor: 'rgba(16,185,129,0.3)' }]}
              >
                <View style={styles.cardInner}>
                  <View style={styles.cardTop}>
                    <View style={styles.emisLeftBadge}>
                      <Text style={styles.emisLeftNum}>{item.emisLeft}</Text>
                      <Text style={styles.emisLeftLabel}>EMIs{'\n'}left</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 16 }}>
                      <Text style={styles.loanName}>{item.loan.loanName}</Text>
                      <Text style={styles.maturityDate}>Ends: {fd(item.endDate)}</Text>
                      <Text style={[styles.dueAmt, { color: '#10b981' }]}>{fc(item.remainingAmount)}</Text>
                      <Text style={styles.dueAmtLabel}>Principal Remaining</Text>
                    </View>
                  </View>
                  <View style={[styles.hintBox, { backgroundColor: 'rgba(16,185,129,0.08)' }]}>
                    <Text style={[styles.hintText, { color: '#10b981' }]}>
                      🎉 Only {item.emisLeft} EMI{item.emisLeft !== 1 ? 's' : ''} of{' '}
                      {fc(item.monthlyEMI)} remaining — you're almost done!
                    </Text>
                  </View>
                </View>
              </BlurView>
            ))}
          </>
        )}

        {bulletLoans.length === 0 && nearingEMIs.length === 0 && (
          <BlurView intensity={15} tint="light" style={[styles.emptyCard, { marginTop: 16 }]}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyText}>All clear!</Text>
            <Text style={styles.emptySub}>No bullet loans and no EMIs nearing completion</Text>
          </BlurView>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function DetailTile({ label, value, color, bold }) {
  return (
    <View style={styles.detailTile}>
      <Text style={styles.detailTileLabel}>{label}</Text>
      <Text style={[styles.detailTileValue, color && { color }, bold && { fontWeight: '700' }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 60 },

  header:       { marginBottom: 24 },
  backBtn:      { fontSize: 16, fontWeight: '600', color: '#f59e0b', marginBottom: 12 },
  headerTitle:  { fontSize: 30, fontWeight: '700', color: '#0f172a' },
  headerSub:    { fontSize: 13, color: 'rgba(15,23,42,0.5)', marginTop: 2 },

  exposureBanner:      { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', marginBottom: 20 },
  exposureBannerInner: { padding: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.06)' },
  exposureLabel:       { fontSize: 12, color: 'rgba(15,23,42,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  exposureAmount:      { fontSize: 32, fontWeight: '700', color: '#0f172a' },
  exposureSub:         { fontSize: 12, color: 'rgba(15,23,42,0.5)', marginTop: 2 },
  alertBadge:          { backgroundColor: '#e11d48', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  alertBadgeText:      { fontSize: 14, fontWeight: '800', color: '#fff' },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 12 },

  card:      { borderRadius: 28, overflow: 'hidden', borderWidth: 1.5, marginBottom: 16 },
  cardInner: { padding: 22 },

  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },

  loanName:    { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  maturityDate:{ fontSize: 13, color: 'rgba(15,23,42,0.5)', marginBottom: 6 },
  dueAmt:      { fontSize: 26, fontWeight: '700' },
  dueAmtLabel: { fontSize: 11, color: 'rgba(15,23,42,0.4)', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },

  urgencyBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  urgencyBadgeText: { fontSize: 11, fontWeight: '700' },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, paddingTop: 14, marginBottom: 14, gap: 0 },
  detailTile:       { width: '50%', paddingVertical: 6, paddingRight: 8 },
  detailTileLabel:  { fontSize: 11, color: 'rgba(15,23,42,0.45)', textTransform: 'uppercase', letterSpacing: 0.3 },
  detailTileValue:  { fontSize: 15, fontWeight: '600', color: '#0f172a', marginTop: 2 },

  hintBox:  { borderRadius: 14, padding: 14 },
  hintText: { fontSize: 13, lineHeight: 19 },

  emisLeftBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#10b981', flexShrink: 0 },
  emisLeftNum:   { fontSize: 26, fontWeight: '800', color: '#10b981', lineHeight: 30 },
  emisLeftLabel: { fontSize: 10, color: '#10b981', textAlign: 'center', lineHeight: 12 },

  emptyCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', padding: 48, alignItems: 'center', marginTop: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  emptySub:  { fontSize: 14, color: 'rgba(15,23,42,0.45)', textAlign: 'center' },
});

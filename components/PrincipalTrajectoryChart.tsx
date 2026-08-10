import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { calculateEMIBreakdown } from "../utils/emiCalculator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const fc = (amount: number) =>
  `₹${Math.round(amount || 0).toLocaleString("en-IN")}`;

const fcDynamicAxis = (v: number) => {
  const val = Math.round(v || 0);
  const absVal = Math.abs(val);

  if (absVal === 0) return "0";
  if (absVal >= 10000000) {
    const cr = val / 10000000;
    return `${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)}Cr`;
  }
  if (absVal >= 1000000) {
    const m = val / 1000000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (absVal >= 100000) {
    const l = val / 100000;
    return `${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)}L`;
  }
  if (absVal >= 1000) {
    const k = val / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `${val}`;
};

export type ViewMode = "combined" | "past" | "future";

interface PrincipalTrajectoryChartProps {
  loans: any[];
  payments: any[];
  compact?: boolean;
  onPressViewAll?: () => void;
}

interface MonthDataPoint {
  index: number;
  label: string;
  monthName: string;
  year: number;
  monthIndex: number;
  isPast: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  principalPending: number;
  principalReduced: number;
}

export default function PrincipalTrajectoryChart({
  loans = [],
  payments = [],
  compact = false,
  onPressViewAll,
}: PrincipalTrajectoryChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("combined");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // ── Calculate 13-month data points (Past 6M + Current + Future 6M) ──
  const timelineData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const points: MonthDataPoint[] = [];

    // Helper: calculate total principal pending across all active loans at a given past/present month offset
    const getHistoricalPending = (targetYear: number, targetMonth: number) => {
      let totalPending = 0;
      const targetEndDate = new Date(
        targetYear,
        targetMonth + 1,
        0,
        23,
        59,
        59,
      );

      loans.forEach((loan) => {
        if (loan.status === "closed" && loan.closedAt) {
          const closedDate = new Date(loan.closedAt);
          if (closedDate < new Date(targetYear, targetMonth, 1)) return;
        }

        const principal =
          parseFloat(String(loan.principal || 0).replace(/,/g, "")) || 0;
        const interest = parseFloat(loan.interest) || 0;
        const tenure =
          parseInt(String(loan.tenure || 0).replace(/,/g, "")) || 0;
        const emiAmount =
          parseFloat(String(loan.emiAmount || 0).replace(/,/g, "")) || 0;
        const loanType = loan.loanType || "emi";

        if (!loan.startDate) {
          totalPending += principal;
          return;
        }

        const sd = new Date(loan.startDate);
        if (sd > targetEndDate) return; // Loan not started yet

        let monthsElapsed =
          (targetYear - sd.getFullYear()) * 12 + (targetMonth - sd.getMonth());
        if (targetMonth === currentMonth && targetYear === currentYear) {
          if (now.getDate() >= sd.getDate()) monthsElapsed++;
        } else {
          monthsElapsed++; // full month elapsed
        }
        monthsElapsed = Math.max(0, Math.min(monthsElapsed, tenure));

        const extraPaymentsUpToMonth = payments.filter((p) => {
          if (p.loanId !== loan.id) return false;
          const pDate = new Date(p.paidAt || p.date || p.createdAt);
          return !isNaN(pDate.getTime()) && pDate <= targetEndDate;
        });

        const bd = (calculateEMIBreakdown as any)(
          principal,
          interest,
          tenure,
          monthsElapsed,
          emiAmount || null,
          loanType,
          extraPaymentsUpToMonth,
        );

        totalPending += bd.remainingPrincipalAmount;
      });

      return Math.max(0, totalPending);
    };

    // Construct 13 timeline points: -6 to +6
    for (let offset = -6; offset <= 6; offset++) {
      const d = new Date(currentYear, currentMonth + offset, 1);
      const year = d.getFullYear();
      const monthIdx = d.getMonth();
      const monthShort = d.toLocaleDateString("en-IN", { month: "short" });
      const monthFull = d.toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
      });

      const isPast = offset < 0;
      const isCurrent = offset === 0;
      const isFuture = offset > 0;

      let pending = 0;
      if (offset <= 0) {
        pending = getHistoricalPending(year, monthIdx);
      } else {
        // Future Projection based on current month active loans reducing balance
        const prevPending = points[points.length - 1]?.principalPending || 0;
        let monthlyReduction = 0;

        loans.forEach((loan) => {
          if (loan.status === "closed") return;
          const emiAmount =
            parseFloat(String(loan.emiAmount || 0).replace(/,/g, "")) || 0;
          const interestRate = parseFloat(loan.interest || 0);
          const loanType = loan.loanType || "emi";

          if (loanType === "emi" && emiAmount > 0) {
            // Interest portion ~ principal * r/12, principal reduction ~ emi - interest
            const monthlyRate = interestRate / 12 / 100;
            const currentEstPrincipal =
              prevPending > 0 ? prevPending / Math.max(1, loans.length) : 0;
            const interestPart = currentEstPrincipal * monthlyRate;
            const principalPart = Math.max(0, emiAmount - interestPart);
            monthlyReduction += principalPart;
          }
        });

        pending = Math.max(0, prevPending - monthlyReduction);
      }

      points.push({
        index: points.length,
        label: monthShort,
        monthName: monthFull,
        year,
        monthIndex: monthIdx,
        isPast,
        isCurrent,
        isFuture,
        principalPending: pending,
        principalReduced: 0,
      });
    }

    // Calculate month-over-month principal reduction
    for (let i = 1; i < points.length; i++) {
      points[i].principalReduced = Math.max(
        0,
        points[i - 1].principalPending - points[i].principalPending,
      );
    }

    return points;
  }, [loans, payments]);

  // Filter dataset according to active View Mode
  const activeDataset = useMemo(() => {
    if (viewMode === "past") {
      return timelineData.filter((p) => p.isPast || p.isCurrent);
    }
    if (viewMode === "future") {
      return timelineData.filter((p) => p.isCurrent || p.isFuture);
    }
    return timelineData;
  }, [timelineData, viewMode]);

  // Key Header Metrics
  const currentPoint = timelineData.find((p) => p.isCurrent) || timelineData[6];
  const sixMonthsAgoPoint = timelineData[0];
  const sixMonthsFuturePoint = timelineData[12];

  const projectedPaydown =
    (currentPoint?.principalPending || 0) -
    (sixMonthsFuturePoint?.principalPending || 0);
  const projectedPaydownPct =
    currentPoint?.principalPending > 0
      ? (projectedPaydown / currentPoint.principalPending) * 100
      : 0;

  const avgMonthlyPaydown = projectedPaydown / 6;

  // Selected point details (defaults to current month if null)
  const selectedPoint =
    selectedIndex !== null && activeDataset[selectedIndex]
      ? activeDataset[selectedIndex]
      : currentPoint;

  // Format chart data for react-native-chart-kit: sample max 5 labels to avoid crowding
  const chartData = useMemo(() => {
    if (activeDataset.length === 0) {
      return { labels: ["Now"], datasets: [{ data: [0] }] };
    }

    const maxTicks = 5;
    const step = Math.max(
      1,
      Math.floor((activeDataset.length - 1) / (maxTicks - 1)),
    );
    const milestoneIndices = new Set<number>();
    milestoneIndices.add(0);
    milestoneIndices.add(activeDataset.length - 1);

    for (let i = step; i < activeDataset.length - 1; i += step) {
      milestoneIndices.add(i);
    }

    const labels = activeDataset.map((d, i) =>
      milestoneIndices.has(i) ? d.label : "",
    );
    const dataValues = activeDataset.map((d) => Math.round(d.principalPending));

    return {
      labels,
      datasets: [
        {
          data: dataValues.length > 0 ? dataValues : [0],
          color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
          strokeWidth: 2.5,
        },
      ],
    };
  }, [activeDataset]);

  const cardWidth = SCREEN_WIDTH - (compact ? 40 : 32);

  return (
    <BlurView
      intensity={30}
      tint="light"
      style={[styles.container, compact && styles.compactContainer]}
    >
      {/* Card Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="trending-down" size={20} color="#10b981" />
          </View>
          <View>
            <Text style={styles.cardTitle}>Principal Pending & Trajectory</Text>
            <Text style={styles.cardSubtitle}>
              6M History · Current · 6M Expected Payoff
            </Text>
          </View>
        </View>
        {onPressViewAll && (
          <TouchableOpacity onPress={onPressViewAll} style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>Details</Text>
            <Ionicons name="chevron-forward" size={14} color="#10b981" />
          </TouchableOpacity>
        )}
      </View>

      {/* Main Numbers Banner */}
      <View style={styles.statsBanner}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Current Pending</Text>
          <Text style={styles.statValue}>
            {fc(currentPoint?.principalPending || 0)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>6M Paydown Trajectory</Text>
          <Text
            style={[
              styles.statValue,
              { color: projectedPaydown >= 0 ? "#10b981" : "#e11d48" },
            ]}
          >
            {projectedPaydown >= 0 ? "-" : "+"}
            {fc(Math.abs(projectedPaydown))}
          </Text>
          <Text style={styles.statSubText}>
            ({projectedPaydownPct.toFixed(1)}% reduction)
          </Text>
        </View>
      </View>

      {/* View Mode Toggle Controls */}
      {!compact && (
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              viewMode === "combined" && styles.toggleBtnActive,
            ]}
            onPress={() => {
              setViewMode("combined");
              setSelectedIndex(null);
            }}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.toggleText,
                viewMode === "combined" && styles.toggleTextActive,
              ]}
            >
              12M Timeline
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              viewMode === "past" && styles.toggleBtnActive,
            ]}
            onPress={() => {
              setViewMode("past");
              setSelectedIndex(null);
            }}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.toggleText,
                viewMode === "past" && styles.toggleTextActive,
              ]}
            >
              Past 6 Months
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              viewMode === "future" && styles.toggleBtnActive,
            ]}
            onPress={() => {
              setViewMode("future");
              setSelectedIndex(null);
            }}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.toggleText,
                viewMode === "future" && styles.toggleTextActive,
              ]}
            >
              Expected Trajectory
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Line Chart Component */}
      <View style={styles.chartWrapper}>
        <LineChart
          data={chartData}
          width={cardWidth}
          height={compact ? 170 : 210}
          yAxisLabel=""
          yAxisSuffix=""
          withDots={activeDataset.length <= 15}
          xLabelsOffset={-4}
          yLabelsOffset={-2}
          chartConfig={{
            backgroundColor: "#ffffff",
            backgroundGradientFrom: "#ffffff",
            backgroundGradientFromOpacity: 0,
            backgroundGradientTo: "#ffffff",
            backgroundGradientToOpacity: 0,
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
            style: {
              borderRadius: 16,
            },
            propsForLabels: {
              fontSize: 10,
              fontWeight: "600",
            },
            propsForDots: {
              r: "3",
              strokeWidth: "1.5",
              stroke: "#10b981",
              fill: "#ffffff",
            },
            propsForBackgroundLines: {
              strokeDasharray: "4 4",
              stroke: "rgba(226, 232, 240, 0.8)",
            },
            formatYLabel: (y) => fcDynamicAxis(parseFloat(y)),
          }}
          bezier
          style={{
            borderRadius: 16,
            paddingLeft: 64,
            paddingRight: 45,
          }}
          onDataPointClick={({ index }) => {
            setSelectedIndex(index);
          }}
        />
      </View>

      {/* Legend & Selected Node Details */}
      <View style={styles.chartLegendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#10b981" }]} />
          <Text style={styles.legendText}>Historical Balance</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#8b5cf6" }]} />
          <Text style={styles.legendText}>Projected Trajectory</Text>
        </View>
      </View>

      {/* Selected Data Point Inspector Card */}
      {selectedPoint && (
        <LinearGradient
          colors={["rgba(248,250,252,0.9)", "rgba(241,245,249,0.9)"]}
          style={styles.inspectorCard}
        >
          <View style={styles.inspectorRow}>
            <View>
              <View style={styles.monthBadgeRow}>
                <Text style={styles.inspectorMonth}>
                  {selectedPoint.monthName}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: selectedPoint.isPast
                        ? "rgba(16, 185, 129, 0.12)"
                        : selectedPoint.isCurrent
                          ? "rgba(59, 130, 246, 0.12)"
                          : "rgba(139, 92, 246, 0.12)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color: selectedPoint.isPast
                          ? "#10b981"
                          : selectedPoint.isCurrent
                            ? "#2563eb"
                            : "#8b5cf6",
                      },
                    ]}
                  >
                    {selectedPoint.isPast
                      ? "Historical"
                      : selectedPoint.isCurrent
                        ? "Current Month"
                        : "Expected Trajectory"}
                  </Text>
                </View>
              </View>
              <Text style={styles.inspectorValue}>
                {fc(selectedPoint.principalPending)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.inspectorLabel}>Monthly Reduction</Text>
              <Text style={[styles.inspectorReduced, { color: "#10b981" }]}>
                -{fc(selectedPoint.principalReduced || avgMonthlyPaydown)}
              </Text>
            </View>
          </View>
        </LinearGradient>
      )}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    padding: 16,
    marginVertical: 12,
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  compactContainer: {
    marginVertical: 8,
    padding: 14,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10b981",
  },
  statsBanner: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(241, 245, 249, 1)",
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 4,
  },
  statLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "500",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  statSubText: {
    fontSize: 10,
    color: "#10b981",
    fontWeight: "600",
    marginTop: 1,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "rgba(241, 245, 249, 0.9)",
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    gap: 2,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 9,
    alignItems: "center",
  },
  toggleBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  toggleTextActive: {
    color: "#10b981",
    fontWeight: "700",
  },
  chartWrapper: {
    alignItems: "center",
    borderRadius: 16,
  },
  chartStyle: {
    borderRadius: 16,
    paddingRight: 32,
    paddingLeft: 0,
  },
  chartLegendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    marginTop: 6,
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "500",
  },
  inspectorCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.8)",
    marginTop: 4,
  },
  inspectorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monthBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  inspectorMonth: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  inspectorValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  inspectorLabel: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "500",
    marginBottom: 2,
  },
  inspectorReduced: {
    fontSize: 14,
    fontWeight: "700",
  },
});

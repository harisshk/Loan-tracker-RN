import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
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

const fc = (v: number) => `₹${Math.round(v || 0).toLocaleString("en-IN")}`;

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

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

interface PrincipalRoadmapChartProps {
  loans: any[];
  payments: any[];
  extraMonthlyBudget?: number;
  onExtraBudgetChange?: (val: number) => void;
}

interface RoadmapPoint {
  index: number;
  label: string;
  monthName: string;
  year: number;
  monthIndex: number;
  totalPrincipal: number;
  activeEMI: number;
  extraApplied: number;
}

interface ClosureEvent {
  loanName: string;
  monthIndex: number;
  label: string;
  freedEMI: number;
  newTotalExtra: number;
}

export default function PrincipalRoadmapChart({
  loans = [],
  payments = [],
  extraMonthlyBudget = 25000,
}: PrincipalRoadmapChartProps) {
  const [selectedLoanId, setSelectedLoanId] = useState<string | "all">("all");
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );

  // Filter EMI loans
  const emiLoans = useMemo(() => {
    return loans.filter(
      (l) => l.status !== "closed" && (l.loanType || "emi") === "emi",
    );
  }, [loans]);

  // Prep active loan initial states
  const initialLoanStates = useMemo(() => {
    const parseSafe = (val: any) =>
      parseFloat(String(val || "0").replace(/,/g, "")) || 0;

    return emiLoans.map((loan) => {
      const principal = parseSafe(loan.principal);
      const interest = parseFloat(loan.interest) || 0;
      const tenure =
        parseInt(String(loan.tenure || "0").replace(/,/g, "")) || 0;
      const emiAmount = parseSafe(loan.emiAmount);
      const loanType = loan.loanType || "emi";

      let monthsElapsed = 0;
      if (loan.startDate) {
        const start = new Date(loan.startDate);
        // Count only fully completed EMI months — no +1 for current in-progress month
        monthsElapsed =
          (TODAY.getFullYear() - start.getFullYear()) * 12 +
          (TODAY.getMonth() - start.getMonth());
        monthsElapsed = Math.max(0, monthsElapsed);
      }

      const extraPayments = payments.filter((p) => p.loanId === loan.id);
      const bd = (calculateEMIBreakdown as any)(
        principal,
        interest,
        tenure,
        monthsElapsed,
        emiAmount || null,
        loanType,
        extraPayments,
      );

      return {
        id: loan.id,
        name: loan.loanName,
        principal,
        interest,
        tenureRemaining: Math.max(0, tenure - monthsElapsed),
        emiAmount,
        remainingPrincipal: bd.remainingPrincipalAmount,
        closed: bd.remainingPrincipalAmount <= 5,
      };
    });
  }, [emiLoans, payments]);

  // Run Cascade Simulation & Build Graph Points
  const { points, closureEvents, dynamicCaption } = useMemo(() => {
    if (initialLoanStates.length === 0) {
      return { points: [], closureEvents: [], dynamicCaption: "" };
    }

    const targetStates =
      selectedLoanId === "all"
        ? initialLoanStates.map((l) => ({ ...l }))
        : initialLoanStates
            .filter((l) => l.id === selectedLoanId)
            .map((l) => ({ ...l }));

    const pointsList: RoadmapPoint[] = [];
    const events: ClosureEvent[] = [];

    let currentExtraBudget = extraMonthlyBudget;
    let baseExtraInput = extraMonthlyBudget;

    const currentMonthLabel = TODAY.toLocaleDateString("en-IN", {
      month: "short",
      year: "numeric",
    });
    const initialTotalPrincipal = targetStates.reduce(
      (s, l) => s + (l.closed ? 0 : l.remainingPrincipal),
      0,
    );
    const initialActiveEMI = targetStates.reduce(
      (s, l) => s + (l.closed ? 0 : l.emiAmount),
      0,
    );

    pointsList.push({
      index: 0,
      label: TODAY.toLocaleDateString("en-IN", { month: "short" }),
      monthName: currentMonthLabel,
      year: TODAY.getFullYear(),
      monthIndex: TODAY.getMonth(),
      totalPrincipal: Math.round(initialTotalPrincipal),
      activeEMI: initialActiveEMI,
      extraApplied: currentExtraBudget,
    });

    const MAX_SIM_MONTHS = 48;
    let m = 0;

    while (targetStates.some((l) => !l.closed) && m < MAX_SIM_MONTHS) {
      m++;
      const date = new Date(TODAY.getFullYear(), TODAY.getMonth() + m, 1);
      const monthShort = date.toLocaleDateString("en-IN", { month: "short" });
      const monthLabel = date.toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      });

      targetStates.forEach((l) => {
        if (l.closed) return;
        const r = l.interest / 12 / 100;
        const interestPortion = l.remainingPrincipal * r;
        const principalPortion = Math.max(0, l.emiAmount - interestPortion);
        l.remainingPrincipal = Math.max(
          0,
          l.remainingPrincipal - principalPortion,
        );
        l.tenureRemaining -= 1;

        if (l.remainingPrincipal <= 5 || l.tenureRemaining <= 0) {
          l.remainingPrincipal = 0;
          l.closed = true;

          events.push({
            loanName: l.name,
            monthIndex: m,
            label: monthLabel,
            freedEMI: l.emiAmount,
            newTotalExtra: currentExtraBudget + l.emiAmount,
          });

          currentExtraBudget += l.emiAmount;
        }
      });

      let extraToApply = currentExtraBudget;
      const openLoans = targetStates
        .filter((l) => !l.closed)
        .sort((a, b) => b.interest - a.interest);

      for (const l of openLoans) {
        if (extraToApply <= 0) break;
        const pay = Math.min(extraToApply, l.remainingPrincipal);
        l.remainingPrincipal = Math.max(0, l.remainingPrincipal - pay);
        extraToApply -= pay;

        if (l.remainingPrincipal <= 5) {
          l.remainingPrincipal = 0;
          if (!l.closed) {
            l.closed = true;
            if (!events.find((e) => e.loanName === l.name)) {
              events.push({
                loanName: l.name,
                monthIndex: m,
                label: monthLabel,
                freedEMI: l.emiAmount,
                newTotalExtra: currentExtraBudget + l.emiAmount,
              });
              currentExtraBudget += l.emiAmount;
            }
          }
        }
      }

      const totalRem = targetStates.reduce(
        (s, l) => s + (l.closed ? 0 : l.remainingPrincipal),
        0,
      );
      const activeEMI = targetStates.reduce(
        (s, l) => s + (l.closed ? 0 : l.emiAmount),
        0,
      );

      pointsList.push({
        index: m,
        label: monthShort,
        monthName: monthLabel,
        year: date.getFullYear(),
        monthIndex: date.getMonth(),
        totalPrincipal: Math.round(totalRem),
        activeEMI,
        extraApplied: currentExtraBudget,
      });
    }

    let caption = `Illustrative principal-only roadmap using ${fc(baseExtraInput)}/month extra paydown.`;
    if (events.length > 0) {
      const firstClosure = events[0];
      caption = `Illustrative principal-only roadmap using ${fc(
        baseExtraInput,
      )}/month through ${firstClosure.label}, then ${fc(
        firstClosure.newTotalExtra,
      )}/month after the ${firstClosure.loanName} ends.`;
    }

    return {
      points: pointsList,
      closureEvents: events,
      dynamicCaption: caption,
    };
  }, [initialLoanStates, selectedLoanId, extraMonthlyBudget]);

  // Clean X-Axis sampling: plot all data points for smooth line, but show 4-5 well-spaced X-axis labels
  const chartData = useMemo(() => {
    if (points.length === 0) {
      return { labels: ["Now"], datasets: [{ data: [0] }] };
    }

    const totalLen = points.length;
    const milestoneIndices = new Set<number>();
    milestoneIndices.add(0);
    milestoneIndices.add(totalLen - 1);

    if (closureEvents.length > 0 && closureEvents[0].monthIndex < totalLen) {
      milestoneIndices.add(closureEvents[0].monthIndex);
    }

    if (totalLen > 3) {
      const step = Math.floor((totalLen - 1) / 4);
      for (let i = step; i < totalLen - 1; i += step) {
        if (totalLen - 1 - i >= 3) {
          milestoneIndices.add(i);
        }
      }
    }

    const labels = points.map((p, idx) => {
      if (milestoneIndices.has(idx)) {
        return `${p.label}'${String(p.year).slice(-2)}`;
      }
      return "";
    });

    return {
      labels,
      datasets: [
        {
          data: points.map((p) => p.totalPrincipal),
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
          strokeWidth: 2.5,
        },
      ],
    };
  }, [points, closureEvents]);

  const selectedPoint =
    selectedPointIndex !== null && points[selectedPointIndex]
      ? points[selectedPointIndex]
      : points[0];

  const cardWidth = SCREEN_WIDTH - 32;

  if (initialLoanStates.length === 0) {
    return (
      <BlurView intensity={20} tint="light" style={styles.container}>
        <Text style={styles.emptyText}>
          No active EMI loans found to build payoff roadmap.
        </Text>
      </BlurView>
    );
  }

  return (
    <BlurView intensity={25} tint="light" style={styles.container}>
      {/* Header Title */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="map-outline" size={20} color="#3b82f6" />
          </View>
          <View>
            <Text style={styles.title}>Principal Payoff Roadmap</Text>
            <Text style={styles.subtitle}>
              EMI Rollover & Cascade Accelerator (in ₹)
            </Text>
          </View>
        </View>
      </View>

      {/* Dynamic Headline Caption from Screenshot */}
      <View style={styles.captionBox}>
        <Text style={styles.captionText}>{dynamicCaption}</Text>
      </View>

      {/* Loan Selector Filter Pills */}
      {emiLoans.length > 1 && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedLoanId === "all" && styles.filterChipActive,
            ]}
            onPress={() => {
              setSelectedLoanId("all");
              setSelectedPointIndex(null);
            }}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedLoanId === "all" && styles.filterChipTextActive,
              ]}
            >
              All EMI Loans
            </Text>
          </TouchableOpacity>
          {emiLoans.map((loan) => (
            <TouchableOpacity
              key={loan.id}
              style={[
                styles.filterChip,
                selectedLoanId === loan.id && styles.filterChipActive,
              ]}
              onPress={() => {
                setSelectedLoanId(loan.id);
                setSelectedPointIndex(null);
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedLoanId === loan.id && styles.filterChipTextActive,
                ]}
                numberOfLines={1}
              >
                {loan.loanName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Line Chart Component */}
      <View style={styles.chartWrapper}>
        <LineChart
          data={chartData}
          width={cardWidth}
          height={220}
          yAxisLabel=""
          yAxisSuffix=""
          withDots={points.length <= 15}
          xLabelsOffset={-4}
          yLabelsOffset={0}
          chartConfig={{
            backgroundColor: "#ffffff",
            backgroundGradientFrom: "#ffffff",
            backgroundGradientFromOpacity: 0,
            backgroundGradientTo: "#ffffff",
            backgroundGradientToOpacity: 0,
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
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
              stroke: "#3b82f6",
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
            setSelectedPointIndex(index);
          }}
        />
      </View>

      {/* Milestone Events List */}
      {closureEvents.length > 0 && (
        <View style={styles.eventsSection}>
          <Text style={styles.eventsTitle}>🚀 EMI Rollover Milestones</Text>
          {closureEvents.map((ev, i) => (
            <View key={i} style={styles.eventRow}>
              <View style={styles.eventDot} />
              <Text style={styles.eventText}>
                <Text style={{ fontWeight: "700", color: "#0f172a" }}>
                  {ev.loanName}
                </Text>{" "}
                finishes in{" "}
                <Text style={{ fontWeight: "700", color: "#3b82f6" }}>
                  {ev.label}
                </Text>
                ! Freed EMI ({fc(ev.freedEMI)}/mo) added to extra principal
                budget ({fc(ev.newTotalExtra)}/mo).
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Selected Point Inspector */}
      {selectedPoint && (
        <View style={styles.inspectorCard}>
          <View style={styles.inspectorRow}>
            <View>
              <Text style={styles.inspectorMonth}>
                {selectedPoint.monthName}
              </Text>
              <Text style={styles.inspectorVal}>
                {fc(selectedPoint.totalPrincipal)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.inspectorSubLabel}>Monthly Acceleration</Text>
              <Text style={styles.inspectorAccel}>
                +{fc(selectedPoint.extraApplied)}/mo
              </Text>
            </View>
          </View>
        </View>
      )}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    padding: 16,
    marginVertical: 14,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.25)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  captionBox: {
    backgroundColor: "rgba(241, 245, 249, 0.9)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
  },
  captionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    lineHeight: 19,
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 1)",
  },
  filterChipActive: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderColor: "#3b82f6",
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  filterChipTextActive: {
    color: "#3b82f6",
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
  eventsSection: {
    marginTop: 10,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(241, 245, 249, 1)",
  },
  eventsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#3b82f6",
  },
  eventText: {
    fontSize: 11,
    color: "#475569",
    flex: 1,
    lineHeight: 16,
  },
  inspectorCard: {
    backgroundColor: "rgba(248, 250, 252, 0.95)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.9)",
    marginTop: 10,
  },
  inspectorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inspectorMonth: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  inspectorVal: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 1,
  },
  inspectorSubLabel: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "500",
  },
  inspectorAccel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#10b981",
    marginTop: 1,
  },
  emptyText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    padding: 16,
  },
});

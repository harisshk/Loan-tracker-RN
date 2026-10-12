import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, HIT, radius, space, type } from "../../constants/dashboardTheme";
import { FinancialQuote, getCategoryTheme, getDailyQuote, getNextQuote } from "../../utils/quotes";
import { Card, hapticTap, PressableScale } from "./primitives";

/** Daily quote: stable for the day, changes only when the user asks. */
export default function QuoteCard() {
  const [quote, setQuote] = useState<FinancialQuote>(() => getDailyQuote());
  const theme = getCategoryTheme(quote.category);

  const shuffle = () => {
    hapticTap();
    setQuote((prev) => getNextQuote(prev?.id));
  };

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.chip, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
            {theme.emoji}
          </Text>
          <Text style={[styles.chipText, { color: theme.text }]}>{quote.category}</Text>
        </View>
        <Text style={styles.overline}>Daily wisdom</Text>
        <View style={{ flex: 1 }} />
        <PressableScale onPress={shuffle} haptic={false} style={styles.shuffle} accessibilityLabel="Show another quote" hitSlop={6}>
          <Ionicons name="shuffle" size={14} color={colors.indigo} />
          <Text style={styles.shuffleText}>Shuffle</Text>
        </PressableScale>
      </View>
      <Animated.View key={quote.id} entering={FadeIn.duration(220)}>
        <Text style={styles.quote} numberOfLines={5}>
          “{quote.quote}”
        </Text>
        <Text style={styles.author}>— {quote.author}</Text>
      </Animated.View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  emoji: {
    fontSize: 11,
  },
  chipText: {
    ...type.caption,
    fontSize: 11,
  },
  overline: {
    ...type.overline,
    fontSize: 10,
    color: colors.textMuted,
  },
  shuffle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: HIT - 8,
    paddingHorizontal: space.sm,
  },
  shuffleText: {
    ...type.caption,
    color: colors.indigo,
  },
  quote: {
    ...type.body,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
    color: colors.text,
  },
  author: {
    ...type.label,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: space.sm,
  },
});

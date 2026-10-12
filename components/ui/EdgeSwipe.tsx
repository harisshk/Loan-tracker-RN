import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

const EDGE_WIDTH = 18;

/**
 * Invisible strip along the left edge of a screen: swiping right from it calls
 * `onOpen` (used to open the side menu). Vertical scrolling is unaffected.
 */
export default function EdgeSwipeOpener({ onOpen }: { onOpen: () => void }) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX(10)
        .failOffsetY([-14, 14])
        .onEnd((e) => {
          if (e.translationX > 48 || e.velocityX > 450) onOpen();
        }),
    [onOpen],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.edge}
        collapsable={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_WIDTH,
    zIndex: 20,
  },
});

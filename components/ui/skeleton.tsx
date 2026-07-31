import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, ViewStyle } from 'react-native';

interface SkeletonProps {
  style?: ViewStyle | ViewStyle[];
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
}

export function PulseSkeleton({ style, width, height, borderRadius }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    let isMounted = true;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.65,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 850,
          useNativeDriver: true,
        }),
      ])
    );

    if (isMounted) {
      animation.start();
    }

    return () => {
      isMounted = false;
      animation.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          opacity,
          backgroundColor: 'rgba(15, 23, 42, 0.07)',
          width: width ?? '100%',
          height: height ?? 20,
          borderRadius: borderRadius ?? 8,
        } as any,
        style,
      ]}
    />
  );
}

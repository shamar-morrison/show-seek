import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS } from '@/src/constants/theme';

interface LoadingSkeletonProps {
  width?: number | string;
  height?: number;
  style?: any;
}

export function LoadingSkeleton({ width = '100%', height = 20, style }: LoadingSkeletonProps) {
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function MovieCardSkeleton({ width = 140 }: { width?: number }) {
  return (
    <View style={[styles.cardContainer, { width }]}>
      <LoadingSkeleton width={width} height={width * 1.5} style={styles.poster} />
      <LoadingSkeleton width="80%" height={14} style={{ marginTop: SPACING.s }} />
      <LoadingSkeleton width="40%" height={12} style={{ marginTop: 4 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.s,
  },
  cardContainer: {
    marginRight: SPACING.m,
  },
  poster: {
    borderRadius: BORDER_RADIUS.m,
  },
});

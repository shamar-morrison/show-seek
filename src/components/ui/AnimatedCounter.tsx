import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  style?: any;
  decimals?: number;
}

const AnimatedText = Animated.createAnimatedComponent(Text);

export function AnimatedCounter({ 
  value, 
  duration = 1000, 
  style,
  decimals = 0 
}: AnimatedCounterProps) {
  const count = useSharedValue(0);

  useEffect(() => {
    count.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration]);

  const animatedProps = useAnimatedProps(() => {
    const formattedValue = decimals > 0 
      ? count.value.toFixed(decimals)
      : Math.round(count.value).toLocaleString('en-US');
    
    return {
      text: formattedValue,
    };
  });

  return (
    <AnimatedText 
      style={style}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({});

import { COLORS } from '@/src/constants/theme';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface AnimatedCheckProps {
  visible: boolean;
  size?: number;
  color?: string;
}

/**
 * Animated checkmark component with spring animation for selection states.
 * Used in list selection UIs like AddToListModal and HomeScreenCustomizationModal.
 */
export const AnimatedCheck = ({ visible, size = 14, color = COLORS.white }: AnimatedCheckProps) => {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 10,
      }).start();
    } else {
      Animated.timing(scale, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <AppIcon icon={Tick02Icon} size={size} color={color} strokeWidth={3} />
    </Animated.View>
  );
};

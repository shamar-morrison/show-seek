import { useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Custom hook for managing animated scroll header behavior
 *
 * Returns scrollY value and scroll view props needed for the animated header effect
 *
 * @returns Object containing scrollY Animated.Value and scrollViewProps
 *
 * @example
 * const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
 *
 * return (
 *   <>
 *     <AnimatedScrollHeader title="Movie" onBackPress={goBack} scrollY={scrollY} />
 *     <Animated.ScrollView {...scrollViewProps}>
 *       {content}
 *     </Animated.ScrollView>
 *   </>
 * );
 */
export const useAnimatedScrollHeader = () => {
  const scrollY = useRef(new Animated.Value(0)).current;

  return {
    scrollY,
    scrollViewProps: {
      onScroll: Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
      scrollEventThrottle: 16,
    },
  };
};

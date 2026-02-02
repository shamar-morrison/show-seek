import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Scale factor to zoom in the image so posters are visible
const SCALE_FACTOR = 2.5;

// The original image is landscape (~640x360), we need to calculate scaled dimensions
// We scale based on width to ensure it fills the screen width when zoomed
const IMAGE_ASPECT_RATIO = 640 / 360;
const SCALED_WIDTH = SCREEN_WIDTH * SCALE_FACTOR;
const SCALED_HEIGHT = SCALED_WIDTH / IMAGE_ASPECT_RATIO;

// Animation duration in ms (20 seconds for a subtle, slow scroll)
const ANIMATION_DURATION = 20000;

/**
 * Animated background component for auth screens.
 * Displays a movie poster collage that continuously scrolls upward
 * with a dark gradient overlay for text readability.
 */
export function AnimatedBackground() {
  const translateY = useSharedValue(0);

  useEffect(() => {
    // Animate from 0 to negative half the image height, then loop
    // This creates a seamless infinite scroll effect
    translateY.value = withRepeat(
      withTiming(-SCALED_HEIGHT / 2, {
        duration: ANIMATION_DURATION,
        easing: Easing.linear,
      }),
      -1, // Infinite repeat
      false // Don't reverse, just reset to start
    );
  }, [translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Animated movie collage - we render it twice for seamless looping */}
      <Animated.View style={[styles.imageContainer, animatedStyle]}>
        <Animated.Image
          source={require('@/assets/images/movie_collage.png')}
          style={styles.image}
          resizeMode="cover"
        />
        {/* Duplicate image for seamless loop */}
        <Animated.Image
          source={require('@/assets/images/movie_collage.png')}
          style={styles.image}
          resizeMode="cover"
        />
      </Animated.View>

      {/* Gradient overlay - stronger from bottom */}
      <LinearGradient
        colors={[
          'rgba(0, 0, 0, 0.3)', // Top - lighter
          'rgba(0, 0, 0, 0.7)', // Middle
          'rgba(0, 0, 0, 0.8)', // Bottom - solid background color
        ]}
        locations={[0, 0.4, 0.85]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  imageContainer: {
    position: 'absolute',
    top: 0,
    left: -(SCALED_WIDTH - SCREEN_WIDTH) / 2, // Center horizontally
    width: SCALED_WIDTH,
    // Height is double to allow seamless looping
    height: SCALED_HEIGHT * 2,
  },
  image: {
    width: SCALED_WIDTH,
    height: SCALED_HEIGHT,
  },
});

import { BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { screenStyles } from '@/src/styles/screenStyles';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MOVIE_PLACEHOLDERS = 3;

/**
 * Placeholder for the Collection page, laid out like it: the hero backdrop, title, overview,
 * tracking button and the first few movie cards. Shown while the collection loads, and for one
 * tick when it's cached so the page slides in before the full list is drawn.
 */
export const CollectionScreenSkeleton = memo(() => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const shimmer = {
    opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }),
  };

  return (
    <View style={screenStyles.container} testID="collection-skeleton">
      <View style={styles.hero}>
        <Animated.View style={[styles.backdrop, shimmer]} />
        <LinearGradient colors={['transparent', COLORS.background]} style={styles.gradient} />
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.backButton} />
        </SafeAreaView>
      </View>

      <View style={styles.content}>
        <Animated.View style={[styles.title, shimmer]} />
        <Animated.View style={[styles.textLine, { width: '100%' }, shimmer]} />
        <Animated.View style={[styles.textLine, { width: '85%' }, shimmer]} />
        <Animated.View style={[styles.button, shimmer]} />
        <Animated.View style={[styles.sectionTitle, shimmer]} />

        {Array.from({ length: MOVIE_PLACEHOLDERS }, (_, index) => (
          <View key={index} style={styles.movieCard}>
            <Animated.View style={[styles.poster, shimmer]} />
            <View style={styles.movieInfo}>
              <Animated.View style={[styles.textLine, { width: '80%' }, shimmer]} />
              <Animated.View style={[styles.textLine, { width: '40%' }, shimmer]} />
              <Animated.View style={[styles.textLine, { width: '95%' }, shimmer]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

CollectionScreenSkeleton.displayName = 'CollectionScreenSkeleton';

const styles = StyleSheet.create({
  // Sizes follow CollectionScreen's styles so the page doesn't jump when it fills in.
  hero: {
    height: 300,
    position: 'relative',
  },
  backdrop: {
    backgroundColor: COLORS.surfaceLight,
    height: '100%',
    width: '100%',
  },
  gradient: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  headerSafe: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  backButton: {
    backgroundColor: COLORS.overlay,
    borderRadius: BORDER_RADIUS.round,
    height: 40,
    marginLeft: SPACING.m,
    marginTop: SPACING.m,
    width: 40,
  },
  content: {
    marginTop: -SPACING.xxl,
    padding: SPACING.l,
  },
  title: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.s,
    height: 32,
    marginBottom: SPACING.m,
    width: '70%',
  },
  textLine: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.s,
    height: 14,
    marginBottom: SPACING.s,
  },
  button: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    height: 48,
    marginBottom: SPACING.l,
    marginTop: SPACING.l,
  },
  sectionTitle: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.s,
    height: 22,
    marginBottom: SPACING.m,
    width: '35%',
  },
  movieCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    flexDirection: 'row',
    marginBottom: SPACING.m,
    padding: SPACING.m,
  },
  poster: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.s,
    height: 120,
    width: 80,
  },
  movieInfo: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.m,
  },
});

import { BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { screenStyles } from '@/src/styles/screenStyles';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Skeleton placeholder for detail screens (Movie/TV).
 * Shows a shimmer effect matching the hero section layout.
 */
export const DetailScreenSkeleton = memo(() => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [shimmerAnim]);

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <View style={screenStyles.container}>
      {/* Hero Section Skeleton */}
      <View style={styles.heroContainer}>
        <Animated.View style={[styles.backdrop, { opacity: shimmerOpacity }]} />
        <LinearGradient colors={['transparent', COLORS.background]} style={styles.gradient} />

        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.backButtonPlaceholder} />
        </SafeAreaView>

        {/* Poster placeholder */}
        <View style={styles.posterContainer}>
          <Animated.View style={[styles.poster, { opacity: shimmerOpacity }]} />
        </View>
      </View>

      {/* Content Section Skeleton */}
      <View style={styles.content}>
        {/* Title placeholder */}
        <Animated.View style={[styles.titleSkeleton, { opacity: shimmerOpacity }]} />

        {/* Meta row placeholder */}
        <View style={styles.metaRow}>
          <Animated.View style={[styles.metaItem, { opacity: shimmerOpacity }]} />
          <Animated.View style={[styles.metaItem, { opacity: shimmerOpacity }]} />
          <Animated.View style={[styles.metaItem, { opacity: shimmerOpacity }]} />
        </View>

        {/* Genre tags placeholder */}
        <View style={styles.genreRow}>
          <Animated.View style={[styles.genreTag, { width: 60, opacity: shimmerOpacity }]} />
          <Animated.View style={[styles.genreTag, { width: 80, opacity: shimmerOpacity }]} />
          <Animated.View style={[styles.genreTag, { width: 50, opacity: shimmerOpacity }]} />
        </View>

        {/* Action buttons placeholder */}
        <View style={styles.actionButtons}>
          <View style={styles.actionRow}>
            <Animated.View style={[styles.actionButton, { opacity: shimmerOpacity }]} />
            <Animated.View style={[styles.actionButton, { opacity: shimmerOpacity }]} />
            <Animated.View style={[styles.actionButton, { opacity: shimmerOpacity }]} />
            <Animated.View style={[styles.actionButton, { opacity: shimmerOpacity }]} />
          </View>
          <Animated.View style={[styles.trailerButton, { opacity: shimmerOpacity }]} />
        </View>

        {/* Overview placeholder */}
        <Animated.View style={[styles.sectionTitle, { opacity: shimmerOpacity }]} />
        <Animated.View style={[styles.textLine, { width: '100%', opacity: shimmerOpacity }]} />
        <Animated.View style={[styles.textLine, { width: '90%', opacity: shimmerOpacity }]} />
        <Animated.View style={[styles.textLine, { width: '75%', opacity: shimmerOpacity }]} />
      </View>
    </View>
  );
});

DetailScreenSkeleton.displayName = 'DetailScreenSkeleton';

const styles = StyleSheet.create({
  heroContainer: {
    height: 400,
    position: 'relative',
  },
  backdrop: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surfaceLight,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  headerSafe: {
    position: 'absolute',
    top: 10,
    left: 0,
    zIndex: 10,
  },
  backButtonPlaceholder: {
    width: 40,
    height: 40,
    marginLeft: SPACING.m,
    backgroundColor: COLORS.overlay,
    borderRadius: BORDER_RADIUS.round,
  },
  posterContainer: {
    position: 'absolute',
    bottom: SPACING.l,
    left: SPACING.l,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  content: {
    paddingHorizontal: SPACING.l,
    marginTop: -SPACING.m,
  },
  titleSkeleton: {
    height: 28,
    width: '70%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.s,
    marginTop: SPACING.s,
    marginBottom: SPACING.s,
  },
  metaRow: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginBottom: SPACING.m,
  },
  metaItem: {
    height: 16,
    width: 60,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.s,
  },
  genreRow: {
    flexDirection: 'row',
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  genreTag: {
    height: 28,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.round,
  },
  actionButtons: {
    gap: SPACING.s,
    marginBottom: SPACING.xl,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.s,
  },
  actionButton: {
    flex: 1,
    height: 48,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  trailerButton: {
    height: 48,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  sectionTitle: {
    height: 20,
    width: 80,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.s,
    marginBottom: SPACING.m,
  },
  textLine: {
    height: 14,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.s,
    marginBottom: SPACING.s,
  },
});

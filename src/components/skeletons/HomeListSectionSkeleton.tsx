import { MovieCardSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { FONT_SIZE, SPACING } from '@/src/constants/theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';

/**
 * Skeleton placeholder for a home screen list section.
 * Shows a title skeleton and 4 movie card skeletons.
 */
export function HomeListSectionSkeleton() {
  return (
    <View style={styles.section}>
      {/* Title skeleton */}
      <View style={styles.titleContainer}>
        <LoadingSkeleton width={150} height={FONT_SIZE.l + 4} />
      </View>
      {/* Cards skeleton row */}
      <View style={styles.cardsContainer}>
        <MovieCardSkeleton />
        <MovieCardSkeleton />
        <MovieCardSkeleton />
        <MovieCardSkeleton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.l,
  },
  titleContainer: {
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.m,
  },
  cardsContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.l,
  },
});

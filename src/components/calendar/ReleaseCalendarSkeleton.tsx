import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface ReleaseCalendarSkeletonProps {
  showMediaFilterRow?: boolean;
}

export function ReleaseCalendarSkeleton({
  showMediaFilterRow = true,
}: ReleaseCalendarSkeletonProps) {
  return (
    <View
      style={[styles.container, !showMediaFilterRow && styles.containerContentOnly]}
      testID="calendar-loading"
    >
      {showMediaFilterRow ? (
        <View style={styles.mediaFilterRow}>
          <LoadingSkeleton width={72} height={36} style={styles.filterPill} />
          <LoadingSkeleton width={88} height={36} style={styles.filterPill} />
          <LoadingSkeleton width={98} height={36} style={styles.filterPill} />
        </View>
      ) : null}

      <View style={styles.temporalTabsRow}>
        <LoadingSkeleton width={72} height={34} style={styles.tabPill} />
        <LoadingSkeleton width={98} height={34} style={styles.tabPill} />
        <LoadingSkeleton width={86} height={34} style={styles.tabPill} />
        <LoadingSkeleton width={110} height={34} style={styles.tabPill} />
      </View>

      <View style={styles.cardsContainer}>
        <ReleaseCardSkeleton />
        <ReleaseCardSkeleton />
        <ReleaseCardSkeleton />
      </View>
    </View>
  );
}

function ReleaseCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.dateColumn}>
        <LoadingSkeleton width={30} height={26} style={styles.dateLine} />
        <LoadingSkeleton width={36} height={12} />
      </View>
      <View style={styles.cardBody}>
        <LoadingSkeleton width="100%" height={88} style={styles.preview} />
        <View style={styles.cardContent}>
          <LoadingSkeleton width="68%" height={16} />
          <LoadingSkeleton width="42%" height={12} style={styles.metaLine} />
          <LoadingSkeleton width="56%" height={12} style={styles.metaLine} />
          <View style={styles.footerRow}>
            <LoadingSkeleton width={74} height={12} />
            <LoadingSkeleton width={22} height={22} style={styles.footerBadge} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: SPACING.m,
  },
  containerContentOnly: {
    paddingTop: 0,
  },
  mediaFilterRow: {
    flexDirection: 'row',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
  },
  filterPill: {
    borderRadius: BORDER_RADIUS.round,
  },
  temporalTabsRow: {
    flexDirection: 'row',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  tabPill: {
    borderRadius: BORDER_RADIUS.round,
  },
  cardsContainer: {
    gap: SPACING.s,
    paddingTop: SPACING.m,
  },
  card: {
    flexDirection: 'row',
    marginHorizontal: SPACING.m,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    backgroundColor: COLORS.surface,
  },
  dateColumn: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
  },
  dateLine: {
    borderRadius: BORDER_RADIUS.s,
  },
  cardBody: {
    flex: 1,
  },
  preview: {
    borderRadius: 0,
  },
  cardContent: {
    padding: SPACING.m,
  },
  metaLine: {
    marginTop: SPACING.xs,
  },
  footerRow: {
    marginTop: SPACING.s,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerBadge: {
    borderRadius: BORDER_RADIUS.round,
  },
});

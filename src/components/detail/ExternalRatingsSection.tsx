/**
 * External Ratings Section
 *
 * Displays IMDb, Rotten Tomatoes, and Metacritic ratings with source logos.
 * Hides completely if no ratings are available.
 */
import { ExternalRatings } from '@/src/api/omdb';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { Trophy } from 'lucide-react-native';
import React, { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

// Logo imports
const imdbLogo = require('@/assets/images/imdb.png');
const rtLogo = require('@/assets/images/rt.png');
const mcLogo = require('@/assets/images/mc.png');

interface ExternalRatingsSectionProps {
  ratings: ExternalRatings | null;
  isLoading?: boolean;
}

// Skeleton loader for ratings
const RatingSkeleton = memo(() => (
  <>
    <SectionSeparator />
    <View style={styles.ratingsRow}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.ratingItem}>
          <View style={styles.skeletonLogo} />
          <View style={styles.skeletonText} />
        </View>
      ))}
    </View>
    <SectionSeparator />
  </>
));
RatingSkeleton.displayName = 'RatingSkeleton';

/**
 * Individual rating display with logo and value
 */
const RatingItem = memo<{
  logo: any;
  logoStyle?: object;
  value: string;
  label: string;
}>(({ logo, logoStyle, value, label }) => (
  <View style={styles.ratingItem}>
    <Image source={logo} style={[styles.logo, logoStyle]} resizeMode="contain" />
    <Text style={styles.ratingValue}>{value}</Text>
    <Text style={styles.ratingLabel}>{label}</Text>
  </View>
));
RatingItem.displayName = 'RatingItem';

/**
 * External Ratings Section Component
 *
 * Displays ratings from IMDb, Rotten Tomatoes, and Metacritic.
 * Returns null if no ratings are available (hides the section).
 */
export const ExternalRatingsSection = memo<ExternalRatingsSectionProps>(
  ({ ratings, isLoading }) => {
    // Show skeleton while loading
    if (isLoading) {
      return <RatingSkeleton />;
    }

    // Hide section if no ratings
    if (!ratings) {
      return null;
    }

    const hasAnyRating = ratings.imdb || ratings.rottenTomatoes || ratings.metacritic;
    if (!hasAnyRating) {
      return null;
    }

    return (
      <>
        <SectionSeparator />
        <View style={styles.ratingsRow}>
          {ratings.imdb && (
            <RatingItem
              logo={imdbLogo}
              logoStyle={styles.imdbLogo}
              value={`${ratings.imdb.rating}/10`}
              label="IMDb"
            />
          )}
          {ratings.rottenTomatoes && (
            <RatingItem logo={rtLogo} value={ratings.rottenTomatoes} label="Rotten Tomatoes" />
          )}
          {ratings.metacritic && (
            <RatingItem logo={mcLogo} value={ratings.metacritic} label="Metacritic" />
          )}
        </View>

        {ratings.awards && (
          <View style={styles.awardsContainer}>
            <Trophy size={16} color={COLORS.warning} />
            <Text style={styles.awardsText}>{ratings.awards}</Text>
          </View>
        )}
        <SectionSeparator />
      </>
    );
  }
);

ExternalRatingsSection.displayName = 'ExternalRatingsSection';

const styles = StyleSheet.create({
  ratingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  ratingItem: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.xs,
  },
  logo: {
    width: 28,
    height: 28,
  },
  imdbLogo: {
    width: 48,
    height: 24,
  },
  ratingValue: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
  ratingLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  awardsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.m,
    gap: SPACING.s,
  },
  awardsText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.m,
    flex: 1,
  },
  // Skeleton styles
  skeletonLogo: {
    width: 28,
    height: 28,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
  },
  skeletonText: {
    width: 40,
    height: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    marginTop: SPACING.xs,
  },
});

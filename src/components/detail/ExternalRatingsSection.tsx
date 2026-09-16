/**
 * External Ratings Section
 *
 * Displays IMDb, Rotten Tomatoes, and Metacritic ratings with source logos.
 * Each rating is tappable and opens the respective website for the media.
 * Hides completely if no ratings are available.
 */
import { ExternalRatings } from '@/src/api/omdb';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { buildOpenWithUrl, OpenWithServiceId } from '@/src/utils/openWithLinks';
import React, { memo, useCallback } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

// Logo imports
const imdbLogo = require('@/assets/images/imdb.png');
const rtLogo = require('@/assets/images/rt.png');
const mcLogo = require('@/assets/images/mc.png');

interface ExternalRatingsSectionProps {
  ratings: ExternalRatings | null;
  isLoading?: boolean;
  mediaType?: 'movie' | 'tv';
  mediaId?: number;
  title?: string;
  year?: string | null;
  imdbId?: string | null;
  onOpenLinkError?: (message: string) => void;
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
 * Individual rating display with logo and value.
 * Tappable — opens the source website for the media.
 */
const RatingItem = memo<{
  logo: any;
  logoStyle?: object;
  value: string;
  label: string;
  testID?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
}>(({ logo, logoStyle, value, label, testID, accessibilityLabel, onPress }) => (
  <Pressable
    style={({ pressed }) => [styles.ratingItem, { opacity: pressed ? 0.7 : 1 }]}
    onPress={onPress}
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    hitSlop={SPACING.s}
  >
    <Image source={logo} style={[styles.logo, logoStyle]} resizeMode="contain" />
    <Text style={styles.ratingValue}>{value}</Text>
    <Text style={styles.ratingLabel}>{label}</Text>
  </Pressable>
));
RatingItem.displayName = 'RatingItem';

/**
 * External Ratings Section Component
 *
 * Displays ratings from IMDb, Rotten Tomatoes, and Metacritic.
 * Each rating opens the respective website (IMDb title page when the IMDb ID
 * is known, otherwise site search — same URL logic as the Open With drawer).
 * Returns a single SectionSeparator if no ratings are available to maintain uniform section separation.
 */
export const ExternalRatingsSection = memo<ExternalRatingsSectionProps>(
  ({ ratings, isLoading, mediaType = 'movie', mediaId = 0, title = '', year, imdbId, onOpenLinkError }) => {
    const openServiceUrl = useCallback(
      async (serviceId: OpenWithServiceId) => {
        const effectiveImdbId = imdbId ?? ratings?.imdbId ?? null;
        const url = buildOpenWithUrl({
          serviceId,
          mediaType,
          mediaId,
          title,
          year,
          imdbId: effectiveImdbId,
        });

        try {
          await Linking.openURL(url);
        } catch (error) {
          console.error('[ExternalRatingsSection] Failed to open URL:', error);
          onOpenLinkError?.(url);
        }
      },
      [imdbId, ratings, mediaType, mediaId, title, year, onOpenLinkError]
    );

    const handleImdbPress = useCallback(
      () => void openServiceUrl('imdb'),
      [openServiceUrl]
    );
    const handleRottenTomatoesPress = useCallback(
      () => void openServiceUrl('rottenTomatoes'),
      [openServiceUrl]
    );
    const handleMetacriticPress = useCallback(
      () => void openServiceUrl('metacritic'),
      [openServiceUrl]
    );

    // Show skeleton while loading
    if (isLoading) {
      return <RatingSkeleton />;
    }

    // Show single separator if no ratings
    if (!ratings) {
      return <SectionSeparator />;
    }

    const hasAnyRating = ratings.imdb || ratings.rottenTomatoes || ratings.metacritic;
    if (!hasAnyRating) {
      return <SectionSeparator />;
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
              testID="external-rating-imdb"
              accessibilityLabel={title ? `Open IMDb page for ${title}` : 'Open IMDb page'}
              onPress={handleImdbPress}
            />
          )}
          {ratings.rottenTomatoes && (
            <RatingItem
              logo={rtLogo}
              value={ratings.rottenTomatoes}
              label="Rotten Tomatoes"
              testID="external-rating-rotten-tomatoes"
              accessibilityLabel={
                title ? `Open Rotten Tomatoes page for ${title}` : 'Open Rotten Tomatoes page'
              }
              onPress={handleRottenTomatoesPress}
            />
          )}
          {ratings.metacritic && (
            <RatingItem
              logo={mcLogo}
              value={ratings.metacritic}
              label="Metacritic"
              testID="external-rating-metacritic"
              accessibilityLabel={
                title ? `Open Metacritic page for ${title}` : 'Open Metacritic page'
              }
              onPress={handleMetacriticPress}
            />
          )}
        </View>
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
    fontFamily: FONT_FAMILY.bold,
  },
  ratingLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
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

/**
 * External Ratings Section
 *
 * A compact row of scores (IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Trakt), each a small
 * logo with the score under it. Sites without a score are left out and the rest spread evenly.
 * Each one opens that site's page for the title. Hides when there are no scores.
 */
import { ExternalRatings } from '@/src/api/mdblist';
import { TraktLogo } from '@/src/components/icons/TraktLogo';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { buildOpenWithUrl, OpenWithServiceId } from '@/src/utils/openWithLinks';
import React, { memo, useCallback } from 'react';
import { Image, ImageStyle, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

const imdbLogo = require('@/assets/images/imdb.png');
const rtLogo = require('@/assets/images/rt.png');
const mcLogo = require('@/assets/images/mc.png');
const lbLogo = require('@/assets/images/lb.png');

/** Logo height; IMDb's wide logo keeps its shape at this height. */
const LOGO_SIZE = 18;
const LOGO_STYLE: ImageStyle = { height: LOGO_SIZE, width: LOGO_SIZE };

type RatingSite = Extract<
  OpenWithServiceId,
  'imdb' | 'rottenTomatoes' | 'metacritic' | 'letterboxd' | 'trakt'
>;

/** In the order they're shown. */
const SITES: { id: RatingSite; label: string; testID: string; logo: React.ReactNode }[] = [
  {
    id: 'imdb',
    label: 'IMDb',
    testID: 'external-rating-imdb',
    logo: (
      <Image
        source={imdbLogo}
        style={[LOGO_STYLE, { width: LOGO_SIZE * 2 }]}
        resizeMode="contain"
      />
    ),
  },
  {
    id: 'rottenTomatoes',
    label: 'Rotten Tomatoes',
    testID: 'external-rating-rotten-tomatoes',
    logo: <Image source={rtLogo} style={LOGO_STYLE} resizeMode="contain" />,
  },
  {
    id: 'metacritic',
    label: 'Metacritic',
    testID: 'external-rating-metacritic',
    logo: <Image source={mcLogo} style={LOGO_STYLE} resizeMode="contain" />,
  },
  {
    id: 'letterboxd',
    label: 'Letterboxd',
    testID: 'external-rating-letterboxd',
    logo: <Image source={lbLogo} style={LOGO_STYLE} resizeMode="contain" />,
  },
  {
    id: 'trakt',
    label: 'Trakt',
    testID: 'external-rating-trakt',
    logo: <TraktLogo size={LOGO_SIZE} />,
  },
];

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

const RatingSkeleton = memo(() => (
  <>
    <SectionSeparator />
    <View style={styles.ratingsRow} testID="external-ratings-skeleton">
      {[1, 2, 3, 4, 5].map((i) => (
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

const RatingItem = memo<{
  logo: React.ReactNode;
  value: string;
  testID: string;
  accessibilityLabel: string;
  onPress: () => void;
}>(({ logo, value, testID, accessibilityLabel, onPress }) => (
  <Pressable
    style={({ pressed }) => [styles.ratingItem, { opacity: pressed ? 0.7 : 1 }]}
    onPress={onPress}
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    hitSlop={SPACING.s}
  >
    <View style={styles.logoSlot}>{logo}</View>
    <Text style={styles.ratingValue} numberOfLines={1}>
      {value}
    </Text>
  </Pressable>
));
RatingItem.displayName = 'RatingItem';

export const ExternalRatingsSection = memo<ExternalRatingsSectionProps>(
  ({
    ratings,
    isLoading,
    mediaType = 'movie',
    mediaId = 0,
    title = '',
    year,
    imdbId,
    onOpenLinkError,
  }) => {
    const openServiceUrl = useCallback(
      async (serviceId: OpenWithServiceId) => {
        const url = buildOpenWithUrl({
          serviceId,
          mediaType,
          mediaId,
          title,
          year,
          imdbId: imdbId ?? ratings?.imdbId ?? null,
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

    if (isLoading) {
      return <RatingSkeleton />;
    }

    const shown = ratings ? SITES.filter((site) => ratings[site.id]) : [];
    if (shown.length === 0) {
      // A single separator keeps the spacing between the sections around it.
      return <SectionSeparator />;
    }

    return (
      <>
        <SectionSeparator />
        <View style={styles.ratingsRow}>
          {shown.map((site) => (
            <RatingItem
              key={site.id}
              logo={site.logo}
              value={ratings![site.id]!}
              testID={site.testID}
              accessibilityLabel={
                title
                  ? `${site.label} ${ratings![site.id]}. Open ${site.label} page for ${title}`
                  : `${site.label} ${ratings![site.id]}. Open ${site.label} page`
              }
              onPress={() => void openServiceUrl(site.id)}
            />
          ))}
        </View>
        <SectionSeparator />
      </>
    );
  }
);

ExternalRatingsSection.displayName = 'ExternalRatingsSection';

const styles = StyleSheet.create({
  ratingsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  ratingItem: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.xs,
  },
  logoSlot: {
    alignItems: 'center',
    height: LOGO_SIZE,
    justifyContent: 'center',
  },
  ratingValue: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.s,
  },
  skeletonLogo: {
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    height: LOGO_SIZE,
    width: LOGO_SIZE,
  },
  skeletonText: {
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    height: 12,
    width: 32,
  },
});

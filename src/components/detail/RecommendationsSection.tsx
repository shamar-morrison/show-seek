import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ListMembershipBadge } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useListMembership } from '@/src/hooks/useListMembership';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { FlashList } from '@shopify/flash-list';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useDetailStyles } from './detailStyles';
import { getMediaTitle, getMediaYear } from './detailUtils';
import type { RecommendationsSectionProps, SimilarMediaItem } from './types';

// Memoized recommendation card component to prevent unnecessary re-renders
const RecommendationCard = memo<{
  item: any;
  onPress: (id: number) => void;
  onLongPress?: (item: any) => void;
  mediaType: 'movie' | 'tv';
  preferOriginalTitles: boolean;
  resolvePosterPath: (
    mediaType: 'movie' | 'tv',
    mediaId: number,
    fallbackPosterPath: string | null | undefined
  ) => string | null;
}>(({ item, onPress, onLongPress, mediaType, preferOriginalTitles, resolvePosterPath }) => {
  const styles = useDetailStyles();
  const { getListsForMedia } = useListMembership();
  const listIds = getListsForMedia(item.id, mediaType);

  const year = useMemo(
    () => getMediaYear(item.release_date || item.first_air_date),
    [item.release_date, item.first_air_date]
  );
  const displayTitle = useMemo(
    () => getMediaTitle(item, preferOriginalTitles),
    [item, preferOriginalTitles]
  );
  const posterPath = useMemo(
    () => resolvePosterPath(mediaType, item.id, item.poster_path),
    [item.id, item.poster_path, mediaType, resolvePosterPath]
  );

  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [item.id, onPress]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(item);
  }, [item, onLongPress]);

  return (
    <TouchableOpacity
      style={styles.similarCard}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <View style={styles.similarPosterContainer}>
        <MediaImage
          source={{
            uri: getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.small),
          }}
          style={styles.similarPoster}
          contentFit="cover"
        />
        {listIds.length > 0 && <ListMembershipBadge listIds={listIds} />}
      </View>
      <Text style={styles.similarTitle} numberOfLines={2}>
        {displayTitle}
      </Text>
      <View style={styles.similarMeta}>
        {year && <Text style={styles.similarYear}>{year}</Text>}
        {item.vote_average > 0 && year && <Text style={styles.similarSeparator}> • </Text>}
        {item.vote_average > 0 && (
          <View style={styles.similarRating}>
            <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
            <Text style={styles.similarRatingText}>{item.vote_average.toFixed(1)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

RecommendationCard.displayName = 'RecommendationCard';

export const RecommendationsSection = memo<RecommendationsSectionProps>(
  ({
    items,
    isLoading,
    isError,
    shouldLoad,
    onMediaPress,
    onMediaLongPress,
    onLayout,
    style,
    mediaType,
    preferOriginalTitles = false,
  }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();
    const { resolvePosterPath } = usePosterOverrides();
    const renderRecommendationItem = useCallback(
      ({ item }: { item: SimilarMediaItem }) => (
        <RecommendationCard
          item={item}
          onPress={onMediaPress}
          onLongPress={onMediaLongPress}
          mediaType={mediaType}
          preferOriginalTitles={preferOriginalTitles}
          resolvePosterPath={resolvePosterPath}
        />
      ),
      [
        mediaType,
        onMediaLongPress,
        onMediaPress,
        preferOriginalTitles,
        resolvePosterPath,
      ]
    );

    // Render loading skeleton
    if (isLoading && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
            {t('media.youMayAlsoLike')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.similarList}
          >
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.recommendationCardSkeleton}>
                <View style={styles.skeletonPoster} />
                <View style={styles.skeletonTitle} />
                <View style={styles.skeletonMeta} />
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }

    // Render error state
    if (isError && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
            {t('media.youMayAlsoLike')}
          </Text>
          <View style={styles.reviewErrorBox}>
            <Text style={styles.reviewErrorText}>{t('errors.failedToLoadRecommendations')}</Text>
          </View>
        </View>
      );
    }

    // Render recommendations if available
    if (!isLoading && !isError && items.length > 0) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
            {t('media.youMayAlsoLike')}
          </Text>
          <View style={styles.similarList}>
            <FlashList
              horizontal
              data={items}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={true}
              drawDistance={400}
              renderItem={renderRecommendationItem}
            />
          </View>
        </View>
      );
    }

    // Render trigger without content if not loaded yet
    if (!shouldLoad) {
      return <View style={style} onLayout={onLayout} />;
    }

    // Don't render anything if no recommendations
    return null;
  },
  (prevProps, nextProps) => {
    // Custom comparison: check items array length, loading states, shouldLoad, and mediaType
    return (
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.isError === nextProps.isError &&
      prevProps.shouldLoad === nextProps.shouldLoad &&
      prevProps.items.length === nextProps.items.length &&
      (prevProps.items.length === 0 || prevProps.items[0]?.id === nextProps.items[0]?.id) &&
      prevProps.mediaType === nextProps.mediaType &&
      prevProps.preferOriginalTitles === nextProps.preferOriginalTitles
    );
  }
);

RecommendationsSection.displayName = 'RecommendationsSection';

import { tmdbApi, TrailerItem } from '@/src/api/tmdb';
import { MovieCardSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { MediaImage } from '@/src/components/ui/MediaImage';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { usePreferences } from '@/src/hooks/usePreferences';
import { HorizontalFlashList } from '@/src/components/ui/HorizontalFlashList';
import { useQuery } from '@tanstack/react-query';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Film01Icon, Tv01Icon } from '@hugeicons/core-free-icons';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';

interface LatestTrailersSectionProps {
  label: string;
}

export const LatestTrailersSection = memo<LatestTrailersSectionProps>(({ label }) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const [selectedTrailer, setSelectedTrailer] = useState<TrailerItem | null>(null);

  const { data: trailers, isLoading } = useQuery({
    queryKey: ['latest-trailers'],
    queryFn: () => tmdbApi.getLatestTrailers(),
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Use mqdefault.jpg (medium quality) when data saver is enabled, otherwise hqdefault.jpg (high quality)
  const thumbnailQuality = useMemo(
    () => (preferences?.dataSaver ? 'mqdefault' : 'hqdefault'),
    [preferences?.dataSaver]
  );

  const handleTrailerPress = useCallback((trailer: TrailerItem) => {
    setSelectedTrailer(trailer);
  }, []);

  const renderTrailerCard = useCallback(
    ({ item }: { item: TrailerItem }) => {
      const displayTitle = getDisplayMediaTitle(
        { title: item.mediaTitle, original_title: item.mediaOriginalTitle },
        !!preferences?.showOriginalTitles
      );

      return (
        <Pressable
          style={({ pressed }) => [styles.videoCard, pressed && { opacity: ACTIVE_OPACITY }]}
          onPress={() => handleTrailerPress(item)}
          accessibilityRole="button"
          accessibilityLabel={displayTitle || item.name}
        >
          <MediaImage
            source={{
              uri: `https://img.youtube.com/vi/${item.key}/${thumbnailQuality}.jpg`,
            }}
            style={styles.videoThumbnail}
            contentFit="cover"
          />
          <View style={styles.mediaTypeBadge}>
            {item.mediaType === 'movie' ? (
              <AppIcon icon={Film01Icon} size={12} color={COLORS.text} />
            ) : (
              <AppIcon icon={Tv01Icon} size={12} color={COLORS.text} />
            )}
            <Text style={styles.mediaTypeText}>
              {item.mediaType === 'movie' ? t('media.movie') : t('media.tvShow')}
            </Text>
          </View>
          <Text style={styles.videoTitle} numberOfLines={2}>
            {displayTitle}
          </Text>
          <Text style={styles.videoType} numberOfLines={1}>
            {item.name}
          </Text>
        </Pressable>
      );
    },
    [handleTrailerPress, thumbnailQuality, preferences?.showOriginalTitles, t]
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      {isLoading ? (
        <HorizontalFlashList
          data={[1, 2, 3, 4]}
          renderItem={() => <MovieCardSkeleton />}
          keyExtractor={(item) => item.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          drawDistance={400}
        />
      ) : trailers && trailers.length > 0 ? (
        <HorizontalFlashList
          data={trailers}
          renderItem={renderTrailerCard}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          drawDistance={400}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('home.noTrailersAvailable')}</Text>
        </View>
      )}

      <TrailerPlayer
        visible={!!selectedTrailer}
        onClose={() => setSelectedTrailer(null)}
        videoKey={selectedTrailer?.key || null}
        title={
          selectedTrailer?.mediaTitle
            ? `${selectedTrailer.mediaTitle} - ${selectedTrailer.name}`
            : selectedTrailer?.name
        }
      />
    </View>
  );
});

LatestTrailersSection.displayName = 'LatestTrailersSection';

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    marginBottom: SPACING.m,
    paddingHorizontal: SPACING.l,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
  },
  videoCard: {
    width: 240,
    marginRight: SPACING.m,
  },
  videoThumbnail: {
    width: 240,
    height: 135,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
  },
  mediaTypeBadge: {
    position: 'absolute',
    top: SPACING.s,
    right: SPACING.s,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.overlay,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.s,
    gap: SPACING.xs,
  },
  mediaTypeText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.semiBold,
  },
  videoTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
    marginBottom: SPACING.xs,
  },
  videoType: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  emptyContainer: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
});

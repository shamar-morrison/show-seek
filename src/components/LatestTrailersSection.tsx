import { tmdbApi, TrailerItem } from '@/src/api/tmdb';
import { MovieCardSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Film, Tv } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface LatestTrailersSectionProps {
  label: string;
}

export const LatestTrailersSection = memo<LatestTrailersSectionProps>(({ label }) => {
  const { data: trailers, isLoading } = useQuery({
    queryKey: ['latest-trailers'],
    queryFn: () => tmdbApi.getLatestTrailers(),
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const handleTrailerPress = (trailer: TrailerItem) => {
    const youtubeUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
    Linking.openURL(youtubeUrl).catch((error) => {
      Alert.alert(
        'Error',
        'Unable to open video. Please make sure you have a web browser or YouTube installed.'
      );
      console.error('Error opening trailer:', error);
    });
  };

  const renderTrailerCard = useCallback(
    ({ item }: { item: TrailerItem }) => (
      <TouchableOpacity
        style={styles.videoCard}
        onPress={() => handleTrailerPress(item)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <MediaImage
          source={{
            uri: `https://img.youtube.com/vi/${item.key}/hqdefault.jpg`,
          }}
          style={styles.videoThumbnail}
          contentFit="cover"
        />
        <View style={styles.mediaTypeBadge}>
          {item.mediaType === 'movie' ? (
            <Film size={12} color={COLORS.text} />
          ) : (
            <Tv size={12} color={COLORS.text} />
          )}
          <Text style={styles.mediaTypeText}>
            {item.mediaType === 'movie' ? 'Movie' : 'TV Show'}
          </Text>
        </View>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {item.mediaTitle}
        </Text>
        <Text style={styles.videoType} numberOfLines={1}>
          {item.name}
        </Text>
      </TouchableOpacity>
    ),
    [handleTrailerPress]
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      {isLoading ? (
        <FlashList
          horizontal
          data={[1, 2, 3, 4]}
          renderItem={() => <MovieCardSkeleton />}
          keyExtractor={(item) => item.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          drawDistance={400}
        />
      ) : trailers && trailers.length > 0 ? (
        <FlashList
          horizontal
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
          <Text style={styles.emptyText}>No trailers available</Text>
        </View>
      )}
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
    fontWeight: 'bold',
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
    left: SPACING.s,
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
    fontWeight: '600',
  },
  videoTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
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

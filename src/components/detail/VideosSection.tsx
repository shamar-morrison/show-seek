import { type Video } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import type { VideosSectionProps } from './types';

export const VideosSection = memo<VideosSectionProps>(
  ({ videos, onVideoPress, style }) => {
    const { t } = useTranslation();

    // Hook must be called unconditionally (before any early returns)
    const renderItem = useCallback(
      ({ item }: { item: Video }) => (
        <TouchableOpacity
          style={detailStyles.videoCard}
          onPress={() => onVideoPress(item)}
          activeOpacity={ACTIVE_OPACITY}
        >
          <MediaImage
            source={{
              uri:
                item.site === 'YouTube'
                  ? `https://img.youtube.com/vi/${item.key}/hqdefault.jpg`
                  : null,
            }}
            style={detailStyles.videoThumbnail}
            contentFit="cover"
          />
          <Text style={detailStyles.videoTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={detailStyles.videoType}>{item.type}</Text>
        </TouchableOpacity>
      ),
      [onVideoPress]
    );

    if (videos.length === 0) {
      return null;
    }

    return (
      <View style={style}>
        <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>
          {t('media.videos')}
        </Text>
        <FlashList
          horizontal
          data={videos}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.l }}
          style={{ marginHorizontal: -SPACING.l }}
          removeClippedSubviews={true}
          drawDistance={400}
        />
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check array length, first item ID, and all props
    return (
      prevProps.videos.length === nextProps.videos.length &&
      (prevProps.videos.length === 0 || prevProps.videos[0]?.id === nextProps.videos[0]?.id) &&
      prevProps.onVideoPress === nextProps.onVideoPress &&
      prevProps.style === nextProps.style
    );
  }
);

VideosSection.displayName = 'VideosSection';

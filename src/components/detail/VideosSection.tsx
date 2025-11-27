import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import React, { memo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import type { VideosSectionProps } from './types';

export const VideosSection = memo<VideosSectionProps>(
  ({ videos, onVideoPress, style }) => {
  if (videos.length === 0) {
    return null;
  }

  return (
    <View style={style}>
      <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>Videos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={detailStyles.videosList}>
        {videos.map((video) => (
          <TouchableOpacity
            key={video.id}
            style={detailStyles.videoCard}
            onPress={() => onVideoPress(video)}
            activeOpacity={ACTIVE_OPACITY}
          >
            <MediaImage
              source={{
                uri:
                  video.site === 'YouTube'
                    ? `https://img.youtube.com/vi/${video.key}/hqdefault.jpg`
                    : null,
              }}
              style={detailStyles.videoThumbnail}
              contentFit="cover"
            />
            <Text style={detailStyles.videoTitle} numberOfLines={2}>
              {video.name}
            </Text>
            <Text style={detailStyles.videoType}>{video.type}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check array length and first item ID
    return (
      prevProps.videos.length === nextProps.videos.length &&
      (prevProps.videos.length === 0 || prevProps.videos[0]?.id === nextProps.videos[0]?.id)
    );
  }
);

VideosSection.displayName = 'VideosSection';

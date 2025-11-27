import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { Star } from 'lucide-react-native';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import { getMediaTitle, getMediaYear } from './detailUtils';
import type { SimilarMediaSectionProps } from './types';

export function SimilarMediaSection({
  mediaType,
  items,
  onMediaPress,
  title,
  style,
}: SimilarMediaSectionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={style}>
      <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={detailStyles.similarList}
      >
        {items.map((item) => {
          const year = getMediaYear(item.release_date || item.first_air_date);

          return (
            <TouchableOpacity
              key={item.id}
              style={detailStyles.similarCard}
              onPress={() => onMediaPress(item.id)}
              activeOpacity={ACTIVE_OPACITY}
            >
              <MediaImage
                source={{
                  uri: getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.small),
                }}
                style={detailStyles.similarPoster}
                contentFit="cover"
              />
              <Text style={detailStyles.similarTitle} numberOfLines={2}>
                {getMediaTitle(item)}
              </Text>
              <View style={detailStyles.similarMeta}>
                {year && <Text style={detailStyles.similarYear}>{year}</Text>}
                {item.vote_average > 0 && year && (
                  <Text style={detailStyles.similarSeparator}> • </Text>
                )}
                {item.vote_average > 0 && (
                  <View style={detailStyles.similarRating}>
                    <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                    <Text style={detailStyles.similarRatingText}>
                      {item.vote_average.toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import type { CastSectionProps } from './types';

export function CastSection({ cast, onCastPress, onViewAll, style }: CastSectionProps) {
  if (cast.length === 0) {
    return null;
  }

  return (
    <View style={style}>
      <TouchableOpacity
        style={detailStyles.sectionHeader}
        onPress={onViewAll}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={detailStyles.sectionTitle}>Cast</Text>
        <ChevronRight size={20} color={COLORS.primary} />
      </TouchableOpacity>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={detailStyles.castList}>
        {cast.map((actor) => (
          <TouchableOpacity
            key={actor.id}
            style={detailStyles.castCard}
            onPress={() => onCastPress(actor.id)}
            activeOpacity={ACTIVE_OPACITY}
          >
            <MediaImage
              source={{
                uri: getImageUrl(actor.profile_path, TMDB_IMAGE_SIZES.profile.medium),
              }}
              style={detailStyles.castImage}
              contentFit="cover"
              placeholderType="person"
            />
            <Text style={detailStyles.castName} numberOfLines={2}>
              {actor.name}
            </Text>
            <Text style={detailStyles.characterName} numberOfLines={1}>
              {actor.character}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

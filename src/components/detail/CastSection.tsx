import { ACTIVE_OPACITY, SPACING } from '@/constants/theme';
import { getImageUrl, TMDB_IMAGE_SIZES, type CastMember } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import React, { memo, useCallback } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import type { CastSectionProps } from './types';

// Memoized cast card component to prevent unnecessary re-renders
const CastCard = memo<{
  actor: CastMember;
  onPress: (id: number) => void;
}>(({ actor, onPress }) => {
  const handlePress = useCallback(() => {
    onPress(actor.id);
  }, [actor.id, onPress]);

  return (
    <TouchableOpacity
      style={detailStyles.castCard}
      onPress={handlePress}
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
  );
});

CastCard.displayName = 'CastCard';

export const CastSection = memo<CastSectionProps>(
  ({ cast, onCastPress, onViewAll, style }) => {
    if (cast.length === 0) {
      return null;
    }

    return (
      <View style={[style, { marginTop: -SPACING.m }]}>
        <TouchableOpacity
          style={detailStyles.sectionHeader}
          onPress={onViewAll}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={detailStyles.sectionTitle}>Cast</Text>
          <Text style={detailStyles.viewAll}>View All</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={detailStyles.castList}>
          {cast.map((actor) => (
            <CastCard key={actor.id} actor={actor} onPress={onCastPress} />
          ))}
        </ScrollView>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.cast.length === nextProps.cast.length &&
      (prevProps.cast.length === 0 || prevProps.cast[0]?.id === nextProps.cast[0]?.id) &&
      prevProps.onCastPress === nextProps.onCastPress &&
      prevProps.onViewAll === nextProps.onViewAll &&
      prevProps.style === nextProps.style
    );
  }
);

CastSection.displayName = 'CastSection';

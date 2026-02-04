import { getImageUrl, TMDB_IMAGE_SIZES, type CrewMember } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { detailStyles } from './detailStyles';

const DirectorCard = memo<{
  director: CrewMember;
  onPress: (id: number) => void;
}>(({ director, onPress }) => {
  const { t } = useTranslation();

  const handlePress = useCallback(() => {
    onPress(director.id);
  }, [director.id, onPress]);

  return (
    <TouchableOpacity
      style={detailStyles.castCard}
      onPress={handlePress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <MediaImage
        source={{
          uri: getImageUrl(director.profile_path, TMDB_IMAGE_SIZES.profile.medium),
        }}
        style={detailStyles.castImage}
        contentFit="cover"
        placeholderType="person"
      />
      <Text style={detailStyles.castName} numberOfLines={2}>
        {director.name}
      </Text>
      <Text style={detailStyles.characterName} numberOfLines={1}>
        {t('media.director')}
      </Text>
    </TouchableOpacity>
  );
});

DirectorCard.displayName = 'DirectorCard';

interface DirectorsSectionProps {
  directors: CrewMember[];
  onDirectorPress: (id: number) => void;
  style?: ViewStyle;
}

export const DirectorsSection = memo<DirectorsSectionProps>(
  ({ directors, onDirectorPress, style }) => {
    const { t } = useTranslation();

    if (directors.length === 0) {
      return null;
    }

    const title = directors.length > 1 ? t('media.directors') : t('media.director');

    return (
      <View style={[style, { marginTop: -SPACING.m }]}>
        <View style={detailStyles.sectionHeader}>
          <Text style={detailStyles.sectionTitle}>{title}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={detailStyles.castList}>
          {directors.map((director, index) => (
            <DirectorCard
              key={`${director.id}-${index}`}
              director={director}
              onPress={onDirectorPress}
            />
          ))}
        </ScrollView>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.directors.length === nextProps.directors.length &&
      (prevProps.directors.length === 0 ||
        prevProps.directors[0]?.id === nextProps.directors[0]?.id) &&
      prevProps.onDirectorPress === nextProps.onDirectorPress &&
      prevProps.style === nextProps.style
    );
  }
);

DirectorsSection.displayName = 'DirectorsSection';

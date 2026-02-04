import { getImageUrl, TMDB_IMAGE_SIZES, type CrewMember } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useDetailStyles } from './detailStyles';

const DirectorCard = memo<{
  director: CrewMember;
  onPress: (id: number) => void;
  label: string;
}>(({ director, onPress, label }) => {
  const styles = useDetailStyles();
  const handlePress = useCallback(() => {
    onPress(director.id);
  }, [director.id, onPress]);

  return (
    <TouchableOpacity
      style={styles.castCard}
      onPress={handlePress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <MediaImage
        source={{
          uri: getImageUrl(director.profile_path, TMDB_IMAGE_SIZES.profile.medium),
        }}
        style={styles.castImage}
        contentFit="cover"
        placeholderType="person"
      />
      <Text style={styles.castName} numberOfLines={2}>
        {director.name}
      </Text>
      <Text style={styles.characterName} numberOfLines={1}>
        {label}
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
    const styles = useDetailStyles();

    if (directors.length === 0) {
      return null;
    }

    const directorLabel = t('media.director');
    const title = directors.length > 1 ? t('media.directors') : directorLabel;

    return (
      <View style={[style, { marginTop: -SPACING.m }]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.castList}>
          {directors.map((director, index) => (
            <DirectorCard
              key={`${director.id}-${index}`}
              director={director}
              onPress={onDirectorPress}
              label={directorLabel}
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

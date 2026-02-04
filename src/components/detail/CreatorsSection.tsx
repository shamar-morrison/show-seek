import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { detailStyles } from './detailStyles';

// Type matching TMDB's created_by field
interface Creator {
  id: number;
  name: string;
  profile_path: string | null;
}

const CreatorCard = memo<{
  creator: Creator;
  onPress: (id: number) => void;
}>(({ creator, onPress }) => {
  const { t } = useTranslation();

  const handlePress = useCallback(() => {
    onPress(creator.id);
  }, [creator.id, onPress]);

  return (
    <TouchableOpacity
      style={detailStyles.castCard}
      onPress={handlePress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <MediaImage
        source={{
          uri: getImageUrl(creator.profile_path, TMDB_IMAGE_SIZES.profile.medium),
        }}
        style={detailStyles.castImage}
        contentFit="cover"
        placeholderType="person"
      />
      <Text style={detailStyles.castName} numberOfLines={2}>
        {creator.name}
      </Text>
      <Text style={detailStyles.characterName} numberOfLines={1}>
        {t('media.creator')}
      </Text>
    </TouchableOpacity>
  );
});

CreatorCard.displayName = 'CreatorCard';

interface CreatorsSectionProps {
  creators: Creator[];
  onCreatorPress: (id: number) => void;
  style?: ViewStyle;
}

export const CreatorsSection = memo<CreatorsSectionProps>(
  ({ creators, onCreatorPress, style }) => {
    const { t } = useTranslation();

    if (creators.length === 0) {
      return null;
    }

    const title = creators.length > 1 ? t('media.creators') : t('media.creator');

    return (
      <View style={[style, { marginTop: -SPACING.m }]}>
        <View style={detailStyles.sectionHeader}>
          <Text style={detailStyles.sectionTitle}>{title}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={detailStyles.castList}>
          {creators.map((creator, index) => (
            <CreatorCard
              key={`${creator.id}-${index}`}
              creator={creator}
              onPress={onCreatorPress}
            />
          ))}
        </ScrollView>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.creators.length === nextProps.creators.length &&
      (prevProps.creators.length === 0 ||
        prevProps.creators[0]?.id === nextProps.creators[0]?.id) &&
      prevProps.onCreatorPress === nextProps.onCreatorPress &&
      prevProps.style === nextProps.style
    );
  }
);

CreatorsSection.displayName = 'CreatorsSection';

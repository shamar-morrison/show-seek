import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { FavoritePersonBadge } from '@/src/components/ui/FavoritePersonBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { HORIZONTAL_LIST_CONTENT_STYLE, HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import { useIsPersonFavorited } from '@/src/hooks/useFavoritePersons';
import {
  toPersonFavoriteTarget,
  type PersonFavoriteTarget,
} from '@/src/hooks/usePersonFavoriteSheet';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useDetailStyles } from './detailStyles';

// Type matching TMDB's created_by field
interface Creator {
  id: number;
  name: string;
  profile_path: string | null;
}

const CreatorCard = memo<{
  creator: Creator;
  onPress: (id: number) => void;
  label: string;
  onLongPress?: (person: PersonFavoriteTarget) => void;
}>(({ creator, onPress, label, onLongPress }) => {
  const styles = useDetailStyles();
  const { isFavorited } = useIsPersonFavorited(creator.id);

  const handlePress = useCallback(() => {
    onPress(creator.id);
  }, [creator.id, onPress]);
  const handleLongPress = useCallback(() => {
    onLongPress?.(toPersonFavoriteTarget(creator));
  }, [creator, onLongPress]);

  return (
    <TouchableOpacity
      style={styles.castCard}
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      activeOpacity={ACTIVE_OPACITY}
    >
      <View style={styles.castImageContainer}>
        <MediaImage
          source={{
            uri: getImageUrl(creator.profile_path, TMDB_IMAGE_SIZES.profile.medium),
          }}
          style={styles.castImage}
          contentFit="cover"
          placeholderType="person"
        />
        {isFavorited && <FavoritePersonBadge />}
      </View>
      <Text style={styles.castName} numberOfLines={2}>
        {creator.name}
      </Text>
      <Text style={styles.characterName} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

CreatorCard.displayName = 'CreatorCard';

interface CreatorsSectionProps {
  creators: Creator[];
  onCreatorPress: (id: number) => void;
  onCreatorLongPress?: (person: PersonFavoriteTarget) => void;
  style?: ViewStyle;
}

export const CreatorsSection = memo<CreatorsSectionProps>(
  ({ creators, onCreatorPress, onCreatorLongPress, style }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();

    if (creators.length === 0) {
      return null;
    }

    const creatorLabel = t('media.creator');
    const title = creators.length > 1 ? t('media.creators') : creatorLabel;

    return (
      <View style={[style, { marginTop: -SPACING.m }]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <ScrollView {...HORIZONTAL_SCROLL_PROPS} showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.l }} contentContainerStyle={HORIZONTAL_LIST_CONTENT_STYLE}>
          {creators.map((creator, index) => (
            <CreatorCard
              key={`${creator.id}-${index}`}
              creator={creator}
              onPress={onCreatorPress}
              onLongPress={onCreatorLongPress}
              label={creatorLabel}
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
      prevProps.onCreatorLongPress === nextProps.onCreatorLongPress &&
      prevProps.style === nextProps.style
    );
  }
);

CreatorsSection.displayName = 'CreatorsSection';

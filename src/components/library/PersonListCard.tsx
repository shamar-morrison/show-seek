import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { FavoritePersonBadge } from '@/src/components/ui/FavoritePersonBadge';
import { COLORS, FONT_FAMILY, FONT_SIZE } from '@/src/constants/theme';
import { useIsPersonFavorited } from '@/src/hooks/useFavoritePersons';
import type { PersonFavoriteTarget } from '@/src/hooks/usePersonFavoriteSheet';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { FavoritePerson } from '@/src/types/favoritePerson';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';

interface PersonListCardProps {
  person: Omit<FavoritePerson, 'addedAt'>;
  onPress: (personId: number) => void;
  onLongPress?: (person: PersonFavoriteTarget) => void;
  /** If true, skip the favorites check (e.g., when showing favorite people list) */
  hideFavoriteBadge?: boolean;
  /** Optional secondary line shown below the name instead of known_for_department */
  subtitle?: string;
}

export const PersonListCard = memo<PersonListCardProps>(
  ({ person, onPress, onLongPress, hideFavoriteBadge = false, subtitle }) => {
    const { isFavorited } = useIsPersonFavorited(person.id);

    const handlePress = useCallback(() => {
      onPress(person.id);
    }, [onPress, person.id]);

    const handleLongPress = useCallback(() => {
      onLongPress?.({
        id: person.id,
        name: person.name,
        profile_path: person.profile_path,
        known_for_department: person.known_for_department,
      });
    }, [onLongPress, person]);

    const showBadge = !hideFavoriteBadge && isFavorited;
    const secondaryText = subtitle ?? person.known_for_department;

    return (
      <Pressable
        style={({ pressed }) => [
          listCardStyles.container,
          pressed && listCardStyles.containerPressed,
        ]}
        onPress={handlePress}
        onLongPress={onLongPress ? handleLongPress : undefined}
      >
        <View style={styles.imageContainer}>
          <MediaImage
            source={{ uri: getImageUrl(person.profile_path, TMDB_IMAGE_SIZES.profile.medium) }}
            style={listCardStyles.poster}
            contentFit="cover"
            placeholderType="person"
          />
          {showBadge && <FavoritePersonBadge size="medium" />}
        </View>
        <View style={listCardStyles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {person.name}
          </Text>
          {!!secondaryText && (
            <Text style={styles.department} numberOfLines={1}>
              {secondaryText}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }
);

PersonListCard.displayName = 'PersonListCard';

const styles = StyleSheet.create({
  imageContainer: {
    position: 'relative',
  },
  name: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.text,
  },
  department: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});

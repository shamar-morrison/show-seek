import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { FavoritePersonBadge } from '@/src/components/ui/FavoritePersonBadge';
import { COLORS, FONT_SIZE } from '@/src/constants/theme';
import { useIsPersonFavorited } from '@/src/hooks/useFavoritePersons';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { FavoritePerson } from '@/src/types/favoritePerson';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';

interface PersonListCardProps {
  person: FavoritePerson;
  onPress: (personId: number) => void;
  /** If true, skip the favorites check (e.g., when showing favorite people list) */
  hideFavoriteBadge?: boolean;
}

export const PersonListCard = memo<PersonListCardProps>(
  ({ person, onPress, hideFavoriteBadge = false }) => {
    const { isFavorited } = useIsPersonFavorited(person.id);

    const handlePress = useCallback(() => {
      onPress(person.id);
    }, [onPress, person.id]);

    const showBadge = !hideFavoriteBadge && isFavorited;

    return (
      <Pressable
        style={({ pressed }) => [
          listCardStyles.container,
          pressed && listCardStyles.containerPressed,
        ]}
        onPress={handlePress}
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
          {person.known_for_department && (
            <Text style={styles.department} numberOfLines={1}>
              {person.known_for_department}
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
    fontWeight: '600',
    color: COLORS.text,
  },
  department: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});

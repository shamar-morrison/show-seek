import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { FavoritePersonBadge } from '@/src/components/ui/FavoritePersonBadge';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useIsPersonFavorited } from '@/src/hooks/useFavoritePersons';
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
        style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
        onPress={handlePress}
      >
        <View style={styles.imageContainer}>
          <MediaImage
            source={{ uri: getImageUrl(person.profile_path, TMDB_IMAGE_SIZES.profile.medium) }}
            style={styles.profileImage}
            contentFit="cover"
            placeholderType="person"
          />
          {showBadge && <FavoritePersonBadge size="medium" />}
        </View>
        <View style={styles.info}>
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
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    padding: SPACING.s,
    gap: SPACING.m,
  },
  containerPressed: {
    opacity: ACTIVE_OPACITY,
  },
  imageContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surfaceLight,
  },
  info: {
    flex: 1,
    gap: SPACING.xs,
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

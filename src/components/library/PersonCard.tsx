import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { FavoritePersonBadge } from '@/src/components/ui/FavoritePersonBadge';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useIsPersonFavorited } from '@/src/hooks/useFavoritePersons';
import { FavoritePerson } from '@/src/types/favoritePerson';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';

interface PersonCardProps {
  person: FavoritePerson;
  onPress: (personId: number) => void;
  width?: number;
  /** If true, skip the favorites check (e.g., when showing favorite people list) */
  hideFavoriteBadge?: boolean;
}

export const PersonCard = memo<PersonCardProps>(
  ({ person, onPress, hideFavoriteBadge = false }) => {
    const { isFavorited } = useIsPersonFavorited(person.id);

    const handlePress = useCallback(() => {
      onPress(person.id);
    }, [onPress, person.id]);

    const showBadge = !hideFavoriteBadge && isFavorited;

    return (
      <Pressable style={styles.card} onPress={handlePress}>
        <View style={styles.imageContainer}>
          <MediaImage
            source={{ uri: getImageUrl(person.profile_path, TMDB_IMAGE_SIZES.profile.medium) }}
            style={styles.profileImage}
            contentFit="cover"
            placeholderType="person"
          />
          {showBadge && <FavoritePersonBadge />}
        </View>
        <View style={styles.cardInfo}>
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

PersonCard.displayName = 'PersonCard';

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    maxWidth: '31%', // Ensure 3 columns fit with gap
  },
  imageContainer: {
    position: 'relative',
  },
  profileImage: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: COLORS.surfaceLight,
  },
  cardInfo: {
    padding: SPACING.s,
  },
  name: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  department: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
});

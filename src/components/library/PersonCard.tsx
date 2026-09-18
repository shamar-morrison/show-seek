import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { FavoritePersonBadge } from '@/src/components/ui/FavoritePersonBadge';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useIsPersonFavorited } from '@/src/hooks/useFavoritePersons';
import type { PersonFavoriteTarget } from '@/src/hooks/usePersonFavoriteSheet';
import { FavoritePerson } from '@/src/types/favoritePerson';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';

interface PersonCardProps {
  person: Omit<FavoritePerson, 'addedAt'>;
  onPress: (personId: number) => void;
  onLongPress?: (person: PersonFavoriteTarget) => void;
  /** Fixed width for the card (e.g., when used in a fixed-column grid) */
  width?: number;
  /** If true, skip the favorites check (e.g., when showing favorite people list) */
  hideFavoriteBadge?: boolean;
  /** Optional secondary line shown below the name instead of known_for_department */
  subtitle?: string;
  /** If true, render without the surface background and inner text padding */
  transparent?: boolean;
}

export const PersonCard = memo<PersonCardProps>(
  ({ person, onPress, onLongPress, width, hideFavoriteBadge = false, subtitle, transparent = false }) => {
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
        style={[
          styles.card,
          width != null && { width, maxWidth: width },
          transparent && styles.cardTransparent,
        ]}
        onPress={handlePress}
        onLongPress={onLongPress ? handleLongPress : undefined}
      >
        <View style={styles.imageContainer}>
          <MediaImage
            source={{ uri: getImageUrl(person.profile_path, TMDB_IMAGE_SIZES.profile.medium) }}
            style={[styles.profileImage, transparent && styles.profileImageTransparent]}
            contentFit="cover"
            placeholderType="person"
          />
          {showBadge && <FavoritePersonBadge />}
        </View>
        <View style={[styles.cardInfo, transparent && styles.cardInfoTransparent]}>
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

PersonCard.displayName = 'PersonCard';

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    maxWidth: '31%', // Ensure 3 columns fit with gap
  },
  cardTransparent: {
    backgroundColor: 'transparent',
  },
  imageContainer: {
    position: 'relative',
  },
  profileImage: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: COLORS.surfaceLight,
  },
  profileImageTransparent: {
    borderRadius: BORDER_RADIUS.m,
  },
  cardInfo: {
    padding: SPACING.s,
  },
  cardInfoTransparent: {
    padding: 0,
    marginTop: SPACING.s,
  },
  name: {
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.text,
    marginBottom: 2,
  },
  department: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
});

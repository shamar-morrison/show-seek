import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { FavoritePerson } from '@/src/types/favoritePerson';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { MediaImage } from '../ui/MediaImage';

interface PersonCardProps {
  person: FavoritePerson;
  onPress: (personId: number) => void;
  width?: number;
}

export const PersonCard = memo<PersonCardProps>(({ person, onPress, width = 100 }) => {
  const handlePress = useCallback(() => {
    onPress(person.id);
  }, [onPress, person.id]);

  return (
    <Pressable style={[styles.container, { width }]} onPress={handlePress}>
      <MediaImage
        source={{ uri: getImageUrl(person.profile_path, TMDB_IMAGE_SIZES.profile.medium) }}
        style={[styles.profileImage, { width, height: width }]}
        contentFit="cover"
        placeholderType="person"
      />
      <Text style={styles.name} numberOfLines={2}>
        {person.name}
      </Text>
      {person.known_for_department && (
        <Text style={styles.department} numberOfLines={1}>
          {person.known_for_department}
        </Text>
      )}
    </Pressable>
  );
});

PersonCard.displayName = 'PersonCard';

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  profileImage: {
    borderRadius: 50,
    backgroundColor: COLORS.surfaceLight,
  },
  name: {
    marginTop: SPACING.s,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  department: {
    marginTop: 2,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

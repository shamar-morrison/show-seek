import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import { useOpenDiscoverGenre } from '@/src/hooks/useOpenDiscoverGenre';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useDetailStyles } from './detailStyles';

interface GenrePillsProps {
  genres: { id: number; name: string }[];
  mediaType: 'movie' | 'tv';
}

/** The genres on a movie or TV page; tapping one opens Discover filtered by it. */
export function GenrePills({ genres, mediaType }: GenrePillsProps) {
  const { t } = useTranslation();
  const styles = useDetailStyles();
  const openGenre = useOpenDiscoverGenre(mediaType);

  return (
    <ScrollView
      {...HORIZONTAL_SCROLL_PROPS}
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -SPACING.l }}
      contentContainerStyle={{ paddingHorizontal: SPACING.l }}
    >
      <View style={styles.genresContainer}>
        {genres.map((genre) => (
          <Pressable
            key={genre.id}
            style={({ pressed }) => [styles.genreTag, pressed && { opacity: ACTIVE_OPACITY }]}
            onPress={() => openGenre(genre.id)}
            accessibilityRole="button"
            accessibilityLabel={genre.name}
            accessibilityHint={t('media.genreOpensDiscover', { genre: genre.name })}
            testID={`genre-pill-${genre.id}`}
          >
            <Text style={styles.genreText}>{genre.name}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

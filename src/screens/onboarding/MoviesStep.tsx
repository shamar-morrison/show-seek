import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Movie } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface MoviesStepProps {
  selectedMovies: Movie[];
  onSelect: (movies: Movie[]) => void;
  genreIds?: number[];
}

export default function MoviesStep({ selectedMovies, onSelect, genreIds }: MoviesStepProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const currentYear = new Date().getFullYear();
  // Use pipe-separated IDs for OR logic — movies matching ANY selected genre
  const genreFilter = genreIds && genreIds.length > 0 ? genreIds.join('|') : undefined;

  const thisYearQuery = useQuery({
    queryKey: ['onboarding', 'discoverMovies', currentYear, genreFilter],
    queryFn: () =>
      tmdbApi.discoverMovies({ year: currentYear, sortBy: 'popularity.desc', genre: genreFilter }),
    staleTime: 1000 * 60 * 30,
  });

  const lastYearQuery = useQuery({
    queryKey: ['onboarding', 'discoverMovies', currentYear - 1, genreFilter],
    queryFn: () =>
      tmdbApi.discoverMovies({
        year: currentYear - 1,
        sortBy: 'popularity.desc',
        genre: genreFilter,
      }),
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const isLoading = thisYearQuery.isLoading || lastYearQuery.isLoading;

  // Merge and shuffle results from both years
  const movies = useMemo(() => {
    const thisYear = thisYearQuery.data?.results ?? [];
    const lastYear = lastYearQuery.data?.results ?? [];

    // Take top items from each and interleave
    const merged: Movie[] = [];
    const maxItems = Math.max(thisYear.length, lastYear.length);
    for (let i = 0; i < maxItems; i++) {
      if (i < thisYear.length) merged.push(thisYear[i]);
      if (i < lastYear.length) merged.push(lastYear[i]);
    }

    // Deduplicate by id
    const seen = new Set<number>();
    return merged.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [thisYearQuery.data, lastYearQuery.data]);

  const selectedIds = useMemo(() => new Set(selectedMovies.map((m) => m.id)), [selectedMovies]);

  const handleToggle = useCallback(
    (movie: Movie) => {
      if (selectedIds.has(movie.id)) {
        onSelect(selectedMovies.filter((m) => m.id !== movie.id));
      } else {
        onSelect([...selectedMovies, movie]);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [selectedMovies, selectedIds, onSelect]
  );

  const renderItem = useCallback(
    ({ item }: { item: Movie }) => {
      const isSelected = selectedIds.has(item.id);
      const uri = getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.medium);

      return (
        <Pressable
          style={[styles.posterCard, isSelected && { borderColor: accentColor }]}
          onPress={() => handleToggle(item)}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          accessibilityState={{ selected: isSelected }}
        >
          <MediaImage source={uri ? { uri } : undefined} style={styles.posterImage} contentFit="cover" />
          {isSelected && (
            <View style={[styles.checkBadge, { backgroundColor: accentColor }]}>
              <Check size={12} color={COLORS.white} />
            </View>
          )}
        </Pressable>
      );
    },
    [accentColor, handleToggle, selectedIds]
  );

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.header}>
        <Text style={styles.title}>{t('personalOnboarding.moviesTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.moviesSubtitle')}</Text>
        {selectedMovies.length > 0 && (
          <Text style={styles.selectedCount}>
            {t('personalOnboarding.selected', { count: selectedMovies.length })}
          </Text>
        )}
      </Animated.View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      ) : (
        <FlashList
          data={movies}
          renderItem={renderItem}
          numColumns={3}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  selectedCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContent: {
    paddingHorizontal: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  posterCard: {
    flex: 1,
    margin: SPACING.xs,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  posterImage: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: COLORS.surfaceLight,
  },
  checkBadge: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

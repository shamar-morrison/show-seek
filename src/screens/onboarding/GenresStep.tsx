import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Genre } from '@/src/api/tmdb';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

const MAX_GENRES = 3;
const TMDB_GENRE_CARD_IMAGE_SIZE = TMDB_IMAGE_SIZES.backdrop.medium;

interface GenreVisual {
  tmdbId: number;
  sourceMediaType?: 'movie' | 'tv';
  fallbackColor: string;
}

const DEFAULT_GENRE_COLOR = COLORS.surfaceLight;

const MOVIE_GENRE_VISUALS: Record<number, GenreVisual> = {
  28: {
    tmdbId: 155,
    fallbackColor: '#2B1114',
  },
  12: {
    tmdbId: 85,
    fallbackColor: '#2B1C10',
  },
  16: {
    tmdbId: 324857,
    fallbackColor: '#1B2440',
  },
  35: {
    tmdbId: 120467,
    fallbackColor: '#302116',
  },
  80: {
    tmdbId: 769,
    fallbackColor: '#141A20',
  },
  99: {
    tmdbId: 1044,
    sourceMediaType: 'tv',
    fallbackColor: '#0F2B23',
  },
  18: {
    tmdbId: 238,
    fallbackColor: '#241717',
  },
  10751: {
    tmdbId: 8587,
    fallbackColor: '#263015',
  },
  14: {
    tmdbId: 120,
    fallbackColor: '#172337',
  },
  36: {
    tmdbId: 424,
    fallbackColor: '#25221F',
  },
  27: {
    tmdbId: 493922,
    fallbackColor: '#1A1015',
  },
  10402: {
    tmdbId: 244786,
    fallbackColor: '#241733',
  },
  9648: {
    tmdbId: 546554,
    fallbackColor: '#1A1F2E',
  },
  10749: {
    tmdbId: 313369,
    fallbackColor: '#311722',
  },
  878: {
    tmdbId: 157336,
    fallbackColor: '#111D32',
  },
  10770: {
    tmdbId: 839,
    fallbackColor: '#1B2430',
  },
  53: {
    tmdbId: 6977,
    fallbackColor: '#171C1A',
  },
  10752: {
    tmdbId: 374720,
    fallbackColor: '#22251D',
  },
  37: {
    tmdbId: 44264,
    fallbackColor: '#2A2119',
  },
};

const TV_GENRE_VISUALS: Record<number, GenreVisual> = {
  10759: {
    tmdbId: 82856,
    fallbackColor: '#14202F',
  },
  16: {
    tmdbId: 456,
    fallbackColor: '#222C1A',
  },
  35: {
    tmdbId: 2316,
    fallbackColor: '#252018',
  },
  80: {
    tmdbId: 1396,
    fallbackColor: '#121F18',
  },
  99: {
    tmdbId: 83880,
    fallbackColor: '#0F2B23',
  },
  18: {
    tmdbId: 100088,
    fallbackColor: '#171F24',
  },
  10751: {
    tmdbId: 82728,
    fallbackColor: '#193046',
  },
  10762: {
    tmdbId: 502,
    fallbackColor: '#243C2B',
  },
  9648: {
    tmdbId: 19885,
    fallbackColor: '#18202C',
  },
  10763: {
    tmdbId: 651,
    fallbackColor: '#1B2026',
  },
  10764: {
    tmdbId: 14658,
    fallbackColor: '#242317',
  },
  10765: {
    tmdbId: 66732,
    fallbackColor: '#151E34',
  },
  10766: {
    tmdbId: 987,
    fallbackColor: '#281A22',
  },
  10767: {
    tmdbId: 2224,
    fallbackColor: '#202029',
  },
  10768: {
    tmdbId: 87108,
    fallbackColor: '#23231E',
  },
  37: {
    tmdbId: 1406,
    fallbackColor: '#2A2119',
  },
};

const GENRE_VISUALS_BY_MEDIA_TYPE: Record<'movie' | 'tv', Record<number, GenreVisual>> = {
  movie: MOVIE_GENRE_VISUALS,
  tv: TV_GENRE_VISUALS,
};

interface GenresStepProps {
  selectedGenreIds: number[];
  onSelect: (genreIds: number[]) => void;
  mediaType?: 'movie' | 'tv';
}

interface GenreCardProps {
  genre: Genre;
  backdropPath?: string | null;
  fallbackColor: string;
  isSelected: boolean;
  isDisabled: boolean;
  accentColor: string;
  onPress: () => void;
}

function GenreCard({
  genre,
  backdropPath,
  fallbackColor,
  isSelected,
  isDisabled,
  accentColor,
  onPress,
}: GenreCardProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUri = backdropPath ? getImageUrl(backdropPath, TMDB_GENRE_CARD_IMAGE_SIZE) : null;
  const shouldShowImage = Boolean(imageUri) && !hasImageError;
  const cardContent = (
    <LinearGradient
      colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.15)']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.genreCardOverlay}
    >
      <Text style={styles.genreLabel}>{genre.name}</Text>
      {isSelected && (
        <View style={[styles.checkBadge, { backgroundColor: accentColor }]}>
          <Check size={14} color={COLORS.white} />
        </View>
      )}
    </LinearGradient>
  );

  useEffect(() => {
    setHasImageError(false);
  }, [imageUri]);

  return (
    <Pressable
      style={[
        styles.genreCard,
        { backgroundColor: fallbackColor },
        isSelected && { borderColor: accentColor },
        isDisabled && styles.genreCardDisabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={genre.name}
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
    >
      {shouldShowImage ? (
        <ImageBackground
          source={{ uri: imageUri ?? undefined }}
          resizeMode="cover"
          style={styles.genreCardImage}
          imageStyle={styles.genreCardImage}
          onError={() => setHasImageError(true)}
        >
          {cardContent}
        </ImageBackground>
      ) : (
        cardContent
      )}
    </Pressable>
  );
}

export default function GenresStep({
  selectedGenreIds,
  onSelect,
  mediaType = 'movie',
}: GenresStepProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const titleKey =
    mediaType === 'tv' ? 'personalOnboarding.tvGenresTitle' : 'personalOnboarding.genresTitle';
  const subtitleKey =
    mediaType === 'tv'
      ? 'personalOnboarding.tvGenresSubtitle'
      : 'personalOnboarding.genresSubtitle';

  const { data: genres, isLoading } = useQuery({
    queryKey: ['onboarding', `${mediaType}Genres`],
    queryFn: () => tmdbApi.getGenres(mediaType),
    staleTime: Infinity,
  });
  const visibleGenres = genres ?? [];
  const genreVisuals = GENRE_VISUALS_BY_MEDIA_TYPE[mediaType];
  const backdropQueryResults = useQueries({
    queries: visibleGenres.map((genre) => {
      const visual = genreVisuals[genre.id];
      const sourceMediaType = visual?.sourceMediaType ?? mediaType;

      return {
        queryKey: [
          'onboarding',
          'genreBackdrop',
          mediaType,
          genre.id,
          sourceMediaType,
          visual?.tmdbId,
        ],
        queryFn: async () => {
          if (!visual) return null;

          try {
            const details =
              sourceMediaType === 'movie'
                ? await tmdbApi.getMovieDetails(visual.tmdbId)
                : await tmdbApi.getTVShowDetails(visual.tmdbId);
            return details.backdrop_path ?? null;
          } catch {
            return null;
          }
        },
        enabled: Boolean(visual),
        staleTime: 24 * 60 * 60 * 1000,
      };
    }),
  });

  const selectedSet = useMemo(() => new Set(selectedGenreIds), [selectedGenreIds]);

  const handleToggle = useCallback(
    (genre: Genre) => {
      if (selectedGenreIds.includes(genre.id)) {
        onSelect(selectedGenreIds.filter((id) => id !== genre.id));
      } else {
        if (selectedGenreIds.length >= MAX_GENRES) return;
        onSelect([...selectedGenreIds, genre.id]);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [selectedGenreIds, onSelect]
  );

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)}>
        <Text style={styles.title}>{t(titleKey)}</Text>
        <Text style={styles.subtitle}>{t(subtitleKey)}</Text>
      </Animated.View>

      {selectedGenreIds.length > 0 && (
        <Text style={styles.selectedCount}>
          {t('personalOnboarding.selected', { count: selectedGenreIds.length })}
        </Text>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {visibleGenres.map((genre, index) => {
            const isSelected = selectedSet.has(genre.id);
            const isDisabled = !isSelected && selectedGenreIds.length >= MAX_GENRES;
            const visual = genreVisuals[genre.id];
            const backdropPath = backdropQueryResults[index]?.data as string | null | undefined;

            return (
              <Animated.View key={genre.id} entering={FadeInDown.duration(300).delay(index * 40)}>
                <GenreCard
                  genre={genre}
                  backdropPath={backdropPath}
                  fallbackColor={visual?.fallbackColor ?? DEFAULT_GENRE_COLOR}
                  isSelected={isSelected}
                  isDisabled={isDisabled}
                  accentColor={accentColor}
                  onPress={() => handleToggle(genre)}
                />
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.l,
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
    marginBottom: SPACING.m,
    lineHeight: 20,
  },
  selectedCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.s,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: SPACING.xl,
    gap: SPACING.s,
  },
  genreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 110,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  genreCardDisabled: {
    opacity: 0.4,
  },
  genreCardImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  genreCardOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: SPACING.l,
  },
  genreLabel: {
    fontSize: 18,
    color: COLORS.white,
    fontWeight: '800',
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

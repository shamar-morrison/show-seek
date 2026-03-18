import { tmdbApi, type Genre } from '@/src/api/tmdb';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

const MAX_GENRES = 3;

interface GenresStepProps {
  selectedGenreIds: number[];
  onSelect: (genreIds: number[]) => void;
}

export default function GenresStep({ selectedGenreIds, onSelect }: GenresStepProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const { data: genres, isLoading } = useQuery({
    queryKey: ['onboarding', 'movieGenres'],
    queryFn: () => tmdbApi.getGenres('movie'),
    staleTime: Infinity,
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
        <Text style={styles.title}>{t('personalOnboarding.genresTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.genresSubtitle')}</Text>
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
          {(genres ?? []).map((genre, index) => {
            const isSelected = selectedSet.has(genre.id);
            const isDisabled = !isSelected && selectedGenreIds.length >= MAX_GENRES;

            return (
              <Animated.View key={genre.id} entering={FadeInDown.duration(300).delay(index * 40)}>
                <Pressable
                  style={[
                    styles.genreCard,
                    isSelected && [styles.genreCardSelected, { borderColor: accentColor }],
                    isDisabled && styles.genreCardDisabled,
                  ]}
                  onPress={() => handleToggle(genre)}
                  disabled={isDisabled}
                >
                  <Text
                    style={[
                      styles.genreLabel,
                      isSelected && styles.genreLabelSelected,
                      isDisabled && styles.genreLabelDisabled,
                    ]}
                  >
                    {genre.name}
                  </Text>
                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: accentColor }]}>
                      <Check size={14} color={COLORS.white} />
                    </View>
                  )}
                </Pressable>
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
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.l,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  genreCardSelected: {
    backgroundColor: COLORS.surfaceLight,
  },
  genreCardDisabled: {
    opacity: 0.4,
  },
  genreLabel: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
  },
  genreLabelSelected: {
    color: COLORS.white,
  },
  genreLabelDisabled: {
    color: COLORS.textSecondary,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

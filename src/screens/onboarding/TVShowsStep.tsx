import { tmdbApi, getImageUrl, TMDB_IMAGE_SIZES, type TVShow } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { EXCLUDED_TV_GENRE_IDS } from '@/src/constants/genres';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface TVShowsStepProps {
  selectedShows: TVShow[];
  onSelect: (shows: TVShow[]) => void;
}

export default function TVShowsStep({ selectedShows, onSelect }: TVShowsStepProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const page1Query = useQuery({
    queryKey: ['onboarding', 'trendingTV', 1],
    queryFn: () => tmdbApi.getTrendingTV('week', 1),
    staleTime: 1000 * 60 * 30,
  });

  const page2Query = useQuery({
    queryKey: ['onboarding', 'trendingTV', 2],
    queryFn: () => tmdbApi.getTrendingTV('week', 2),
    staleTime: 1000 * 60 * 30,
  });

  const isLoading = page1Query.isLoading || page2Query.isLoading;

  const shows = useMemo(() => {
    const p1 = page1Query.data?.results ?? [];
    const p2 = page2Query.data?.results ?? [];
    const merged = [...p1, ...p2];
    // Deduplicate by id
    const seen = new Set<number>();
    const unique = merged.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    // Exclude non-scripted content (talk shows, news, reality/awards shows)
    const noExcludedGenres = unique.filter(
      (s) => !s.genre_ids.some((gid) => EXCLUDED_TV_GENRE_IDS.includes(gid))
    );
    // Exclude award shows by name that may slip through genre filters
    const EXCLUDED_NAME_PATTERNS = [
      /\boscar/i,
      /\bacademy\s*award/i,
      /\bemmy/i,
      /\bgrammy/i,
      /\bgolden\s*globe/i,
      /\bbafta/i,
      /\bsag\s*award/i,
      /\bscreen\s*actors?\s*guild/i,
      /\btonys?\b/i,
      /\btony\s*award/i,
    ];
    return noExcludedGenres.filter(
      (s) => !EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(s.name))
    );
  }, [page1Query.data, page2Query.data]);

  const selectedIds = useMemo(() => new Set(selectedShows.map((s) => s.id)), [selectedShows]);

  const handleToggle = useCallback(
    (show: TVShow) => {
      if (selectedShows.some((selectedShow) => selectedShow.id === show.id)) {
        onSelect(selectedShows.filter((s) => s.id !== show.id));
      } else {
        onSelect([...selectedShows, show]);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [selectedShows, onSelect]
  );

  const renderItem = useCallback(
    ({ item }: { item: TVShow }) => {
      const isSelected = selectedIds.has(item.id);
      const uri = getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.medium);

      return (
        <Pressable
          style={[styles.posterCard, isSelected && { borderColor: accentColor }]}
          onPress={() => handleToggle(item)}
          accessibilityRole="button"
          accessibilityLabel={item.name}
          accessibilityState={{ selected: isSelected }}
        >
          <MediaImage
            source={uri ? { uri } : undefined}
            style={styles.posterImage}
            contentFit="cover"
            placeholderType="tv"
          />
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
        <Text style={styles.title}>{t('personalOnboarding.tvShowsTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.tvShowsSubtitle')}</Text>
        {selectedShows.length > 0 && (
          <Text style={styles.selectedCount}>
            {t('personalOnboarding.selected', { count: selectedShows.length })}
          </Text>
        )}
      </Animated.View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      ) : (
        <FlashList
          data={shows}
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

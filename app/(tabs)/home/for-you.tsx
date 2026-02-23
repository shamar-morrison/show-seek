import { Movie, TVShow } from '@/src/api/tmdb';
import { MovieCard } from '@/src/components/cards/MovieCard';
import { TVShowCard } from '@/src/components/cards/TVShowCard';
import { MovieCardSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useForYouRecommendations } from '@/src/hooks/useForYouRecommendations';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { screenStyles } from '@/src/styles/screenStyles';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Sparkles, Star, TrendingUp } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * For You personalized recommendations screen.
 * Shows content tailored to the user's highly-rated movies and TV shows.
 */
export default function ForYouScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accentColor } = useAccentColor();

  const {
    sections,
    hasEnoughData,
    isLoadingRatings,
    hiddenGems,
    isLoadingHiddenGems,
    trendingMovies,
    trendingTV,
    isLoadingTrending,
    needsFallback,
  } = useForYouRecommendations();

  // Haptic feedback on mount
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleGoToDiscover = () => {
    router.push({ pathname: '/(tabs)/discover' });
  };

  // Loading state
  if (isLoadingRatings) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <SkeletonSection />
          <SkeletonSection />
          <SkeletonSection />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Empty state - no high ratings yet
  if (!hasEnoughData) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.emptyContainer}>
          <View style={styles.iconContainer}>
            <Sparkles size={64} color={accentColor} />
          </View>
          <Text style={styles.emptyTitle}>{t('forYou.notEnoughData')}</Text>
          <Text style={styles.emptyDescription}>{t('forYou.notEnoughDataDescription')}</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={handleGoToDiscover}>
            <Text style={styles.primaryButtonText}>{t('forYou.goToDiscover')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Recommendation sections based on user's high-rated content */}
        {sections.map((section, index) => (
          <RecommendationSection
            key={`${section.seed.mediaType}-${section.seed.id}`}
            title={t('forYou.becauseYouLoved', { title: section.seed.title })}
            items={section.recommendations}
            mediaType={section.seed.mediaType}
            isLoading={section.isLoading}
            icon={<Star size={20} color={COLORS.warning} />}
          />
        ))}

        {/* Hidden Gems section */}
        {(hiddenGems.length > 0 || isLoadingHiddenGems) && (
          <RecommendationSection
            title={t('forYou.hiddenGems')}
            items={hiddenGems}
            mediaType="movie"
            isLoading={isLoadingHiddenGems}
            icon={<Sparkles size={20} color={accentColor} />}
          />
        )}

        {/* Trending fallback for users with low rating data */}
        {needsFallback && (
          <>
            {(trendingMovies.length > 0 || isLoadingTrending) && (
              <RecommendationSection
                title={t('forYou.trendingThisWeek') + ' - ' + t('media.movies')}
                items={trendingMovies}
                mediaType="movie"
                isLoading={isLoadingTrending}
                icon={<TrendingUp size={20} color={COLORS.success} />}
              />
            )}
            {(trendingTV.length > 0 || isLoadingTrending) && (
              <RecommendationSection
                title={t('forYou.trendingThisWeek') + ' - ' + t('media.tvShows')}
                items={trendingTV}
                mediaType="tv"
                isLoading={isLoadingTrending}
                icon={<TrendingUp size={20} color={COLORS.success} />}
              />
            )}
          </>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

interface RecommendationSectionProps {
  title: string;
  items: (Movie | TVShow)[];
  mediaType: 'movie' | 'tv';
  isLoading: boolean;
  icon?: React.ReactNode;
}

function RecommendationSection({
  title,
  items,
  mediaType,
  isLoading,
  icon,
}: RecommendationSectionProps) {
  const { overrides } = usePosterOverrides();
  const listExtraData = useMemo(() => ({ overrides }), [overrides]);
  const renderItem = useCallback(
    ({ item }: { item: Movie | TVShow }) =>
      mediaType === 'tv' ? <TVShowCard show={item as TVShow} /> : <MovieCard movie={item as Movie} />,
    [mediaType]
  );

  if (!isLoading && items.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {isLoading ? (
        <FlashList
          horizontal
          data={[1, 2, 3, 4]}
          renderItem={() => <MovieCardSkeleton />}
          keyExtractor={(item) => item.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <FlashList
          horizontal
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          extraData={listExtraData}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function SkeletonSection() {
  return (
    <View style={styles.section}>
      <View style={styles.skeletonTitleContainer}>
        <View style={styles.skeletonTitle} />
      </View>
      <FlashList
        horizontal
        data={[1, 2, 3, 4]}
        renderItem={() => <MovieCardSkeleton />}
        keyExtractor={(item) => item.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: SPACING.l,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.m,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  emptyDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  primaryButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
  skeletonTitleContainer: {
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.m,
  },
  skeletonTitle: {
    width: 200,
    height: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
  },
});

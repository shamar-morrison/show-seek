import { Movie, TVShow } from '@/src/api/tmdb';
import { MovieCard } from '@/src/components/cards/MovieCard';
import { TVShowCard } from '@/src/components/cards/TVShowCard';
import { MovieCardSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { getMoodById } from '@/src/constants/moods';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { MoodMediaType, useMoodDiscovery } from '@/src/hooks/useMoodDiscovery';
import { screenStyles } from '@/src/styles/screenStyles';
import { getGridMetrics } from '@/src/utils/gridLayout';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Frown, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLUMN_COUNT = 2;
const ITEM_GAP = SPACING.m;
const TARGET_OUTER_PADDING = SPACING.l;

/**
 * Media type toggle component.
 */
function MediaTypeToggle({
  mediaType,
  onToggle,
  accentColor,
}: {
  mediaType: MoodMediaType;
  onToggle: (type: MoodMediaType) => void;
  accentColor: string;
}) {
  const { t } = useTranslation();
  const sliderPosition = useSharedValue(mediaType === 'movie' ? 0 : 1);

  useEffect(() => {
    sliderPosition.value = withSpring(mediaType === 'movie' ? 0 : 1, {
      damping: 15,
      stiffness: 150,
    });
  }, [mediaType, sliderPosition]);

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sliderPosition.value * 100 }],
  }));

  const handlePress = (type: MoodMediaType) => {
    if (type !== mediaType) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onToggle(type);
    }
  };

  return (
    <View style={styles.toggleContainer}>
      <Animated.View style={[styles.toggleSlider, { backgroundColor: accentColor }, sliderStyle]} />
      <Pressable style={styles.toggleButton} onPress={() => handlePress('movie')}>
        <Text style={[styles.toggleText, mediaType === 'movie' && styles.toggleTextActive]}>
          {t('discover.movies')}
        </Text>
      </Pressable>
      <Pressable style={styles.toggleButton} onPress={() => handlePress('tv')}>
        <Text style={[styles.toggleText, mediaType === 'tv' && styles.toggleTextActive]}>
          {t('discover.tvShows')}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Loading skeleton for the results list.
 */
function ResultsSkeleton({
  itemWidth,
  itemHorizontalMargin,
  listPaddingHorizontal,
}: {
  itemWidth: number;
  itemHorizontalMargin: number;
  listPaddingHorizontal: number;
}) {
  const cardSpacingStyle = useMemo(
    () => ({
      marginRight: 0,
      marginHorizontal: itemHorizontalMargin,
      marginBottom: SPACING.m,
    }),
    [itemHorizontalMargin]
  );

  return (
    <View style={[styles.skeletonContainer, { paddingHorizontal: listPaddingHorizontal }]}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <MovieCardSkeleton key={i} width={itemWidth} containerStyle={cardSpacingStyle} />
      ))}
    </View>
  );
}

/**
 * Empty state when no results are found.
 */
function EmptyState({
  onTryAnother,
  accentColor,
}: {
  onTryAnother: () => void;
  accentColor: string;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: accentColor + '20' }]}>
        <Frown size={48} color={accentColor} />
      </View>
      <Text style={styles.emptyTitle}>{t('mood.noResults')}</Text>
      <Pressable
        style={[styles.tryAnotherButton, { backgroundColor: accentColor }]}
        onPress={onTryAnother}
      >
        <RefreshCw size={20} color={COLORS.text} />
        <Text style={styles.tryAnotherText}>{t('mood.tryAnother')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Mood Results screen showing content filtered by the selected mood.
 */
export default function MoodResultsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const { accentColor } = useAccentColor();
  const params = useLocalSearchParams<{ moodId: string }>();
  const moodId = params.moodId || '';

  const [mediaType, setMediaType] = useState<MoodMediaType>('movie');

  const mood = useMemo(() => getMoodById(moodId), [moodId]);

  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useMoodDiscovery({
      moodId,
      mediaType,
      enabled: !!moodId,
    });

  // Get mood name for display
  const moodKey = mood?.translationKey?.replace('mood.', '') || '';
  const moodName = t(`mood.${moodKey}.name`);

  // Update navigation header title dynamically based on media type and mood
  useEffect(() => {
    const mediaTypeLabel = mediaType === 'movie' ? t('discover.movies') : t('discover.tvShows');
    navigation.setOptions({
      title: `${mediaTypeLabel} • ${moodName}`,
    });
  }, [mediaType, moodName, navigation, t]);

  // Haptic feedback on mount
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleTryAnother = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back();
  }, [router]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleMediaTypeToggle = useCallback((type: MoodMediaType) => {
    setMediaType(type);
  }, []);

  const { itemWidth, itemHorizontalMargin, listPaddingHorizontal } = useMemo(
    () => getGridMetrics(windowWidth, COLUMN_COUNT, ITEM_GAP, TARGET_OUTER_PADDING),
    [windowWidth]
  );

  const cardSpacingStyle = useMemo(
    () => ({
      marginRight: 0,
      marginHorizontal: itemHorizontalMargin,
      marginBottom: SPACING.m,
    }),
    [itemHorizontalMargin]
  );

  const renderItem = useCallback(({ item }: { item: Movie | TVShow }) => {
    // Type guard to determine if it's a Movie or TVShow
    const isMovie = 'title' in item;

    if (isMovie) {
      return <MovieCard movie={item as Movie} width={itemWidth} containerStyle={cardSpacingStyle} />;
    } else {
      return <TVShowCard show={item as TVShow} width={itemWidth} containerStyle={cardSpacingStyle} />;
    }
  }, [cardSpacingStyle, itemWidth]);

  const keyExtractor = useCallback(
    (item: Movie | TVShow) => `${item.id}-${mediaType}`,
    [mediaType]
  );

  const ListHeader = useMemo(
    () => (
      <View style={styles.headerContainer}>
        <View style={[styles.moodBadge, { backgroundColor: (mood?.color || accentColor) + '20' }]}>
          <Text style={styles.moodEmoji}>{mood?.emoji}</Text>
          <Text style={[styles.moodBadgeText, { color: mood?.color || accentColor }]}>
            {moodName}
          </Text>
        </View>
        <MediaTypeToggle
          mediaType={mediaType}
          onToggle={handleMediaTypeToggle}
          accentColor={accentColor}
        />
      </View>
    ),
    [mood, moodName, mediaType, handleMediaTypeToggle, accentColor]
  );

  const ListFooter = useMemo(() => {
    if (isFetchingNextPage) {
      return (
        <View style={styles.loadingMore}>
          <MovieCardSkeleton width={itemWidth} containerStyle={cardSpacingStyle} />
        </View>
      );
    }
    return null;
  }, [cardSpacingStyle, isFetchingNextPage, itemWidth]);

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        {ListHeader}
        <ResultsSkeleton
          itemWidth={itemWidth}
          itemHorizontalMargin={itemHorizontalMargin}
          listPaddingHorizontal={listPaddingHorizontal}
        />
      </SafeAreaView>
    );
  }

  // Error state
  if (isError) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        {ListHeader}
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: accentColor + '20' }]}>
            <Frown size={48} color={accentColor} />
          </View>
          <Text style={styles.emptyTitle}>{t('common.error')}</Text>
          <Pressable
            style={[styles.tryAnotherButton, { backgroundColor: accentColor }]}
            onPress={() => refetch()}
          >
            <RefreshCw size={20} color={COLORS.text} />
            <Text style={styles.tryAnotherText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (!isLoading && data.length === 0) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        {ListHeader}
        <EmptyState onTryAnother={handleTryAnother} accentColor={accentColor} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: listPaddingHorizontal }]}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        drawDistance={400}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.l,
    alignItems: 'center',
    gap: SPACING.m,
  },
  moodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.round,
  },
  moodEmoji: {
    fontSize: 24,
  },
  moodBadgeText: {
    fontSize: FONT_SIZE.l,
    fontWeight: '600',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.xs,
    position: 'relative',
    width: 200,
  },
  toggleSlider: {
    position: 'absolute',
    top: SPACING.xs,
    left: SPACING.xs,
    width: 96,
    height: 36,
    borderRadius: BORDER_RADIUS.m,
  },
  toggleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.s,
    zIndex: 1,
  },
  toggleText: {
    fontSize: FONT_SIZE.s,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  toggleTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: SPACING.xl,
  },
  skeletonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: SPACING.m,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.l,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  tryAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
  },
  tryAnotherText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  loadingMore: {
    padding: SPACING.l,
    alignItems: 'center',
  },
});

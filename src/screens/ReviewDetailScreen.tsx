import { getImageUrl, Review, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { BORDER_RADIUS, COLORS, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { screenStyles } from '@/src/styles/screenStyles';
import { getReviewQueue, type QueuedReview } from '@/src/utils/reviewQueue';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, Star, ThumbsUp } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function parseReviewParam(param: string | string[] | undefined): Review {
  try {
    return JSON.parse((typeof param === 'string' ? param : param?.[0]) || '{}');
  } catch {
    return {} as Review;
  }
}

function resolveAvatarUrl(avatarPath: string | null | undefined): string | null {
  if (!avatarPath) return null;

  // TMDB sometimes returns gravatar URLs in avatar_path
  if (avatarPath.startsWith('/https://')) {
    return avatarPath.substring(1);
  }

  return getImageUrl(avatarPath, TMDB_IMAGE_SIZES.profile.small);
}

interface ReviewPageProps {
  review: QueuedReview;
  pageWidth: number;
  isSpoilerGated: boolean;
  onRevealSpoiler: (id: string) => void;
  spoilerHint: string;
  language: string;
}

function ReviewPage({
  review,
  pageWidth,
  isSpoilerGated,
  onRevealSpoiler,
  spoilerHint,
  language,
}: ReviewPageProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const hasRating = review.author_details.rating != null;
  const hasLikes = review.likes != null && review.likes > 0;

  return (
    <ScrollView style={[styles.scrollView, { width: pageWidth }]}>
      <View style={styles.content}>
        {/* Author Info */}
        <View style={styles.authorContainer}>
          <MediaImage
            source={{ uri: resolveAvatarUrl(review.author_details.avatar_path) }}
            style={styles.avatar}
            contentFit="cover"
            placeholderType="person"
          />
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>{review.author}</Text>
            <Text style={styles.date}>{formatDate(review.created_at)}</Text>
          </View>
          {(hasRating || hasLikes) && (
            <View style={styles.badges}>
              {hasRating && (
                <View style={styles.ratingContainer}>
                  <Star size={16} color={COLORS.warning} fill={COLORS.warning} />
                  <Text style={styles.rating}>
                    {Number(review.author_details.rating).toFixed(1)}
                  </Text>
                </View>
              )}
              {hasLikes && (
                <View style={styles.likesContainer}>
                  <ThumbsUp size={14} color={COLORS.textSecondary} />
                  <Text style={styles.likesText}>{review.likes}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Review Content (spoiler-gated when unrevealed) */}
        {isSpoilerGated ? (
          <Pressable
            style={styles.spoilerContainer}
            onPress={() => onRevealSpoiler(review.id)}
            accessibilityRole="button"
            testID={`spoiler-reveal-${review.id}`}
          >
            <Text style={styles.spoilerHint}>{spoilerHint}</Text>
          </Pressable>
        ) : (
          <Text style={styles.reviewText}>{review.content}</Text>
        )}
      </View>
    </ScrollView>
  );
}

export default function ReviewDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<QueuedReview>>(null);

  // The single review stays in params as the deep-link-safe source of truth.
  const entryReview = useMemo(() => parseReviewParam(params.review), [params.review]);
  const routeId = typeof params.id === 'string' ? params.id : params.id?.[0];

  // Snapshot the sibling queue staged by the detail screen before navigation.
  // A miss (direct deep link, stale queue) means "no pager" — single review as before.
  const queue = useMemo(() => getReviewQueue(), []);
  const startIndex = useMemo(() => {
    if (!queue || !entryReview?.id) return -1;
    return queue.findIndex((item) => item.id === entryReview.id);
  }, [queue, entryReview?.id]);
  const hasPager = startIndex >= 0 && (queue?.length ?? 0) > 1;

  const [activeIndex, setActiveIndex] = useState(startIndex >= 0 ? startIndex : 0);
  // The tapped review was necessarily already visible (spoiler cards need an
  // explicit reveal tap before they navigate), so it starts revealed.
  const [revealedIds, setRevealedIds] = useState<Set<string>>(
    () => new Set(entryReview?.id ? [entryReview.id] : [])
  );

  const spoilerHint = t('reviews.tapToRevealSpoiler');

  const handleRevealSpoiler = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRevealedIds((prev) => new Set(prev).add(id));
  }, []);

  const syncIndex = useCallback(
    (index: number) => {
      if (!queue || index < 0 || index >= queue.length) return;
      setActiveIndex(index);
      const item = queue[index];
      if (item.id !== routeId) {
        router.setParams({ id: item.id, review: JSON.stringify(item) });
      }
    },
    [queue, routeId, router]
  );

  const goToIndex = useCallback(
    (index: number) => {
      if (!queue || index < 0 || index >= queue.length || index === activeIndex) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      listRef.current?.scrollToIndex({ index, animated: true });
      // Optimistic sync; onMomentumScrollEnd re-syncs idempotently.
      syncIndex(index);
    },
    [queue, activeIndex, syncIndex]
  );

  // Keep the active page aligned across rotations.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  useEffect(() => {
    if (hasPager) {
      listRef.current?.scrollToIndex({ index: activeIndexRef.current, animated: false });
    }
  }, [width, hasPager]);

  const isFirst = activeIndex <= 0;
  const isLast = !queue || activeIndex >= queue.length - 1;

  return (
    <View style={screenStyles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView style={styles.header} edges={['top']}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {hasPager && queue
            ? t('media.reviewCounter', { current: activeIndex + 1, total: queue.length })
            : t('media.review')}
        </Text>
        {hasPager ? (
          <View style={styles.pagerControls}>
            <TouchableOpacity
              testID="review-prev-button"
              accessibilityRole="button"
              accessibilityLabel={t('common.previous')}
              disabled={isFirst}
              hitSlop={HIT_SLOP.m}
              onPress={() => goToIndex(activeIndex - 1)}
              style={[styles.pagerButton, isFirst && styles.pagerButtonDisabled]}
            >
              <ChevronLeft
                size={24}
                color={isFirst ? COLORS.textSecondary : COLORS.white}
              />
            </TouchableOpacity>
            <TouchableOpacity
              testID="review-next-button"
              accessibilityRole="button"
              accessibilityLabel={t('common.next')}
              disabled={isLast}
              hitSlop={HIT_SLOP.m}
              onPress={() => goToIndex(activeIndex + 1)}
              style={[styles.pagerButton, isLast && styles.pagerButtonDisabled]}
            >
              <ChevronRight size={24} color={isLast ? COLORS.textSecondary : COLORS.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </SafeAreaView>

      {hasPager && queue ? (
        <FlatList
          ref={listRef}
          testID="review-pager"
          data={queue}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          initialScrollIndex={startIndex}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: info.index * width,
              animated: false,
            });
          }}
          onMomentumScrollEnd={(event) => {
            syncIndex(Math.round(event.nativeEvent.contentOffset.x / width));
          }}
          windowSize={3}
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          renderItem={({ item }) => (
            <ReviewPage
              review={item}
              pageWidth={width}
              isSpoilerGated={!!item.spoiler && !revealedIds.has(item.id)}
              onRevealSpoiler={handleRevealSpoiler}
              spoilerHint={spoilerHint}
              language={i18n.language}
            />
          )}
        />
      ) : (
        <ReviewPage
          review={entryReview as QueuedReview}
          pageWidth={width}
          isSpoilerGated={false}
          onRevealSpoiler={handleRevealSpoiler}
          spoilerHint={spoilerHint}
          language={i18n.language}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    backgroundColor: COLORS.background,
  },
  backButton: {
    padding: SPACING.s,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  pagerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pagerButton: {
    padding: SPACING.s,
  },
  pagerButtonDisabled: {
    opacity: 0.35,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: SPACING.l,
  },
  authorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.round,
    marginRight: SPACING.m,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  date: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  badges: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.s,
  },
  rating: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.warning,
  },
  likesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.s,
  },
  likesText: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  reviewText: {
    fontSize: FONT_SIZE.m,
    lineHeight: 24,
    color: COLORS.text,
  },
  spoilerContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    marginTop: SPACING.xs,
  },
  spoilerHint: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});

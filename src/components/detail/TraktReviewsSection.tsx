import { MediaImage } from '@/src/components/ui/MediaImage';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import type { TraktReview } from '@/src/types/trakt';
import { FlashList } from '@shopify/flash-list';
import { Star, ThumbsUp } from 'lucide-react-native';
import React, { memo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { detailStyles } from './detailStyles';

// Import the Trakt logo SVG
const TraktLogo = require('@/assets/images/trakt-logo.svg');

interface TraktReviewsSectionProps {
  isLoading: boolean;
  isError: boolean;
  reviews: TraktReview[];
  shouldLoad: boolean;
  onLayout?: () => void;
  style?: ViewStyle;
}

/**
 * A single review card with spoiler handling
 */
const TraktReviewCard = memo(({ review }: { review: TraktReview }) => {
  const [revealed, setRevealed] = useState(false);
  const isSpoiler = review.spoiler && !revealed;

  const avatarUrl = review.user.images?.avatar?.full;

  return (
    <View style={detailStyles.reviewCard}>
      <View style={detailStyles.reviewHeader}>
        <MediaImage
          source={{ uri: avatarUrl }}
          style={detailStyles.reviewAvatar}
          contentFit="cover"
          placeholderType="person"
        />
        <View style={detailStyles.reviewAuthorInfo}>
          <Text style={detailStyles.reviewAuthor} numberOfLines={1}>
            {review.user.name || review.user.username}
          </Text>
          <View style={styles.reviewMeta}>
            {review.user_rating && (
              <View style={detailStyles.reviewRating}>
                <Star size={12} color={COLORS.warning} fill={COLORS.warning} />
                <Text style={detailStyles.reviewRatingText}>{review.user_rating.toFixed(1)}</Text>
              </View>
            )}
            {review.likes > 0 && (
              <View style={styles.likesContainer}>
                <ThumbsUp size={12} color={COLORS.textSecondary} />
                <Text style={styles.likesText}>{review.likes}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {isSpoiler ? (
        <Pressable onPress={() => setRevealed(true)} style={styles.spoilerContainer}>
          <View style={styles.spoilerOverlay}>
            <Text style={styles.spoilerHint}>Tap to reveal spoiler</Text>
          </View>
          <Text style={[detailStyles.reviewContent, styles.blurredText]} numberOfLines={4}>
            {review.comment}
          </Text>
        </Pressable>
      ) : (
        <Text style={detailStyles.reviewContent} numberOfLines={4}>
          {review.comment}
        </Text>
      )}
    </View>
  );
});

TraktReviewCard.displayName = 'TraktReviewCard';

export const TraktReviewsSection = memo<TraktReviewsSectionProps>(
  ({ isLoading, isError, reviews, shouldLoad, onLayout, style }) => {
    // Render loading skeleton
    if (isLoading && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <View style={styles.headerContainer}>
            <Image source={TraktLogo} style={styles.traktLogo} />
            <Text style={[detailStyles.sectionTitle, { paddingBottom: 0 }]}>Trakt Reviews</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={detailStyles.similarList}
          >
            {[1, 2, 3].map((i) => (
              <View key={i} style={detailStyles.reviewCardSkeleton}>
                <View style={detailStyles.skeletonHeader}>
                  <View style={detailStyles.skeletonAvatar} />
                  <View style={{ flex: 1 }}>
                    <View style={detailStyles.skeletonText} />
                    <View style={[detailStyles.skeletonText, { width: '60%' }]} />
                  </View>
                </View>
                <View style={detailStyles.skeletonText} />
                <View style={detailStyles.skeletonText} />
                <View style={[detailStyles.skeletonText, { width: '80%' }]} />
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }

    // Render error state - but only show if we were actively trying to load
    if (isError && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <View style={styles.headerContainer}>
            <Image source={TraktLogo} style={styles.traktLogo} />
            <Text style={[detailStyles.sectionTitle, { paddingBottom: 0 }]}>Trakt Reviews</Text>
          </View>
          <View style={detailStyles.reviewErrorBox}>
            <Text style={detailStyles.reviewErrorText}>Failed to load Trakt reviews</Text>
          </View>
        </View>
      );
    }

    // Render reviews if we have them
    if (!isLoading && !isError && reviews.length > 0) {
      return (
        <View style={style} onLayout={onLayout}>
          <View style={styles.headerContainer}>
            <Image source={TraktLogo} style={styles.traktLogo} />
            <Text style={[detailStyles.sectionTitle, { paddingBottom: 0 }]}>Trakt Reviews</Text>
          </View>
          <View style={detailStyles.similarList}>
            <FlashList
              horizontal
              data={reviews}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={true}
              drawDistance={400}
              renderItem={({ item }) => <TraktReviewCard review={item} />}
            />
          </View>
        </View>
      );
    }

    // Render trigger without content if not loaded yet
    if (!shouldLoad) {
      return <View style={style} onLayout={onLayout} />;
    }

    // No reviews and not loading - return null (don't render the section)
    return null;
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.isError === nextProps.isError &&
      prevProps.shouldLoad === nextProps.shouldLoad &&
      prevProps.reviews.length === nextProps.reviews.length &&
      (prevProps.reviews.length === 0 || prevProps.reviews[0]?.id === nextProps.reviews[0]?.id)
    );
  }
);

TraktReviewsSection.displayName = 'TraktReviewsSection';

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingBottom: SPACING.s,
  },
  traktLogo: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.s,
  },
  reviewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
  likesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likesText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  spoilerContainer: {
    position: 'relative',
  },
  spoilerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.m,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  spoilerHint: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.round,
  },
  blurredText: {
    opacity: 0,
  },
});

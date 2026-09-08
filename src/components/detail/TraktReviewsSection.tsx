import { TraktLogo } from '@/src/components/icons/TraktLogo';
import { MediaImage } from '@/src/components/ui/MediaImage';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import type { TraktReview } from '@/src/types/trakt';
import { traktToReview } from '@/src/utils/reviewQueue';
import {
  HorizontalFlashList,
  HORIZONTAL_SCROLL_PROPS,
} from '@/src/components/ui/HorizontalFlashList';
import { HORIZONTAL_LIST_CONTENT_STYLE } from '@/src/components/ui/horizontalScrollProps';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { StarIcon, ThumbsUpIcon } from '@hugeicons/core-free-icons';
import React, { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useDetailStyles } from './detailStyles';
import type { Review } from './types';

interface TraktReviewsSectionProps {
  isLoading: boolean;
  isError: boolean;
  reviews: TraktReview[];
  shouldLoad: boolean;
  onReviewPress: (review: Review) => void;
  onLayout?: () => void;
  style?: ViewStyle;
}

/**
 * A single review card with spoiler handling
 */
const TraktReviewCard = memo(
  ({
    review,
    onPress,
    spoilerLabel,
  }: {
    review: TraktReview;
    onPress: () => void;
    spoilerLabel: string;
  }) => {
    const styles = useDetailStyles();
    const [revealed, setRevealed] = useState(false);
    const isSpoiler = review.spoiler && !revealed;

    const avatarUrl = review.user.images?.avatar?.full;

    const handlePress = () => {
      if (isSpoiler) {
        setRevealed(true);
      } else {
        onPress();
      }
    };

    return (
      <TouchableOpacity
        style={styles.reviewCard}
        onPress={handlePress}
        activeOpacity={ACTIVE_OPACITY}
      >
        <View style={styles.reviewHeader}>
          <MediaImage
            source={{ uri: avatarUrl }}
            style={styles.reviewAvatar}
            contentFit="cover"
            placeholderType="person"
          />
          <View style={styles.reviewAuthorInfo}>
            <Text style={styles.reviewAuthor} numberOfLines={1}>
              {review.user.name || review.user.username}
            </Text>
            <View style={localStyles.reviewMeta}>
              {review.user_rating && (
                <View style={styles.reviewRating}>
                  <AppIcon icon={StarIcon} size={12} color={COLORS.warning} fill={COLORS.warning} />
                  <Text style={styles.reviewRatingText}>{review.user_rating.toFixed(1)}</Text>
                </View>
              )}
              {review.likes > 0 && (
                <View style={localStyles.likesContainer}>
                  <AppIcon icon={ThumbsUpIcon} size={12} color={COLORS.textSecondary} />
                  <Text style={localStyles.likesText}>{review.likes}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {isSpoiler ? (
          <View style={localStyles.spoilerContainer}>
            <Text style={localStyles.spoilerHint}>{spoilerLabel}</Text>
          </View>
        ) : (
          <Text style={styles.reviewContent} numberOfLines={4}>
            {review.comment}
          </Text>
        )}
      </TouchableOpacity>
    );
  }
);

TraktReviewCard.displayName = 'TraktReviewCard';

export const TraktReviewsSection = memo<TraktReviewsSectionProps>(
  ({ isLoading, isError, reviews, shouldLoad, onReviewPress, onLayout, style }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();
    const spoilerLabel = t('reviews.tapToRevealSpoiler');
    // Render loading skeleton
    if (isLoading && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <View style={localStyles.headerContainer}>
            <TraktLogo size={24} />
            <Text style={[styles.sectionTitle, { paddingBottom: 0 }]}>{t('trakt.reviews')}</Text>
          </View>
          <ScrollView
            {...HORIZONTAL_SCROLL_PROPS}
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -SPACING.l }}
            contentContainerStyle={HORIZONTAL_LIST_CONTENT_STYLE}
          >
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.reviewCardSkeleton}>
                <View style={styles.skeletonHeader}>
                  <View style={styles.skeletonAvatar} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.skeletonText} />
                    <View style={[styles.skeletonText, { width: '60%' }]} />
                  </View>
                </View>
                <View style={styles.skeletonText} />
                <View style={styles.skeletonText} />
                <View style={[styles.skeletonText, { width: '80%' }]} />
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
          <View style={localStyles.headerContainer}>
            <TraktLogo size={24} />
            <Text style={[styles.sectionTitle, { paddingBottom: 0 }]}>{t('trakt.reviews')}</Text>
          </View>
          <View style={styles.reviewErrorBox}>
            <Text style={styles.reviewErrorText}>{t('errors.failedToLoadTraktReviews')}</Text>
          </View>
        </View>
      );
    }

    // Render reviews if we have them
    if (!isLoading && !isError && reviews.length > 0) {
      return (
        <View style={style} onLayout={onLayout}>
          <View style={localStyles.headerContainer}>
            <TraktLogo size={24} />
            <Text style={[styles.sectionTitle, { paddingBottom: 0 }]}>{t('trakt.reviews')}</Text>
          </View>
          <View style={{ marginHorizontal: -SPACING.l }}>
            <HorizontalFlashList
              data={reviews}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={true}
              drawDistance={400}
              renderItem={({ item }) => (
                <TraktReviewCard
                  review={item}
                  onPress={() => onReviewPress(traktToReview(item))}
                  spoilerLabel={spoilerLabel}
                />
              )}
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

const localStyles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingBottom: SPACING.s,
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
    fontFamily: FONT_FAMILY.semiBold,
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
    fontFamily: FONT_FAMILY.semiBold,
  },
});

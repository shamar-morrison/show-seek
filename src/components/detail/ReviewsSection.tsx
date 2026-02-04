import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { FlashList } from '@shopify/flash-list';
import { Star } from 'lucide-react-native';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useDetailStyles } from './detailStyles';
import { getAvatarUrl } from './detailUtils';
import type { ReviewsSectionProps } from './types';

export const ReviewsSection = memo<ReviewsSectionProps>(
  ({ isLoading, isError, reviews, shouldLoad, onReviewPress, onLayout, style }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();

    if (isLoading && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
            {t('media.tmdbReviews')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.similarList}
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

    // Render error state
    if (isError && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
            {t('media.tmdbReviews')}
          </Text>
          <View style={styles.reviewErrorBox}>
            <Text style={styles.reviewErrorText}>{t('errors.failedToLoadReviews')}</Text>
          </View>
        </View>
      );
    }

    if (!isLoading && !isError && reviews.length > 0) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
            {t('media.tmdbReviews')}
          </Text>
          <View style={styles.similarList}>
            <FlashList
              horizontal
              data={reviews}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={true}
              drawDistance={400}
              renderItem={({ item: review }) => (
                <TouchableOpacity
                  style={styles.reviewCard}
                  onPress={() => onReviewPress(review)}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <View style={styles.reviewHeader}>
                    <MediaImage
                      source={{ uri: getAvatarUrl(review.author_details.avatar_path) }}
                      style={styles.reviewAvatar}
                      contentFit="cover"
                      placeholderType="person"
                    />
                    <View style={styles.reviewAuthorInfo}>
                      <Text style={styles.reviewAuthor} numberOfLines={1}>
                        {review.author}
                      </Text>
                      {review.author_details.rating && (
                        <View style={styles.reviewRating}>
                          <Star size={12} color={COLORS.warning} fill={COLORS.warning} />
                          <Text style={styles.reviewRatingText}>
                            {review.author_details.rating.toFixed(1)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={styles.reviewContent} numberOfLines={4}>
                    {review.content}
                  </Text>
                </TouchableOpacity>
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

    return null;
  },
  (prevProps, nextProps) => {
    // Custom comparison: check reviews array length, loading states, and shouldLoad
    return (
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.isError === nextProps.isError &&
      prevProps.shouldLoad === nextProps.shouldLoad &&
      prevProps.reviews.length === nextProps.reviews.length &&
      (prevProps.reviews.length === 0 || prevProps.reviews[0]?.id === nextProps.reviews[0]?.id)
    );
  }
);

ReviewsSection.displayName = 'ReviewsSection';

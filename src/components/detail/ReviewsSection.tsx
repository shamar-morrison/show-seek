import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { FlashList } from '@shopify/flash-list';
import { Star } from 'lucide-react-native';
import React, { memo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import { getAvatarUrl } from './detailUtils';
import type { ReviewsSectionProps } from './types';

export const ReviewsSection = memo<ReviewsSectionProps>(
  ({ isLoading, isError, reviews, shouldLoad, onReviewPress, onLayout, style }) => {
    // Render loading skeleton
    if (isLoading && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>Reviews</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={detailStyles.reviewsListContent}
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

    // Render error state
    if (isError && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>Reviews</Text>
          <View style={detailStyles.reviewErrorBox}>
            <Text style={detailStyles.reviewErrorText}>Failed to load reviews</Text>
          </View>
        </View>
      );
    }

    // Render reviews if available
    if (!isLoading && !isError && reviews.length > 0) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>Reviews</Text>
          <FlashList
            horizontal
            data={reviews}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={detailStyles.reviewsListContent}
            removeClippedSubviews={true}
            drawDistance={400}
            renderItem={({ item: review }) => (
              <TouchableOpacity
                style={detailStyles.reviewCard}
                onPress={() => onReviewPress(review)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <View style={detailStyles.reviewHeader}>
                  <MediaImage
                    source={{ uri: getAvatarUrl(review.author_details.avatar_path) }}
                    style={detailStyles.reviewAvatar}
                    contentFit="cover"
                    placeholderType="person"
                  />
                  <View style={detailStyles.reviewAuthorInfo}>
                    <Text style={detailStyles.reviewAuthor} numberOfLines={1}>
                      {review.author}
                    </Text>
                    {review.author_details.rating && (
                      <View style={detailStyles.reviewRating}>
                        <Star size={12} color={COLORS.warning} fill={COLORS.warning} />
                        <Text style={detailStyles.reviewRatingText}>
                          {review.author_details.rating.toFixed(1)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={detailStyles.reviewContent} numberOfLines={4}>
                  {review.content}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      );
    }

    // Render trigger without content if not loaded yet
    if (!shouldLoad) {
      return <View style={style} onLayout={onLayout} />;
    }

    // Don't render anything if no reviews
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

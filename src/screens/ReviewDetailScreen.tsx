import { getImageUrl, Review, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { screenStyles } from '@/src/styles/screenStyles';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReviewDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t, i18n } = useTranslation();

  // Parse the review object from params
  const review: Review = JSON.parse((params.review as string) || '{}');

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getAvatarUrl = () => {
    if (!review.author_details.avatar_path) return null;

    // TMDB sometimes returns gravatar URLs in avatar_path
    if (review.author_details.avatar_path.startsWith('/https://')) {
      return review.author_details.avatar_path.substring(1);
    }

    return getImageUrl(review.author_details.avatar_path, TMDB_IMAGE_SIZES.profile.small);
  };

  return (
    <View style={screenStyles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView style={styles.header} edges={['top']}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('media.review')}</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {/* Author Info */}
          <View style={styles.authorContainer}>
            <MediaImage
              source={{ uri: getAvatarUrl() }}
              style={styles.avatar}
              contentFit="cover"
              placeholderType="person"
            />
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{review.author}</Text>
              <Text style={styles.date}>{formatDate(review.created_at)}</Text>
            </View>
            {review.author_details.rating && (
              <View style={styles.ratingContainer}>
                <Star size={16} color={COLORS.warning} fill={COLORS.warning} />
                <Text style={styles.rating}>{review.author_details.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>

          {/* Review Content */}
          <Text style={styles.reviewText}>{review.content}</Text>
        </View>
      </ScrollView>
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
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.white,
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
  reviewText: {
    fontSize: FONT_SIZE.m,
    lineHeight: 24,
    color: COLORS.text,
  },
});

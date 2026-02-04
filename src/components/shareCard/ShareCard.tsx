import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

// Share card dimensions for Instagram Stories (9:16 aspect ratio)
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

export interface MediaShareCardData {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: string;
  genres: string[];
  userRating: number; // 0 if not rated
}

interface ShareCardProps {
  mediaData?: MediaShareCardData;
}

// Share card specific colors (distinct from main theme for visual variety)
const SHARE_CARD_COLORS = {
  // Fallback gradient when poster is missing
  fallbackGradient: ['#1a1a2e', '#16213e', '#0f3460'] as const,
  // Dark overlay for text readability
  overlayGradient: ['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.85)'] as const,
  // Shadow color for poster
  shadow: '#000',
} as const;

/**
 * Hidden snapshot view component designed for capture.
 * Renders at 1080x1920 (9:16 Stories format).
 */
export const ShareCard = forwardRef<View, ShareCardProps>(({ mediaData }, ref) => {
  if (mediaData) {
    return <MediaShareCard ref={ref} data={mediaData} />;
  }

  return null;
});

ShareCard.displayName = 'ShareCard';

// ============ MEDIA SHARE CARD ============

interface MediaShareCardProps {
  data: MediaShareCardData;
}

const MediaShareCard = forwardRef<View, MediaShareCardProps>(({ data }, ref) => {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  // Use poster for background blur (not backdrop)
  const posterUrl = data.posterPath
    ? getImageUrl(data.posterPath, TMDB_IMAGE_SIZES.poster.original)
    : null;
  const posterDisplayUrl = data.posterPath
    ? getImageUrl(data.posterPath, TMDB_IMAGE_SIZES.poster.large)
    : null;

  const hasRating = data.userRating > 0;
  const displayRating = Number.isInteger(data.userRating)
    ? data.userRating
    : data.userRating.toFixed(1);

  return (
    <View ref={ref} style={styles.container} collapsable={false}>
      {/* Background - Blurred Poster or Gradient */}
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          style={styles.backdrop}
          contentFit="cover"
          blurRadius={25}
        />
      ) : (
        <LinearGradient colors={[...SHARE_CARD_COLORS.fallbackGradient]} style={styles.backdrop} />
      )}

      {/* Dark overlay for text readability */}
      <LinearGradient colors={[...SHARE_CARD_COLORS.overlayGradient]} style={styles.overlay} />

      {/* Content */}
      <View style={styles.content}>
        {/* Poster - Larger */}
        {posterDisplayUrl && (
          <View style={styles.posterContainer}>
            <Image source={{ uri: posterDisplayUrl }} style={styles.poster} contentFit="cover" />
          </View>
        )}

        {/* Title */}
        <Text style={styles.title} numberOfLines={3}>
          {data.title}
        </Text>

        {/* Metadata: Year & Genres - Larger */}
        <Text style={styles.metadata}>
          {data.releaseYear}
          {data.genres.length > 0 && ` • ${data.genres.slice(0, 2).join(', ')}`}
        </Text>

        {/* Rating Section */}
        <View style={styles.ratingSection}>
          <View style={[styles.ctaContainer, { backgroundColor: accentColor }]}>
            <Text style={styles.ctaText}>{t('shareCard.rateIt')}</Text>
          </View>
          {hasRating && (
            <>
              <Text style={styles.ratingLabel}>{t('shareCard.myRating')}</Text>
              <Text style={[styles.ratingValue, { color: accentColor }]}>
                {displayRating}/10
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
});

MediaShareCard.displayName = 'MediaShareCard';

// ============ STYLES ============

const styles = StyleSheet.create({
  container: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: COLORS.background,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl * 2,
    paddingTop: SHARE_CARD_HEIGHT * 0.05,
  },
  // Larger poster: 550x825 (was 420x630)
  posterContainer: {
    width: 550,
    height: 825,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
    // Shadow for poster
    shadowColor: SHARE_CARD_COLORS.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: FONT_SIZE.hero * 1.6,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  // Larger metadata (year & genres)
  metadata: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  ratingSection: {
    alignItems: 'center',
    marginTop: SPACING.l,
  },
  ratingLabel: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: SPACING.xxl,
  },
  // Rating without star icon
  ratingValue: {
    fontSize: FONT_SIZE.hero * 1.8,
    fontWeight: 'bold',
  },
  // Larger CTA button
  ctaContainer: {
    paddingHorizontal: SPACING.xxl * 1.5,
    paddingVertical: SPACING.l,
    borderRadius: BORDER_RADIUS.round,
  },
  ctaText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  // Circular logo watermark
  watermark: {
    position: 'absolute',
    bottom: SPACING.xxl * 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  logoContainer: {
    width: 260,
    height: 260,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});

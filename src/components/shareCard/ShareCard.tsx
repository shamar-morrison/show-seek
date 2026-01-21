import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Star } from 'lucide-react-native';
import React, { forwardRef } from 'react';
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

export interface StatsOverviewData {
  variant: 'overview';
  totalWatched: number;
  totalRated: number;
  totalAdded: number;
  currentStreak: number;
}

export interface StatsMonthlyData {
  variant: 'monthly';
  monthName: string;
  watchedCount: number;
  avgRating: number | null;
  topGenres: string[];
}

export type StatsShareCardData = StatsOverviewData | StatsMonthlyData;

interface ShareCardProps {
  mediaData?: MediaShareCardData;
  statsData?: StatsShareCardData;
}

// Fallback gradient for missing backdrops
const FALLBACK_GRADIENT_COLORS = ['#1a1a2e', '#16213e', '#0f3460'] as const;

/**
 * Hidden snapshot view component designed for capture.
 * Renders at 1080x1920 (9:16 Stories format).
 */
export const ShareCard = forwardRef<View, ShareCardProps>(({ mediaData, statsData }, ref) => {
  if (mediaData) {
    return <MediaShareCard ref={ref} data={mediaData} />;
  }

  if (statsData) {
    return <StatsShareCard ref={ref} data={statsData} />;
  }

  return null;
});

ShareCard.displayName = 'ShareCard';

// ============ MEDIA SHARE CARD ============

interface MediaShareCardProps {
  data: MediaShareCardData;
}

const MediaShareCard = forwardRef<View, MediaShareCardProps>(({ data }, ref) => {
  const backdropUrl = data.backdropPath
    ? getImageUrl(data.backdropPath, TMDB_IMAGE_SIZES.backdrop.original)
    : null;
  const posterUrl = data.posterPath
    ? getImageUrl(data.posterPath, TMDB_IMAGE_SIZES.poster.large)
    : null;

  const hasRating = data.userRating > 0;
  const displayRating = Number.isInteger(data.userRating)
    ? data.userRating
    : data.userRating.toFixed(1);

  return (
    <View ref={ref} style={styles.container} collapsable={false}>
      {/* Background - Backdrop or Gradient */}
      {backdropUrl ? (
        <Image
          source={{ uri: backdropUrl }}
          style={styles.backdrop}
          contentFit="cover"
          blurRadius={8}
        />
      ) : (
        <LinearGradient colors={[...FALLBACK_GRADIENT_COLORS]} style={styles.backdrop} />
      )}

      {/* Dark overlay for text readability */}
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
        style={styles.overlay}
      />

      {/* Content */}
      <View style={styles.content}>
        {/* Poster */}
        {posterUrl && (
          <View style={styles.posterContainer}>
            <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
          </View>
        )}

        {/* Title */}
        <Text style={styles.title} numberOfLines={3}>
          {data.title}
        </Text>

        {/* Metadata: Year & Genres */}
        <Text style={styles.metadata}>
          {data.releaseYear}
          {data.genres.length > 0 && ` • ${data.genres.slice(0, 2).join(', ')}`}
        </Text>

        {/* Rating Section */}
        <View style={styles.ratingSection}>
          {hasRating ? (
            <>
              <Text style={styles.ratingLabel}>My Rating</Text>
              <View style={styles.ratingRow}>
                <Star size={32} color={COLORS.primary} fill={COLORS.primary} />
                <Text style={styles.ratingValue}>{displayRating}/10</Text>
              </View>
            </>
          ) : (
            <View style={styles.ctaContainer}>
              <Text style={styles.ctaText}>Rate it on ShowSeek!</Text>
            </View>
          )}
        </View>
      </View>

      {/* Branding Watermark */}
      <View style={styles.watermark}>
        <Text style={styles.watermarkText}>ShowSeek</Text>
      </View>
    </View>
  );
});

MediaShareCard.displayName = 'MediaShareCard';

// ============ STATS SHARE CARD ============

interface StatsShareCardProps {
  data: StatsShareCardData;
}

const StatsShareCard = forwardRef<View, StatsShareCardProps>(({ data }, ref) => {
  if (data.variant === 'overview') {
    return <StatsOverviewCard ref={ref} data={data} />;
  }
  return <StatsMonthlyCard ref={ref} data={data} />;
});

StatsShareCard.displayName = 'StatsShareCard';

// ---- Overview Card ----

interface StatsOverviewCardProps {
  data: StatsOverviewData;
}

const StatsOverviewCard = forwardRef<View, StatsOverviewCardProps>(({ data }, ref) => {
  return (
    <View ref={ref} style={styles.container} collapsable={false}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.backdrop} />

      <View style={styles.statsContent}>
        <Text style={styles.statsTitle}>My Last 6 Months</Text>

        <View style={styles.statsGrid}>
          <StatBox label="Watched" value={data.totalWatched} color={COLORS.primary} />
          <StatBox label="Rated" value={data.totalRated} color="#FFD700" />
          <StatBox label="Added" value={data.totalAdded} color={COLORS.success} />
        </View>

        <View style={styles.streakContainer}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={styles.streakValue}>{data.currentStreak} day streak</Text>
        </View>
      </View>

      {/* Branding Watermark */}
      <View style={styles.watermark}>
        <Text style={styles.watermarkText}>ShowSeek</Text>
      </View>
    </View>
  );
});

StatsOverviewCard.displayName = 'StatsOverviewCard';

// ---- Monthly Card ----

interface StatsMonthlyCardProps {
  data: StatsMonthlyData;
}

const StatsMonthlyCard = forwardRef<View, StatsMonthlyCardProps>(({ data }, ref) => {
  return (
    <View ref={ref} style={styles.container} collapsable={false}>
      <LinearGradient colors={['#2d132c', '#801336', '#c72c41']} style={styles.backdrop} />

      <View style={styles.statsContent}>
        <Text style={styles.statsTitle}>{data.monthName}</Text>

        <View style={styles.monthlyStatsRow}>
          <View style={styles.monthlyStatItem}>
            <Text style={styles.monthlyStatValue}>{data.watchedCount}</Text>
            <Text style={styles.monthlyStatLabel}>Watched</Text>
          </View>
          {data.avgRating !== null && (
            <View style={styles.monthlyStatItem}>
              <Text style={styles.monthlyStatValue}>{data.avgRating}</Text>
              <Text style={styles.monthlyStatLabel}>Avg Rating</Text>
            </View>
          )}
        </View>

        {data.topGenres.length > 0 && (
          <View style={styles.genresRow}>
            {data.topGenres.slice(0, 3).map((genre, index) => (
              <View key={index} style={styles.genreTag}>
                <Text style={styles.genreText}>{genre}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Branding Watermark */}
      <View style={styles.watermark}>
        <Text style={styles.watermarkText}>ShowSeek</Text>
      </View>
    </View>
  );
});

StatsMonthlyCard.displayName = 'StatsMonthlyCard';

// ---- Helper Components ----

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statBoxValue, { color }]}>{value}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
}

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
    paddingTop: SHARE_CARD_HEIGHT * 0.15,
  },
  posterContainer: {
    width: 320,
    height: 480,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
    // Shadow for poster
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: FONT_SIZE.hero * 1.5,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  metadata: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  ratingSection: {
    alignItems: 'center',
    marginTop: SPACING.l,
  },
  ratingLabel: {
    fontSize: FONT_SIZE.l,
    color: COLORS.textSecondary,
    marginBottom: SPACING.s,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
  ratingValue: {
    fontSize: FONT_SIZE.hero * 1.5,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  ctaContainer: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.round,
  },
  ctaText: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  watermark: {
    position: 'absolute',
    bottom: SPACING.xxl * 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  watermarkText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.primary,
    opacity: 0.8,
    letterSpacing: 2,
  },
  // Stats card styles
  statsContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl * 2,
  },
  statsTitle: {
    fontSize: FONT_SIZE.hero * 1.8,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.xxl * 2,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.xl,
    marginBottom: SPACING.xxl * 2,
  },
  statBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.xl,
    alignItems: 'center',
    minWidth: 200,
  },
  statBoxValue: {
    fontSize: FONT_SIZE.hero * 2,
    fontWeight: 'bold',
  },
  statBoxLabel: {
    fontSize: FONT_SIZE.l,
    color: COLORS.textSecondary,
    marginTop: SPACING.s,
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
  streakEmoji: {
    fontSize: 48,
  },
  streakValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  // Monthly stats styles
  monthlyStatsRow: {
    flexDirection: 'row',
    gap: SPACING.xxl * 2,
    marginBottom: SPACING.xxl,
  },
  monthlyStatItem: {
    alignItems: 'center',
  },
  monthlyStatValue: {
    fontSize: FONT_SIZE.hero * 2.5,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  monthlyStatLabel: {
    fontSize: FONT_SIZE.l,
    color: COLORS.textSecondary,
    marginTop: SPACING.s,
  },
  genresRow: {
    flexDirection: 'row',
    gap: SPACING.m,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  genreTag: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.round,
  },
  genreText: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
  },
});

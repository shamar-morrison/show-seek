import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { StyleSheet } from 'react-native';

export const detailStyles = StyleSheet.create({
  // Section Headers
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    paddingBottom: SPACING.xs,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.s,
    marginTop: SPACING.m,
  },

  // Watch Providers
  providersSection: {
    marginBottom: SPACING.m,
  },
  providerType: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    marginBottom: SPACING.s,
    fontWeight: '600',
  },
  providerCard: {
    alignItems: 'center',
    marginRight: SPACING.m,
    width: 60,
  },
  providerLogo: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.s,
    marginBottom: SPACING.xs,
  },
  providerName: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
  },

  // Cast
  castList: {
    marginHorizontal: -SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  castCard: {
    width: 120,
    marginRight: SPACING.m,
  },
  castImage: {
    width: 120,
    height: 180,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
  },
  castName: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  characterName: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },

  // Similar Media
  similarList: {
    marginHorizontal: -SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  similarCard: {
    width: 120,
    marginRight: SPACING.m,
  },
  similarPoster: {
    width: 120,
    height: 180,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
  },
  similarTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  similarMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  similarYear: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  similarSeparator: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  similarRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  similarRatingText: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },

  // Photos
  photosList: {
    marginHorizontal: -SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  photoImage: {
    width: 240,
    height: 135,
    borderRadius: BORDER_RADIUS.m,
    marginRight: SPACING.m,
  },

  // Videos
  videosList: {
    marginHorizontal: -SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  videoCard: {
    width: 240,
    marginRight: SPACING.m,
  },
  videoThumbnail: {
    width: 240,
    height: 135,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
  },
  videoTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    marginBottom: 4,
  },
  videoType: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },

  // Reviews
  reviewsListContent: {
    paddingHorizontal: SPACING.l,
  },
  reviewCard: {
    width: 280,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
    marginRight: SPACING.m,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.round,
    marginRight: SPACING.m,
  },
  reviewAuthorInfo: {
    flex: 1,
  },
  reviewAuthor: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    marginBottom: 4,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewRatingText: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  reviewContent: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
  },

  // Review Loading States
  reviewCardSkeleton: {
    width: 280,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
    marginRight: SPACING.m,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surface,
    marginRight: SPACING.m,
  },
  skeletonText: {
    height: 14,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.s,
    marginBottom: SPACING.s,
  },

  // Recommendation Card Skeleton
  recommendationCardSkeleton: {
    width: 120,
    marginRight: SPACING.m,
  },
  skeletonPoster: {
    width: 120,
    height: 180,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.s,
  },
  skeletonTitle: {
    height: 12,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.s,
    marginBottom: SPACING.xs,
  },
  skeletonMeta: {
    height: 10,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.s,
    width: '70%',
  },

  // Review Error State
  reviewErrorBox: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.l,
    marginBottom: SPACING.m,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  reviewErrorText: {
    color: COLORS.error,
    fontSize: FONT_SIZE.m,
    textAlign: 'center',
  },
});

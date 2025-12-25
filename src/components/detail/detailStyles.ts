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

  // Overview Section
  overview: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 24,
    marginBottom: SPACING.s,
  },
  readMore: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.s,
  },

  // Director/Creator Section
  directorContainer: {
    flexDirection: 'row',
  },
  label: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  value: {
    color: COLORS.text,
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
  viewAll: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.primary,
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

  // Episode-specific styles
  episodeHeroContainer: {
    height: 300, // Shorter than 400px for movies/TV
    position: 'relative',
  },
  episodeBreadcrumb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: SPACING.s,
  },
  episodeBreadcrumbText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginHorizontal: SPACING.xs,
  },
  episodeBreadcrumbLink: {
    fontSize: FONT_SIZE.s,
    color: COLORS.primary,
  },
  episodeNumberBadge: {
    position: 'absolute',
    top: SPACING.m,
    left: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.m,
  },
  episodeNumberText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.text,
    fontWeight: '600',
  },
  watchStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.m,
    marginTop: SPACING.s,
    alignSelf: 'flex-start',
  },
  watchStatusText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.text,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },

  // Crew section layout
  crewContainer: {
    marginTop: SPACING.m,
  },
  crewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  crewJob: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    flex: 1,
  },
  crewName: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    flex: 2,
    textAlign: 'right',
  },

  // Related episodes
  relatedEpisodeCard: {
    width: 280,
    marginRight: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
  },
  relatedEpisodeStill: {
    width: '100%',
    height: 157.5, // 16:9 aspect ratio for 280px width
    backgroundColor: COLORS.surfaceLight,
  },
  relatedEpisodeInfo: {
    padding: SPACING.m,
  },
  relatedEpisodeNumber: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  relatedEpisodeTitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
  },
  currentEpisodeBorder: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  relatedEpisodeWatchedOverlay: {
    position: 'absolute',
    top: SPACING.s,
    right: SPACING.s,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.round,
    padding: SPACING.xs,
  },
  ratingButtonContainer: {
    width: 48,
    height: 56,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Shared screen layout styles
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    marginBottom: SPACING.m,
  },
  scrollView: {
    flex: 1,
  },

  // Hero section
  heroContainer: {
    height: 400,
    position: 'relative',
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  headerSafe: {
    position: 'absolute',
    top: 10,
    left: 0,
    zIndex: 10,
  },
  headerButton: {
    padding: SPACING.m,
    marginLeft: SPACING.s,
    backgroundColor: COLORS.overlay,
    borderRadius: BORDER_RADIUS.round,
  },
  posterContainer: {
    position: 'absolute',
    bottom: SPACING.l,
    left: SPACING.l,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: SPACING.xs,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: SPACING.s,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: BORDER_RADIUS.m,
  },

  // Content section
  content: {
    paddingHorizontal: SPACING.l,
    marginTop: -SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.s,
    marginTop: SPACING.s,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.m,
    flexWrap: 'wrap',
    gap: SPACING.m,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  genreTag: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
  },
  genreText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },

  // Action buttons
  actionButtons: {
    flexDirection: 'column',
    gap: SPACING.s,
    marginBottom: SPACING.xl,
  },
  // Secondary action buttons row (Rating, Add to List, Reminder, Notes)
  secondaryActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.s,
  },
  // Trailer button row
  trailerButtonRow: {
    flexDirection: 'row',
  },
  playButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    gap: SPACING.xs,
  },
  disabledButton: {
    opacity: 0.5,
  },
  playButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
  addButton: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  addedButton: {
    backgroundColor: COLORS.success,
  },

  // Error screen
  backButton: {
    padding: SPACING.m,
    paddingTop: SPACING.xl,
  },
  backButtonText: {
    color: COLORS.primary,
  },

  // TV-specific status badge
  statusBadge: {
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.s,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});

import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Video } from '@/src/api/tmdb';
import { CastSection } from '@/src/components/detail/CastSection';
import { CrewSection } from '@/src/components/detail/CrewSection';
import { useDetailStyles } from '@/src/components/detail/detailStyles';
import { PhotosSection } from '@/src/components/detail/PhotosSection';
import { RelatedEpisodesSection } from '@/src/components/detail/RelatedEpisodesSection';
import { VideosSection } from '@/src/components/detail/VideosSection';
import ImageLightbox from '@/src/components/ImageLightbox';
import NoteModal, { NoteModalRef } from '@/src/components/NotesModal';
import RatingButton from '@/src/components/RatingButton';
import RatingModal from '@/src/components/RatingModal';
import { AnimatedScrollHeader } from '@/src/components/ui/AnimatedScrollHeader';
import { ExpandableText } from '@/src/components/ui/ExpandableText';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import UserRating from '@/src/components/UserRating';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  BUTTON_HEIGHT,
  COLORS,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useAnimatedScrollHeader } from '@/src/hooks/useAnimatedScrollHeader';
import {
  useIsEpisodeWatched,
  useMarkEpisodeUnwatched,
  useMarkEpisodeWatched,
  useShowEpisodeTracking,
} from '@/src/hooks/useEpisodeTracking';
import { useIsEpisodeFavorited, useToggleFavoriteEpisode } from '@/src/hooks/useFavoriteEpisodes';
import { useLists, useMediaLists } from '@/src/hooks/useLists';
import { useMediaNote } from '@/src/hooks/useNotes';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useProgressiveRender } from '@/src/hooks/useProgressiveRender';
import { useEpisodeRating } from '@/src/hooks/useRatings';
import { screenStyles } from '@/src/styles/screenStyles';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { parseEpisodeRouteParams } from '@/src/utils/episodeRouteParams';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Heart,
  Pencil,
  Play,
  Star,
  StickyNote,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  ActivityIndicator,
  Animated,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EpisodeDetailScreen() {
  const detailStyles = useDetailStyles();
  const params = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const {
    tvId,
    seasonNumber,
    episodeNumber,
    hasValidTvId,
    hasValidSeasonNumber,
    hasValidEpisodeRoute,
  } = parseEpisodeRouteParams({
    id: params.id,
    seasonNum: params.seasonNum,
    episodeNum: params.episodeNum,
  });

  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [isOpeningNote, setIsOpeningNote] = useState(false);
  const noteSheetRef = useRef<NoteModalRef>(null);
  const toastRef = React.useRef<ToastRef>(null);

  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
  const currentTab = useCurrentTab();
  const isAccountRequired = useAccountRequired();

  // Progressive render: defer heavy component tree by one tick on cache hit
  const { isReady } = useProgressiveRender();

  const { userRating, isLoading: isLoadingRating } = useEpisodeRating(
    tvId,
    seasonNumber,
    episodeNumber
  );

  const { data: episodeTracking } = useShowEpisodeTracking(tvId);
  const { isWatched } = useIsEpisodeWatched(tvId, seasonNumber, episodeNumber);
  const markWatched = useMarkEpisodeWatched();
  const markUnwatched = useMarkEpisodeUnwatched();

  const { preferences } = usePreferences();
  const { membership: listMembership } = useMediaLists(tvId);
  const { data: lists } = useLists();
  const { isPremium } = usePremium();

  const { isFavorited, isLoading: isLoadingFavorite } = useIsEpisodeFavorited(
    tvId,
    seasonNumber,
    episodeNumber
  );
  const toggleFavoriteMutation = useToggleFavoriteEpisode();

  const {
    note,
    hasNote,
    isLoading: isLoadingNote,
    ensureNoteLoadedForEdit,
  } = useMediaNote('episode', tvId, seasonNumber, episodeNumber);

  // Calculate current count for 'currently-watching' list
  const currentlyWatchingList = lists?.find((l) => l.id === 'currently-watching');
  const currentListCount = currentlyWatchingList
    ? Object.keys(currentlyWatchingList.items || {}).length
    : 0;

  const tvShowQuery = useQuery({
    queryKey: ['tv', tvId],
    queryFn: () => tmdbApi.getTVShowDetails(tvId),
    enabled: hasValidTvId,
  });

  const seasonQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber],
    queryFn: () => tmdbApi.getSeasonDetails(tvId, seasonNumber),
    enabled: hasValidTvId && hasValidSeasonNumber,
  });

  const episodeDetailsQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber, 'episode', episodeNumber, 'details'],
    queryFn: () => tmdbApi.getEpisodeDetails(tvId, seasonNumber, episodeNumber),
    enabled: hasValidEpisodeRoute,
  });

  const episodeCreditsQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber, 'episode', episodeNumber, 'credits'],
    queryFn: () => tmdbApi.getEpisodeCredits(tvId, seasonNumber, episodeNumber),
    enabled: hasValidEpisodeRoute,
  });

  const episodeVideosQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber, 'episode', episodeNumber, 'videos'],
    queryFn: () => tmdbApi.getEpisodeVideos(tvId, seasonNumber, episodeNumber),
    enabled: hasValidEpisodeRoute,
  });

  const episodeImagesQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber, 'episode', episodeNumber, 'images'],
    queryFn: () => tmdbApi.getEpisodeImages(tvId, seasonNumber, episodeNumber),
    enabled: hasValidEpisodeRoute,
  });

  const tvShow = tvShowQuery.data;
  const displayShowTitle = tvShow
    ? getDisplayMediaTitle(tvShow, !!preferences?.showOriginalTitles)
    : '';
  const episode = episodeDetailsQuery.data;
  const season = seasonQuery.data;
  const credits = episodeCreditsQuery.data;
  const videos = episodeVideosQuery.data || [];
  const images = episodeImagesQuery.data;
  const lightboxImages = (images?.stills || [])
    .map((img) => getImageUrl(img.file_path, TMDB_IMAGE_SIZES.backdrop.original))
    .filter((url): url is string => url !== null);

  const isLoading = episodeDetailsQuery.isLoading || tvShowQuery.isLoading || seasonQuery.isLoading;

  const isError = episodeDetailsQuery.isError || tvShowQuery.isError || seasonQuery.isError;

  // Tab-aware navigation
  const navigateTo = useCallback(
    (path: string) => {
      if (currentTab) {
        router.push(`/(tabs)/${currentTab}${path}` as any);
      } else {
        router.push(path as any);
      }
    },
    [currentTab, router]
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleTVShowPress = useCallback(() => {
    navigateTo(`/tv/${tvId}`);
  }, [navigateTo, tvId]);

  const handlePersonPress = useCallback(
    (personId: number) => {
      navigateTo(`/person/${personId}`);
    },
    [navigateTo]
  );

  const handleRelatedEpisodePress = useCallback(
    (episodeNum: number) => {
      navigateTo(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNum}`);
    },
    [navigateTo, tvId, seasonNumber]
  );

  const handleMarkWatched = useCallback(() => {
    if (isAccountRequired()) return;
    if (!episode || !tvShow) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isWatched) {
      markUnwatched.mutate({
        tvShowId: tvId,
        seasonNumber,
        episodeNumber,
      });
    } else {
      markWatched.mutate({
        tvShowId: tvId,
        seasonNumber,
        episodeNumber,
        episodeData: {
          episodeId: episode.id,
          episodeName: episode.name,
          episodeAirDate: episode.air_date,
        },
        showMetadata: {
          tvShowName: tvShow.name,
          posterPath: tvShow.poster_path,
        },
        autoAddOptions: {
          showStatus: tvShow.status,
          shouldAutoAdd: !!preferences?.autoAddToWatching,
          listMembership,
          firstAirDate: tvShow.first_air_date,
          voteAverage: tvShow.vote_average,
          genreIds: tvShow.genres?.map((g) => g.id) || [],
          isPremium,
          currentListCount,
        },
        previousEpisodesOptions: {
          seasonEpisodes: season?.episodes || [],
          shouldMarkPrevious: !!preferences?.markPreviousEpisodesWatched,
        },
      });
    }
  }, [
    isAccountRequired,
    episode,
    tvShow,
    isWatched,
    markWatched,
    markUnwatched,
    tvId,
    seasonNumber,
    episodeNumber,
    preferences,
    listMembership,
    season,
    isPremium,
    currentListCount,
  ]);

  const handleToggleFavorite = useCallback(() => {
    if (isAccountRequired()) return;
    if (!episode || !tvShow) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    (async () => {
      try {
        await toggleFavoriteMutation.mutateAsync({
          isFavorited,
          episodeData: {
            id: `${tvId}-${seasonNumber}-${episodeNumber}`,
            tvShowId: tvId,
            seasonNumber,
            episodeNumber,
            episodeName: episode.name,
            showName: tvShow.name,
            posterPath: tvShow.poster_path,
          },
        });
        toastRef.current?.show(
          isFavorited ? t('library.removedFromFavorites') : t('library.addedToFavorites')
        );
      } catch (error) {
        console.error('Failed to toggle favorite episode:', error);
        toastRef.current?.show(t('errors.generic'));
      }
    })();
  }, [
    isAccountRequired,
    isFavorited,
    toggleFavoriteMutation,
    episode,
    tvShow,
    tvId,
    seasonNumber,
    episodeNumber,
    t,
  ]);

  const handleVideoPress = useCallback((video: Video) => {
    setSelectedVideo(video);
    setTrailerModalVisible(true);
  }, []);

  const handlePhotoPress = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxVisible(true);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      episodeDetailsQuery.refetch(),
      episodeCreditsQuery.refetch(),
      episodeVideosQuery.refetch(),
      episodeImagesQuery.refetch(),
      seasonQuery.refetch(),
      tvShowQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [
    episodeDetailsQuery,
    episodeCreditsQuery,
    episodeVideosQuery,
    episodeImagesQuery,
    seasonQuery,
    tvShowQuery,
  ]);

  // Calculate watched episodes for related episodes section
  const watchedEpisodesMap = useMemo(() => {
    if (!episodeTracking?.episodes) return {};
    const map: Record<string, boolean> = {};
    Object.keys(episodeTracking.episodes).forEach((key) => {
      map[key] = true;
    });
    return map;
  }, [episodeTracking]);

  const trailer = useMemo(() => {
    return videos.find((v) => v.type === 'Trailer' && v.site === 'YouTube');
  }, [videos]);

  const hasAired = useMemo(() => {
    if (!episode?.air_date) return false;
    return new Date(episode.air_date) <= new Date();
  }, [episode]);

  if (!isReady || isLoading) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <FullScreenLoading />
      </SafeAreaView>
    );
  }

  if (isError || !episode) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppErrorState
          error={episodeDetailsQuery.error ?? tvShowQuery.error ?? seasonQuery.error}
          message={t('episodeDetail.failedToLoad')}
          onRetry={() => {
            void Promise.all([
              episodeDetailsQuery.refetch(),
              episodeCreditsQuery.refetch(),
              episodeVideosQuery.refetch(),
              episodeImagesQuery.refetch(),
              seasonQuery.refetch(),
              tvShowQuery.refetch(),
            ]);
          }}
          onSecondaryAction={handleBack}
          secondaryActionLabel={t('common.goBack')}
        />
      </SafeAreaView>
    );
  }

  const stillUrl = getImageUrl(episode.still_path, TMDB_IMAGE_SIZES.backdrop.large);
  const isPending = markWatched.isPending || markUnwatched.isPending;
  const headerSubtitle = t('media.seasonEpisode', { season: seasonNumber, episode: episodeNumber });
  const isNoteActionLoading = isLoadingNote || isOpeningNote;

  const handleNotePress = async () => {
    if (isAccountRequired()) return;
    if (isOpeningNote) return;

    setIsOpeningNote(true);

    const openNoteEditor = (initialNote?: string) => {
      noteSheetRef.current?.present({
        mediaType: 'episode',
        mediaId: tvId,
        seasonNumber,
        episodeNumber,
        posterPath: tvShow?.poster_path || null,
        mediaTitle: episode.name,
        initialNote,
        showId: tvId,
      });
    };

    try {
      const resolvedNote = note ?? (await ensureNoteLoadedForEdit());
      openNoteEditor(resolvedNote?.content);
    } catch (error) {
      console.error('[EpisodeDetailScreen] Failed to load note before opening editor:', error);

      if (!note?.content) {
        Alert.alert(t('common.error'), t('common.tryAgain'));
      }

      openNoteEditor(note?.content ?? '');
    } finally {
      setIsOpeningNote(false);
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <AnimatedScrollHeader
        title={displayShowTitle || t('common.loading')}
        subtitle={headerSubtitle}
        onBackPress={handleBack}
        scrollY={scrollY}
      />

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accentColor}
            colors={[accentColor]}
          />
        }
      >
        {/* Hero Section */}
        <View style={detailStyles.episodeHeroContainer}>
          <MediaImage source={{ uri: stillUrl }} style={styles.heroImage} contentFit="cover" />
          <LinearGradient colors={['transparent', COLORS.background]} style={styles.heroGradient} />

          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={ACTIVE_OPACITY}
          >
            <ArrowLeft size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Content Section */}
        <View style={styles.content}>
          {/* Breadcrumb Navigation */}
          <View style={detailStyles.episodeBreadcrumb}>
            <TouchableOpacity onPress={handleTVShowPress} activeOpacity={ACTIVE_OPACITY}>
              <Text style={detailStyles.episodeBreadcrumbLink}>{displayShowTitle}</Text>
            </TouchableOpacity>
            <ChevronRight size={14} color={COLORS.textSecondary} />
            <TouchableOpacity onPress={handleBack} activeOpacity={ACTIVE_OPACITY}>
              <Text style={detailStyles.episodeBreadcrumbLink}>
                {season?.name || t('media.seasonNumber', { number: seasonNumber })}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Episode Title */}
          <Text style={styles.title}>{episode.name}</Text>

          {/* Meta Information */}
          <View style={styles.metaRow}>
            {/* Episode Number */}
            <View style={styles.metaItem}>
              <Text style={[styles.metaText, { fontWeight: '600', color: COLORS.text }]}>
                {t('media.seasonEpisode', { season: seasonNumber, episode: episodeNumber })}
              </Text>
            </View>

            {episode.air_date && (
              <View style={styles.metaItem}>
                <Calendar size={16} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>{formatTmdbDate(episode.air_date)}</Text>
              </View>
            )}
            {episode.runtime && (
              <View style={styles.metaItem}>
                <Clock size={16} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>
                  {t('common.minutesShort', { count: episode.runtime })}
                </Text>
              </View>
            )}
            {episode.vote_average > 0 && (
              <View style={styles.metaItem}>
                <Star size={16} color={COLORS.warning} fill={COLORS.warning} />
                <Text style={[styles.metaText, { color: COLORS.warning }]}>
                  {episode.vote_average.toFixed(1)}
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsContainer}>
            <View style={styles.secondaryActions}>
              <View style={styles.actionButtonWrapper}>
                <RatingButton
                  onPress={() => {
                    if (isAccountRequired()) return;
                    setRatingModalVisible(true);
                  }}
                  isRated={userRating > 0}
                  isLoading={isLoadingRating}
                />
              </View>

              <TouchableOpacity
                style={styles.actionButtonWrapper}
                onPress={handleToggleFavorite}
                disabled={isLoadingFavorite}
                activeOpacity={ACTIVE_OPACITY}
              >
                <View style={styles.iconButton}>
                  {isLoadingFavorite ? (
                    <ActivityIndicator size="small" color={COLORS.text} />
                  ) : (
                    <Heart
                      size={24}
                      color={isFavorited ? accentColor : COLORS.text}
                      fill={isFavorited ? accentColor : 'transparent'}
                    />
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButtonWrapper}
                onPress={handleNotePress}
                disabled={isNoteActionLoading}
                activeOpacity={ACTIVE_OPACITY}
              >
                <View style={styles.iconButton}>
                  {isNoteActionLoading ? (
                    <ActivityIndicator size="small" color={COLORS.text} />
                  ) : hasNote ? (
                    <Pencil size={24} color={COLORS.white} />
                  ) : (
                    <StickyNote size={24} color={COLORS.text} />
                  )}
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.primaryActions}>
              <TouchableOpacity
                style={[
                  styles.watchButtonFull,
                  !isWatched && { backgroundColor: accentColor },
                  isWatched && styles.unwatchButton,
                  (!hasAired || isPending) && styles.disabledButton,
                ]}
                onPress={handleMarkWatched}
                disabled={!hasAired || isPending}
                activeOpacity={ACTIVE_OPACITY}
              >
                {isPending ? (
                  <ActivityIndicator size="small" color={COLORS.text} />
                ) : (
                  <>
                    <Check size={20} color={COLORS.text} />
                    <Text style={styles.watchButtonText}>
                      {isWatched ? t('media.markAsUnwatched') : t('media.markAsWatched')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {trailer && (
                <TouchableOpacity
                  style={styles.trailerButton}
                  onPress={() => handleVideoPress(trailer)}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <Play size={20} color={COLORS.text} fill={COLORS.text} />
                  <Text style={styles.trailerButtonText}>{t('media.watchTrailer')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* User Rating Display */}
          {userRating > 0 && <UserRating rating={userRating} />}

          {/* Overview */}
          {episode.overview && (
            <View style={styles.overviewSection}>
              <Text style={detailStyles.sectionTitle}>{t('media.overview')}</Text>
              <ExpandableText
                text={episode.overview}
                style={[styles.overviewText, { marginBottom: SPACING.s }]}
                readMoreStyle={[detailStyles.readMore, { color: accentColor }]}
              />
            </View>
          )}

          <SectionSeparator />

          {/* Guest Cast Section */}
          {credits?.guest_stars && credits.guest_stars.length > 0 && (
            <>
              <CastSection
                cast={credits.guest_stars}
                onCastPress={handlePersonPress}
                title={t('media.guestStars')}
              />
              <SectionSeparator />
            </>
          )}

          {/* Crew Section */}
          {credits?.crew && credits.crew.length > 0 && (
            <>
              <CrewSection
                crew={credits.crew}
                onCrewPress={handlePersonPress}
                style={{ marginTop: SPACING.l }}
              />
              <SectionSeparator />
            </>
          )}

          {/* Episode Stills */}
          {images?.stills && images.stills.length > 0 && (
            <>
              <PhotosSection
                images={images.stills}
                onPhotoPress={handlePhotoPress}
                style={{ marginTop: SPACING.l }}
              />
              <SectionSeparator />
            </>
          )}

          {/* Videos Section */}
          {videos.length > 0 && (
            <>
              <VideosSection videos={videos} onVideoPress={handleVideoPress} />
              <SectionSeparator />
            </>
          )}

          {/* Related Episodes */}
          {season?.episodes && (
            <>
              <RelatedEpisodesSection
                episodes={season.episodes}
                currentEpisodeNumber={episodeNumber}
                seasonNumber={seasonNumber}
                tvId={tvId}
                watchedEpisodes={watchedEpisodesMap}
                onEpisodePress={handleRelatedEpisodePress}
              />
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* Modals */}
      <TrailerPlayer
        visible={trailerModalVisible}
        videoKey={selectedVideo?.key || ''}
        onClose={() => {
          setTrailerModalVisible(false);
          setSelectedVideo(null);
        }}
      />

      <ImageLightbox
        visible={lightboxVisible}
        images={lightboxImages}
        downloadImages={lightboxImages}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxVisible(false)}
        onShowToast={(message) => toastRef.current?.show(message)}
      />

      {/* Rating Modal */}
      {episode && tvShow && (
        <RatingModal
          visible={ratingModalVisible}
          onClose={() => setRatingModalVisible(false)}
          episodeData={{
            tvShowId: tvId,
            seasonNumber,
            episodeNumber,
            episodeName: episode.name,
            tvShowName: tvShow.name,
            posterPath: tvShow.poster_path,
          }}
          initialRating={userRating}
          onRatingSuccess={() => {}}
          onShowToast={(message) => toastRef.current?.show(message)}
        />
      )}
      <NoteModal ref={noteSheetRef} />
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
  },
  heroImage: {
    width: '100%',
    height: 300,
    backgroundColor: COLORS.surfaceLight,
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  backButton: {
    position: 'absolute',
    top: SPACING.m,
    left: SPACING.m,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BORDER_RADIUS.round,
    padding: SPACING.s,
  },
  content: {
    padding: SPACING.l,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.m,
    marginBottom: SPACING.m,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  metaText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  actionButtonsContainer: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.l,
    gap: SPACING.s,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: SPACING.s,
    alignItems: 'center',
  },
  primaryActions: {
    gap: SPACING.s,
  },
  actionButtonWrapper: {
    flex: 1,
    height: BUTTON_HEIGHT,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchButtonFull: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  unwatchButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  disabledButton: {
    opacity: 0.5,
  },
  watchButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
  },
  trailerButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
  },
  trailerButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
  },
  overviewSection: {},
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.s,
  },
  overviewText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  readMore: {
    fontSize: FONT_SIZE.m,
    marginTop: SPACING.xs,
  },
});

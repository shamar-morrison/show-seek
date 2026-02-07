import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Video } from '@/src/api/tmdb';
import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import { CastSection } from '@/src/components/detail/CastSection';
import { CreatorsSection } from '@/src/components/detail/CreatorsSection';
import { DetailScreenSkeleton } from '@/src/components/detail/DetailScreenSkeleton';
import { useDetailStyles } from '@/src/components/detail/detailStyles';
import { ExternalRatingsSection } from '@/src/components/detail/ExternalRatingsSection';
import { MediaActionButtons } from '@/src/components/detail/MediaActionButtons';
import { MediaDetailsInfo } from '@/src/components/detail/MediaDetailsInfo';
import OpenWithDrawer from '@/src/components/detail/OpenWithDrawer';
import { PhotosSection } from '@/src/components/detail/PhotosSection';
import { RecommendationsSection } from '@/src/components/detail/RecommendationsSection';
import { ReviewsSection } from '@/src/components/detail/ReviewsSection';
import { SeasonsSection } from '@/src/components/detail/SeasonsSection';
import { SimilarMediaSection } from '@/src/components/detail/SimilarMediaSection';
import { TraktReviewsSection } from '@/src/components/detail/TraktReviewsSection';
import { TVHeroSection } from '@/src/components/detail/TVHeroSection';
import { TVMetaSection } from '@/src/components/detail/TVMetaSection';
import { VideosSection } from '@/src/components/detail/VideosSection';
import { WatchProvidersSection } from '@/src/components/detail/WatchProvidersSection';
import ImageLightbox from '@/src/components/ImageLightbox';
import NoteModal, { NoteModalRef } from '@/src/components/NotesModal';
import RatingModal from '@/src/components/RatingModal';
import ShareCardModal from '@/src/components/ShareCardModal';
import TVReminderModal from '@/src/components/TVReminderModal';
import { AnimatedScrollHeader } from '@/src/components/ui/AnimatedScrollHeader';
import { BlurredText } from '@/src/components/ui/BlurredText';
import { ExpandableText } from '@/src/components/ui/ExpandableText';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import UserRating from '@/src/components/UserRating';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAnimatedScrollHeader } from '@/src/hooks/useAnimatedScrollHeader';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useContentFilter } from '@/src/hooks/useContentFilter';
import { useDetailLongPress } from '@/src/hooks/useDetailLongPress';
import { useExternalRatings } from '@/src/hooks/useExternalRatings';
import { useMediaLists } from '@/src/hooks/useLists';
import { useMediaNote } from '@/src/hooks/useNotes';
import { useNotificationPermissions } from '@/src/hooks/useNotificationPermissions';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useProgressiveRender } from '@/src/hooks/useProgressiveRender';
import { useMediaRating } from '@/src/hooks/useRatings';
import {
  useCancelReminder,
  useCreateReminder,
  useMediaReminder,
  useUpdateReminder,
} from '@/src/hooks/useReminders';
import { useTraktReviews } from '@/src/hooks/useTraktReviews';
import { useTVReminderLogic } from '@/src/hooks/useTVReminderLogic';
import { errorStyles } from '@/src/styles/errorStyles';
import {
  getListColor,
  getListIconComponent,
  MULTIPLE_LISTS_COLOR,
  MultipleListsIcon,
} from '@/src/utils/listIcons';
import { hasWatchProviders } from '@/src/utils/mediaUtils';
import { showPremiumAlert } from '@/src/utils/premiumAlert';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, RefreshControl, Text, TouchableOpacity, View } from 'react-native';

export default function TVDetailScreen() {
  const styles = useDetailStyles();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const currentTab = useCurrentTab();
  const { accentColor } = useAccentColor();
  const tvId = Number(id);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const addToListModalRef = useRef<AddToListModalRef>(null);
  const noteSheetRef = useRef<NoteModalRef>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [shouldLoadReviews, setShouldLoadReviews] = useState(false);
  const [shouldLoadTraktReviews, setShouldLoadTraktReviews] = useState(false);
  const [shouldLoadRecommendations, setShouldLoadRecommendations] = useState(false);
  const [shareCardModalVisible, setShareCardModalVisible] = useState(false);
  const [openWithDrawerVisible, setOpenWithDrawerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);
  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
  const { requireAuth, AuthGuardModal } = useAuthGuard();
  const { isPremium } = usePremium();

  // Long-press handler for similar/recommended media
  const {
    handleLongPress: handleMediaLongPress,
    addToListModalRef: similarMediaModalRef,
    selectedMediaItem: selectedSimilarMediaItem,
  } = useDetailLongPress('tv');

  // External ratings (IMDb, RT, Metacritic)
  const { ratings: externalRatings, isLoading: isLoadingExternalRatings } = useExternalRatings(
    'tv',
    tvId
  );

  // Wrap the long-press handler with auth guard
  const guardedHandleMediaLongPress = useCallback(
    (item: any) => {
      requireAuth(() => handleMediaLongPress(item), t('discover.signInToAdd'));
    },
    [requireAuth, handleMediaLongPress, t]
  );

  const { membership, isLoading: isLoadingLists } = useMediaLists(tvId);
  const { userRating, isLoading: isLoadingRating } = useMediaRating(tvId, 'tv');
  const { preferences } = usePreferences();
  const listIds = Object.keys(membership);
  const isInAnyList = listIds.length > 0;
  const listIcon =
    listIds.length === 1
      ? getListIconComponent(listIds[0])
      : isInAnyList
        ? MultipleListsIcon
        : undefined;
  const listColor =
    listIds.length === 1
      ? getListColor(listIds[0], accentColor)
      : isInAnyList
        ? MULTIPLE_LISTS_COLOR
        : undefined;

  // Reminder hooks
  const { reminder, hasReminder, isLoading: isLoadingReminder } = useMediaReminder(tvId, 'tv');
  const { note, hasNote, isLoading: isLoadingNote } = useMediaNote('tv', tvId);
  const { requestPermission } = useNotificationPermissions();
  const createReminderMutation = useCreateReminder();
  const cancelReminderMutation = useCancelReminder();
  const updateReminderMutation = useUpdateReminder();

  // Trakt reviews
  const {
    reviews: traktReviews,
    isLoading: isLoadingTraktReviews,
    isError: isTraktReviewsError,
  } = useTraktReviews(tvId, 'tv', shouldLoadTraktReviews);

  const tvQuery = useQuery({
    queryKey: ['tv', tvId],
    queryFn: () => tmdbApi.getTVShowDetails(tvId),
    enabled: !!tvId,
  });

  const creditsQuery = useQuery({
    queryKey: ['tv', tvId, 'credits'],
    queryFn: () => tmdbApi.getTVCredits(tvId),
    enabled: !!tvId,
  });

  const videosQuery = useQuery({
    queryKey: ['tv', tvId, 'videos'],
    queryFn: () => tmdbApi.getTVVideos(tvId),
    enabled: !!tvId,
  });

  const similarQuery = useQuery({
    queryKey: ['tv', tvId, 'similar'],
    queryFn: () => tmdbApi.getSimilarTV(tvId),
    enabled: !!tvId,
  });

  const watchProvidersQuery = useQuery({
    queryKey: ['tv', tvId, 'watch-providers'],
    queryFn: () => tmdbApi.getTVWatchProviders(tvId),
    enabled: !!tvId,
  });

  const imagesQuery = useQuery({
    queryKey: ['tv', tvId, 'images'],
    queryFn: () => tmdbApi.getTVImages(tvId),
    enabled: !!tvId,
  });

  const reviewsQuery = useQuery({
    queryKey: ['tv', tvId, 'reviews'],
    queryFn: () => tmdbApi.getTVReviews(tvId),
    enabled: !!tvId && shouldLoadReviews,
  });

  const recommendationsQuery = useQuery({
    queryKey: ['tv', tvId, 'recommendations'],
    queryFn: () => tmdbApi.getRecommendedTV(tvId),
    enabled: !!tvId && shouldLoadRecommendations,
  });

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

  const handleToast = useCallback((message: string) => {
    toastRef.current?.show(message);
  }, []);

  const {
    nextEpisodeInfo: originalNextEpisode,
    effectiveNextEpisode,
    nextSeasonAirDate,
    nextSeasonNumber,
    isUsingSubsequent,
    isLoadingSubsequent,
    handleSetReminder,
    handleCancelReminder,
  } = useTVReminderLogic({
    tvId,
    tvShowData: tvQuery.data,
    reminder: reminder || undefined,
    hasReminder,
    createReminderMutation,
    cancelReminderMutation,
    updateReminderMutation,
    requestPermission,
    onToast: handleToast,
  });

  // Progressive rendering: defer heavy component tree by one tick on cache hit
  const { isReady } = useProgressiveRender();

  // Filter out watched content - must be called before early returns (Rules of Hooks)
  const rawSimilarShows = similarQuery.data?.results.slice(0, 10) || [];
  const rawRecommendations = recommendationsQuery.data?.results.slice(0, 10) || [];
  const filteredSimilarShows = useContentFilter(rawSimilarShows);
  const filteredRecommendations = useContentFilter(rawRecommendations);

  if (!isReady || tvQuery.isLoading) {
    return <DetailScreenSkeleton />;
  }

  if (tvQuery.isError || !tvQuery.data) {
    return (
      <View style={errorStyles.container}>
        <Text style={errorStyles.text}>{t('tvDetail.failedToLoad')}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.backButtonText}>{t('common.goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const show = tvQuery.data;
  const cast = creditsQuery.data?.cast.slice(0, 10) || [];
  const creators = show.created_by || [];
  const videos = videosQuery.data || [];
  const trailer =
    videos.find((v) => v.type === 'Trailer' && v.official) ||
    videos.find((v) => v.type === 'Trailer') ||
    videos[0];
  const similarShows = similarQuery.data?.results.slice(0, 10) || [];
  const watchProviders = watchProvidersQuery.data;
  const watchProvidersLink = watchProvidersQuery.data?.link;
  const images = imagesQuery.data;
  const lightboxDisplayImages =
    images?.backdrops
      .slice(0, 10)
      .map((img) => getImageUrl(img.file_path, TMDB_IMAGE_SIZES.backdrop.large) || '') || [];
  const lightboxDownloadImages =
    images?.backdrops
      .slice(0, 10)
      .map((img) => getImageUrl(img.file_path, TMDB_IMAGE_SIZES.backdrop.original) || '') || [];
  const reviews = reviewsQuery.data?.results.slice(0, 10) || [];
  const recommendations = recommendationsQuery.data?.results.slice(0, 10) || [];

  const backdropUrl = getImageUrl(show.backdrop_path, TMDB_IMAGE_SIZES.backdrop.medium);
  const posterUrl = getImageUrl(show.poster_path, TMDB_IMAGE_SIZES.poster.medium);

  const handleTrailerPress = () => {
    if (trailer) {
      setSelectedVideo(trailer);
      setTrailerModalVisible(true);
    }
  };

  const handleCastPress = (personId: number) => {
    navigateTo(`/person/${personId}`);
  };

  const handleShowPress = (id: number) => {
    navigateTo(`/tv/${id}`);
  };

  const handleSeasonsPress = (seasonNumber?: number) => {
    const path = `/tv/${tvId}/seasons${seasonNumber !== undefined ? `?season=${seasonNumber}` : ''}`;
    navigateTo(path);
  };

  const handleCastViewAll = () => {
    navigateTo(`/tv/${tvId}/cast?title=${encodeURIComponent(show.name)}`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        tvQuery.refetch(),
        creditsQuery.refetch(),
        videosQuery.refetch(),
        similarQuery.refetch(),
        watchProvidersQuery.refetch(),
        imagesQuery.refetch(),
        ...(shouldLoadReviews ? [reviewsQuery.refetch()] : []),
        ...(shouldLoadRecommendations ? [recommendationsQuery.refetch()] : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <AnimatedScrollHeader
        title={show.name}
        onBackPress={() => router.back()}
        scrollY={scrollY}
        rightAction={
          <HeaderIconButton onPress={() => setOpenWithDrawerVisible(true)}>
            <ExternalLink size={20} color={COLORS.white} />
          </HeaderIconButton>
        }
      />

      <Animated.ScrollView
        style={styles.scrollView}
        bounces={true}
        {...scrollViewProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={accentColor}
            colors={[accentColor]}
          />
        }
      >
        {/* Hero Section */}
        <TVHeroSection
          backdropPath={show.backdrop_path}
          posterPath={show.poster_path}
          showName={show.name}
          showId={tvId}
          onBackPress={() => router.back()}
          onOpenWithPress={() => setOpenWithDrawerVisible(true)}
          onShowToast={(msg) => toastRef.current?.show(msg)}
        />

        {/* Content */}
        <View style={styles.content}>
          <TVMetaSection
            show={show}
            onSeasonsPress={() => handleSeasonsPress()}
            onShowToast={(msg) => toastRef.current?.show(msg)}
          />

          {/* Action buttons */}
          <MediaActionButtons
            onAddToList={() =>
              requireAuth(() => addToListModalRef.current?.present(), t('discover.signInToAdd'))
            }
            onRate={() =>
              requireAuth(() => setRatingModalVisible(true), t('authGuards.rateMoviesAndShows'))
            }
            onReminder={
              show.status === 'Returning Series' ||
              show.status === 'In Production' ||
              show.status === 'Planned' ||
              show.status === 'Pilot'
                ? () =>
                    requireAuth(() => {
                      if (!isPremium) {
                        showPremiumAlert('premiumFeature.features.reminders');
                        return;
                      }
                      setReminderModalVisible(true);
                    }, t('authGuards.setReleaseReminders'))
                : undefined
            }
            onNote={() =>
              requireAuth(
                () =>
                  noteSheetRef.current?.present({
                    mediaType: 'tv',
                    mediaId: tvId,
                    posterPath: show.poster_path,
                    mediaTitle: show.name,
                    initialNote: note?.content,
                  }),
                t('authGuards.addNotes')
              )
            }
            onTrailer={handleTrailerPress}
            onShareCard={() => setShareCardModalVisible(true)}
            isInAnyList={isInAnyList}
            isLoadingLists={isLoadingLists}
            listIcon={listIcon}
            listColor={listColor}
            userRating={userRating}
            isLoadingRating={isLoadingRating}
            hasReminder={hasReminder}
            isLoadingReminder={isLoadingReminder}
            hasNote={hasNote}
            isLoadingNote={isLoadingNote}
            hasTrailer={!!trailer}
          />

          {userRating > 0 && <UserRating rating={userRating} />}

          {/* External Ratings (IMDb, Rotten Tomatoes, Metacritic) */}
          <ExternalRatingsSection ratings={externalRatings} isLoading={isLoadingExternalRatings} />

          <Text style={styles.sectionTitle}>{t('media.overview')}</Text>
          {preferences?.blurPlotSpoilers ? (
            <BlurredText
              text={show.overview || t('media.noOverview')}
              style={styles.overview}
              readMoreStyle={styles.readMore}
              isBlurred={true}
            />
          ) : (
            <ExpandableText
              text={show.overview || t('media.noOverview')}
              style={styles.overview}
              readMoreStyle={styles.readMore}
            />
          )}

          <SectionSeparator />

          {/* Seasons Section */}
          {show.seasons && show.seasons.some((s) => s.season_number > 0) && (
            <>
              <SeasonsSection
                tvShowId={tvId}
                seasons={show.seasons.filter((s) => s.season_number > 0)}
                onSeasonPress={handleSeasonsPress}
              />
              <SectionSeparator />
            </>
          )}

          {/* Creators Section */}
          <CreatorsSection
            creators={creators}
            onCreatorPress={(id) => navigateTo(`/person/${id}`)}
          />

          {creators.length > 0 && <SectionSeparator />}

          {/* Watch Providers */}
          <WatchProvidersSection watchProviders={watchProviders} link={watchProvidersLink} />

          {hasWatchProviders(watchProviders) && <SectionSeparator />}

          {/* Cast */}
          <CastSection cast={cast} onCastPress={handleCastPress} onViewAll={handleCastViewAll} />

          {cast.length > 0 && <SectionSeparator />}

          {/* Similar Shows */}
          <SimilarMediaSection
            mediaType="tv"
            items={filteredSimilarShows}
            onMediaPress={handleShowPress}
            onMediaLongPress={guardedHandleMediaLongPress}
            title={t('media.similarShows')}
          />

          {filteredSimilarShows.length > 0 && <SectionSeparator />}

          {/* Photos */}
          {images && images.backdrops && images.backdrops.length > 0 && (
            <PhotosSection
              images={images.backdrops}
              onPhotoPress={(index) => {
                setLightboxIndex(index);
                setLightboxVisible(true);
              }}
            />
          )}

          {images && images.backdrops && images.backdrops.length > 0 && <SectionSeparator />}

          {/* Videos */}
          <VideosSection
            videos={videos}
            onVideoPress={(video) => {
              setSelectedVideo(video);
              setTrailerModalVisible(true);
            }}
          />

          {videos.length > 0 && <SectionSeparator />}

          {/* Recommendations */}
          <RecommendationsSection
            mediaType="tv"
            items={filteredRecommendations}
            isLoading={recommendationsQuery.isLoading}
            isError={recommendationsQuery.isError}
            shouldLoad={shouldLoadRecommendations}
            onMediaPress={handleShowPress}
            onMediaLongPress={guardedHandleMediaLongPress}
            onLayout={() => {
              if (!shouldLoadRecommendations) {
                setShouldLoadRecommendations(true);
              }
            }}
          />

          {filteredRecommendations.length > 0 && <SectionSeparator />}

          {/* Trakt Reviews */}
          <TraktReviewsSection
            isLoading={isLoadingTraktReviews}
            isError={isTraktReviewsError}
            reviews={traktReviews}
            shouldLoad={shouldLoadTraktReviews}
            onReviewPress={(review) => {
              navigateTo(
                `/review/${review.id}?review=${encodeURIComponent(JSON.stringify(review))}`
              );
            }}
            onLayout={() => {
              if (!shouldLoadTraktReviews) {
                setShouldLoadTraktReviews(true);
              }
            }}
          />

          {!isLoadingTraktReviews && !isTraktReviewsError && traktReviews.length > 0 && (
            <SectionSeparator />
          )}

          {/* TMDB Reviews */}
          <ReviewsSection
            isLoading={reviewsQuery.isLoading}
            isError={reviewsQuery.isError}
            reviews={reviews}
            shouldLoad={shouldLoadReviews}
            onReviewPress={(review) => {
              navigateTo(
                `/review/${review.id}?review=${encodeURIComponent(JSON.stringify(review))}`
              );
            }}
            onLayout={() => {
              if (!shouldLoadReviews) {
                setShouldLoadReviews(true);
              }
            }}
          />

          {!reviewsQuery.isLoading && !reviewsQuery.isError && reviews.length > 0 && (
            <SectionSeparator />
          )}

          {/* Details */}
          <MediaDetailsInfo media={show} type="tv" />
        </View>
      </Animated.ScrollView>

      <TrailerPlayer
        visible={trailerModalVisible}
        onClose={() => setTrailerModalVisible(false)}
        videoKey={selectedVideo?.key || trailer?.key || null}
      />

      <ImageLightbox
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
        images={lightboxDisplayImages}
        downloadImages={lightboxDownloadImages}
        onShowToast={(message) => toastRef.current?.show(message)}
        initialIndex={lightboxIndex}
      />

      <OpenWithDrawer
        visible={openWithDrawerVisible}
        onClose={() => setOpenWithDrawerVisible(false)}
        mediaId={tvId}
        mediaType="tv"
        title={show.name}
        year={show.first_air_date?.split('-')[0] || null}
        onShowToast={(message) => toastRef.current?.show(message)}
      />

      {show && (
        <>
          <AddToListModal
            ref={addToListModalRef}
            mediaItem={{
              id: show.id,
              title: show.name,
              poster_path: show.poster_path,
              media_type: 'tv',
              vote_average: show.vote_average,
              release_date: show.first_air_date,
              genre_ids: show.genres?.map((g) => g.id) || [],
            }}
            onShowToast={(message) => toastRef.current?.show(message)}
          />
          <RatingModal
            visible={ratingModalVisible}
            onClose={() => setRatingModalVisible(false)}
            mediaId={show.id}
            mediaType="tv"
            initialRating={userRating}
            onRatingSuccess={() => {}}
            onShowToast={(message) => toastRef.current?.show(message)}
            autoAddOptions={{
              mediaMetadata: {
                title: show.name,
                poster_path: show.poster_path,
                vote_average: show.vote_average,
                release_date: show.first_air_date || '',
                genre_ids: show.genres?.map((g) => g.id),
              },
            }}
          />
          <TVReminderModal
            visible={reminderModalVisible}
            onClose={() => setReminderModalVisible(false)}
            tvTitle={show.name}
            nextEpisode={effectiveNextEpisode}
            originalNextEpisode={originalNextEpisode}
            isUsingSubsequentEpisode={isUsingSubsequent}
            isLoadingSubsequentEpisode={isLoadingSubsequent}
            nextSeasonAirDate={nextSeasonAirDate}
            nextSeasonNumber={nextSeasonNumber}
            currentTiming={reminder?.reminderTiming}
            currentFrequency={reminder?.tvFrequency}
            currentNextEpisode={reminder?.nextEpisode}
            hasReminder={hasReminder}
            onSetReminder={handleSetReminder}
            onCancelReminder={handleCancelReminder}
            onShowToast={(message) => toastRef.current?.show(message)}
          />
          <NoteModal ref={noteSheetRef} />
          {/* Lazy load ShareCardModal - only mount when needed */}
          {shareCardModalVisible && (
            <ShareCardModal
              visible={shareCardModalVisible}
              onClose={() => setShareCardModalVisible(false)}
              mediaData={{
                id: show.id,
                type: 'tv',
                title: show.name,
                posterPath: show.poster_path,
                backdropPath: show.backdrop_path,
                releaseYear: show.first_air_date?.split('-')[0] || '',
                genres: show.genres?.map((g) => g.name) || [],
                userRating,
              }}
              onShowToast={(message) => toastRef.current?.show(message)}
            />
          )}
        </>
      )}
      <Toast ref={toastRef} />
      {AuthGuardModal}

      {/* AddToListModal for long-pressed similar/recommended media */}
      {selectedSimilarMediaItem && (
        <AddToListModal
          ref={similarMediaModalRef}
          mediaItem={selectedSimilarMediaItem}
          onShowToast={(message) => toastRef.current?.show(message)}
        />
      )}
    </View>
  );
}

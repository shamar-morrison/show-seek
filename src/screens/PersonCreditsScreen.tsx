import {
  getImageUrl,
  Movie,
  MovieCrewCredit,
  TMDB_IMAGE_SIZES,
  tmdbApi,
  TVCrewCredit,
  TVShow,
} from '@/src/api/tmdb';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import ListActionsModal, {
  ListActionsIcon,
  ListActionsModalRef,
} from '@/src/components/ListActionsModal';
import { SortState } from '@/src/components/MediaSortModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { MediaImage } from '@/src/components/ui/MediaImage';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { EXCLUDED_TV_GENRE_IDS } from '@/src/constants/genres';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAllGenres } from '@/src/hooks/useGenres';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import { ListMediaItem } from '@/src/services/ListService';
import { errorStyles } from '@/src/styles/errorStyles';
import { mediaMetaStyles } from '@/src/styles/mediaMetaStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { getThreeColumnGridMetrics, GRID_COLUMN_COUNT } from '@/src/utils/gridLayout';
import { createSortAction } from '@/src/utils/listActions';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { getSortableTitle } from '@/src/utils/sortUtils';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Film, SlidersHorizontal, Star, Tv } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_CREDITS_SORT: SortState = {
  option: 'rating',
  direction: 'desc',
};

interface CreditItem extends ListMediaItem {
  character?: string;
  job?: string;
  popularity?: number;
}

export default function PersonCreditsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const currentTab = useCurrentTab();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { preferences } = usePreferences();
  const movieLabel = t('media.movie');
  const tvShowLabel = t('media.tvShow');
  const { id, name, mediaType, creditType } = useLocalSearchParams<{
    id: string;
    name: string;
    mediaType: 'movie' | 'tv';
    creditType: 'cast' | 'crew';
  }>();

  const personId = Number(id);
  const isTVCredits = mediaType === 'tv';
  const isCrewCredits = creditType === 'crew';

  // Compute screen title early for the header
  const screenTitle = `${name || 'Credits'} ${isTVCredits ? 'TV Shows' : 'Movies'}`;

  // Set header options synchronously before first paint to prevent status bar overlap
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: screenTitle,
      headerStyle: { backgroundColor: COLORS.background },
      headerTintColor: COLORS.text,
    });
  }, [navigation, screenTitle]);

  // Sort and filter state
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_CREDITS_SORT);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterState, setFilterState] = useState<WatchStatusFilterState>(
    DEFAULT_WATCH_STATUS_FILTERS
  );
  const listActionsModalRef = useRef<ListActionsModalRef>(null);

  const { data: genreMap = {} } = useAllGenres();
  const { itemWidth, itemHorizontalMargin, listPaddingHorizontal } =
    getThreeColumnGridMetrics(windowWidth);

  const hasActiveSort =
    sortState.option !== DEFAULT_CREDITS_SORT.option ||
    sortState.direction !== DEFAULT_CREDITS_SORT.direction;
  const hasActiveFilterState = hasActiveFilters(filterState);

  const actionButton = useMemo(
    () => ({
      icon: ListActionsIcon,
      onPress: () => listActionsModalRef.current?.present(),
      showBadge: hasActiveSort || hasActiveFilterState,
    }),
    [hasActiveSort, hasActiveFilterState]
  );

  const { viewMode, isLoadingPreference } = useViewModeToggle({
    storageKey: `person-credits-view-${mediaType}`,
    showSortButton: false,
    actionButton,
  });

  type CreditsResponse =
    | { cast: Movie[]; crew: MovieCrewCredit[] }
    | { cast: TVShow[]; crew: TVCrewCredit[] };

  type MovieCastCredit = Movie & { character?: string };
  type TVCastCredit = TVShow & { character?: string };
  type CastCredit = MovieCastCredit | TVCastCredit;
  type CrewCredit = MovieCrewCredit | TVCrewCredit;
  type RawCredit = CastCredit | CrewCredit;

  const creditsQuery = useQuery<CreditsResponse>({
    queryKey: ['person', personId, `${mediaType}-credits`],
    queryFn: async () => {
      if (isTVCredits) {
        return tmdbApi.getPersonTVCredits(personId);
      }
      return tmdbApi.getPersonMovieCredits(personId);
    },
    enabled: !!personId,
  });

  const credits: CreditItem[] = useMemo(() => {
    if (!creditsQuery.data) return [];

    const rawCredits: RawCredit[] = isCrewCredits
      ? (creditsQuery.data.crew as CrewCredit[])
      : (creditsQuery.data.cast as CastCredit[]);

    const relevantCrewJobs = [
      'Director',
      'Writer',
      'Screenplay',
      'Story',
      'Creator',
      'Executive Producer',
    ];

    let filtered: RawCredit[] = isCrewCredits
      ? rawCredits.filter((credit) =>
          relevantCrewJobs.some((job) => (credit as CrewCredit).job?.includes(job))
        )
      : rawCredits;

    if (isTVCredits) {
      filtered = filtered.filter(
        (item) => !item.genre_ids?.some((id) => EXCLUDED_TV_GENRE_IDS.includes(id))
      );
    }

    // Deduplicate (a person may have multiple roles on same project)
    const uniqueMap = new Map<number, RawCredit>();
    filtered.forEach((credit) => {
      if (!uniqueMap.has(credit.id)) {
        uniqueMap.set(credit.id, credit);
      }
    });

    const items: CreditItem[] = Array.from(uniqueMap.values()).map(
      (credit): CreditItem => ({
        id: credit.id,
        title: getDisplayMediaTitle(credit, !!preferences?.showOriginalTitles),
        poster_path: credit.poster_path,
        media_type: mediaType as 'movie' | 'tv',
        vote_average: credit.vote_average || 0,
        release_date: 'first_air_date' in credit ? credit.first_air_date : credit.release_date,
        addedAt: 0,
        genre_ids: credit.genre_ids,
        character: 'character' in credit ? credit.character : undefined,
        job: 'job' in credit ? credit.job : undefined,
        popularity: credit.popularity,
      })
    );

    const filteredItems = filterMediaItems(items, filterState) as CreditItem[];

    return [...filteredItems].sort((a, b) => {
      const direction = sortState.direction === 'asc' ? 1 : -1;

      switch (sortState.option) {
        case 'releaseDate': {
          const dateA = a.release_date || '';
          const dateB = b.release_date || '';
          return dateA.localeCompare(dateB) * direction;
        }
        case 'rating':
          return ((a.vote_average ?? 0) - (b.vote_average ?? 0)) * direction;
        case 'alphabetical': {
          const titleA = getSortableTitle(a.title || '');
          const titleB = getSortableTitle(b.title || '');
          return titleA.localeCompare(titleB) * direction;
        }
        case 'popularity':
          return ((a.popularity ?? 0) - (b.popularity ?? 0)) * direction;
        default:
          return ((a.vote_average ?? 0) - (b.vote_average ?? 0)) * direction;
      }
    });
  }, [
    creditsQuery.data,
    isCrewCredits,
    isTVCredits,
    mediaType,
    filterState,
    sortState,
    preferences?.showOriginalTitles,
  ]);

  const handleItemPress = useCallback(
    (item: CreditItem) => {
      const path = item.media_type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
      if (currentTab) {
        router.push(`/(tabs)/${currentTab}${path}` as any);
      } else {
        router.push(path as any);
      }
    },
    [currentTab, router]
  );

  const listActions = useMemo(
    () => [
      {
        id: 'filter',
        icon: SlidersHorizontal,
        label: 'Filter Items',
        onPress: () => setFilterModalVisible(true),
        showBadge: hasActiveFilterState,
      },
      createSortAction({
        onPress: () => setSortModalVisible(true),
        showBadge: hasActiveSort,
      }),
    ],
    [hasActiveFilterState, hasActiveSort]
  );

  const renderGridItem = useCallback(
    ({ item }: { item: CreditItem }) => (
      <Pressable
        style={({ pressed }) => [
          styles.gridCard,
          { width: itemWidth, marginHorizontal: itemHorizontalMargin },
          pressed && styles.cardPressed,
        ]}
        onPress={() => handleItemPress(item)}
      >
        <MediaImage
          source={{ uri: getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.medium) }}
          style={[styles.gridPoster, { width: itemWidth, height: itemWidth * 1.5 }]}
          contentFit="cover"
        />
        <View style={styles.gridInfo}>
          <Text style={styles.gridTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.release_date && (
            <View style={mediaMetaStyles.yearRatingContainer}>
              <Text style={mediaMetaStyles.year}>{new Date(item.release_date).getFullYear()}</Text>
              {item.vote_average > 0 && (
                <>
                  <Text style={mediaMetaStyles.separator}> • </Text>
                  <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                  <Text style={mediaMetaStyles.rating}>{item.vote_average.toFixed(1)}</Text>
                </>
              )}
            </View>
          )}
        </View>
      </Pressable>
    ),
    [handleItemPress, itemHorizontalMargin, itemWidth]
  );

  const renderListItem = useCallback(
    ({ item }: { item: CreditItem }) => (
      <MediaListCard
        item={item}
        onPress={handleItemPress}
        subtitle={item.character || item.job}
        hideMediaType
        movieLabel={movieLabel}
        tvShowLabel={tvShowLabel}
      />
    ),
    [handleItemPress, movieLabel, tvShowLabel]
  );

  if (creditsQuery.isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  if (creditsQuery.isError) {
    return (
      <View style={errorStyles.container}>
        <Text style={errorStyles.text}>{t('credits.failedToLoad')}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButtonError}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.backButtonText, { color: accentColor }]}>{t('common.goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        {credits.length === 0 ? (
          <View style={styles.emptyContainer}>
            {isTVCredits ? (
              <Tv size={48} color={COLORS.textSecondary} />
            ) : (
              <Film size={48} color={COLORS.textSecondary} />
            )}
            <Text style={styles.emptyTitle}>
              {hasActiveFilterState
                ? t('discover.noResultsWithFilters')
                : t('personCredits.noCreditsTitle')}
            </Text>
            <Text style={styles.emptyDescription}>
              {hasActiveFilterState
                ? t('discover.adjustFilters')
                : isTVCredits
                  ? t('personCredits.noTVCreditsDescription')
                  : t('personCredits.noMovieCreditsDescription')}
            </Text>
            {hasActiveFilterState && (
              <TouchableOpacity
                style={[styles.clearFiltersButton, { backgroundColor: accentColor }]}
                onPress={() => setFilterState(DEFAULT_WATCH_STATUS_FILTERS)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={styles.clearFiltersText}>{t('common.clearFilters')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlashList
            data={credits}
            renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
            keyExtractor={(item) => `${item.id}-${item.media_type}`}
            numColumns={viewMode === 'grid' ? GRID_COLUMN_COUNT : 1}
            key={viewMode}
            drawDistance={400}
            contentContainerStyle={
              viewMode === 'grid'
                ? [styles.gridContent, { paddingHorizontal: listPaddingHorizontal }]
                : styles.listContent
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      <LibrarySortModal
        visible={sortModalVisible}
        setVisible={setSortModalVisible}
        sortState={sortState}
        onApplySort={setSortState}
        allowedOptions={['popularity', 'releaseDate', 'rating', 'alphabetical']}
      />

      <WatchStatusFiltersModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filterState}
        onApplyFilters={(newFilters) => {
          setFilterState(newFilters);
          setFilterModalVisible(false);
        }}
        genreMap={genreMap}
        showMediaTypeFilter={false}
      />

      <ListActionsModal ref={listActionsModalRef} actions={listActions} />
    </>
  );
}

const styles = StyleSheet.create({
  backButtonError: {
    padding: SPACING.m,
  },
  backButtonText: {},
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.m,
    marginBottom: SPACING.s,
  },
  emptyDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  clearFiltersButton: {
    marginTop: SPACING.l,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.m,
  },
  clearFiltersText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
  // Grid styles - aligned with MediaGrid
  gridContent: {
    paddingTop: SPACING.m,
  },
  gridCard: {
    marginBottom: SPACING.m,
  },
  gridPoster: {
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  gridInfo: {
    marginTop: SPACING.s,
  },
  gridTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  // List styles
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
  },
  // Shared styles
  cardPressed: {
    opacity: ACTIVE_OPACITY,
  },
});

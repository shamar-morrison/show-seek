import {
  getImageUrl,
  Movie,
  MovieCrewCredit,
  TMDB_IMAGE_SIZES,
  tmdbApi,
  TVCrewCredit,
  TVShow,
} from '@/src/api/tmdb';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { EXCLUDED_TV_GENRE_IDS } from '@/src/constants/genres';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import { ListMediaItem } from '@/src/services/ListService';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Film, Star, Tv } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

interface CreditItem extends ListMediaItem {
  character?: string;
  job?: string;
}

export default function PersonCreditsScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { id, name, mediaType, creditType } = useLocalSearchParams<{
    id: string;
    name: string;
    mediaType: 'movie' | 'tv';
    creditType: 'cast' | 'crew';
  }>();

  const personId = Number(id);
  const isTVCredits = mediaType === 'tv';
  const isCrewCredits = creditType === 'crew';

  const { viewMode, isLoadingPreference } = useViewModeToggle({
    storageKey: `person-credits-view-${mediaType}`,
    showSortButton: false,
  });

  // union type for both movie and TV credits
  type CreditsResponse =
    | { cast: Movie[]; crew: MovieCrewCredit[] }
    | { cast: TVShow[]; crew: TVCrewCredit[] };

  // Cast credits have character, crew credits have job
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

  // Transform and filter credits
  const credits: CreditItem[] = useMemo(() => {
    if (!creditsQuery.data) return [];

    const rawCredits: RawCredit[] = isCrewCredits
      ? (creditsQuery.data.crew as CrewCredit[])
      : (creditsQuery.data.cast as CastCredit[]);

    // For crew credits, filter to relevant jobs
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

    // Transform to CreditItem format and sort by popularity
    return Array.from(uniqueMap.values())
      .sort((a, b) => b.popularity - a.popularity)
      .map(
        (credit): CreditItem => ({
          id: credit.id,
          title: 'name' in credit ? credit.name : credit.title,
          poster_path: credit.poster_path,
          media_type: mediaType as 'movie' | 'tv',
          vote_average: credit.vote_average || 0,
          release_date: 'first_air_date' in credit ? credit.first_air_date : credit.release_date,
          addedAt: 0,
          genre_ids: credit.genre_ids,
          character: 'character' in credit ? credit.character : undefined,
          job: 'job' in credit ? credit.job : undefined,
        })
      );
  }, [creditsQuery.data, isCrewCredits, isTVCredits, mediaType]);

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

  // Title format: "Person Name Movies" or "Person Name TV Shows"
  const screenTitle = `${name || 'Credits'} ${isTVCredits ? 'TV Shows' : 'Movies'}`;

  const renderGridItem = useCallback(
    ({ item }: { item: CreditItem }) => (
      <Pressable
        style={({ pressed }) => [styles.gridCard, pressed && styles.cardPressed]}
        onPress={() => handleItemPress(item)}
      >
        <MediaImage
          source={{ uri: getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.medium) }}
          style={styles.gridPoster}
          contentFit="cover"
        />
        <View style={styles.gridInfo}>
          <Text style={styles.gridTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.release_date && (
            <View style={styles.yearRatingContainer}>
              <Text style={styles.year}>{new Date(item.release_date).getFullYear()}</Text>
              {item.vote_average > 0 && (
                <>
                  <Text style={styles.separator}> • </Text>
                  <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                  <Text style={styles.rating}>{item.vote_average.toFixed(1)}</Text>
                </>
              )}
            </View>
          )}
        </View>
      </Pressable>
    ),
    [handleItemPress]
  );

  const renderListItem = useCallback(
    ({ item }: { item: CreditItem }) => (
      <MediaListCard
        item={item}
        onPress={handleItemPress}
        subtitle={item.character || item.job}
        hideMediaType
      />
    ),
    [handleItemPress]
  );

  if (creditsQuery.isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (creditsQuery.isError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load credits</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButtonError}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: screenTitle,
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />

      {credits.length === 0 ? (
        <View style={styles.emptyContainer}>
          {isTVCredits ? (
            <Tv size={48} color={COLORS.textSecondary} />
          ) : (
            <Film size={48} color={COLORS.textSecondary} />
          )}
          <Text style={styles.emptyTitle}>No Credits Found</Text>
          <Text style={styles.emptyDescription}>
            No {isTVCredits ? 'TV show' : 'movie'} credits available for this person.
          </Text>
        </View>
      ) : (
        <FlashList
          data={credits}
          renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
          keyExtractor={(item) => `${item.id}-${item.media_type}`}
          numColumns={viewMode === 'grid' ? COLUMN_COUNT : 1}
          key={viewMode}
          drawDistance={400}
          contentContainerStyle={viewMode === 'grid' ? styles.gridContent : styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  backButtonError: {
    padding: SPACING.m,
  },
  backButtonText: {
    color: COLORS.primary,
  },
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
  // Grid styles - aligned with MediaGrid
  gridContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    marginLeft: SPACING.s,
  },
  gridCard: {
    width: ITEM_WIDTH,
    marginBottom: SPACING.m,
    marginRight: SPACING.m,
  },
  gridPoster: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH * 1.5,
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
  yearRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: SPACING.xs,
  },
  year: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  separator: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  rating: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
});

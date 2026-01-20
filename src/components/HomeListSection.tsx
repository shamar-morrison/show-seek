import { Movie, PaginatedResponse, tmdbApi, TVShow } from '@/src/api/tmdb';
import { MovieCard } from '@/src/components/cards/MovieCard';
import { TVShowCard } from '@/src/components/cards/TVShowCard';
import { LatestTrailersSection } from '@/src/components/LatestTrailersSection';
import { MovieCardSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { useContentFilter } from '@/src/hooks/useContentFilter';
import { useLists } from '@/src/hooks/useLists';
import { HomeScreenListItem } from '@/src/types/preferences';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface HomeListSectionProps {
  config: HomeScreenListItem;
}

// Map TMDB list IDs to their query functions
const TMDB_QUERY_MAP: Record<
  string,
  {
    queryKey: string[];
    queryFn: (page: number) => Promise<PaginatedResponse<Movie | TVShow>>;
    mediaType: 'movie' | 'tv';
  }
> = {
  'trending-movies': {
    queryKey: ['trending', 'movies', 'week'],
    queryFn: (page) => tmdbApi.getTrendingMovies('week', page),
    mediaType: 'movie',
  },
  'trending-tv': {
    queryKey: ['trending', 'tv', 'week'],
    queryFn: (page) => tmdbApi.getTrendingTV('week', page),
    mediaType: 'tv',
  },
  'popular-movies': {
    queryKey: ['popular', 'movies'],
    queryFn: (page) => tmdbApi.getPopularMovies(page),
    mediaType: 'movie',
  },
  'top-rated-movies': {
    queryKey: ['topRated', 'movies'],
    queryFn: (page) => tmdbApi.getTopRatedMovies(page),
    mediaType: 'movie',
  },
  'upcoming-movies': {
    queryKey: ['upcoming', 'movies'],
    queryFn: (page) => tmdbApi.getUpcomingMovies(page),
    mediaType: 'movie',
  },
  'upcoming-tv': {
    queryKey: ['upcoming', 'tv'],
    queryFn: (page) => tmdbApi.getUpcomingTVShows(page),
    mediaType: 'tv',
  },
};

/**
 * TMDB List Section - fetches data from TMDB API with infinite scroll
 */
function TMDBListSection({ id, label }: { id: string; label: string }) {
  const config = TMDB_QUERY_MAP[id];

  const query = useInfiniteQuery({
    queryKey: config?.queryKey ?? [id],
    queryFn: ({ pageParam = 1 }) =>
      config?.queryFn(pageParam) ??
      Promise.resolve({ results: [], page: 1, total_pages: 1, total_results: 0 }),
    getNextPageParam: (lastPage: PaginatedResponse<Movie | TVShow>) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: !!config,
    staleTime: 1000 * 60 * 5, // 5 minutes - fresher content for home screen
  });

  const items = useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((page) => page.results);
  }, [query.data]);

  // Filter out watched content from TMDB lists
  const filteredItems = useContentFilter(items);

  const handleLoadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  };

  if (!config) {
    return null;
  }

  const isTV = config.mediaType === 'tv';

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      {query.isLoading ? (
        <FlashList
          horizontal
          data={[1, 2, 3, 4]}
          renderItem={() => <MovieCardSkeleton />}
          keyExtractor={(item) => item.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          drawDistance={400}
        />
      ) : (
        <FlashList
          horizontal
          data={filteredItems}
          renderItem={({ item }) =>
            isTV ? <TVShowCard show={item as TVShow} /> : <MovieCard movie={item as Movie} />
          }
          keyExtractor={(item) => item.id.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          removeClippedSubviews={true}
          drawDistance={400}
        />
      )}
    </View>
  );
}

/**
 * User List Section - displays items from user's default or custom lists
 */
function UserListSection({ listId, label }: { listId: string; label: string }) {
  const { data: lists, isLoading } = useLists();

  const listData = useMemo(() => {
    if (!lists) return null;
    return lists.find((l) => l.id === listId);
  }, [lists, listId]);

  const items = useMemo(() => {
    if (!listData?.items) return [];
    return Object.values(listData.items).sort((a, b) => b.addedAt - a.addedAt);
  }, [listData]);

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <FlashList
          horizontal
          data={[1, 2, 3, 4]}
          renderItem={() => <MovieCardSkeleton />}
          keyExtractor={(item) => item.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          drawDistance={400}
        />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No items in this list</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <FlashList
        horizontal
        data={items}
        renderItem={({ item }) =>
          item.media_type === 'tv' ? (
            <TVShowCard
              show={{
                id: item.id,
                name: item.name || item.title,
                poster_path: item.poster_path,
                vote_average: item.vote_average,
                vote_count: 0,
                first_air_date: item.first_air_date || item.release_date,
                genre_ids: item.genre_ids || [],
                overview: '',
                popularity: 0,
                backdrop_path: null,
                original_name: item.name || item.title,
                original_language: 'en',
              }}
            />
          ) : (
            <MovieCard
              movie={{
                id: item.id,
                title: item.title,
                poster_path: item.poster_path,
                vote_average: item.vote_average,
                release_date: item.release_date,
                genre_ids: item.genre_ids || [],
                overview: '',
                popularity: 0,
                backdrop_path: null,
                original_title: item.title,
                original_language: 'en',
                adult: false,
                video: false,
                vote_count: 0,
              }}
            />
          )
        }
        keyExtractor={(item) => `${item.media_type}-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews={true}
        drawDistance={400}
      />
    </View>
  );
}

/**
 * Main HomeListSection component - routes to appropriate section based on type
 */
export function HomeListSection({ config }: HomeListSectionProps) {
  const { user } = useAuth();
  const { isPremium } = usePremium();

  // Latest Trailers is premium-only - skip for guests and non-premium users
  // (Top Rated will be added at the end by the Home screen)
  if (config.id === 'latest-trailers') {
    const isGuest = !user;
    const canAccessTrailers = !isGuest && isPremium;

    if (canAccessTrailers) {
      return <LatestTrailersSection label={config.label} />;
    }
    // Return null - Home screen will append Top Rated at the end
    return null;
  }

  if (config.type === 'tmdb') {
    return <TMDBListSection id={config.id} label={config.label} />;
  }

  // Both 'default' and 'custom' types use UserListSection
  return <UserListSection listId={config.id} label={config.label} />;
}

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.m,
    paddingHorizontal: SPACING.l,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
  },
  emptyContainer: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
});

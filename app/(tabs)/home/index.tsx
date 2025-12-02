import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';
import { Movie, PaginatedResponse, tmdbApi, TVShow } from '@/src/api/tmdb';
import { MovieCard } from '@/src/components/cards/MovieCard';
import { TVShowCard } from '@/src/components/cards/TVShowCard';
import { MovieCardSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Performance: Card dimensions for FlashList optimization
const CARD_WIDTH = 140;
const CARD_HEIGHT = CARD_WIDTH * 1.5; // 210px

export default function HomeScreen() {
  const [refreshing, setRefreshing] = React.useState(false);

  const trendingMoviesQuery = useInfiniteQuery({
    queryKey: ['trending', 'movies', 'week'],
    queryFn: ({ pageParam = 1 }) => tmdbApi.getTrendingMovies('week', pageParam),
    getNextPageParam: (lastPage: PaginatedResponse<Movie>) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const trendingTVQuery = useInfiniteQuery({
    queryKey: ['trending', 'tv', 'week'],
    queryFn: ({ pageParam = 1 }) => tmdbApi.getTrendingTV('week', pageParam),
    getNextPageParam: (lastPage: PaginatedResponse<TVShow>) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const popularMoviesQuery = useInfiniteQuery({
    queryKey: ['popular', 'movies'],
    queryFn: ({ pageParam = 1 }) => tmdbApi.getPopularMovies(pageParam),
    getNextPageParam: (lastPage: PaginatedResponse<Movie>) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const topRatedMoviesQuery = useInfiniteQuery({
    queryKey: ['topRated', 'movies'],
    queryFn: ({ pageParam = 1 }) => tmdbApi.getTopRatedMovies(pageParam),
    getNextPageParam: (lastPage: PaginatedResponse<Movie>) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const upcomingMoviesQuery = useInfiniteQuery({
    queryKey: ['upcoming', 'movies'],
    queryFn: ({ pageParam = 1 }) => tmdbApi.getUpcomingMovies(pageParam),
    getNextPageParam: (lastPage: PaginatedResponse<Movie>) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const trendingMovies = React.useMemo(() => {
    if (!trendingMoviesQuery.data?.pages) return [];
    return trendingMoviesQuery.data.pages.flatMap((page) => page.results);
  }, [trendingMoviesQuery.data]);

  const trendingTVShows = React.useMemo(() => {
    if (!trendingTVQuery.data?.pages) return [];
    return trendingTVQuery.data.pages.flatMap((page) => page.results);
  }, [trendingTVQuery.data]);

  const popularMovies = React.useMemo(() => {
    if (!popularMoviesQuery.data?.pages) return [];
    return popularMoviesQuery.data.pages.flatMap((page) => page.results);
  }, [popularMoviesQuery.data]);

  const topRatedMovies = React.useMemo(() => {
    if (!topRatedMoviesQuery.data?.pages) return [];
    return topRatedMoviesQuery.data.pages.flatMap((page) => page.results);
  }, [topRatedMoviesQuery.data]);

  const upcomingMovies = React.useMemo(() => {
    if (!upcomingMoviesQuery.data?.pages) return [];
    return upcomingMoviesQuery.data.pages.flatMap((page) => page.results);
  }, [upcomingMoviesQuery.data]);

  const skeletonList = useMemo(
    () => (
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
    ),
    []
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      trendingMoviesQuery.refetch(),
      trendingTVQuery.refetch(),
      popularMoviesQuery.refetch(),
      topRatedMoviesQuery.refetch(),
      upcomingMoviesQuery.refetch(),
    ]);
    setRefreshing(false);
  }, []);

  const handleMovieLoadMore = (query: typeof trendingMoviesQuery) => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  };

  const handleTVLoadMore = (query: typeof trendingTVQuery) => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ShowSeek</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Trending Movies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trending Movies</Text>
          {trendingMoviesQuery.isLoading ? (
            skeletonList
          ) : (
            <FlashList
              horizontal
              data={trendingMovies}
              renderItem={({ item }) => <MovieCard movie={item} />}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              onEndReached={() => handleMovieLoadMore(trendingMoviesQuery)}
              onEndReachedThreshold={0.5}
              removeClippedSubviews={true}
              drawDistance={400}
            />
          )}
        </View>

        {/* Trending TV Shows */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trending TV Shows</Text>
          {trendingTVQuery.isLoading ? (
            skeletonList
          ) : (
            <FlashList
              horizontal
              data={trendingTVShows}
              renderItem={({ item }) => <TVShowCard show={item} />}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              onEndReached={() => handleTVLoadMore(trendingTVQuery)}
              onEndReachedThreshold={0.5}
              removeClippedSubviews={true}
              drawDistance={400}
            />
          )}
        </View>

        {/* Popular Movies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popular Movies</Text>
          {popularMoviesQuery.isLoading ? (
            skeletonList
          ) : (
            <FlashList
              horizontal
              data={popularMovies}
              renderItem={({ item }) => <MovieCard movie={item} />}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              onEndReached={() => handleMovieLoadMore(popularMoviesQuery)}
              onEndReachedThreshold={0.5}
              removeClippedSubviews={true}
              drawDistance={400}
            />
          )}
        </View>

        {/* Top Rated */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Rated</Text>
          {topRatedMoviesQuery.isLoading ? (
            skeletonList
          ) : (
            <FlashList
              horizontal
              data={topRatedMovies}
              renderItem={({ item }) => <MovieCard movie={item} />}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              onEndReached={() => handleMovieLoadMore(topRatedMoviesQuery)}
              onEndReachedThreshold={0.5}
              removeClippedSubviews={true}
              drawDistance={400}
            />
          )}
        </View>

        {/* Upcoming */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          {upcomingMoviesQuery.isLoading ? (
            skeletonList
          ) : (
            <FlashList
              horizontal
              data={upcomingMovies}
              renderItem={({ item }) => <MovieCard movie={item} />}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              onEndReached={() => handleMovieLoadMore(upcomingMoviesQuery)}
              onEndReachedThreshold={0.5}
              removeClippedSubviews={true}
              drawDistance={400}
            />
          )}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  scrollView: {
    flex: 1,
  },
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
});

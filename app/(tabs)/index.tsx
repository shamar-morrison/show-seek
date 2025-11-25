import React from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZE } from '@/src/constants/theme';
import { tmdbApi, Movie, TVShow } from '@/src/api/tmdb';
import { MovieCard } from '@/src/components/cards/MovieCard';
import { TVShowCard } from '@/src/components/cards/TVShowCard';
import { MovieCardSkeleton } from '@/src/components/ui/LoadingSkeleton';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = React.useState(false);

  const trendingMoviesQuery = useQuery({
    queryKey: ['trending', 'movies', 'week'],
    queryFn: () => tmdbApi.getTrendingMovies('week'),
  });

  const trendingTVQuery = useQuery({
    queryKey: ['trending', 'tv', 'week'],
    queryFn: () => tmdbApi.getTrendingTV('week'),
  });

  const popularMoviesQuery = useQuery({
    queryKey: ['popular', 'movies'],
    queryFn: () => tmdbApi.getPopularMovies(),
  });

  const topRatedMoviesQuery = useQuery({
    queryKey: ['topRated', 'movies'],
    queryFn: () => tmdbApi.getTopRatedMovies(),
  });

  const upcomingMoviesQuery = useQuery({
    queryKey: ['upcoming', 'movies'],
    queryFn: () => tmdbApi.getUpcomingMovies(),
  });

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

  const renderMovieList = (title: string, movies: Movie[] | undefined, isLoading: boolean) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {isLoading ? (
        <FlatList
          horizontal
          data={[1, 2, 3, 4]}
          renderItem={() => <MovieCardSkeleton />}
          keyExtractor={(item) => item.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <FlatList
          horizontal
          data={movies || []}
          renderItem={({ item }) => <MovieCard movie={item} />}
          keyExtractor={(item) => item.id.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );

  const renderTVList = (title: string, shows: TVShow[] | undefined, isLoading: boolean) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {isLoading ? (
        <FlatList
          horizontal
          data={[1, 2, 3, 4]}
          renderItem={() => <MovieCardSkeleton />}
          keyExtractor={(item) => item.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <FlatList
          horizontal
          data={shows || []}
          renderItem={({ item }) => <TVShowCard show={item} />}
          keyExtractor={(item) => item.id.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rork</Text>
        <Text style={styles.headerSubtitle}>Movies & TV Shows</Text>
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
        {renderMovieList(
          'Trending Movies',
          trendingMoviesQuery.data?.results,
          trendingMoviesQuery.isLoading
        )}

        {renderTVList(
          'Trending TV Shows',
          trendingTVQuery.data?.results,
          trendingTVQuery.isLoading
        )}

        {renderMovieList(
          'Popular Movies',
          popularMoviesQuery.data?.results,
          popularMoviesQuery.isLoading
        )}

        {renderMovieList(
          'Top Rated',
          topRatedMoviesQuery.data?.results,
          topRatedMoviesQuery.isLoading
        )}

        {renderMovieList(
          'Upcoming',
          upcomingMoviesQuery.data?.results,
          upcomingMoviesQuery.isLoading
        )}

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
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: 2,
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

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft } from 'lucide-react-native';
import { COLORS, SPACING, FONT_SIZE } from '@/src/constants/theme';
import { tmdbApi, Movie, TVShow, PaginatedResponse } from '@/src/api/tmdb';
import { MovieCard } from '@/src/components/cards/MovieCard';
import { TVShowCard } from '@/src/components/cards/TVShowCard';
import { MovieCardSkeleton } from '@/src/components/ui/LoadingSkeleton';

type CategoryKey = 
  | 'trending-movies' 
  | 'trending-tv' 
  | 'popular-movies' 
  | 'top-rated-movies' 
  | 'upcoming-movies';

const CATEGORY_TITLES: Record<CategoryKey, string> = {
  'trending-movies': 'Trending Movies',
  'trending-tv': 'Trending TV Shows',
  'popular-movies': 'Popular Movies',
  'top-rated-movies': 'Top Rated Movies',
  'upcoming-movies': 'Upcoming Movies',
};

const CATEGORY_API_MAP = {
  'trending-movies': (page: number) => tmdbApi.getTrendingMovies('week', page),
  'trending-tv': (page: number) => tmdbApi.getTrendingTV('week', page),
  'popular-movies': (page: number) => tmdbApi.getPopularMovies(page),
  'top-rated-movies': (page: number) => tmdbApi.getTopRatedMovies(page),
  'upcoming-movies': (page: number) => tmdbApi.getUpcomingMovies(page),
};

export default function CategoryListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const categoryKey = params.type as CategoryKey;
  const mediaType = (params.mediaType || 'movie') as 'movie' | 'tv';

  const title = CATEGORY_TITLES[categoryKey] || 'Category';

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['category', categoryKey],
    queryFn: ({ pageParam = 1 }) => {
      const apiFn = CATEGORY_API_MAP[categoryKey];
      return apiFn(pageParam);
    },
    getNextPageParam: (lastPage: PaginatedResponse<Movie | TVShow>) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const allItems = React.useMemo(() => {
    return data?.pages.flatMap(page => page.results) || [];
  }, [data]);

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const renderItem = ({ item }: { item: Movie | TVShow }) => {
    if (mediaType === 'movie') {
      return <MovieCard movie={item as Movie} />;
    } else {
      return <TVShowCard show={item as TVShow} />;
    }
  };

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.gridContent}>
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <MovieCardSkeleton key={item} />
          ))}
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Failed to load content</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No content available</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView style={styles.header} edges={['top']}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.placeholder} />
      </SafeAreaView>

      {allItems.length > 0 ? (
        <FlashList
          data={allItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        renderEmpty()
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  backButton: {
    padding: SPACING.s,
    marginLeft: -SPACING.s,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.white,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  listContent: {
    paddingHorizontal: SPACING.m,
    paddingTop: SPACING.m,
    paddingBottom: 100,
  },
  gridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SPACING.m,
    gap: SPACING.m,
  },
  footer: {
    paddingVertical: SPACING.l,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    textAlign: 'center',
  },
});

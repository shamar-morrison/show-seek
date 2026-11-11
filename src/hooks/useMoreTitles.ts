/**
 * The titles behind "More like this" and "Recommendations" on movie and TV pages, a page (20) at a
 * time. The detail page shows the first few; See All loads more as you scroll. Both read the same
 * cached pages.
 */
import { tmdbApi, type Movie, type PaginatedResponse, type TVShow } from '@/src/api/tmdb';
import { fetchMoreLikeThisPage, resolveMoreLikeThisPlan } from '@/src/api/moreLikeThis';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

export type MoreTitlesKind = 'similar' | 'recommendations';

/** Relevance falls off past this, so See All stops at about 100 titles. */
export const MAX_MORE_TITLES_PAGES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export const moreTitlesQueryKey = (kind: MoreTitlesKind, mediaType: 'movie' | 'tv', id: number) =>
  [mediaType, id, kind === 'similar' ? 'more-like-this' : 'recommendation-pages'] as const;

export function useMoreTitles(
  kind: MoreTitlesKind,
  mediaType: 'movie' | 'tv',
  id: number,
  { enabled = true }: { enabled?: boolean } = {}
) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: moreTitlesQueryKey(kind, mediaType, id),
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<PaginatedResponse<Movie | TVShow>> => {
      if (kind === 'recommendations') {
        return mediaType === 'movie'
          ? tmdbApi.getRecommendedMovies(id, pageParam)
          : tmdbApi.getRecommendedTV(id, pageParam);
      }
      // The filters are worked out once (it can take a few requests) and reused for every page.
      const plan = await queryClient.fetchQuery({
        queryKey: [mediaType, id, 'more-like-this-plan'],
        queryFn: () => resolveMoreLikeThisPlan(mediaType, id),
        staleTime: DAY_MS,
      });
      return fetchMoreLikeThisPage(mediaType, plan, pageParam);
    },
    getNextPageParam: (lastPage) =>
      lastPage.page < Math.min(lastPage.total_pages, MAX_MORE_TITLES_PAGES)
        ? lastPage.page + 1
        : undefined,
    enabled: enabled && !!id,
    staleTime: DAY_MS,
  });

  // Every loaded page in order, without the title itself (Discover can return it) or repeats.
  const items = useMemo(() => {
    const seen = new Set<number>([id]);
    const all: (Movie | TVShow)[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.results) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        all.push(item);
      }
    }
    return all;
  }, [id, query.data]);

  return { ...query, items };
}

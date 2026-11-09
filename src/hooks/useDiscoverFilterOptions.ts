import { tmdbApi } from '@/src/api/tmdb';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;

/**
 * Languages and streaming services offered by the Discover filters. Shared by the filter sheet
 * and the active filter chips (which need the names), so both read the same cached queries.
 */
export function useDiscoverFilterOptions(mediaType: 'movie' | 'tv') {
  const watchProvidersQuery = useQuery({
    queryKey: ['watchProviders', mediaType],
    queryFn: () => tmdbApi.getWatchProviders(mediaType),
    staleTime: THIRTY_DAYS,
    gcTime: THIRTY_DAYS,
  });

  const languagesQuery = useQuery({
    queryKey: ['languages'],
    queryFn: () => tmdbApi.getLanguages(),
    staleTime: THIRTY_DAYS,
    gcTime: THIRTY_DAYS,
  });

  const watchProviders = useMemo(() => watchProvidersQuery.data ?? [], [watchProvidersQuery.data]);
  const languages = useMemo(() => languagesQuery.data ?? [], [languagesQuery.data]);

  const languageNames = useMemo(
    () => Object.fromEntries(languages.map((l) => [l.iso_639_1, l.english_name])),
    [languages]
  ) as Record<string, string>;

  const providerNames = useMemo(
    () => Object.fromEntries(watchProviders.map((p) => [p.provider_id, p.provider_name])),
    [watchProviders]
  ) as Record<number, string>;

  return {
    languages,
    watchProviders,
    isLoadingWatchProviders: watchProvidersQuery.isLoading,
    languageNames,
    providerNames,
  };
}

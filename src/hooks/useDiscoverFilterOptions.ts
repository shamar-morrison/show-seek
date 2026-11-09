import { tmdbApi, type WatchProvider } from '@/src/api/tmdb';
import type { MultiSelectOption, SelectOption } from '@/src/components/filters';
import { DISCOVER_SORT_OPTIONS } from '@/src/utils/discoverFilters';
import { getRuntimeLabel, getTmdbRatingLabel, getYearOptions } from '@/src/utils/listFilterLabels';
import { RUNTIME_FILTER_VALUES, type RuntimeFilter } from '@/src/utils/listFilters';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
const RATING_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const RUNTIME_VALUES: RuntimeFilter[] = ['any', ...RUNTIME_FILTER_VALUES];

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

/**
 * The option lists for every Discover filter field, shared by the filter sheet and the pickers
 * that the active filter chips open, so both always offer the same choices.
 */
export function useDiscoverFieldOptions(
  mediaType: 'movie' | 'tv',
  genreMap: Record<number, string>
) {
  const { t } = useTranslation();
  const { languages, watchProviders, isLoadingWatchProviders } =
    useDiscoverFilterOptions(mediaType);

  return useMemo(() => {
    const sortOptions: SelectOption[] = DISCOVER_SORT_OPTIONS.map((option) => ({
      label: t(option.labelKey),
      value: option.value,
    }));

    const ratingOptions: SelectOption[] = RATING_VALUES.map((value) => ({
      label: getTmdbRatingLabel(t, value),
      value,
    }));

    const runtimeOptions: SelectOption[] = RUNTIME_VALUES.map((value) => ({
      label: getRuntimeLabel(t, value),
      value,
    }));

    const genreOptions: MultiSelectOption[] = Object.entries(genreMap).map(([id, name]) => ({
      label: name,
      value: Number(id),
    }));

    const languageOptions: SelectOption[] = [
      { label: t('discover.anyLanguage'), value: null },
      ...languages.map((l) => ({ label: l.english_name, value: l.iso_639_1 })),
    ];

    const watchProviderOptions: MultiSelectOption[] = watchProviders.map((p: WatchProvider) => ({
      label: p.provider_name,
      value: p.provider_id,
      logoPath: p.logo_path,
    }));

    return {
      sortOptions,
      ratingOptions,
      runtimeOptions,
      yearOptions: getYearOptions(t) as SelectOption[],
      genreOptions,
      languageOptions,
      watchProviderOptions,
      isLoadingWatchProviders,
    };
  }, [genreMap, isLoadingWatchProviders, languages, t, watchProviders]);
}

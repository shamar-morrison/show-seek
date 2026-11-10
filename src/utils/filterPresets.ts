import {
  areDiscoverFiltersEqual,
  DEFAULT_DISCOVER_FILTERS,
  DISCOVER_SORT_OPTIONS,
  hasActiveDiscoverFilters,
  type DiscoverFilterState,
} from '@/src/utils/discoverFilters';
import {
  areWatchStatusFiltersEqual,
  DEFAULT_WATCH_STATUS_FILTERS,
  hasActiveFilters,
  RUNTIME_FILTER_VALUES,
  type MediaTypeFilter,
  type RuntimeFilter,
  type UserRatingFilter,
  type WatchStatusFilterState,
} from '@/src/utils/listFilters';

/** Presets kept per scope; checked in the app because Firestore rules can't count documents. */
export const MAX_FILTER_PRESETS_PER_SCOPE = 25;
export const MAX_PRESET_NAME_LENGTH = 40;

export type FilterPresetScope = 'discover' | 'list';

interface FilterPresetBase {
  id: string;
  name: string;
  createdAt: Date;
  /** When the preset was last applied; presets are listed most recently used first. */
  lastUsedAt?: Date | null;
}

/** A saved Discover search. Movie and TV genre IDs differ, so a preset belongs to one tab. */
export interface DiscoverFilterPreset extends FilterPresetBase {
  scope: 'discover';
  mediaType: 'movie' | 'tv';
  filters: DiscoverFilterState;
}

/** Saved list filters, shared by every library list screen. Sort isn't included. */
export interface ListFilterPreset extends FilterPresetBase {
  scope: 'list';
  filters: WatchStatusFilterState;
}

export type FilterPreset = DiscoverFilterPreset | ListFilterPreset;

/** Which list filters a screen offers, so presets it can't fully apply are left out. */
export interface ListPresetScreenCaps {
  /** The one media type the screen shows, or 'all' when it has the media type filter. */
  mediaType: MediaTypeFilter;
  /** Whether the screen has the Runtime and Your rating filters. */
  showListFilters: boolean;
}

export const FULL_LIST_PRESET_CAPS: ListPresetScreenCaps = {
  mediaType: 'all',
  showListFilters: true,
};

export type PresetNameError = 'empty' | 'tooLong' | 'duplicate';

// --- Normalizing stored data -----------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toIdList = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is number => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
};

const toGenreOperator = (value: unknown): 'and' | 'or' => (value === 'and' ? 'and' : 'or');

const toYear = (value: unknown): number | null =>
  Number.isInteger(value) && (value as number) > 1800 && (value as number) < 3000
    ? (value as number)
    : null;

const toRating = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10 ? value : 0;

const toRuntime = (value: unknown): RuntimeFilter =>
  RUNTIME_FILTER_VALUES.includes(value as Exclude<RuntimeFilter, 'any'>)
    ? (value as RuntimeFilter)
    : 'any';

const toUserRating = (value: unknown): UserRatingFilter => {
  if (value === 'rated' || value === 'unrated') return value;
  if (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 9) {
    return value as number;
  }
  return 'any';
};

const toMediaTypeFilter = (value: unknown): MediaTypeFilter =>
  value === 'movie' || value === 'tv' ? value : 'all';

const DISCOVER_SORT_VALUES: readonly string[] = DISCOVER_SORT_OPTIONS.map((o) => o.value);

/**
 * Discover filters from stored data, filled in from the defaults. Fields added after a preset
 * was saved get their default, and anything invalid is dropped rather than sent to TMDB.
 */
export function normalizeDiscoverPresetFilters(value: unknown): DiscoverFilterState {
  const data = isRecord(value) ? value : {};
  const genres = toIdList(data.genres);
  return {
    sortBy:
      typeof data.sortBy === 'string' && DISCOVER_SORT_VALUES.includes(data.sortBy)
        ? data.sortBy
        : DEFAULT_DISCOVER_FILTERS.sortBy,
    genres,
    genreOperator: genres.length > 0 ? toGenreOperator(data.genreOperator) : 'or',
    year: toYear(data.year),
    rating: toRating(data.rating),
    runtime: toRuntime(data.runtime),
    language: typeof data.language === 'string' && data.language.length > 0 ? data.language : null,
    watchProviders: toIdList(data.watchProviders),
  };
}

/** List filters from stored data, filled in from the defaults. */
export function normalizeListPresetFilters(value: unknown): WatchStatusFilterState {
  const data = isRecord(value) ? value : {};
  const genres = toIdList(data.genres);
  return {
    genres,
    genreOperator: genres.length > 0 ? toGenreOperator(data.genreOperator) : 'or',
    year: toYear(data.year),
    rating: toRating(data.rating),
    mediaType: toMediaTypeFilter(data.mediaType),
    runtime: toRuntime(data.runtime),
    userRating: toUserRating(data.userRating),
  };
}

// --- Names -----------------------------------------------------------------------------------

export function normalizePresetName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Why a name can't be used, or null when it can. Names are unique within a scope, ignoring
 * case; `ignoreId` lets a preset keep its own name when renamed.
 */
export function validatePresetName(
  name: string,
  existing: readonly FilterPreset[],
  ignoreId?: string
): PresetNameError | null {
  const normalized = normalizePresetName(name);
  if (normalized.length === 0) return 'empty';
  if (normalized.length > MAX_PRESET_NAME_LENGTH) return 'tooLong';
  const lower = normalized.toLocaleLowerCase();
  const taken = existing.some(
    (preset) => preset.id !== ignoreId && preset.name.toLocaleLowerCase() === lower
  );
  return taken ? 'duplicate' : null;
}

// --- Discover --------------------------------------------------------------------------------

/** The Discover preset with exactly these filters on this tab, if any. */
export function findMatchingDiscoverPreset(
  presets: readonly DiscoverFilterPreset[],
  mediaType: 'movie' | 'tv',
  filters: DiscoverFilterState
): DiscoverFilterPreset | undefined {
  if (!hasActiveDiscoverFilters(filters)) return undefined;
  return presets.find(
    (preset) => preset.mediaType === mediaType && areDiscoverFiltersEqual(preset.filters, filters)
  );
}

// --- Lists -----------------------------------------------------------------------------------

/**
 * Whether a screen can apply every part of the preset. A Movies preset fits the movie ratings
 * screen, but one that uses Runtime doesn't fit a screen without that filter.
 */
export function isListPresetCompatible(
  preset: ListFilterPreset,
  caps: ListPresetScreenCaps
): boolean {
  const { filters } = preset;
  if (!caps.showListFilters) {
    if (filters.runtime !== DEFAULT_WATCH_STATUS_FILTERS.runtime) return false;
    if (filters.userRating !== DEFAULT_WATCH_STATUS_FILTERS.userRating) return false;
  }
  if (caps.mediaType !== 'all' && filters.mediaType !== 'all') {
    return filters.mediaType === caps.mediaType;
  }
  return true;
}

/** The preset's filters as the screen holds them: single-type screens keep media type at 'all'. */
export function adaptListFiltersForScreen(
  filters: WatchStatusFilterState,
  caps: ListPresetScreenCaps
): WatchStatusFilterState {
  if (caps.mediaType === 'all' || filters.mediaType === 'all') return filters;
  return { ...filters, mediaType: 'all' };
}

/** The compatible list preset whose filters match the screen's current ones, if any. */
export function findMatchingListPreset(
  presets: readonly ListFilterPreset[],
  filters: WatchStatusFilterState,
  caps: ListPresetScreenCaps
): ListFilterPreset | undefined {
  if (!hasActiveFilters(filters)) return undefined;
  const current = adaptListFiltersForScreen(filters, caps);
  return presets.find(
    (preset) =>
      isListPresetCompatible(preset, caps) &&
      areWatchStatusFiltersEqual(adaptListFiltersForScreen(preset.filters, caps), current)
  );
}

/** Splits the list presets into those a screen can apply and a count of the rest. */
export function partitionListPresets(
  presets: readonly ListFilterPreset[],
  caps: ListPresetScreenCaps
): { compatible: ListFilterPreset[]; hiddenCount: number } {
  const compatible = presets.filter((preset) => isListPresetCompatible(preset, caps));
  return { compatible, hiddenCount: presets.length - compatible.length };
}

// --- Saving ----------------------------------------------------------------------------------

export type SavePresetBlocker = 'noFilters' | 'duplicateFilters' | 'limitReached';

/**
 * Why the given Discover filters can't be saved as a new preset, or null when they can.
 * `ignoreId` skips one preset, for "Update with current filters".
 */
export function getDiscoverSaveBlocker(
  presets: readonly DiscoverFilterPreset[],
  mediaType: 'movie' | 'tv',
  filters: DiscoverFilterState,
  ignoreId?: string
): SavePresetBlocker | null {
  if (!hasActiveDiscoverFilters(filters)) return 'noFilters';
  const others = presets.filter((preset) => preset.id !== ignoreId);
  const duplicate = others.some(
    (preset) => preset.mediaType === mediaType && areDiscoverFiltersEqual(preset.filters, filters)
  );
  if (duplicate) return 'duplicateFilters';
  if (!ignoreId && presets.length >= MAX_FILTER_PRESETS_PER_SCOPE) return 'limitReached';
  return null;
}

/** Why the given list filters can't be saved as a new preset, or null when they can. */
export function getListSaveBlocker(
  presets: readonly ListFilterPreset[],
  filters: WatchStatusFilterState,
  ignoreId?: string
): SavePresetBlocker | null {
  if (!hasActiveFilters(filters)) return 'noFilters';
  const others = presets.filter((preset) => preset.id !== ignoreId);
  if (others.some((preset) => areWatchStatusFiltersEqual(preset.filters, filters))) {
    return 'duplicateFilters';
  }
  if (!ignoreId && presets.length >= MAX_FILTER_PRESETS_PER_SCOPE) return 'limitReached';
  return null;
}

const lastActivity = (preset: FilterPreset) =>
  Math.max(preset.createdAt.getTime(), preset.lastUsedAt?.getTime() ?? 0);

/**
 * Most recently used or saved first, so presets people reach for stay at the front of the row.
 */
export function sortPresets<T extends FilterPreset>(presets: readonly T[]): T[] {
  return [...presets].sort((a, b) => lastActivity(b) - lastActivity(a));
}

/** A preset's filters in one line, e.g. "Horror · 7+ stars · Netflix". */
export function joinPresetSummary(parts: readonly string[]): string {
  return parts.join(' · ');
}

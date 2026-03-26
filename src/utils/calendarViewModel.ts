import type { UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
import { toLocalDateKey } from '@/src/utils/dateUtils';

const DAY_MS = 24 * 60 * 60 * 1000;

export const CALENDAR_SOURCE_FILTERS = [
  'watchlist',
  'favorites',
  'currently-watching',
  'reminders',
] as const;

export type CalendarSourceFilter = (typeof CALENDAR_SOURCE_FILTERS)[number];
export type CalendarMediaFilter = 'all' | 'movie' | 'tv';
export type CalendarSortMode = 'soonest' | 'alphabetical' | 'type';

export interface CalendarLabels {
  today: string;
  tomorrow: string;
  thisWeek: string;
  nextWeek: string;
  movies: string;
  tvShows: string;
}

export interface CalendarTemporalTab {
  key: string;
  label: string;
  kind: 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'month';
}

export interface CalendarSingleDisplayItem {
  type: 'single';
  key: string;
  release: UpcomingRelease;
  releaseDate: Date;
}

export interface CalendarGroupedDisplayItem {
  type: 'group';
  key: string;
  showId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: Date;
  episodes: UpcomingRelease[];
  isReminder: boolean;
  sourceFilters: CalendarSourceFilter[];
}

export type CalendarDisplayItem = CalendarSingleDisplayItem | CalendarGroupedDisplayItem;

export interface CalendarSectionHeaderRow {
  type: 'section-header';
  key: string;
  title: string;
  sectionKind: 'month' | 'media-type';
}

export interface CalendarSingleReleaseRow {
  type: 'single-release';
  key: string;
  item: CalendarSingleDisplayItem;
}

export interface CalendarGroupedReleaseRow {
  type: 'grouped-release';
  key: string;
  item: CalendarGroupedDisplayItem;
}

export type CalendarRow =
  | CalendarSectionHeaderRow
  | CalendarSingleReleaseRow
  | CalendarGroupedReleaseRow;

export interface CalendarPresentation {
  rows: CalendarRow[];
  temporalTabs: CalendarTemporalTab[];
  temporalTabAnchors: Record<string, number>;
  totalContentCount: number;
  visibleContentCount: number;
}

export type CalendarPresentationMap = Record<CalendarMediaFilter, CalendarPresentation>;

interface CalendarPresentationOptions {
  releases: UpcomingRelease[];
  sortMode: CalendarSortMode;
  labels: CalendarLabels;
  locale?: string;
  previewLimit?: number;
  referenceDate?: Date;
}

interface CalendarEntry {
  sectionKey?: string;
  sectionTitle?: string;
  sectionKind?: 'month' | 'media-type';
  item: CalendarDisplayItem;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getCalendarDayOffset(date: Date, referenceDate: Date = new Date()): number {
  return Math.round(
    (startOfLocalDay(date).getTime() - startOfLocalDay(referenceDate).getTime()) / DAY_MS
  );
}

export function getCalendarReleaseSources(release: UpcomingRelease): CalendarSourceFilter[] {
  const sources = new Set<CalendarSourceFilter>();

  release.sourceLists.forEach((source) => {
    if (CALENDAR_SOURCE_FILTERS.includes(source as CalendarSourceFilter)) {
      sources.add(source as CalendarSourceFilter);
    }
  });

  if (release.isReminder) {
    sources.add('reminders');
  }

  return Array.from(sources);
}

export function filterUpcomingReleases(
  releases: UpcomingRelease[],
  {
    mediaFilter,
    selectedSources,
  }: {
    mediaFilter: CalendarMediaFilter;
    selectedSources: CalendarSourceFilter[];
  }
): UpcomingRelease[] {
  const selectedSourceSet = new Set(selectedSources);

  return releases.filter((release) => {
    if (mediaFilter !== 'all' && release.mediaType !== mediaFilter) {
      return false;
    }

    const releaseSources = getCalendarReleaseSources(release);
    return releaseSources.some((source) => selectedSourceSet.has(source));
  });
}

export function buildCalendarPresentation({
  releases,
  sortMode,
  labels,
  locale,
  previewLimit,
  referenceDate = new Date(),
}: CalendarPresentationOptions): CalendarPresentation {
  const entries = buildCalendarEntries({
    releases,
    sortMode,
    labels,
    locale,
  });
  const totalContentCount = entries.length;
  const visibleEntries =
    previewLimit === undefined ? entries : entries.slice(0, Math.max(previewLimit, 0));
  const { rows, entryRows } = buildRows({
    entries: visibleEntries,
  });
  const { temporalTabs, temporalTabAnchors } = buildTemporalTabs({
    sortMode,
    entryRows,
    labels,
    locale,
    referenceDate,
  });

  return {
    rows,
    temporalTabs,
    temporalTabAnchors,
    totalContentCount,
    visibleContentCount: visibleEntries.length,
  };
}

export function buildCalendarPresentations({
  releases,
  sortMode,
  labels,
  locale,
  previewLimit,
  referenceDate = new Date(),
}: CalendarPresentationOptions): CalendarPresentationMap {
  const releasesByMedia: Record<CalendarMediaFilter, UpcomingRelease[]> = {
    all: releases,
    movie: [],
    tv: [],
  };

  releases.forEach((release) => {
    releasesByMedia[release.mediaType].push(release);
  });

  const createPresentation = (mediaFilter: CalendarMediaFilter) =>
    buildCalendarPresentation({
      releases: releasesByMedia[mediaFilter],
      sortMode,
      labels,
      locale,
      previewLimit,
      referenceDate,
    });

  return {
    all: createPresentation('all'),
    movie: createPresentation('movie'),
    tv: createPresentation('tv'),
  };
}

function buildCalendarEntries({
  releases,
  sortMode,
  labels,
  locale,
}: {
  releases: UpcomingRelease[];
  sortMode: CalendarSortMode;
  labels: CalendarLabels;
  locale?: string;
}): CalendarEntry[] {
  if (sortMode === 'alphabetical') {
    const collator = new Intl.Collator(locale, { sensitivity: 'base' });
    return buildGroupedItems(releases, (release) => `tv-${release.id}`)
      .sort((left, right) => collator.compare(getDisplayTitle(left), getDisplayTitle(right)))
      .map((item) => ({ item }));
  }

  if (sortMode === 'type') {
    const movieItems = releases
      .filter((release) => release.mediaType === 'movie')
      .sort(compareReleasesByDate)
      .map((release) => createSingleDisplayItem(release));
    const tvItems = buildGroupedItems(
      releases.filter((release) => release.mediaType === 'tv'),
      (release) => `tv-${release.id}`
    ).sort(compareDisplayItemsByDate);

    return [
      ...movieItems.map((item) => ({
        sectionKey: 'movies',
        sectionTitle: labels.movies,
        sectionKind: 'media-type' as const,
        item,
      })),
      ...tvItems.map((item) => ({
        sectionKey: 'tv-shows',
        sectionTitle: labels.tvShows,
        sectionKind: 'media-type' as const,
        item,
      })),
    ];
  }

  const monthMap = new Map<
    string,
    {
      title: string;
      releases: UpcomingRelease[];
    }
  >();

  [...releases].sort(compareReleasesByDate).forEach((release) => {
    const monthKey = getMonthKey(release.releaseDate);
    const existing = monthMap.get(monthKey);

    if (existing) {
      existing.releases.push(release);
      return;
    }

    monthMap.set(monthKey, {
      title: formatMonthYear(release.releaseDate, locale),
      releases: [release],
    });
  });

  const entries: CalendarEntry[] = [];

  monthMap.forEach(({ title, releases: monthReleases }, monthKey) => {
    buildGroupedItems(monthReleases, (release) => `tv-${release.id}-${monthKey}`).forEach((item) => {
      entries.push({
        sectionKey: monthKey,
        sectionTitle: title,
        sectionKind: 'month',
        item,
      });
    });
  });

  return entries;
}

function buildGroupedItems(
  releases: UpcomingRelease[],
  scopeKeyForTV: (release: UpcomingRelease) => string
): CalendarDisplayItem[] {
  const buckets = new Map<
    string,
    {
      firstIndex: number;
      releases: UpcomingRelease[];
    }
  >();

  [...releases].sort(compareReleasesByDate).forEach((release, index) => {
    const bucketKey = release.mediaType === 'tv' ? scopeKeyForTV(release) : release.uniqueKey;
    const existing = buckets.get(bucketKey);

    if (existing) {
      existing.releases.push(release);
      return;
    }

    buckets.set(bucketKey, {
      firstIndex: index,
      releases: [release],
    });
  });

  return Array.from(buckets.entries())
    .sort((left, right) => left[1].firstIndex - right[1].firstIndex)
    .map(([bucketKey, bucket]) => createDisplayItem(bucketKey, bucket.releases));
}

function createDisplayItem(bucketKey: string, releases: UpcomingRelease[]): CalendarDisplayItem {
  const orderedReleases = [...releases].sort(compareReleasesByDate);
  const firstRelease = orderedReleases[0];

  if (firstRelease.mediaType === 'tv' && orderedReleases.length > 1) {
    const sourceFilters = new Set<CalendarSourceFilter>();

    orderedReleases.forEach((release) => {
      getCalendarReleaseSources(release).forEach((source) => sourceFilters.add(source));
    });

    return {
      type: 'group',
      key: bucketKey,
      showId: firstRelease.id,
      title: firstRelease.title,
      posterPath: firstRelease.posterPath,
      backdropPath: firstRelease.backdropPath,
      releaseDate: firstRelease.releaseDate,
      episodes: orderedReleases,
      isReminder: orderedReleases.some((release) => release.isReminder),
      sourceFilters: Array.from(sourceFilters),
    };
  }

  return createSingleDisplayItem(firstRelease);
}

function createSingleDisplayItem(release: UpcomingRelease): CalendarSingleDisplayItem {
  return {
    type: 'single',
    key: release.uniqueKey,
    release,
    releaseDate: release.releaseDate,
  };
}

function buildRows({
  entries,
}: {
  entries: CalendarEntry[];
}): {
  rows: CalendarRow[];
  entryRows: Array<{ item: CalendarDisplayItem; rowIndex: number }>;
} {
  const rows: CalendarRow[] = [];
  const entryRows: Array<{ item: CalendarDisplayItem; rowIndex: number }> = [];

  let currentSectionKey: string | undefined;

  entries.forEach((entry) => {
    if (entry.sectionKey && entry.sectionKey !== currentSectionKey) {
      rows.push({
        type: 'section-header',
        key: `section-${entry.sectionKey}`,
        title: entry.sectionTitle ?? '',
        sectionKind: entry.sectionKind ?? 'month',
      });
      currentSectionKey = entry.sectionKey;
    }

    rows.push(
      entry.item.type === 'single'
        ? {
            type: 'single-release',
            key: entry.item.key,
            item: entry.item,
          }
        : {
            type: 'grouped-release',
            key: entry.item.key,
            item: entry.item,
          }
    );

    entryRows.push({
      item: entry.item,
      rowIndex: rows.length - 1,
    });
  });

  return {
    rows,
    entryRows,
  };
}

function buildTemporalTabs({
  sortMode,
  entryRows,
  labels,
  locale,
  referenceDate,
}: {
  sortMode: CalendarSortMode;
  entryRows: Array<{ item: CalendarDisplayItem; rowIndex: number }>;
  labels: CalendarLabels;
  locale?: string;
  referenceDate: Date;
}): Pick<CalendarPresentation, 'temporalTabs' | 'temporalTabAnchors'> {
  if (sortMode !== 'soonest') {
    return {
      temporalTabs: [],
      temporalTabAnchors: {},
    };
  }

  const temporalTabs: CalendarTemporalTab[] = [];
  const temporalTabAnchors: Record<string, number> = {};
  const registeredTabs = new Set<string>();

  entryRows.forEach(({ item, rowIndex }) => {
    const seenDateKeys = new Set<string>();

    getItemDates(item).forEach((date) => {
      const dateKey = toLocalDateKey(date);
      if (seenDateKeys.has(dateKey)) {
        return;
      }
      seenDateKeys.add(dateKey);

      const dayOffset = getCalendarDayOffset(date, referenceDate);

      if (dayOffset === 0) {
        registerTemporalTab({
          key: 'today',
          label: labels.today,
          kind: 'today',
          rowIndex,
          temporalTabs,
          temporalTabAnchors,
          registeredTabs,
        });
        return;
      }

      if (dayOffset === 1) {
        registerTemporalTab({
          key: 'tomorrow',
          label: labels.tomorrow,
          kind: 'tomorrow',
          rowIndex,
          temporalTabs,
          temporalTabAnchors,
          registeredTabs,
        });
        return;
      }

      if (dayOffset >= 2 && dayOffset <= 7) {
        registerTemporalTab({
          key: 'this-week',
          label: labels.thisWeek,
          kind: 'this-week',
          rowIndex,
          temporalTabs,
          temporalTabAnchors,
          registeredTabs,
        });
        return;
      }

      if (dayOffset >= 8 && dayOffset <= 14) {
        registerTemporalTab({
          key: 'next-week',
          label: labels.nextWeek,
          kind: 'next-week',
          rowIndex,
          temporalTabs,
          temporalTabAnchors,
          registeredTabs,
        });
        return;
      }

      if (dayOffset > 14) {
        const monthKey = getMonthKey(date);
        registerTemporalTab({
          key: `month-${monthKey}`,
          label: formatMonthYear(date, locale),
          kind: 'month',
          rowIndex,
          temporalTabs,
          temporalTabAnchors,
          registeredTabs,
        });
      }
    });
  });

  return {
    temporalTabs,
    temporalTabAnchors,
  };
}

function registerTemporalTab({
  key,
  label,
  kind,
  rowIndex,
  temporalTabs,
  temporalTabAnchors,
  registeredTabs,
}: {
  key: string;
  label: string;
  kind: CalendarTemporalTab['kind'];
  rowIndex: number;
  temporalTabs: CalendarTemporalTab[];
  temporalTabAnchors: Record<string, number>;
  registeredTabs: Set<string>;
}) {
  if (registeredTabs.has(key)) {
    return;
  }

  temporalTabs.push({
    key,
    label,
    kind,
  });
  temporalTabAnchors[key] = rowIndex;
  registeredTabs.add(key);
}

function compareReleasesByDate(left: UpcomingRelease, right: UpcomingRelease): number {
  const timeDifference = left.releaseDate.getTime() - right.releaseDate.getTime();
  if (timeDifference !== 0) {
    return timeDifference;
  }

  return left.title.localeCompare(right.title);
}

function compareDisplayItemsByDate(left: CalendarDisplayItem, right: CalendarDisplayItem): number {
  const timeDifference = left.releaseDate.getTime() - right.releaseDate.getTime();
  if (timeDifference !== 0) {
    return timeDifference;
  }

  return getDisplayTitle(left).localeCompare(getDisplayTitle(right));
}

function getDisplayTitle(item: CalendarDisplayItem): string {
  return item.type === 'single' ? item.release.title : item.title;
}

function getItemDates(item: CalendarDisplayItem): Date[] {
  if (item.type === 'single') {
    return [item.release.releaseDate];
  }

  return item.episodes.map((episode) => episode.releaseDate);
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthYear(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

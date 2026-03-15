const GROUP_SEGMENT_PATTERN = /^\(.+\)$/;

const DEFAULT_LIST_KINDS = [
  'watchlist',
  'currently-watching',
  'already-watched',
  'favorites',
  'dropped',
] as const;

export type AnalyticsLoginMethod = 'google' | 'email' | 'guest';
export type AnalyticsListKind = (typeof DEFAULT_LIST_KINDS)[number] | 'custom';
export type AnalyticsMediaType = 'movie' | 'tv' | 'episode';
export type AnalyticsReminderTiming = 'on_release_day' | '1_day_before' | '1_week_before';
export type AnalyticsTVFrequency = 'every_episode' | 'season_premiere';

export interface TrackAddToListParams {
  listKind: AnalyticsListKind;
  mediaType: Extract<AnalyticsMediaType, 'movie' | 'tv'>;
}

export interface TrackSaveRatingParams {
  mediaType: Extract<AnalyticsMediaType, 'movie' | 'tv'>;
  rating: number;
}

export interface TrackCreateReminderParams {
  mediaType: Extract<AnalyticsMediaType, 'movie' | 'tv'>;
  reminderTiming: AnalyticsReminderTiming;
  tvFrequency?: AnalyticsTVFrequency;
}

export const normalizeListKind = (listId: string): AnalyticsListKind => {
  return DEFAULT_LIST_KINDS.includes(listId as (typeof DEFAULT_LIST_KINDS)[number])
    ? (listId as (typeof DEFAULT_LIST_KINDS)[number])
    : 'custom';
};

export const getAnalyticsScreenName = (segments: readonly string[]): string | null => {
  const visibleSegments = segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => segment !== 'index')
    .filter((segment) => !GROUP_SEGMENT_PATTERN.test(segment));

  return visibleSegments.length > 0 ? visibleSegments.join('/') : null;
};

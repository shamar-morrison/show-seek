import i18n from '../i18n';
import type { TVShowEpisodeTracking, WatchedEpisode } from '../types/episodeTracking';

const EPISODE_KEY_PATTERN = /^(\d+)_(\d+)$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
};

const toMillis = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const parsedDate = Date.parse(value);
    return Number.isNaN(parsedDate) ? null : parsedDate;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  ) {
    const parsed = value.toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : null;
  }

  return null;
};

const getStringOrNull = (value: unknown): string | null => {
  return typeof value === 'string' ? value : null;
};

const getNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseEpisodeKey = (episodeKey: string): { seasonNumber: number; episodeNumber: number } | null => {
  const match = EPISODE_KEY_PATTERN.exec(episodeKey);
  if (!match) {
    return null;
  }

  return {
    seasonNumber: Number(match[1]),
    episodeNumber: Number(match[2]),
  };
};

const buildEpisodeNameFallback = (episodeNumber: number): string =>
  i18n.t('media.episodeNumber', { number: episodeNumber });

export function normalizeEpisodeTrackingDoc(
  raw: unknown,
  docId: string
): TVShowEpisodeTracking | null {
  if (!isRecord(raw)) {
    return null;
  }

  const docData = raw as Record<string, unknown>;
  const rawEpisodes = isRecord(docData.episodes) ? (docData.episodes as Record<string, unknown>) : {};
  const rawMetadata = isRecord(docData.metadata) ? (docData.metadata as Record<string, unknown>) : {};
  const fallbackTvShowId = toInteger(docId);

  const episodes: Record<string, WatchedEpisode> = {};
  let latestWatchedAt = 0;

  Object.entries(rawEpisodes).forEach(([episodeKey, rawEpisode]) => {
    if (!isRecord(rawEpisode)) {
      return;
    }

    const parsedKey = parseEpisodeKey(episodeKey);
    if (!parsedKey) {
      return;
    }

    const tvShowId = toInteger(rawEpisode.tvShowId) ?? fallbackTvShowId;
    const seasonNumber = toInteger(rawEpisode.seasonNumber) ?? parsedKey.seasonNumber;
    const episodeNumber = toInteger(rawEpisode.episodeNumber) ?? parsedKey.episodeNumber;

    if (
      tvShowId === null ||
      tvShowId <= 0 ||
      seasonNumber === null ||
      seasonNumber < 0 ||
      episodeNumber === null ||
      episodeNumber <= 0
    ) {
      return;
    }

    const watchedAt = toMillis(rawEpisode.watchedAt) ?? 0;
    latestWatchedAt = Math.max(latestWatchedAt, watchedAt);
    const normalizedEpisodeKey = `${seasonNumber}_${episodeNumber}`;

    episodes[normalizedEpisodeKey] = {
      episodeId: toInteger(rawEpisode.episodeId) ?? 0,
      tvShowId,
      seasonNumber,
      episodeNumber,
      watchedAt,
      episodeName:
        getNonEmptyString(rawEpisode.episodeName) ?? buildEpisodeNameFallback(episodeNumber),
      episodeAirDate: getStringOrNull(rawEpisode.episodeAirDate),
    };
  });

  return {
    episodes,
    metadata: {
      tvShowName: getNonEmptyString(rawMetadata.tvShowName) ?? i18n.t('media.unknownShow'),
      posterPath: getStringOrNull(rawMetadata.posterPath),
      lastUpdated: toMillis(rawMetadata.lastUpdated) ?? latestWatchedAt,
    },
  };
}

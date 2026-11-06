import type { TFunction } from 'i18next';

import { ShareCardData } from './shareCardTypes';

/** What a card says, independent of how each size lays it out. */
export interface ShareCardContent {
  /** Small capitalized line above the headline. */
  eyebrow?: string;
  headline: string;
  meta: string;
  /** 0 when the user has not rated it. */
  userRating: number;
  progress?: { current: number; total: number };
}

function formatRuntime(minutes: number, t: TFunction): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return t('mediaDetails.runtimeMinutes', { count: remainder });
  if (remainder === 0) return t('mediaDetails.runtimeHours', { count: hours });
  return t('mediaDetails.runtimeHoursMinutes', { hours, minutes: remainder });
}

export function getShareCardContent(data: ShareCardData, t: TFunction): ShareCardContent {
  if (data.kind === 'episode') {
    const episodeNumber = t('shareCard.episodeNumber', {
      season: String(data.seasonNumber).padStart(2, '0'),
      episode: data.episodeNumber,
    });

    return {
      eyebrow: data.showTitle,
      headline: data.episodeTitle,
      meta: data.runtimeMinutes
        ? `${episodeNumber} · ${formatRuntime(data.runtimeMinutes, t)}`
        : episodeNumber,
      userRating: data.userRating,
    };
  }

  if (data.kind === 'progress') {
    return {
      eyebrow: data.showTitle,
      headline: data.seasonTitle,
      meta: data.seasonYear,
      userRating: data.userRating,
      progress: { current: data.watchedCount, total: data.totalCount },
    };
  }

  if (data.kind === 'list') {
    return {
      headline: data.listName,
      meta: `${data.itemCount} ${t('common.item', { count: data.itemCount })}`,
      userRating: 0,
    };
  }

  return {
    headline: data.title,
    meta: [data.releaseYear, data.genres.slice(0, 2).join(', ')].filter(Boolean).join(' • '),
    userRating: data.userRating,
  };
}

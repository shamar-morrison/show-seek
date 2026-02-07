/**
 * Trakt API Client for public data (Reviews)
 */

import axios from 'axios';

import { TRAKT_CONFIG } from '@/src/config/trakt';
import type { TraktReview, TraktSearchResult } from '@/src/types/trakt';

const TRAKT_BASE_URL = 'https://api.trakt.tv';

const traktClient = axios.create({
  baseURL: TRAKT_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': TRAKT_CONFIG.CLIENT_ID,
  },
});

/**
 * Look up the Trakt ID from a TMDB ID
 */
export async function getTraktId(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<number | null> {
  try {
    const type = mediaType === 'tv' ? 'show' : 'movie';
    const response = await traktClient.get<TraktSearchResult[]>(`/search/tmdb/${tmdbId}`, {
      params: { type },
    });

    if (response.data.length === 0) {
      return null;
    }

    const result = response.data[0];
    if (type === 'movie' && result.movie) {
      return result.movie.ids.trakt;
    } else if (type === 'show' && result.show) {
      return result.show.ids.trakt;
    }

    return null;
  } catch (error) {
    console.error('[Trakt API] Failed to lookup Trakt ID:', error);
    return null;
  }
}

/**
 * Look up the Trakt slug from a TMDB ID
 */
export async function getTraktSlugByTmdbId(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<string | null> {
  try {
    const type = mediaType === 'tv' ? 'show' : 'movie';
    const response = await traktClient.get<TraktSearchResult[]>(`/search/tmdb/${tmdbId}`, {
      params: { type },
    });

    if (response.data.length === 0) {
      return null;
    }

    const result = response.data[0];
    if (type === 'movie' && result.movie) {
      return result.movie.ids.slug;
    } else if (type === 'show' && result.show) {
      return result.show.ids.slug;
    }

    return null;
  } catch (error) {
    console.error('[Trakt API] Failed to lookup Trakt slug:', error);
    return null;
  }
}

/**
 * Fetch reviews for a movie or show from Trakt
 */
export async function getTraktReviews(
  traktId: number,
  mediaType: 'movie' | 'tv',
  options: { page?: number; limit?: number } = {}
): Promise<TraktReview[]> {
  const { page = 1, limit = 10 } = options;
  const endpoint = mediaType === 'tv' ? 'shows' : 'movies';

  try {
    const response = await traktClient.get<TraktReview[]>(`/${endpoint}/${traktId}/comments`, {
      params: {
        sort: 'likes',
        page,
        limit,
      },
    });

    // Filter to only include reviews (comments with a rating)
    // Trakt doesn't have a separate reviews endpoint, comments with ratings are reviews
    return response.data;
  } catch (error) {
    console.error('[Trakt API] Failed to fetch reviews:', error);
    return [];
  }
}

/**
 * Fetch reviews by TMDB ID (combines ID lookup + review fetch)
 */
export async function getTraktReviewsByTmdbId(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<TraktReview[]> {
  const traktId = await getTraktId(tmdbId, mediaType);
  if (!traktId) {
    return [];
  }
  return getTraktReviews(traktId, mediaType);
}

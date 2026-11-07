import { createRequestPool } from '@/src/utils/requestPool';

/**
 * One pool for every bulk TMDB lookup (Where to Watch, Release Calendar, ...).
 *
 * TMDB caps clients at roughly 40 requests/second per IP, so screens share one
 * budget rather than each running its own pool. Other one-off TMDB calls aren't
 * counted here; if TMDB still answers 429, requests back off and retry.
 */
const tmdbBulkPool = createRequestPool({ maxConcurrent: 12, maxPerSecond: 30 });

const RATE_LIMIT_BACKOFF_MS = 2000;
const MAX_RATE_LIMIT_RETRIES = 3;

const isRateLimitError = (error: unknown) => (error as { status?: unknown })?.status === 429;

/**
 * Runs a TMDB request through the shared bulk pool, retrying on 429.
 * If `signal` aborts before the request starts, it is dropped without using a slot.
 */
export async function enqueueTmdbBulkRequest<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await tmdbBulkPool.enqueue(fn, signal);
    } catch (error) {
      if (isRateLimitError(error) && attempt < MAX_RATE_LIMIT_RETRIES) {
        tmdbBulkPool.pause(RATE_LIMIT_BACKOFF_MS * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
}

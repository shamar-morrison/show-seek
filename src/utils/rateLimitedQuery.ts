/**
 * Rate-limited query utilities for TMDB API calls.
 * Prevents hitting the 40 requests/second rate limit.
 */

// Simple delay helper
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Global request queue state
let queuedRequests: Array<{
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}> = [];
let isProcessing = false;

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 300; // 300ms between batches = ~33 req/sec max

/**
 * Process queued requests in batches with delays
 */
async function processQueue() {
  if (isProcessing || queuedRequests.length === 0) return;

  isProcessing = true;

  while (queuedRequests.length > 0) {
    // Take a batch of requests
    const batch = queuedRequests.splice(0, BATCH_SIZE);

    // Execute all requests in the batch concurrently
    await Promise.all(
      batch.map(async ({ fn, resolve, reject }) => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      })
    );

    // Delay before next batch if there are more requests
    if (queuedRequests.length > 0) {
      await delay(BATCH_DELAY_MS);
    }
  }

  isProcessing = false;
}

/**
 * Enqueue a request to be processed with rate limiting.
 * Requests are batched and executed with delays to stay under TMDB limits.
 */
export function enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    queuedRequests.push({
      fn: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    // Start processing if not already running
    processQueue();
  });
}

/**
 * Create a rate-limited version of a query function.
 * Use this as a wrapper for TMDB API calls in React Query.
 *
 * @example
 * const seasonQueries = useQueries({
 *   queries: seasons.map(({ showId, seasonNum }) => ({
 *     queryKey: ['season', showId, seasonNum],
 *     queryFn: createRateLimitedQueryFn(
 *       () => tmdbApi.getSeasonDetails(showId, seasonNum)
 *     ),
 *   }))
 * });
 */
export function createRateLimitedQueryFn<T>(fn: () => Promise<T>): () => Promise<T> {
  return () => enqueueRequest(fn);
}

/**
 * Clear the request queue. Useful for cleanup or cancellation.
 * Rejects all pending promises with an error to prevent callers from hanging.
 */
export function clearRequestQueue() {
  const pendingRequests = queuedRequests;
  queuedRequests = [];

  // Reject all pending promises so callers don't hang
  pendingRequests.forEach(({ reject }) => {
    reject(new Error('Request queue cleared'));
  });
}

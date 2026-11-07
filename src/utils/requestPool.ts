/**
 * A request pool that keeps a steady flow of requests going, capped by both
 * concurrency and a sliding one-second rate window.
 *
 * Unlike the batch-then-sleep queue in `rateLimitedQuery`, a slot frees up the
 * moment any request finishes, so throughput stays close to `maxPerSecond`
 * instead of being bounded by the slowest request in each batch.
 */

export class RequestAbortedError extends Error {
  constructor() {
    super('Request aborted');
    this.name = 'RequestAbortedError';
  }
}

interface PoolTask {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
}

export interface RequestPoolOptions {
  /** Maximum number of requests in flight at once. */
  maxConcurrent: number;
  /** Maximum number of requests started in any one-second window. */
  maxPerSecond: number;
}

export interface RequestPool {
  /**
   * Queue a request. If `signal` aborts before the request starts, it is dropped
   * without using a rate slot and the promise rejects with RequestAbortedError.
   */
  enqueue: <T>(fn: () => Promise<T>, signal?: AbortSignal) => Promise<T>;
  /** Stop starting new requests for `ms` (e.g. after a 429). */
  pause: (ms: number) => void;
}

const RATE_WINDOW_MS = 1000;

// Monotonic, so wall-clock changes can't stall or burst the rate window.
const monotonicNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export function createRequestPool({ maxConcurrent, maxPerSecond }: RequestPoolOptions): RequestPool {
  let queue: PoolTask[] = [];
  const startTimes: number[] = [];
  const watchedSignals = new WeakSet<AbortSignal>();
  let inFlight = 0;
  let pausedUntil = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleWake = (delayMs: number) => {
    if (timer) {
      return;
    }
    timer = setTimeout(
      () => {
        timer = null;
        pump();
      },
      Math.max(0, delayMs)
    );
  };

  const purgeAborted = () => {
    const kept: PoolTask[] = [];
    queue.forEach((task) => {
      if (task.signal?.aborted) {
        task.reject(new RequestAbortedError());
      } else {
        kept.push(task);
      }
    });
    queue = kept;
  };

  const pump = () => {
    while (queue.length > 0) {
      const task = queue[0];

      if (task.signal?.aborted) {
        queue.shift();
        task.reject(new RequestAbortedError());
        continue;
      }

      if (inFlight >= maxConcurrent) {
        // A finishing request calls pump() again.
        return;
      }

      const now = monotonicNow();
      if (now < pausedUntil) {
        scheduleWake(pausedUntil - now);
        return;
      }

      while (startTimes.length > 0 && now - startTimes[0] >= RATE_WINDOW_MS) {
        startTimes.shift();
      }
      if (startTimes.length >= maxPerSecond) {
        scheduleWake(RATE_WINDOW_MS - (now - startTimes[0]));
        return;
      }

      queue.shift();
      startTimes.push(now);
      inFlight += 1;

      Promise.resolve()
        .then(task.run)
        .then(task.resolve, task.reject)
        .finally(() => {
          inFlight -= 1;
          pump();
        });
    }
  };

  return {
    enqueue: <T>(fn: () => Promise<T>, signal?: AbortSignal) =>
      new Promise<T>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new RequestAbortedError());
          return;
        }

        if (signal && !watchedSignals.has(signal)) {
          watchedSignals.add(signal);
          signal.addEventListener('abort', purgeAborted, { once: true });
        }

        queue.push({
          run: fn,
          resolve: resolve as (value: unknown) => void,
          reject,
          signal,
        });
        pump();
      }),
    pause: (ms: number) => {
      pausedUntil = Math.max(pausedUntil, monotonicNow() + ms);
    },
  };
}

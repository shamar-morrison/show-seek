/**
 * Creates a promise that rejects after the specified timeout, with a cleanup function
 * to cancel the timer when no longer needed (e.g., when Promise.race completes).
 *
 * @param ms - Timeout in milliseconds (default: 10000)
 * @param message - Custom error message (default: 'Request timed out')
 * @returns Object with the timeout promise and a cancel function
 */
export const createTimeoutWithCleanup = (
  ms: number = 10000,
  message: string = 'Request timed out'
): { promise: Promise<never>; cancel: () => void } => {
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  const cancel = () => clearTimeout(timeoutId);

  return { promise, cancel };
};

/**
 * Simple timeout promise without cleanup - use when cleanup isn't needed
 * @param ms - Timeout in milliseconds (default: 10000)
 * @param message - Custom error message (default: 'Request timed out')
 */
export const createTimeout = (
  ms: number = 10000,
  message: string = 'Request timed out'
): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
};

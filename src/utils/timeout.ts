/**
 * Creates a promise that rejects after the specified timeout
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

/**
 * Detect if a TMDB API error corresponds to a permanent 404 Not Found.
 * Inspects normalized status, response status, and error message.
 */
export const isTmdb404 = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { status?: unknown }).status;
  if (status === 404) return true;
  const response = (error as { response?: { status?: unknown } }).response;
  if (response && response.status === 404) return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message === 'string' && message.includes('404')) return true;
  return false;
};

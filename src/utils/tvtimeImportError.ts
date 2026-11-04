import type { TvTimeRateLimitDetails } from '@/functions/src/shared/tvtimeImport';
import { TvTimeImportError } from '@/src/utils/tvtimeImport/files';

const KEY_BASE = 'tvtimeImport.errors';

/** Normalizes Firebase callable error codes (`functions/resource-exhausted` → `resource-exhausted`). */
export function getTvTimeErrorCode(error: unknown): string | null {
  const raw = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const code = raw.trim().toLowerCase();
  return code.startsWith('functions/') ? code.slice('functions/'.length) : code;
}

/** i18n key for a file-reading/parsing failure on the select screen. */
export function getTvTimeParseErrorKey(error: unknown): string {
  if (error instanceof TvTimeImportError) {
    return `${KEY_BASE}.parse.${error.code}`;
  }
  return `${KEY_BASE}.parse.unknown_format`;
}

/** i18n key for a run-level failure on the progress screen. */
export function getTvTimeRunErrorKey(
  code: string | null,
  details?: Partial<TvTimeRateLimitDetails> | null
): string {
  switch (code) {
    case 'resource-exhausted':
      if (details?.reason === 'cooldown') return `${KEY_BASE}.cooldown`;
      if (details?.reason === 'session_chunks') return `${KEY_BASE}.tooLarge`;
      return `${KEY_BASE}.rateLimited`;
    case 'already-exists':
      return `${KEY_BASE}.inProgressElsewhere`;
    case 'permission-denied':
      return `${KEY_BASE}.premiumRequired`;
    case 'unauthenticated':
      return `${KEY_BASE}.signInRequired`;
    case 'failed-precondition':
    case 'not-found':
      return `${KEY_BASE}.backendUnavailable`;
    case 'invalid-argument':
      return `${KEY_BASE}.invalidData`;
    default:
      return `${KEY_BASE}.importFailedFallback`;
  }
}

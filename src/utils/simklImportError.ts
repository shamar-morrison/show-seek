import type { FileImportRateLimitDetails } from '@/functions/src/shared/fileImport';
import { SimklImportError } from '@/src/utils/simklImport/files';

const KEY_BASE = 'simklImport.errors';

/** Normalizes Firebase callable error codes (`functions/resource-exhausted` → `resource-exhausted`). */
export function getSimklErrorCode(error: unknown): string | null {
  const raw = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const code = raw.trim().toLowerCase();
  return code.startsWith('functions/') ? code.slice('functions/'.length) : code;
}

/** i18n key for a file-reading/parsing failure on the select screen. */
export function getSimklParseErrorKey(error: unknown): string {
  if (error instanceof SimklImportError) {
    return `${KEY_BASE}.parse.${error.code}`;
  }
  return `${KEY_BASE}.parse.unknown_format`;
}

/** i18n key for a run-level failure on the progress screen. */
export function getSimklRunErrorKey(
  code: string | null,
  details?: Partial<FileImportRateLimitDetails> | null
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

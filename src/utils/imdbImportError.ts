const IMDB_IMPORT_ERROR_KEY_BASE = 'imdbImport.errors';

const normalizeErrorCode = (code: unknown): string | null => {
  if (typeof code !== 'string') {
    return null;
  }

  const normalized = code.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized.startsWith('functions/') ? normalized.slice('functions/'.length) : normalized;
};

const extractImportErrorCode = (error: unknown): string | null => {
  if (error instanceof Error) {
    const typedError = error as Error & { cause?: unknown; code?: unknown };
    const directCode = normalizeErrorCode(typedError.code);
    if (directCode) {
      return directCode;
    }

    if (typedError.cause && typeof typedError.cause === 'object') {
      const causeCode = normalizeErrorCode((typedError.cause as { code?: unknown }).code);
      if (causeCode) {
        return causeCode;
      }
    }
  }

  if (error && typeof error === 'object') {
    return normalizeErrorCode((error as { code?: unknown }).code);
  }

  return null;
};

export const getImdbImportErrorCode = (error: unknown): string | null => extractImportErrorCode(error);

export const getImdbImportErrorMessageKey = (error: unknown): string => {
  switch (extractImportErrorCode(error)) {
    case 'not-found':
      return `${IMDB_IMPORT_ERROR_KEY_BASE}.backendUnavailable`;
    case 'failed-precondition':
      return `${IMDB_IMPORT_ERROR_KEY_BASE}.backendMisconfigured`;
    case 'permission-denied':
      return `${IMDB_IMPORT_ERROR_KEY_BASE}.premiumRequired`;
    case 'unauthenticated':
      return `${IMDB_IMPORT_ERROR_KEY_BASE}.signInRequired`;
    case 'unavailable':
      return `${IMDB_IMPORT_ERROR_KEY_BASE}.serviceUnavailable`;
    default:
      return `${IMDB_IMPORT_ERROR_KEY_BASE}.importFailedFallback`;
  }
};

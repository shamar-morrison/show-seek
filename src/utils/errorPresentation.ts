export type ErrorKind = 'network' | 'timeout' | 'generic';

const NETWORK_CODE_TOKENS = [
  'network-request-failed',
  'err_network',
  'econnrefused',
  'econnreset',
  'enotfound',
  'ehostunreach',
  'offline',
  'unavailable',
];

const TIMEOUT_CODE_TOKENS = [
  'deadline-exceeded',
  'econnaborted',
  'etimedout',
  'timeout',
  'time-out',
];

const NETWORK_MESSAGE_PATTERNS = [
  /network/,
  /internet/,
  /offline/,
  /failed to fetch/,
  /could(?:n't| not) connect/,
  /unable to connect/,
  /connection\s+(?:failed|lost|error)/,
  /host unreachable/,
  /name resolution/,
  /temporary failure in name resolution/,
  /socket hang up/,
];

const TIMEOUT_MESSAGE_PATTERNS = [
  /timed out/,
  /timeout/,
  /time-out/,
  /deadline exceeded/,
  /request took too long/,
];

const extractStringValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const collectCandidates = (error: unknown): string[] => {
  const candidates: string[] = [];

  const pushValue = (value: unknown) => {
    const str = extractStringValue(value);
    if (str) {
      candidates.push(str);
    }
  };

  const pushDetails = (value: unknown) => {
    if (value && typeof value === 'object') {
      const details = value as Record<string, unknown>;
      pushValue(details.message);
      pushValue(details.code);
      pushValue(details.reason);
    }
  };

  const pushResponse = (value: unknown) => {
    if (value && typeof value === 'object') {
      const pushScalarValue = (scalar: unknown) => {
        if (
          typeof scalar === 'string' ||
          typeof scalar === 'number' ||
          typeof scalar === 'boolean' ||
          typeof scalar === 'bigint'
        ) {
          pushValue(String(scalar));
        }
      };

      const response = value as Record<string, unknown>;
      pushScalarValue(response.status);
      pushScalarValue(response.statusText);
      if (response.data && typeof response.data === 'object') {
        const responseData = response.data as Record<string, unknown>;
        pushScalarValue(responseData.message);
        pushScalarValue(responseData.error);
      }
    }
  };

  pushValue(error);

  if (error instanceof Error) {
    const typedError = error as Error & {
      name?: unknown;
      code?: unknown;
      cause?: unknown;
      response?: unknown;
    };

    pushValue(error.message);
    pushValue(typedError.name);
    pushValue(typedError.code);
    pushResponse(typedError.response);
    pushValue(typedError.cause);

    const cause = typedError.cause;
    if (cause instanceof Error) {
      const causeError = cause as Error & { code?: unknown; response?: unknown };
      pushValue(causeError.message);
      pushValue(causeError.code);
      pushResponse(causeError.response);
    } else if (cause && typeof cause === 'object') {
      const causeObj = cause as Record<string, unknown>;
      pushValue(causeObj.message);
      pushValue(causeObj.code);
      pushDetails(causeObj.details);
      pushResponse(causeObj.response);
    }
  }

  if (error && typeof error === 'object' && !(error instanceof Error)) {
    const obj = error as Record<string, unknown>;

    pushValue(obj.message);
    pushValue(obj.code);
    pushValue(obj.status);
    pushValue(obj.statusText);
    pushValue(obj.reason);
    pushValue(obj.error);

    pushDetails(obj.details);
    pushResponse(obj.response);
  }

  return candidates;
};

const hasToken = (value: string, tokens: string[]): boolean =>
  tokens.some((token) => value.includes(token));

const matchesPattern = (value: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(value));

export const classifyErrorKind = (error: unknown): ErrorKind => {
  const combined = collectCandidates(error).join(' ').toLowerCase();

  if (!combined) {
    return 'generic';
  }

  if (hasToken(combined, TIMEOUT_CODE_TOKENS) || matchesPattern(combined, TIMEOUT_MESSAGE_PATTERNS)) {
    return 'timeout';
  }

  if (hasToken(combined, NETWORK_CODE_TOKENS) || matchesPattern(combined, NETWORK_MESSAGE_PATTERNS)) {
    return 'network';
  }

  return 'generic';
};

export const getTechnicalErrorMessage = (error: unknown): string | null => {
  const [firstCandidate] = collectCandidates(error);

  if (firstCandidate) {
    return firstCandidate;
  }

  if (error && typeof error === 'object') {
    try {
      const serialized = JSON.stringify(error);
      if (serialized.length > 2) {
        return serialized.slice(0, 400);
      }
    } catch {
      return null;
    }
  }

  return null;
};

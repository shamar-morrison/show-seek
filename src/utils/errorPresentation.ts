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
  /network/i,
  /internet/i,
  /offline/i,
  /failed to fetch/i,
  /could(?:n't| not) connect/i,
  /unable to connect/i,
  /connection\s+(?:failed|lost|error)/i,
  /host unreachable/i,
  /name resolution/i,
  /temporary failure in name resolution/i,
  /socket hang up/i,
];

const TIMEOUT_MESSAGE_PATTERNS = [
  /timed out/i,
  /timeout/i,
  /time-out/i,
  /deadline exceeded/i,
  /request took too long/i,
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

  pushValue(error);

  if (error instanceof Error) {
    pushValue(error.message);
    pushValue((error as Error & { name?: unknown }).name);
    pushValue((error as Error & { cause?: unknown }).cause);
  }

  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;

    pushValue(obj.message);
    pushValue(obj.code);
    pushValue(obj.status);
    pushValue(obj.statusText);
    pushValue(obj.reason);
    pushValue(obj.error);

    if (obj.details && typeof obj.details === 'object') {
      const details = obj.details as Record<string, unknown>;
      pushValue(details.message);
      pushValue(details.code);
      pushValue(details.reason);
    }

    if (obj.response && typeof obj.response === 'object') {
      const response = obj.response as Record<string, unknown>;
      pushValue(response.status);
      pushValue(response.statusText);
      if (response.data && typeof response.data === 'object') {
        const responseData = response.data as Record<string, unknown>;
        pushValue(responseData.message);
        pushValue(responseData.error);
      }
    }
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

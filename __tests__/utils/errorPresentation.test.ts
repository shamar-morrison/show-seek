import {
  classifyErrorKind,
  getTechnicalErrorMessage,
} from '@/src/utils/errorPresentation';

describe('errorPresentation', () => {
  it('classifies Firebase unavailable errors as network', () => {
    expect(classifyErrorKind({ code: 'unavailable' })).toBe('network');
  });

  it('classifies Axios network errors as network', () => {
    expect(classifyErrorKind({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe('network');
  });

  it('classifies Error instances with network codes as network', () => {
    const error = new Error('Request failed') as Error & { code?: string };
    error.code = 'ERR_NETWORK';

    expect(classifyErrorKind(error)).toBe('network');
  });

  it('classifies timeout-like errors as timeout', () => {
    expect(classifyErrorKind({ code: 'deadline-exceeded' })).toBe('timeout');
    expect(classifyErrorKind(new Error('Request timed out'))).toBe('timeout');
  });

  it('classifies Error instances using response fields', () => {
    const timeoutError = new Error('Request failed') as Error & {
      response?: { statusText?: string };
    };
    timeoutError.response = { statusText: 'Request timed out' };

    const networkError = new Error('Request failed') as Error & {
      response?: { data?: { message?: string } };
    };
    networkError.response = { data: { message: 'Network request failed' } };

    expect(classifyErrorKind(timeoutError)).toBe('timeout');
    expect(classifyErrorKind(networkError)).toBe('network');
  });

  it('classifies Error instances using nested cause fields', () => {
    const timeoutCause = new Error('Inner timeout') as Error & { code?: string };
    timeoutCause.code = 'ETIMEDOUT';

    const timeoutWrapper = new Error('Wrapper timeout') as Error & { cause?: unknown };
    timeoutWrapper.cause = timeoutCause;

    const networkWrapper = new Error('Wrapper network') as Error & { cause?: unknown };
    networkWrapper.cause = {
      response: {
        data: {
          message: 'Network request failed',
        },
      },
    };

    expect(classifyErrorKind(timeoutWrapper)).toBe('timeout');
    expect(classifyErrorKind(networkWrapper)).toBe('network');
  });

  it('falls back to generic for unknown errors', () => {
    expect(classifyErrorKind({ foo: 'bar' })).toBe('generic');
    expect(classifyErrorKind(null)).toBe('generic');
  });

  it('extracts a technical message from error values', () => {
    expect(getTechnicalErrorMessage(new Error('Specific failure'))).toBe('Specific failure');
    expect(getTechnicalErrorMessage({ details: { message: 'Nested message' } })).toBe(
      'Nested message'
    );
  });

  it('extracts numeric response status values as strings', () => {
    expect(getTechnicalErrorMessage({ response: { status: 503 } })).toBe('503');
  });

  it('extracts non-string response data scalars as strings', () => {
    expect(getTechnicalErrorMessage({ response: { data: { message: 408 } } })).toBe('408');
    expect(getTechnicalErrorMessage({ response: { data: { error: false } } })).toBe('false');
  });
});

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

  it('classifies timeout-like errors as timeout', () => {
    expect(classifyErrorKind({ code: 'deadline-exceeded' })).toBe('timeout');
    expect(classifyErrorKind(new Error('Request timed out'))).toBe('timeout');
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
});

import {
  getImdbImportErrorCode,
  getImdbImportErrorMessageKey,
} from '@/src/utils/imdbImportError';

describe('imdbImportError', () => {
  it('maps callable not found errors to the backend unavailable message', () => {
    expect(getImdbImportErrorCode({ code: 'functions/not-found' })).toBe('not-found');
    expect(getImdbImportErrorMessageKey({ code: 'functions/not-found' })).toBe(
      'imdbImport.errors.backendUnavailable'
    );
  });

  it('maps failed-precondition errors to the backend misconfigured message', () => {
    expect(getImdbImportErrorMessageKey({ code: 'functions/failed-precondition' })).toBe(
      'imdbImport.errors.backendMisconfigured'
    );
  });

  it('maps permission denied errors to the premium-required message', () => {
    expect(getImdbImportErrorMessageKey({ code: 'permission-denied' })).toBe(
      'imdbImport.errors.premiumRequired'
    );
  });

  it('maps unauthenticated and unavailable errors to dedicated messages', () => {
    expect(getImdbImportErrorMessageKey({ code: 'functions/unauthenticated' })).toBe(
      'imdbImport.errors.signInRequired'
    );
    expect(getImdbImportErrorMessageKey({ code: 'unavailable' })).toBe(
      'imdbImport.errors.serviceUnavailable'
    );
  });

  it('falls back to the generic import error when code is unknown or missing', () => {
    expect(getImdbImportErrorMessageKey({ code: 'functions/internal' })).toBe(
      'imdbImport.errors.importFailedFallback'
    );
    expect(getImdbImportErrorMessageKey(new Error('Something went wrong'))).toBe(
      'imdbImport.errors.importFailedFallback'
    );
  });
});

const mockCallables: Record<string, jest.Mock> = {
  createStremioAddonToken: jest.fn(),
  revokeStremioAddonToken: jest.fn(),
};

// Resolved lazily: the service creates its callables at import time, before mockCallables exists.
jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(
    (_functions: unknown, name: string) =>
      (...args: unknown[]) =>
        mockCallables[name](...args)
  ),
}));

import {
  StremioAccountRequiredError,
  StremioAddonError,
  stremioAddonService,
  StremioRateLimitedError,
} from '@/src/services/StremioAddonService';

const INSTALL_URL = `https://us-central1-showseek-app-2025.cloudfunctions.net/stremioAddon/${'a'.repeat(64)}/manifest.json`;

describe('StremioAddonService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the install URL from the create callable', async () => {
    mockCallables.createStremioAddonToken.mockResolvedValue({ data: { installUrl: INSTALL_URL } });

    await expect(stremioAddonService.createInstallLink()).resolves.toBe(INSTALL_URL);
  });

  it('rejects a missing or non-https install URL', async () => {
    mockCallables.createStremioAddonToken.mockResolvedValueOnce({ data: {} });
    await expect(stremioAddonService.createInstallLink()).rejects.toBeInstanceOf(StremioAddonError);

    mockCallables.createStremioAddonToken.mockResolvedValueOnce({ data: { installUrl: 'stremio://x' } });
    await expect(stremioAddonService.createInstallLink()).rejects.toBeInstanceOf(StremioAddonError);
  });

  it.each(['functions/resource-exhausted', 'resource-exhausted'])(
    'maps %s to a rate-limit error with nextAllowedAt',
    async (code) => {
      mockCallables.createStremioAddonToken.mockRejectedValue({
        code,
        details: { nextAllowedAt: '2026-10-21T12:01:00.000Z' },
      });

      const error = await stremioAddonService.createInstallLink().catch((caught) => caught);
      expect(error).toBeInstanceOf(StremioRateLimitedError);
      expect(error.nextAllowedAt).toBe('2026-10-21T12:01:00.000Z');
    }
  );

  it('maps a rate-limit error without details to no retry time', async () => {
    mockCallables.createStremioAddonToken.mockRejectedValue({ code: 'functions/resource-exhausted' });

    const error = await stremioAddonService.createInstallLink().catch((caught) => caught);
    expect(error).toBeInstanceOf(StremioRateLimitedError);
    expect(error.nextAllowedAt).toBeUndefined();
  });

  it('maps unauthenticated to an account-required error for create and revoke', async () => {
    mockCallables.createStremioAddonToken.mockRejectedValue({ code: 'functions/unauthenticated' });
    mockCallables.revokeStremioAddonToken.mockRejectedValue({ code: 'functions/unauthenticated' });

    await expect(stremioAddonService.createInstallLink()).rejects.toBeInstanceOf(
      StremioAccountRequiredError
    );
    await expect(stremioAddonService.revokeLink()).rejects.toBeInstanceOf(
      StremioAccountRequiredError
    );
  });

  it('maps other failures to a generic error whose message never contains the URL', async () => {
    mockCallables.createStremioAddonToken.mockRejectedValue(
      Object.assign(new Error(`failed for ${INSTALL_URL}`), { code: 'functions/internal' })
    );

    const error = await stremioAddonService.createInstallLink().catch((caught) => caught);
    expect(error).toBeInstanceOf(StremioAddonError);
    expect(error).not.toBeInstanceOf(StremioRateLimitedError);
    expect(error.message).not.toContain(INSTALL_URL);
    expect(JSON.stringify(error)).not.toContain(INSTALL_URL);
  });

  it('revokes through the revoke callable', async () => {
    mockCallables.revokeStremioAddonToken.mockResolvedValue({ data: { success: true } });

    await expect(stremioAddonService.revokeLink()).resolves.toBeUndefined();
    expect(mockCallables.revokeStremioAddonToken).toHaveBeenCalledTimes(1);
  });
});

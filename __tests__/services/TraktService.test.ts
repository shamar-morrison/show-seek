const mockGetIdToken = jest.fn();
const mockCreateTimeoutWithCleanup = jest.fn();

jest.mock('@/src/firebase/config', () => ({
  auth: {
    currentUser: {
      email: 'test@example.com',
      getIdToken: () => mockGetIdToken(),
      uid: 'user-1',
    },
  },
}));

jest.mock('@/src/utils/timeout', () => ({
  createTimeoutWithCleanup: (...args: unknown[]) => mockCreateTimeoutWithCleanup(...args),
}));

import { checkEnrichmentStatus, checkSyncStatus, triggerSync } from '@/src/services/TraktService';

const createTimeoutControls = () => {
  const cancel = jest.fn();
  mockCreateTimeoutWithCleanup.mockReturnValue({
    cancel,
    promise: new Promise(() => {}),
  });
  return cancel;
};

describe('TraktService', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetIdToken.mockResolvedValue('token');
    global.fetch = jest.fn() as never;
    (global as { __DEV__?: boolean }).__DEV__ = false;
  });

  afterAll(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
  });

  it('ignores unknown sync error categories from backend responses', async () => {
    createTimeoutControls();
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        errorCategory: 'unexpected_category',
        errorMessage: 'Backend message',
      }),
      ok: false,
    });

    await expect(checkSyncStatus()).rejects.toMatchObject({
      category: undefined,
      message: 'Backend message',
      name: 'TraktRequestError',
    });
  });

  it('preserves the storage_limit sync error category from backend responses', async () => {
    createTimeoutControls();
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        errorCategory: 'storage_limit',
        errorMessage: 'Friendly storage limit message',
      }),
      ok: false,
    });

    await expect(checkSyncStatus()).rejects.toMatchObject({
      category: 'storage_limit',
      message: 'Friendly storage limit message',
      name: 'TraktRequestError',
    });
  });

  it('awaits sync status JSON parsing so parse failures are caught in the method', async () => {
    const cancel = createTimeoutControls();
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockRejectedValue(new Error('invalid sync json')),
      ok: true,
    });

    await expect(checkSyncStatus()).rejects.toThrow('invalid sync json');
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('awaits enrichment status JSON parsing so parse failures are caught in the method', async () => {
    const cancel = createTimeoutControls();
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockRejectedValue(new Error('invalid enrichment json')),
      ok: true,
    });

    await expect(checkEnrichmentStatus()).rejects.toThrow('invalid enrichment json');
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('sends the dev sync bypass header from __DEV__ builds when triggering sync', async () => {
    createTimeoutControls();
    (global as { __DEV__?: boolean }).__DEV__ = true;
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });

    await expect(triggerSync()).resolves.toBeUndefined();

    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      { headers: Record<string, string> }
    ];

    expect(requestInit.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
        'X-ShowSeek-Dev-Sync': 'true',
      })
    );
  });
});

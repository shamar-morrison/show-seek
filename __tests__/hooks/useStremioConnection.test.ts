import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockGetCachedUserDocument = jest.fn();
const mockMergeUserDocumentCache = jest.fn();
const mockClearUserDocumentCache = jest.fn();
let mockUser: { uid: string; isAnonymous: boolean } | null = { uid: 'member', isAnonymous: false };

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/src/services/UserDocumentCache', () => ({
  getCachedUserDocument: (...args: unknown[]) => mockGetCachedUserDocument(...args),
  mergeUserDocumentCache: (...args: unknown[]) => mockMergeUserDocumentCache(...args),
  clearUserDocumentCache: (...args: unknown[]) => mockClearUserDocumentCache(...args),
}));

import {
  markStremioConnected,
  resetStremioConnectionForTest,
  useStremioConnection,
} from '@/src/hooks/useStremioConnection';

describe('useStremioConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStremioConnectionForTest();
    mockUser = { uid: 'member', isAnonymous: false };
  });

  it.each([
    [{ stremioAddon: { activeTokenHash: 'abc' } }, true],
    [{ stremioAddon: { activeTokenHash: null } }, false],
    [{}, false],
    [null, false],
  ])('derives the state from the cached user doc (%j)', async (doc, expected) => {
    mockGetCachedUserDocument.mockResolvedValue(doc);

    const { result } = renderHook(() => useStremioConnection({ enabled: true }));

    await waitFor(() => expect(result.current.isConnected).toBe(expected));
    expect(mockGetCachedUserDocument).toHaveBeenCalledTimes(1);
    expect(mockGetCachedUserDocument).toHaveBeenCalledWith('member', {
      callsite: 'useStremioConnection',
    });
  });

  it('makes no read while disabled', () => {
    const { result } = renderHook(() => useStremioConnection({ enabled: false }));

    expect(result.current.isConnected).toBeNull();
    expect(mockGetCachedUserDocument).not.toHaveBeenCalled();
  });

  it.each([null, { uid: 'guest', isAnonymous: true }])('makes no read for %p', async (user) => {
    mockUser = user;
    const { result } = renderHook(() => useStremioConnection({ enabled: true }));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.isConnected).toBeNull();
    expect(mockGetCachedUserDocument).not.toHaveBeenCalled();
  });

  it('reports unknown (null) when the read fails', async () => {
    mockGetCachedUserDocument.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useStremioConnection({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetCachedUserDocument).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBeNull();
  });

  it('flips state optimistically and invalidates the cache entry without a read or merge', () => {
    const { result } = renderHook(() => useStremioConnection({ enabled: false }));

    act(() => markStremioConnected('member', true));
    expect(result.current.isConnected).toBe(true);
    expect(mockClearUserDocumentCache).toHaveBeenLastCalledWith('member');

    act(() => markStremioConnected('member', false));
    expect(result.current.isConnected).toBe(false);
    expect(mockClearUserDocumentCache).toHaveBeenCalledTimes(2);
    expect(mockClearUserDocumentCache).toHaveBeenLastCalledWith('member');

    expect(mockMergeUserDocumentCache).not.toHaveBeenCalled();
    expect(mockGetCachedUserDocument).not.toHaveBeenCalled();
  });

  it.each([
    ['create', true, 'new-hash'],
    ['revoke', false, null],
  ])(
    'reflects fresh server data on the next refresh after a %s, not the stale cached value',
    async (_action, isConnected, serverHash) => {
      // Before the action, the cache held the opposite (now stale) state.
      mockGetCachedUserDocument.mockResolvedValueOnce({
        stremioAddon: { activeTokenHash: isConnected ? null : 'old-hash' },
      });
      const { result } = renderHook(() => useStremioConnection({ enabled: true }));
      await waitFor(() => expect(result.current.isConnected).toBe(!isConnected));

      act(() => markStremioConnected('member', isConnected));
      expect(result.current.isConnected).toBe(isConnected);
      expect(mockClearUserDocumentCache).toHaveBeenCalledWith('member');

      // The invalidated entry forces the next read to the server, which has the new state.
      mockGetCachedUserDocument.mockResolvedValueOnce({
        stremioAddon: { activeTokenHash: serverHash },
      });
      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGetCachedUserDocument).toHaveBeenCalledTimes(2);
      expect(result.current.isConnected).toBe(isConnected);
      expect(mockMergeUserDocumentCache).not.toHaveBeenCalled();
    }
  );

  it('does not let an older in-flight read overwrite an optimistic update', async () => {
    let resolveRead: (doc: unknown) => void = () => {};
    mockGetCachedUserDocument.mockReturnValue(new Promise((resolve) => (resolveRead = resolve)));

    const { result } = renderHook(() => useStremioConnection({ enabled: true }));
    act(() => markStremioConnected('member', true));
    await act(async () => {
      resolveRead({ stremioAddon: { activeTokenHash: null } });
    });

    expect(result.current.isConnected).toBe(true);
  });

  it("ignores another user's state", () => {
    const { result } = renderHook(() => useStremioConnection({ enabled: false }));

    act(() => markStremioConnected('someone-else', true));
    expect(result.current.isConnected).toBeNull();
  });
});

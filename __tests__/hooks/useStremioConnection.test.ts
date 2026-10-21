import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockGetCachedUserDocument = jest.fn();
const mockMergeUserDocumentCache = jest.fn();
let mockUser: { uid: string; isAnonymous: boolean } | null = { uid: 'member', isAnonymous: false };

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/src/services/UserDocumentCache', () => ({
  getCachedUserDocument: (...args: unknown[]) => mockGetCachedUserDocument(...args),
  mergeUserDocumentCache: (...args: unknown[]) => mockMergeUserDocumentCache(...args),
}));

import {
  markStremioConnected,
  resetStremioConnectionForTest,
  STREMIO_CLIENT_CONNECTED_MARKER,
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

  it('flips state optimistically and merges the cache without a read', () => {
    const { result } = renderHook(() => useStremioConnection({ enabled: false }));

    act(() => markStremioConnected('member', true));
    expect(result.current.isConnected).toBe(true);
    expect(mockMergeUserDocumentCache).toHaveBeenLastCalledWith('member', {
      stremioAddon: { activeTokenHash: STREMIO_CLIENT_CONNECTED_MARKER },
    });

    act(() => markStremioConnected('member', false));
    expect(result.current.isConnected).toBe(false);
    expect(mockMergeUserDocumentCache).toHaveBeenLastCalledWith('member', {
      stremioAddon: { activeTokenHash: null },
    });
    expect(mockGetCachedUserDocument).not.toHaveBeenCalled();
  });

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

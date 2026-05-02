import { renderHook, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockGetInitialURL = jest.fn();
const mockParse = jest.fn();
const mockRemove = jest.fn();
let capturedUrlListener: ((event: { url: string }) => void) | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('expo-linking', () => ({
  getInitialURL: (...args: unknown[]) => mockGetInitialURL(...args),
  addEventListener: jest.fn((_event: string, listener: (event: { url: string }) => void) => {
    capturedUrlListener = listener;
    return { remove: mockRemove };
  }),
  parse: (...args: unknown[]) => mockParse(...args),
}));

describe('useDeepLinking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedUrlListener = null;
    mockGetInitialURL.mockResolvedValue(null);
    mockParse.mockImplementation((url: string) => {
      const { host, pathname } = new URL(url);
      return {
        path: `${host}${pathname}`.replace(/^\//, ''),
      };
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Verifies a cold-launch deep link is consumed on mount and routed into the internal home tab path.
  it('handles an initial URL on cold launch', async () => {
    const { useDeepLinking } = require('@/src/hooks/useDeepLinking');
    mockGetInitialURL.mockResolvedValueOnce('showseek://movie/550');

    renderHook(() => useDeepLinking());

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/movie/550');
    });
  });

  // Verifies runtime URL events are processed while the app is already open.
  it('handles runtime URL events after mount', async () => {
    const { useDeepLinking } = require('@/src/hooks/useDeepLinking');

    renderHook(() => useDeepLinking());

    capturedUrlListener?.({ url: 'showseek://tv/1396' });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/tv/1396');
    });
  });

  // Verifies malformed paths are rejected so the app does not navigate on invalid URLs.
  it('rejects invalid deep-link shapes', async () => {
    const { useDeepLinking } = require('@/src/hooks/useDeepLinking');
    mockGetInitialURL.mockResolvedValueOnce('showseek://movie');

    renderHook(() => useDeepLinking());

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        'Invalid deep link format:',
        'showseek://movie'
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Verifies unsupported media types are rejected so only movie and TV routes can be entered from deep links.
  it('rejects invalid media types', async () => {
    const { useDeepLinking } = require('@/src/hooks/useDeepLinking');
    mockGetInitialURL.mockResolvedValueOnce('showseek://person/42');

    renderHook(() => useDeepLinking());

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        'Invalid media type in deep link:',
        'person'
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Verifies valid links build the exact internal route shape expected by expo-router.
  it('constructs the correct internal route for valid links', async () => {
    const { useDeepLinking } = require('@/src/hooks/useDeepLinking');
    mockGetInitialURL.mockResolvedValueOnce('showseek://tv/456');

    renderHook(() => useDeepLinking());

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/tv/456');
    });
  });
});

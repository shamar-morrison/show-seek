import { DeepLinkHandler } from '@/src/components/DeepLinkHandler';
import {
  resolveDeepLinkTarget,
  resolveWidgetTarget,
} from '@/src/hooks/useDeepLinking';
import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
let mockNavigationKey: string | undefined = 'mock-root-key';
const mockGetInitialURL = jest.fn();
const mockRemoveListener = jest.fn();
let capturedUrlListener: ((event: { url: string }) => void) | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useRootNavigationState: () => ({
    key: mockNavigationKey,
  }),
}));

jest.mock('expo-linking', () => ({
  getInitialURL: (...args: unknown[]) => mockGetInitialURL(...args),
  addEventListener: jest.fn(
    (_event: string, listener: (event: { url: string }) => void) => {
      capturedUrlListener = listener;
      return { remove: mockRemoveListener };
    }
  ),
  parse: jest.fn((url: string) => {
    const match = url.match(/^([a-zA-Z0-9_-]+):\/\/([^/?#]+)?(?:\/(.*))?$/);
    if (!match) {
      return { scheme: null, hostname: null, path: url };
    }
    return {
      scheme: match[1],
      hostname: match[2] || '',
      path: match[3] || '',
    };
  }),
}));

describe('resolveDeepLinkTarget', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('constructs the correct internal route for valid movie links', () => {
    expect(resolveDeepLinkTarget('showseek://movie/550')).toBe(
      '/(tabs)/home/movie/550'
    );
  });

  it('constructs the correct internal route for valid tv links', () => {
    expect(resolveDeepLinkTarget('showseek://tv/1396')).toBe(
      '/(tabs)/home/tv/1396'
    );
  });

  it('resolves home widget shortcut route', () => {
    expect(resolveDeepLinkTarget('showseek://home')).toBe('/(tabs)/home');
  });

  it('resolves library route', () => {
    expect(resolveDeepLinkTarget('showseek://library')).toBe('/(tabs)/library');
  });

  it('resolves custom list route with list id', () => {
    expect(
      resolveDeepLinkTarget('showseek://library/custom-list/list-42')
    ).toBe('/(tabs)/library/custom-list/list-42');
  });

  it('rejects invalid deep-link shapes and warns', () => {
    const target = resolveDeepLinkTarget('showseek://movie');
    expect(target).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[DeepLink] Invalid deep link format:',
      'showseek://movie'
    );
  });

  it('rejects invalid media types and warns', () => {
    const target = resolveDeepLinkTarget('showseek://person/42');
    expect(target).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[DeepLink] Invalid media type in deep link:',
      'person'
    );
  });
});

describe('resolveWidgetTarget', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps upcoming movies and tv targets to home tab', () => {
    expect(resolveWidgetTarget('upcoming_movies')).toBe('/(tabs)/home');
    expect(resolveWidgetTarget('upcoming_tv')).toBe('/(tabs)/home');
  });

  it('maps watchlist target with id to custom list route', () => {
    expect(resolveWidgetTarget('watchlist:list_abc')).toBe(
      '/(tabs)/library/custom-list/list_abc'
    );
  });

  it('maps watchlist target without id to library tab', () => {
    expect(resolveWidgetTarget('watchlist')).toBe('/(tabs)/library');
  });

  it('rejects unknown widget target and warns', () => {
    const route = resolveWidgetTarget('unknown_kind');
    expect(route).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[DeepLink] Unknown widget target:',
      'unknown_kind'
    );
  });
});

describe('DeepLinkHandler component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigationKey = 'mock-root-key';
    capturedUrlListener = null;
    mockGetInitialURL.mockResolvedValue(null);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('handles an initial URL on cold launch when navigator is ready', async () => {
    mockGetInitialURL.mockResolvedValueOnce('showseek://movie/550');

    render(React.createElement(DeepLinkHandler));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/movie/550');
    });
  });

  it('handles runtime URL events after mount', async () => {
    render(React.createElement(DeepLinkHandler));

    capturedUrlListener?.({ url: 'showseek://tv/1396' });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/tv/1396');
    });
  });

  it('rejects invalid deep-link shapes without navigating', async () => {
    mockGetInitialURL.mockResolvedValueOnce('showseek://movie');

    render(React.createElement(DeepLinkHandler));

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        '[DeepLink] Invalid deep link format:',
        'showseek://movie'
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('rejects invalid media types without navigating', async () => {
    mockGetInitialURL.mockResolvedValueOnce('showseek://person/42');

    render(React.createElement(DeepLinkHandler));

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        '[DeepLink] Invalid media type in deep link:',
        'person'
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('deduplicates duplicate URLs received within the dedupe window (2000ms)', async () => {
    const now = 100000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    render(React.createElement(DeepLinkHandler));

    capturedUrlListener?.({ url: 'showseek://movie/550' });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/movie/550');
    });

    // Fire duplicate within 2000ms (1000ms later)
    nowSpy.mockReturnValue(now + 1000);
    capturedUrlListener?.({ url: 'showseek://movie/550' });

    expect(mockPush).toHaveBeenCalledTimes(1);

    // Fire duplicate after 2000ms window has passed (3000ms later)
    nowSpy.mockReturnValue(now + 3001);
    capturedUrlListener?.({ url: 'showseek://movie/550' });

    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('queues URL when navigator is not ready, then navigates once ready', async () => {
    mockNavigationKey = undefined; // Navigator is not ready

    const { rerender } = render(React.createElement(DeepLinkHandler));

    capturedUrlListener?.({ url: 'showseek://tv/1396' });

    // Push should NOT be called while navigator is unready
    expect(mockPush).not.toHaveBeenCalled();

    // Navigator finishes mounting and receives a key
    mockNavigationKey = 'ready-root-key';
    rerender(React.createElement(DeepLinkHandler));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/tv/1396');
    });
  });

  it('catches push errors gracefully without throwing', async () => {
    mockPush.mockImplementationOnce(() => {
      throw new Error('Push failed');
    });

    render(React.createElement(DeepLinkHandler));

    capturedUrlListener?.({ url: 'showseek://movie/550' });

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        '[DeepLink] Push failed:',
        expect.objectContaining({
          url: 'showseek://movie/550',
          target: '/(tabs)/home/movie/550',
        })
      );
    });
  });
});


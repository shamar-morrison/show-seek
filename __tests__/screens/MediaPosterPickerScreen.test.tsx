import MediaPosterPickerScreen from '@/src/screens/MediaPosterPickerScreen';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockBack = jest.fn();
const mockSetOverride = jest.fn();
const mockClearOverride = jest.fn();
const mockResolvePosterPath = jest.fn();
let mockPosterOverrides: Record<string, string> = {};
const mockDetailsQueryData = {
  id: 10,
  title: 'Movie title',
  original_title: 'Movie title',
  poster_path: '/default.jpg',
};
const mockImagesQueryData = {
  posters: [{ file_path: '/alt.jpg' }, { file_path: '/alt-2.jpg' }],
};
const mockDetailsQueryResult = {
  data: mockDetailsQueryData,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};
const mockImagesQueryResult = {
  data: mockImagesQueryData,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
  useLocalSearchParams: () => ({ id: '10' }),
  useRouter: () => ({
    back: mockBack,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[2] === 'images') {
      return mockImagesQueryResult;
    }

    return mockDetailsQueryResult;
  },
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: ({ data, renderItem }: any) =>
      React.createElement(
        View,
        null,
        data.map((item: any, index: number) =>
          React.createElement(View, { key: `${item.file_path}-${index}` }, renderItem({ item, index }))
        )
      ),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: { showOriginalTitles: false },
  }),
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => () => false,
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    overrides: mockPosterOverrides,
    resolvePosterPath: (...args: unknown[]) => mockResolvePosterPath(...args),
  }),
  useSetPosterOverride: () => ({
    mutateAsync: (...args: unknown[]) => mockSetOverride(...args),
    isPending: false,
  }),
  useClearPosterOverride: () => ({
    mutateAsync: (...args: unknown[]) => mockClearOverride(...args),
    isPending: false,
  }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');
  const Toast = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ show: jest.fn() }));
    return null;
  });
  Toast.displayName = 'Toast';
  return { __esModule: true, default: Toast };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
  NotificationFeedbackType: { Success: 'Success', Error: 'Error' },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

describe('MediaPosterPickerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPosterOverrides = {};
    mockResolvePosterPath.mockImplementation((_mediaType, _mediaId, fallbackPosterPath) => {
      return fallbackPosterPath ?? null;
    });
    mockSetOverride.mockResolvedValue(undefined);
    mockClearOverride.mockResolvedValue(undefined);
  });

  it('saves selected poster override', async () => {
    const { getByTestId } = render(<MediaPosterPickerScreen mediaType="movie" />);

    fireEvent.press(getByTestId('poster-picker-option-/alt.jpg'));

    await waitFor(() => {
      expect(getByTestId('poster-picker-save-button').props.disabled).toBe(false);
    });

    fireEvent.press(getByTestId('poster-picker-save-button'));

    await waitFor(() => {
      expect(mockSetOverride).toHaveBeenCalledWith({
        mediaType: 'movie',
        mediaId: 10,
        posterPath: '/alt.jpg',
      });
    });

    expect(mockBack).toHaveBeenCalled();
  });

  it('clears override when user chooses default poster', async () => {
    mockPosterOverrides = { movie_10: '/override.jpg' };
    mockResolvePosterPath.mockImplementation(() => '/override.jpg');

    const { getByTestId } = render(<MediaPosterPickerScreen mediaType="movie" />);

    fireEvent.press(getByTestId('poster-picker-use-default'));

    await waitFor(() => {
      expect(getByTestId('poster-picker-save-button').props.disabled).toBe(false);
    });

    fireEvent.press(getByTestId('poster-picker-save-button'));

    await waitFor(() => {
      expect(mockClearOverride).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 10 });
    });

    expect(mockBack).toHaveBeenCalled();
  });
});

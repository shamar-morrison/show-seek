import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockUseQuery = jest.fn();
const mockRefetch = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  AccentColorContext: require('react').createContext({ accentColor: '#E50914' }),
  useAccentColor: () => ({
    accentColor: '#E50914',
  }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('react-native-reanimated/mock', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: {
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
    },
    FadeInDown: {
      duration: () => ({ delay: () => ({}) }),
    },
  };
});

jest.mock('@shopify/flash-list', () => ({
  FlashList: () => null,
}));

import StreamingProvidersStep from '@/src/screens/onboarding/StreamingProvidersStep';

describe('StreamingProvidersStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('providers failed'),
      refetch: mockRefetch,
    });
  });

  it('renders an error state and retries the query', () => {
    const { getAllByText, queryByTestId } = render(<StreamingProvidersStep />);

    expect(getAllByText('Something went wrong').length).toBeGreaterThan(0);
    expect(getAllByText('Retry').length).toBeGreaterThan(0);
    expect(queryByTestId('mock-flash-list')).toBeNull();

    fireEvent.press(getAllByText('Retry')[0]);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

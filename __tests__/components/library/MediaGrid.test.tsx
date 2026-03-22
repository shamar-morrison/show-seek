import { MediaGrid } from '@/src/components/library/MediaGrid';
import { act, render } from '@testing-library/react-native';
import React from 'react';

const mockOnRefresh = jest.fn();
let capturedFlashListProps: any = null;

jest.mock('@shopify/flash-list', () => ({
  FlashList: (props: any) => {
    const React = require('react');
    const { View } = require('react-native');

    capturedFlashListProps = props;

    return React.createElement(View, { testID: 'flash-list' }, props.ListEmptyComponent ?? null);
  },
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (
      _mediaType: 'movie' | 'tv',
      _mediaId: number,
      fallbackPosterPath: string | null
    ) => fallbackPosterPath,
  }),
}));

jest.mock('@/src/components/ui/AnimatedCheck', () => ({
  AnimatedCheck: () => null,
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'empty-state-title' }, title);
  },
}));

describe('MediaGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFlashListProps = null;
    mockOnRefresh.mockReset().mockResolvedValue(undefined);
  });

  it('forwards pull-to-refresh props to FlashList and keeps empty state renderable when empty', async () => {
    const EmptyIcon = (() => null) as any;

    const { getByTestId } = render(
      <MediaGrid
        items={[]}
        isLoading={false}
        emptyState={{
          icon: EmptyIcon,
          title: 'No items',
          description: 'Nothing here yet',
        }}
        onItemPress={jest.fn()}
        onItemLongPress={jest.fn()}
        refreshing={true}
        onRefresh={mockOnRefresh}
      />
    );

    expect(capturedFlashListProps).toBeTruthy();
    expect(capturedFlashListProps.data).toEqual([]);
    expect(capturedFlashListProps.refreshing).toBe(true);
    expect(capturedFlashListProps.contentContainerStyle.flexGrow).toBe(1);
    expect(getByTestId('empty-state-title')).toBeTruthy();

    await act(async () => {
      await capturedFlashListProps.onRefresh();
    });

    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
  });
});

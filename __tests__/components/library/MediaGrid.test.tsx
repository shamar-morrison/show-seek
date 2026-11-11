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

jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  ListMembershipBadge: ({ listIds }: { listIds: string[] }) => {
    const { View } = require('react-native');
    return <View testID="list-badge" listIds={listIds} />;
  },
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

  it('loads more near the end and shows a spinner while it does', () => {
    const EmptyIcon = (() => null) as any;
    const onEndReached = jest.fn();
    const props = {
      items: [],
      isLoading: false,
      emptyState: { icon: EmptyIcon, title: 'No items', description: '' },
      onItemPress: jest.fn(),
      onItemLongPress: jest.fn(),
      onEndReached,
    };

    const { rerender } = render(<MediaGrid {...props} />);
    expect(capturedFlashListProps.onEndReachedThreshold).toBe(0.5);
    expect(capturedFlashListProps.ListFooterComponent).toBeNull();
    capturedFlashListProps.onEndReached();
    expect(onEndReached).toHaveBeenCalledTimes(1);

    rerender(<MediaGrid {...props} isFetchingMore />);
    expect(capturedFlashListProps.ListFooterComponent).toBeTruthy();
  });

  describe('list badges', () => {
    const EmptyIcon = (() => null) as any;
    const items = [
      {
        id: 1,
        title: 'In lists',
        media_type: 'movie',
        poster_path: null,
        vote_average: 7,
        release_date: '2020-01-01',
        addedAt: 0,
      },
      {
        id: 2,
        title: 'In none',
        media_type: 'movie',
        poster_path: null,
        vote_average: 7,
        release_date: '2020-01-01',
        addedAt: 0,
      },
    ] as any[];
    const renderCell = (index: number, getListIds?: (item: any) => string[]) => {
      render(
        <MediaGrid
          items={items}
          isLoading={false}
          emptyState={{ icon: EmptyIcon, title: 'No items', description: '' }}
          onItemPress={jest.fn()}
          onItemLongPress={jest.fn()}
          getListIds={getListIds}
        />
      );
      return render(capturedFlashListProps.renderItem({ item: items[index], index }));
    };

    it('shows the lists a title is in when asked to', () => {
      const getListIds = (item: any) => (item.id === 1 ? ['watchlist'] : []);

      expect(renderCell(0, getListIds).getByTestId('list-badge').props.listIds).toEqual([
        'watchlist',
      ]);
      expect(renderCell(1, getListIds).queryByTestId('list-badge')).toBeNull();
    });

    it("shows none on a list's own screen (no getListIds)", () => {
      expect(renderCell(0).queryByTestId('list-badge')).toBeNull();
    });

    it('redraws when list membership changes', () => {
      const getListIds = () => [];
      renderCell(0, getListIds);
      expect(capturedFlashListProps.extraData).toEqual(expect.objectContaining({ getListIds }));
    });
  });
});

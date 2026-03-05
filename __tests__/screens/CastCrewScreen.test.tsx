import CastCrewScreen from '@/src/screens/CastCrewScreen';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockUseQuery = jest.fn();
const mockToggleViewMode = jest.fn();
const mockScrollToOffset = jest.fn();
const mockGetThreeColumnGridMetrics = jest.fn((_windowWidth: number) => ({
  itemWidth: 100,
  itemHorizontalMargin: 8,
  listPaddingHorizontal: 20,
}));

let mockViewMode: 'grid' | 'list' = 'list';
let capturedFlashListProps: any = null;

jest.mock('@tanstack/react-query', () => ({
  useQuery: (args: any) => mockUseQuery(args),
}));

jest.mock('@/src/hooks/useViewModeToggle', () => ({
  useViewModeToggle: () => ({
    viewMode: mockViewMode,
    isLoadingPreference: false,
    toggleViewMode: mockToggleViewMode,
  }),
}));

jest.mock('@/src/utils/gridLayout', () => ({
  GRID_COLUMN_COUNT: 3,
  getThreeColumnGridMetrics: (windowWidth: number) => mockGetThreeColumnGridMetrics(windowWidth),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  const FlashList = React.forwardRef((props: any, ref: any) => {
    capturedFlashListProps = props;

    React.useImperativeHandle(ref, () => ({
      scrollToOffset: mockScrollToOffset,
    }));

    return (
      <View testID="mock-flash-list" onScroll={props.onScroll}>
        {(props.data || []).map((item: any, index: number) => (
          <View key={props.keyExtractor ? props.keyExtractor(item, index) : `${index}`}>
            {props.renderItem({ item, index, target: 'Cell' })}
          </View>
        ))}
      </View>
    );
  });

  return { FlashList };
});

describe('CastCrewScreen', () => {
  const globalAny = global as any;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedFlashListProps = null;
    mockViewMode = 'list';
    mockGetThreeColumnGridMetrics.mockReturnValue({
      itemWidth: 100,
      itemHorizontalMargin: 8,
      listPaddingHorizontal: 20,
    });

    globalAny.requestAnimationFrame = (callback: (timestamp: number) => void) => {
      callback(0);
      return 1;
    };
    globalAny.cancelAnimationFrame = jest.fn();

    mockUseQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        cast: [
          {
            id: 101,
            name: 'Actor One',
            character: 'Lead',
            profile_path: '/actor-one.jpg',
            order: 0,
          },
          {
            id: 102,
            name: 'Actor Two',
            character: 'Support',
            profile_path: '/actor-two.jpg',
            order: 1,
          },
        ],
        crew: [
          {
            id: 501,
            name: 'Crew One',
            job: 'Director',
            department: 'Directing',
            profile_path: null,
          },
          {
            id: 501,
            name: 'Crew One',
            job: 'Writer',
            department: 'Writing',
            profile_path: '/crew-one.jpg',
          },
          {
            id: 502,
            name: 'Crew Two',
            job: 'Editor',
            department: 'Editing',
            profile_path: '/crew-two.jpg',
          },
        ],
      },
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders cast by default and uses FlashList performance props', () => {
    const { getByText, queryByText, getByTestId } = render(
      <CastCrewScreen id={100} type="movie" mediaTitle="Sample" />
    );

    expect(getByTestId('mock-flash-list')).toBeTruthy();
    expect(getByText('Actor One')).toBeTruthy();
    expect(getByText('Lead')).toBeTruthy();
    expect(queryByText('Crew One')).toBeNull();

    expect(capturedFlashListProps.drawDistance).toBe(400);
    expect(capturedFlashListProps.removeClippedSubviews).toBe(true);
  });

  it('uses shared three-column grid metrics in grid mode', () => {
    mockViewMode = 'grid';

    render(<CastCrewScreen id={100} type="movie" mediaTitle="Sample" />);

    expect(capturedFlashListProps.numColumns).toBe(3);
    expect(Array.isArray(capturedFlashListProps.contentContainerStyle)).toBe(true);
    expect(capturedFlashListProps.contentContainerStyle).toContainEqual({
      paddingHorizontal: 20,
    });
  });

  it('switches to crew tab and renders merged crew roles', () => {
    const { getByText, queryAllByText } = render(
      <CastCrewScreen id={100} type="movie" mediaTitle="Sample" />
    );

    fireEvent.press(getByText('Crew'));

    expect(getByText('Crew One')).toBeTruthy();
    expect(getByText('Director • Writer')).toBeTruthy();
    expect(queryAllByText('Crew One')).toHaveLength(1);
    expect(getByText('Crew Two')).toBeTruthy();
  });

  it('restores saved scroll offsets per tab', () => {
    const { getByText, getByTestId } = render(
      <CastCrewScreen id={100} type="movie" mediaTitle="Sample" />
    );

    const flashList = getByTestId('mock-flash-list');

    mockScrollToOffset.mockClear();
    fireEvent.scroll(flashList, {
      nativeEvent: { contentOffset: { x: 0, y: 180 } },
    });

    fireEvent.press(getByText('Crew'));
    expect(mockScrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: false });

    fireEvent.scroll(flashList, {
      nativeEvent: { contentOffset: { x: 0, y: 260 } },
    });

    fireEvent.press(getByText('Cast'));
    expect(mockScrollToOffset).toHaveBeenLastCalledWith({ offset: 180, animated: false });
  });
});

import CastCrewScreen from '@/src/screens/CastCrewScreen';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

jest.mock('@/src/components/ListActionsModal', () => {
  const React = require('react');
  const ListActionsModal = React.forwardRef((_props: any, _ref: any) => null);
  ListActionsModal.displayName = 'ListActionsModal';
  return {
    __esModule: true,
    default: ListActionsModal,
  };
});

jest.mock('@/src/hooks/usePersonFavoriteSheet', () => ({
  usePersonFavoriteSheet: () => ({
    sheetRef: { current: null },
    actions: [],
    selectedPerson: null,
    handlePersonLongPress: jest.fn(),
  }),
  toPersonFavoriteTarget: (person: any) => ({
    id: person.id,
    name: person.name,
    profile_path: person.profile_path ?? null,
    known_for_department: person.known_for_department ?? '',
  }),
}));

jest.mock('@/src/hooks/useFavoritePersons', () => ({
  useIsPersonFavorited: () => ({ isFavorited: false, isLoading: false }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

// The real header needs safe-area insets; a plain input is enough to drive the search.
jest.mock('@/src/components/ui/SearchableHeader', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    SearchableHeader: ({ searchQuery, onSearchChange, onClose, placeholder }: any) => (
      <View>
        <TextInput
          testID="cast-crew-search-input"
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder={placeholder}
        />
        <Pressable testID="cast-crew-search-close" onPress={onClose}>
          <Text>close</Text>
        </Pressable>
      </View>
    ),
  };
});

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

  describe('search', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockUseQuery.mockReturnValue({
        isLoading: false,
        isError: false,
        data: {
          cast: [
            { id: 101, name: 'Penélope Cruz', character: 'Raimunda', profile_path: null, order: 0 },
            { id: 102, name: 'Actor Two', character: 'Support', profile_path: null, order: 1 },
          ],
          crew: [
            { id: 501, name: 'Pedro Almodóvar', job: 'Director', profile_path: null },
            { id: 502, name: 'Crew Two', job: 'Editor', profile_path: null },
          ],
        },
        error: null,
        refetch: jest.fn(),
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const renderAndSearch = (query: string) => {
      const utils = render(<CastCrewScreen id={100} type="movie" mediaTitle="Sample" />);
      fireEvent.press(utils.getByTestId('cast-crew-search-button'));
      fireEvent.changeText(utils.getByTestId('cast-crew-search-input'), query);
      act(() => {
        jest.advanceTimersByTime(200);
      });
      return utils;
    };

    it('opens a search field with a name-or-role placeholder', () => {
      const { getByTestId } = render(<CastCrewScreen id={100} type="movie" mediaTitle="Sample" />);
      fireEvent.press(getByTestId('cast-crew-search-button'));
      expect(getByTestId('cast-crew-search-input').props.placeholder).toBe(
        'Search by name or role…'
      );
    });

    it('matches names regardless of accents and case', () => {
      const { getByText, queryByText } = renderAndSearch('PENELOPE');
      expect(getByText('Penélope Cruz')).toBeTruthy();
      expect(queryByText('Actor Two')).toBeNull();
    });

    it('matches a character name, and a crew job on the Crew tab', () => {
      const { getByText, queryByText } = renderAndSearch('raimunda');
      expect(getByText('Penélope Cruz')).toBeTruthy();

      fireEvent.changeText(screen.getByTestId('cast-crew-search-input'), 'director');
      act(() => {
        jest.advanceTimersByTime(200);
      });
      fireEvent.press(getByText('Crew (1)'));
      expect(getByText('Pedro Almodóvar')).toBeTruthy();
      expect(queryByText('Crew Two')).toBeNull();
    });

    it('shows match counts on both tabs while searching', () => {
      const { getByText } = renderAndSearch('almodovar');
      expect(getByText('Cast (0)')).toBeTruthy();
      expect(getByText('Crew (1)')).toBeTruthy();
    });

    it('shows the empty state when the tab has no matches', () => {
      const { getByText, queryByTestId } = renderAndSearch('nobody here');
      expect(queryByTestId('mock-flash-list')).toBeNull();
      expect(getByText('No results found')).toBeTruthy();
    });

    it('closing search brings back the full list and plain tab labels', () => {
      const { getByTestId, getByText } = renderAndSearch('penelope');
      fireEvent.press(getByTestId('cast-crew-search-close'));
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(getByText('Actor Two')).toBeTruthy();
      expect(getByText('Cast')).toBeTruthy();
      expect(getByTestId('cast-crew-search-button')).toBeTruthy();
    });

    it('starts results at the top and returns to the saved position afterwards', () => {
      const utils = render(<CastCrewScreen id={100} type="movie" mediaTitle="Sample" />);
      fireEvent.scroll(utils.getByTestId('mock-flash-list'), {
        nativeEvent: { contentOffset: { x: 0, y: 300 } },
      });

      fireEvent.press(utils.getByTestId('cast-crew-search-button'));
      fireEvent.changeText(utils.getByTestId('cast-crew-search-input'), 'actor');
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(mockScrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: false });

      // Scrolling the results doesn't replace the full list's saved position.
      fireEvent.scroll(utils.getByTestId('mock-flash-list'), {
        nativeEvent: { contentOffset: { x: 0, y: 40 } },
      });
      fireEvent.press(utils.getByTestId('cast-crew-search-close'));
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(mockScrollToOffset).toHaveBeenLastCalledWith({ offset: 300, animated: false });
    });
  });
});

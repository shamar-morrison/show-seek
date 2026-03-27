import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockSetOptions = jest.fn();
const mockPush = jest.fn();
const mockRefetch = jest.fn();
const mockBulkDeleteMutateAsync = jest.fn();

const mockUseLists = jest.fn();
const mockUsePremium = jest.fn();
const mockUseHeaderSearch = jest.fn();
let capturedFlashListProps: any = null;
let latestCreateListModalProps: any = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockUsePremium(),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
    isGuest: false,
  }),
}));

jest.mock('@/src/context/GuestAccessContext', () => ({
  useGuestAccess: () => ({
    requireAccount: jest.fn(),
  }),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockUseLists(),
  useBulkDeleteLists: () => ({
    mutateAsync: mockBulkDeleteMutateAsync,
    isPending: false,
  }),
}));

jest.mock('@/src/hooks/useHeaderSearch', () => ({
  useHeaderSearch: (...args: unknown[]) => mockUseHeaderSearch(...args),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
  },
  NotificationFeedbackType: {
    Success: 'Success',
    Error: 'Error',
    Warning: 'Warning',
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock('@/src/components/CreateListModal', () => {
  const React = require('react');
  const MockCreateListModal = React.forwardRef((props: any, _ref: any) => {
    latestCreateListModalProps = props;
    return null;
  });

  MockCreateListModal.displayName = 'MockCreateListModal';

  return {
    __esModule: true,
    default: MockCreateListModal,
  };
});

jest.mock('@/src/components/library/LibrarySortModal', () => ({
  LibrarySortModal: () => null,
}));

jest.mock('@/src/components/MediaSortModal', () => ({
  DEFAULT_SORT_STATE: {
    option: 'recentlyAdded',
    direction: 'desc',
  },
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('@/src/components/library/QueryErrorState', () => ({
  QueryErrorState: () => null,
}));

jest.mock('@/src/components/library/StackedPosterPreview', () => ({
  StackedPosterPreview: () => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'stacked-poster-preview' });
  },
}));

jest.mock('@/src/components/library/SearchEmptyState', () => ({
  SearchEmptyState: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'search-empty-state' }, 'search-empty');
  },
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'empty-state-title' }, title);
  },
}));

jest.mock('@/src/components/ui/HeaderIconButton', () => ({
  HeaderIconButton: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');

  const Toast = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      show: jest.fn(),
    }));

    return null;
  });

  Toast.displayName = 'MockToast';

  return {
    __esModule: true,
    default: Toast,
  };
});

jest.mock('@/src/components/library/BulkRemoveProgressModal', () => ({
  BulkRemoveProgressModal: ({ visible, current, total, title }: any) => {
    const React = require('react');
    const { Text } = require('react-native');

    if (!visible) {
      return null;
    }

    return React.createElement(
      Text,
      { testID: 'bulk-delete-progress-modal' },
      `${title}: ${current}/${total}`
    );
  },
}));

jest.mock('@/src/styles/iconBadgeStyles', () => ({
  useIconBadgeStyles: () => ({ wrapper: {}, badge: {} }),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: (props: any) => {
    const React = require('react');
    const { View } = require('react-native');
    const { data, renderItem, ListEmptyComponent } = props;

    capturedFlashListProps = props;

    if (!data || data.length === 0) {
      return React.createElement(View, { testID: 'flash-list-empty' }, ListEmptyComponent);
    }

    return React.createElement(
      View,
      { testID: 'flash-list' },
      data.map((item: any, index: number) =>
        React.createElement(View, { key: `${item.id}-${index}` }, renderItem({ item, index }))
      )
    );
  },
}));

import CustomListsScreen from '@/app/(tabs)/library/custom-lists';

const customListsData = [
  {
    id: 'list-1',
    name: 'Sci-Fi Queue',
    description: 'Future worlds',
    items: {},
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'list-2',
    name: 'Comedy Night',
    description: 'Funny picks',
    items: {},
    createdAt: 2,
    updatedAt: 2,
  },
];

describe('CustomListsScreen search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFlashListProps = null;
    latestCreateListModalProps = null;
    mockRefetch.mockReset().mockResolvedValue(undefined);
    mockBulkDeleteMutateAsync.mockReset().mockResolvedValue({
      deletedIds: ['list-1'],
      failedIds: [],
    });

    mockUsePremium.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });

    mockUseLists.mockReturnValue({
      data: customListsData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    mockUseHeaderSearch.mockReturnValue({
      searchQuery: '',
      isSearchActive: false,
      filteredItems: customListsData,
      activateSearch: jest.fn(),
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: false },
    });
  });

  it('renders all custom lists when search query is empty', () => {
    const { getByText } = render(<CustomListsScreen />);

    expect(getByText('Sci-Fi Queue')).toBeTruthy();
    expect(getByText('Comedy Night')).toBeTruthy();
  });

  it('wires FlashList pull to refresh to the lists refetch', async () => {
    render(<CustomListsScreen />);

    expect(capturedFlashListProps).toBeTruthy();
    expect(capturedFlashListProps.refreshing).toBe(false);

    await act(async () => {
      await capturedFlashListProps.onRefresh();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('navigates once to the new list detail screen after create success', async () => {
    render(<CustomListsScreen />);

    expect(latestCreateListModalProps?.onSuccess).toBeDefined();

    await act(async () => {
      await latestCreateListModalProps?.onSuccess?.('my-new-list', 'My New List');
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/custom-list/my-new-list');
  });

  it('renders filtered custom lists from useHeaderSearch results', () => {
    mockUseHeaderSearch.mockReturnValue({
      searchQuery: 'comedy',
      isSearchActive: true,
      filteredItems: [customListsData[1]],
      activateSearch: jest.fn(),
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: true },
    });

    const { queryByText, getByText } = render(<CustomListsScreen />);

    expect(getByText('Comedy Night')).toBeTruthy();
    expect(queryByText('Sci-Fi Queue')).toBeNull();
  });

  it('shows SearchEmptyState when searchQuery exists and filtered results are empty', () => {
    mockUseHeaderSearch.mockReturnValue({
      searchQuery: 'missing',
      isSearchActive: true,
      filteredItems: [],
      activateSearch: jest.fn(),
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: true },
    });

    const { getByTestId } = render(<CustomListsScreen />);

    expect(getByTestId('search-empty-state')).toBeTruthy();
  });

  it('keeps EmptyState for truly empty custom list data (not search state)', () => {
    mockUseLists.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    mockUseHeaderSearch.mockReturnValue({
      searchQuery: 'anything',
      isSearchActive: true,
      filteredItems: [],
      activateSearch: jest.fn(),
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: true },
    });

    const { getByTestId, queryByTestId } = render(<CustomListsScreen />);

    expect(getByTestId('empty-state-title')).toBeTruthy();
    expect(queryByTestId('search-empty-state')).toBeNull();
  });

  it('enters selection mode on long press and suppresses navigation on the follow-up press', () => {
    const { getByTestId } = render(<CustomListsScreen />);
    const firstCard = getByTestId('custom-list-card-list-1');

    fireEvent(firstCard, 'longPress');
    fireEvent(firstCard, 'press');

    expect(mockPush).not.toHaveBeenCalledWith('/(tabs)/library/custom-list/list-1');
    expect(getByTestId('multi-select-action-bar')).toBeTruthy();
    expect(getByTestId('custom-list-card-selection-badge-list-1')).toBeTruthy();
  });

  it('toggles selection on tap while in selection mode', () => {
    jest.useFakeTimers();

    const { getByTestId, queryByTestId, getByText } = render(<CustomListsScreen />);

    fireEvent(getByTestId('custom-list-card-list-1'), 'longPress');
    fireEvent(getByTestId('custom-list-card-list-1'), 'pressOut');
    act(() => {
      jest.runAllTimers();
    });
    expect(getByText('1 selected')).toBeTruthy();

    fireEvent(getByTestId('custom-list-card-list-2'), 'press');
    expect(getByText('2 selected')).toBeTruthy();

    fireEvent(getByTestId('custom-list-card-list-1'), 'press');
    expect(getByText('1 selected')).toBeTruthy();

    fireEvent(getByTestId('custom-list-card-list-2'), 'press');
    expect(queryByTestId('multi-select-action-bar')).toBeNull();

    jest.useRealTimers();
  });

  it('hides header actions while selection mode is active', () => {
    const { getByTestId } = render(<CustomListsScreen />);

    const initialOptions = mockSetOptions.mock.calls[mockSetOptions.mock.calls.length - 1][0];
    expect(initialOptions.headerRight()).not.toBeNull();

    fireEvent(getByTestId('custom-list-card-list-1'), 'longPress');

    const selectionOptions = mockSetOptions.mock.calls[mockSetOptions.mock.calls.length - 1][0];
    expect(selectionOptions.headerRight()).toBeNull();
  });

  it('opens bulk delete confirmation and shows the progress modal after confirming', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    let resolveDelete!: (value: { deletedIds: string[]; failedIds: string[] }) => void;

    mockBulkDeleteMutateAsync.mockImplementation(
      ({ onProgress }: { onProgress: (processed: number, total: number) => void }) =>
        new Promise<{ deletedIds: string[]; failedIds: string[] }>((resolve) => {
          resolveDelete = resolve;
          onProgress(1, 1);
        })
    );

    const { getByTestId } = render(<CustomListsScreen />);

    fireEvent(getByTestId('custom-list-card-list-1'), 'longPress');
    fireEvent.press(getByTestId('multi-select-remove-button'));

    expect(alertSpy).toHaveBeenCalledTimes(1);

    const buttons = alertSpy.mock.calls[0]?.[2] as Array<{
      style?: string;
      onPress?: () => unknown;
    }>;
    const confirmButton = buttons.find((button) => button.style === 'destructive');

    await act(async () => {
      confirmButton?.onPress?.();
    });

    expect(mockBulkDeleteMutateAsync).toHaveBeenCalledWith({
      listIds: ['list-1'],
      onProgress: expect.any(Function),
    });
    expect(getByTestId('bulk-delete-progress-modal')).toBeTruthy();

    await act(async () => {
      resolveDelete({
        deletedIds: ['list-1'],
        failedIds: [],
      });
    });

    alertSpy.mockRestore();
  });
});

import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import { ListMediaItem } from '@/src/services/ListService';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React, { createRef } from 'react';

const mockSheetPresent = jest.fn(async () => {});
const mockSheetDismiss = jest.fn(async () => {});

const mockListsState: {
  data: any[];
  isLoading: boolean;
  error: Error | null;
} = {
  data: [],
  isLoading: false,
  error: null,
};

const mockAddMutate = jest.fn();
const mockAddMutateAsync = jest.fn();
const mockRemoveMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();
const mockInvalidateQueries = jest.fn(async () => {});
let latestCreateListModalProps:
  | {
      onSuccess?: (listId: string, listName: string) => void;
      onCancel?: () => void;
    }
  | null = null;

const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

jest.mock('react-native', () => {
  const React = require('react');
  const createComponent = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);

  const Pressable = ({ children, disabled, onPress, onLongPress, ...props }: any) =>
    React.createElement(
      'Pressable',
      {
        ...props,
        disabled,
        onPress: disabled ? undefined : onPress,
        onLongPress: disabled ? undefined : onLongPress,
      },
      children
    );

  const FlatList = ({ data = [], renderItem, keyExtractor, ...props }: any) => (
    <View {...props}>
      {data.map((item: any, index: number) => (
        <View key={keyExtractor ? keyExtractor(item, index) : String(index)}>
          {renderItem({ item, index })}
        </View>
      ))}
    </View>
  );

  const View = createComponent('View');
  const Text = createComponent('Text');

  return {
    StyleSheet: {
      create: (styles: any) => styles,
      flatten: (style: any) => style,
    },
    View,
    Text,
    Pressable,
    FlatList,
    ActivityIndicator: createComponent('ActivityIndicator'),
    Alert: {
      alert: jest.fn(),
    },
    Dimensions: {
      get: () => ({ width: 375, height: 812 }),
    },
    useWindowDimensions: () => ({ width: 375, height: 812 }),
  };
});

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  const TrueSheet = React.forwardRef(({ children }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: mockSheetPresent,
      dismiss: mockSheetDismiss,
    }));

    return <View>{children}</View>;
  });

  return {
    TrueSheet,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');

  return {
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    Pressable,
  };
});

jest.mock('@/src/components/ui/AnimatedCheck', () => ({
  AnimatedCheck: ({ visible }: { visible: boolean }) =>
    visible ? require('react').createElement('AnimatedCheck') : null,
}));

jest.mock('@/src/components/CreateListModal', () => {
  const React = require('react');

  const MockCreateListModal = React.forwardRef((props: any, ref: any) => {
    latestCreateListModalProps = props;
    React.useImperativeHandle(ref, () => ({
      present: jest.fn(async () => {}),
      dismiss: jest.fn(async () => {}),
    }));

    return null;
  });
  MockCreateListModal.displayName = 'MockCreateListModal';

  return {
    __esModule: true,
    default: MockCreateListModal,
  };
});

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockListsState,
  useAddToList: () => ({
    mutateAsync: mockAddMutateAsync,
    mutate: mockAddMutate,
  }),
  useRemoveFromList: () => ({
    mutateAsync: mockRemoveMutateAsync,
  }),
  useDeleteList: () => ({
    mutateAsync: mockDeleteMutateAsync,
  }),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user-id' },
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

const createMediaItem = (
  id: number,
  mediaType: 'movie' | 'tv' = 'movie'
): Omit<ListMediaItem, 'addedAt'> => ({
  id,
  title: `Item ${id}`,
  poster_path: `/poster-${id}.jpg`,
  media_type: mediaType,
  vote_average: 7.5,
  release_date: '2024-01-01',
});

const createStoredItem = (item: Omit<ListMediaItem, 'addedAt'>): ListMediaItem => ({
  ...item,
  addedAt: Date.now(),
});

describe('AddToListModal (bulk mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestCreateListModalProps = null;

    mockListsState.data = [];
    mockListsState.isLoading = false;
    mockListsState.error = null;
    mockAddMutateAsync.mockResolvedValue(undefined);
    mockRemoveMutateAsync.mockResolvedValue(undefined);
    mockDeleteMutateAsync.mockResolvedValue(undefined);
    mockInvalidateQueries.mockResolvedValue(undefined);
  });

  it('filters out the source list and requires selecting a target list before save', async () => {
    const selected = createMediaItem(1);

    mockListsState.data = [
      {
        id: 'favorites',
        name: 'Favorites',
        items: { [selected.id]: createStoredItem(selected) },
        createdAt: 1,
      },
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {},
        createdAt: 2,
      },
    ];

    const ref = createRef<AddToListModalRef>();
    const { queryByTestId, getByTestId } = render(
      <AddToListModal ref={ref} mediaItems={[selected]} sourceListId="favorites" />
    );

    await act(async () => {
      await ref.current?.present();
    });

    expect(queryByTestId('add-to-list-row-favorites')).toBeNull();
    expect(getByTestId('add-to-list-row-watchlist')).toBeTruthy();

    const saveButton = getByTestId('add-to-list-save-button');
    expect(saveButton.props.disabled).toBe(true);

    fireEvent.press(getByTestId('add-to-list-row-watchlist'));

    expect(getByTestId('add-to-list-save-button').props.disabled).toBe(false);
  });

  it('shows copy header in bulk copy mode', async () => {
    const selected = createMediaItem(1);

    mockListsState.data = [
      {
        id: 'favorites',
        name: 'Favorites',
        items: { [selected.id]: createStoredItem(selected) },
        createdAt: 1,
      },
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {},
        createdAt: 2,
      },
    ];

    const ref = createRef<AddToListModalRef>();
    const { getByText } = render(
      <AddToListModal
        ref={ref}
        mediaItems={[selected]}
        sourceListId="favorites"
        bulkAddMode="copy"
      />
    );

    await act(async () => {
      await ref.current?.present();
    });

    expect(getByText('Copy to lists')).toBeTruthy();
  });

  it('shows move header in bulk move mode', async () => {
    const selected = createMediaItem(1);

    mockListsState.data = [
      {
        id: 'favorites',
        name: 'Favorites',
        items: { [selected.id]: createStoredItem(selected) },
        createdAt: 1,
      },
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {},
        createdAt: 2,
      },
    ];

    const ref = createRef<AddToListModalRef>();
    const { getByText } = render(
      <AddToListModal
        ref={ref}
        mediaItems={[selected]}
        sourceListId="favorites"
        bulkAddMode="move"
      />
    );

    await act(async () => {
      await ref.current?.present();
    });

    expect(getByText('Move to lists')).toBeTruthy();
  });

  it('keeps single-item mode header as Add to List', async () => {
    const selected = createMediaItem(2);

    mockListsState.data = [
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {},
        createdAt: 2,
      },
    ];

    const ref = createRef<AddToListModalRef>();
    const { getByText } = render(<AddToListModal ref={ref} mediaItem={selected} />);

    await act(async () => {
      await ref.current?.present();
    });

    expect(getByText('Add to List')).toBeTruthy();
  });

  it('reconciles list queries after create-list success in single-item mode', async () => {
    const selected = createMediaItem(2);

    mockListsState.data = [
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {},
        createdAt: 2,
      },
    ];
    mockAddMutateAsync.mockResolvedValue(undefined);

    const ref = createRef<AddToListModalRef>();
    render(<AddToListModal ref={ref} mediaItem={selected} />);

    await act(async () => {
      await ref.current?.present();
    });

    expect(latestCreateListModalProps?.onSuccess).toBeDefined();

    await act(async () => {
      await latestCreateListModalProps?.onSuccess?.('my-new-list', 'My New List');
    });

    expect(mockAddMutateAsync).toHaveBeenCalledWith({
      listId: 'my-new-list',
      mediaItem: selected,
      listName: 'My New List',
    });

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['lists', 'test-user-id'],
        refetchType: 'active',
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['list-membership-index', 'test-user-id'],
        refetchType: 'active',
      });
    });
  });

  it('reconciles list queries and surfaces an error after create-list add failure in single-item mode', async () => {
    const selected = createMediaItem(2);

    mockListsState.data = [
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {},
        createdAt: 2,
      },
    ];
    mockAddMutateAsync.mockRejectedValueOnce(new Error('Create list add failed'));

    const ref = createRef<AddToListModalRef>();
    const { getByText } = render(<AddToListModal ref={ref} mediaItem={selected} />);

    await act(async () => {
      await ref.current?.present();
    });

    expect(latestCreateListModalProps?.onSuccess).toBeDefined();

    await act(async () => {
      await latestCreateListModalProps?.onSuccess?.('my-new-list', 'My New List');
    });

    await waitFor(() => {
      expect(getByText('Create list add failed')).toBeTruthy();
    });

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['lists', 'test-user-id'],
        refetchType: 'active',
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['list-membership-index', 'test-user-id'],
        refetchType: 'active',
      });
    });
  });

  it('removes from source list in move mode after successful adds', async () => {
    const selected = createMediaItem(1);

    mockListsState.data = [
      {
        id: 'favorites',
        name: 'Favorites',
        items: { [selected.id]: createStoredItem(selected) },
        createdAt: 1,
      },
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {},
        createdAt: 2,
      },
    ];

    const ref = createRef<AddToListModalRef>();
    const { getByTestId } = render(
      <AddToListModal
        ref={ref}
        mediaItems={[selected]}
        sourceListId="favorites"
        bulkAddMode="move"
      />
    );

    await act(async () => {
      await ref.current?.present();
    });

    fireEvent.press(getByTestId('add-to-list-row-watchlist'));

    await act(async () => {
      fireEvent.press(getByTestId('add-to-list-save-button'));
    });

    await waitFor(() => {
      expect(mockAddMutateAsync).toHaveBeenCalledWith({
        listId: 'watchlist',
        mediaItem: selected,
        listName: 'Watchlist',
      });
    });

    await waitFor(() => {
      expect(mockRemoveMutateAsync).toHaveBeenCalledWith({
        listId: 'favorites',
        mediaId: selected.id,
      });
    });

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['lists', 'test-user-id'],
        refetchType: 'active',
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['list-membership-index', 'test-user-id'],
        refetchType: 'active',
      });
    });
  });

  it('does not remove from source list in copy mode', async () => {
    const selected = createMediaItem(1);

    mockListsState.data = [
      {
        id: 'favorites',
        name: 'Favorites',
        items: { [selected.id]: createStoredItem(selected) },
        createdAt: 1,
      },
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {},
        createdAt: 2,
      },
    ];

    const ref = createRef<AddToListModalRef>();
    const { getByTestId } = render(
      <AddToListModal
        ref={ref}
        mediaItems={[selected]}
        sourceListId="favorites"
        bulkAddMode="copy"
      />
    );

    await act(async () => {
      await ref.current?.present();
    });

    fireEvent.press(getByTestId('add-to-list-row-watchlist'));

    await act(async () => {
      fireEvent.press(getByTestId('add-to-list-save-button'));
    });

    await waitFor(() => {
      expect(mockAddMutateAsync).toHaveBeenCalledWith({
        listId: 'watchlist',
        mediaItem: selected,
        listName: 'Watchlist',
      });
    });

    expect(mockRemoveMutateAsync).not.toHaveBeenCalled();
  });

  it('processes single-item changes sequentially', async () => {
    const selected = createMediaItem(1);
    const removeDeferred = createDeferred<void>();

    mockListsState.data = [
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: { [selected.id]: createStoredItem(selected) },
        createdAt: 1,
      },
      {
        id: 'favorites',
        name: 'Favorites',
        items: {},
        createdAt: 2,
      },
    ];
    mockRemoveMutateAsync.mockImplementationOnce(() => removeDeferred.promise);
    mockAddMutateAsync.mockResolvedValue(undefined);

    const ref = createRef<AddToListModalRef>();
    const { getByTestId } = render(<AddToListModal ref={ref} mediaItem={selected} />);

    await act(async () => {
      await ref.current?.present();
    });

    fireEvent.press(getByTestId('add-to-list-row-watchlist'));
    fireEvent.press(getByTestId('add-to-list-row-favorites'));

    act(() => {
      fireEvent.press(getByTestId('add-to-list-save-button'));
    });

    await waitFor(() => {
      expect(mockRemoveMutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(mockAddMutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      removeDeferred.resolve(undefined);
    });

    await waitFor(() => {
      expect(mockAddMutateAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a partial failure banner for single-item saves with mixed outcomes', async () => {
    const selected = createMediaItem(1);

    mockListsState.data = [
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: { [selected.id]: createStoredItem(selected) },
        createdAt: 1,
      },
      {
        id: 'favorites',
        name: 'Favorites',
        items: {},
        createdAt: 2,
      },
    ];

    mockRemoveMutateAsync.mockRejectedValueOnce(
      new Error('You do not have permission to perform this action')
    );
    mockAddMutateAsync.mockResolvedValue(undefined);

    const ref = createRef<AddToListModalRef>();
    const { getByTestId, getByText } = render(<AddToListModal ref={ref} mediaItem={selected} />);

    await act(async () => {
      await ref.current?.present();
    });

    fireEvent.press(getByTestId('add-to-list-row-watchlist'));
    fireEvent.press(getByTestId('add-to-list-row-favorites'));

    await act(async () => {
      fireEvent.press(getByTestId('add-to-list-save-button'));
    });

    await waitFor(() => {
      expect(mockRemoveMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockAddMutateAsync).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(getByText('Changes failed to save')).toBeTruthy();
    });

    expect(mockSheetDismiss).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['lists', 'test-user-id'],
      refetchType: 'active',
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['list-membership-index', 'test-user-id'],
      refetchType: 'active',
    });
  });

});

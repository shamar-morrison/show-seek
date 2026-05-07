import {
  RatingMultiSelectTarget,
  useRatingMultiSelectActions,
} from '@/src/hooks/useRatingMultiSelectActions';
import { act, renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

type TestItem = {
  key: string;
  label: string;
  target: RatingMultiSelectTarget;
};

type HookParams = Parameters<
  typeof useRatingMultiSelectActions<TestItem, RatingMultiSelectTarget>
>[0];

const movieItem: TestItem = {
  key: 'movie',
  label: 'Movie',
  target: {
    id: '123',
    mediaType: 'movie',
    mediaId: 123,
  },
};

const tvItem: TestItem = {
  key: 'tv',
  label: 'TV',
  target: {
    id: '456',
    mediaType: 'tv',
    mediaId: 456,
  },
};

const episodeItem: TestItem = {
  key: 'episode',
  label: 'Episode',
  target: {
    id: 'episode-10-1-2',
    mediaType: 'episode',
    tvShowId: 10,
    seasonNumber: 1,
    episodeNumber: 2,
  },
};

const seasonItem: TestItem = {
  key: 'season',
  label: 'Season',
  target: {
    id: 'season-10-1',
    mediaType: 'season',
    tvShowId: 10,
    seasonNumber: 1,
  },
};

function createParams(overrides: Partial<HookParams> = {}): HookParams {
  return {
    isLoading: false,
    isRemoving: false,
    getSelectionTarget: (item) => item.target,
    onNavigate: jest.fn(),
    showToast: jest.fn(),
    removeRating: jest.fn(),
    isSearchActive: false,
    deactivateSearch: jest.fn(),
    dismissListActionsModal: jest.fn(),
    insetsBottom: 0,
    ...overrides,
  };
}

function getConfirmButton() {
  const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
  const buttons = alertCall?.[2] as { style?: string; onPress?: () => unknown }[];
  const confirmButton = buttons.find((button) => button.style === 'destructive');

  if (!confirmButton?.onPress) {
    throw new Error('Expected destructive confirm button');
  }

  return confirmButton;
}

describe('useRatingMultiSelectActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enters selection mode on long press and toggles selection on tap', () => {
    const onNavigate = jest.fn();
    const { result } = renderHook(() =>
      useRatingMultiSelectActions<TestItem, RatingMultiSelectTarget>(
        createParams({
          onNavigate,
        })
      )
    );

    act(() => {
      result.current.handleLongPress(movieItem);
    });

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    expect(result.current.isSelectionMode).toBe(true);
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.isItemSelected(movieItem)).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();

    act(() => {
      result.current.handleItemPress(movieItem);
    });

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  it('deactivates search and dismisses the list actions modal when selection starts', () => {
    const deactivateSearch = jest.fn();
    const dismissListActionsModal = jest.fn();
    const { result } = renderHook(() =>
      useRatingMultiSelectActions<TestItem, RatingMultiSelectTarget>(
        createParams({
          isSearchActive: true,
          deactivateSearch,
          dismissListActionsModal,
        })
      )
    );

    act(() => {
      result.current.handleLongPress(movieItem);
    });

    expect(deactivateSearch).toHaveBeenCalledTimes(1);
    expect(dismissListActionsModal).toHaveBeenCalledTimes(1);
  });

  it('navigates normally when not in selection mode', () => {
    const onNavigate = jest.fn();
    const { result } = renderHook(() =>
      useRatingMultiSelectActions<TestItem, RatingMultiSelectTarget>(
        createParams({
          onNavigate,
        })
      )
    );

    act(() => {
      result.current.handleItemPress(tvItem);
    });

    expect(onNavigate).toHaveBeenCalledWith(tvItem);
    expect(result.current.isSelectionMode).toBe(false);
  });

  it('tracks bulk removal progress and removes movie, tv, episode, and season targets', async () => {
    const resolvers: (() => void)[] = [];
    const removeRating = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const showToast = jest.fn();

    const { result } = renderHook(() =>
      useRatingMultiSelectActions<TestItem, RatingMultiSelectTarget>(
        createParams({
          removeRating,
          showToast,
        })
      )
    );

    act(() => {
      result.current.handleLongPress(movieItem);
    });

    act(() => {
      result.current.handleItemPress(tvItem);
    });

    act(() => {
      result.current.handleItemPress(episodeItem);
    });

    act(() => {
      result.current.handleItemPress(seasonItem);
    });

    expect(result.current.selectedCount).toBe(4);

    act(() => {
      result.current.handleRemoveSelectedItems();
    });

    const confirmButton = getConfirmButton();
    let removePromise: unknown;

    act(() => {
      removePromise = confirmButton.onPress?.();
    });

    expect(result.current.isBulkRemoving).toBe(true);
    expect(result.current.bulkRemoveProgress).toEqual({ processed: 0, total: 4 });

    await act(async () => {
      resolvers[0]?.();
      await Promise.resolve();
    });

    expect(result.current.bulkRemoveProgress).toEqual({ processed: 1, total: 4 });

    await act(async () => {
      resolvers[1]?.();
      await Promise.resolve();
    });

    expect(result.current.bulkRemoveProgress).toEqual({ processed: 2, total: 4 });

    await act(async () => {
      resolvers[2]?.();
      await Promise.resolve();
    });

    expect(result.current.bulkRemoveProgress).toEqual({ processed: 3, total: 4 });

    await act(async () => {
      resolvers[3]?.();
      await removePromise;
    });

    expect(removeRating).toHaveBeenNthCalledWith(1, movieItem.target);
    expect(removeRating).toHaveBeenNthCalledWith(2, tvItem.target);
    expect(removeRating).toHaveBeenNthCalledWith(3, episodeItem.target);
    expect(removeRating).toHaveBeenNthCalledWith(4, seasonItem.target);
    expect(showToast).toHaveBeenCalledWith('4 ratings removed');
    expect(result.current.isBulkRemoving).toBe(false);
    expect(result.current.bulkRemoveProgress).toBeNull();
    expect(result.current.isSelectionMode).toBe(false);
  });

  it('shows the generic failure toast when one or more removals fail', async () => {
    const removeRating = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('timeout'));
    const showToast = jest.fn();

    const { result } = renderHook(() =>
      useRatingMultiSelectActions<TestItem, RatingMultiSelectTarget>(
        createParams({
          removeRating,
          showToast,
        })
      )
    );

    act(() => {
      result.current.handleLongPress(movieItem);
    });

    act(() => {
      result.current.handleItemPress(tvItem);
    });

    act(() => {
      result.current.handleRemoveSelectedItems();
    });

    await act(async () => {
      await getConfirmButton().onPress?.();
    });

    expect(showToast).toHaveBeenCalledWith('Changes failed to save');
    expect(result.current.isSelectionMode).toBe(true);
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.isItemSelected(movieItem)).toBe(false);
    expect(result.current.isItemSelected(tvItem)).toBe(true);
  });
});

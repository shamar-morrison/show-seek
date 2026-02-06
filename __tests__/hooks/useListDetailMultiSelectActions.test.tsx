import { useListDetailMultiSelectActions } from '@/src/hooks/useListDetailMultiSelectActions';
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: {
      copyInsteadOfMove: false,
    },
  }),
}));

type HookParams = Parameters<typeof useListDetailMultiSelectActions>[0];

function createParams(overrides: Partial<HookParams> = {}): HookParams {
  return {
    sourceListId: 'watchlist',
    sourceListName: 'Watchlist',
    selectedMediaItems: [{ id: 1 }, { id: 2 }],
    selectedCount: 2,
    isSelectionMode: true,
    isRemoving: false,
    clearSelection: jest.fn(),
    showToast: jest.fn(),
    removeItemFromSource: jest.fn(),
    requireAuth: (action) => {
      void action();
    },
    authPromptMessage: 'Sign in',
    isSearchActive: false,
    deactivateSearch: jest.fn(),
    dismissListActionsModal: jest.fn(),
    insetsBottom: 0,
    ...overrides,
  };
}

function getConfirmButton() {
  const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
  const buttons = alertCall?.[2] as Array<{ text?: string; style?: string; onPress?: () => unknown }>;
  const confirmButton = buttons.find((button) => button.style === 'destructive');
  if (!confirmButton?.onPress) {
    throw new Error('Expected destructive confirm button with onPress');
  }
  return confirmButton;
}

describe('useListDetailMultiSelectActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks bulk remove progress and completes with success toast', async () => {
    const resolvers: Array<() => void> = [];
    const removeItemFromSource = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const showToast = jest.fn();
    const clearSelection = jest.fn();

    const params = createParams({
      removeItemFromSource,
      showToast,
      clearSelection,
    });

    const { result } = renderHook(() => useListDetailMultiSelectActions(params));

    act(() => {
      result.current.handleRemoveSelectedItems();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);

    const confirmButton = getConfirmButton();
    let removePromise: unknown;

    act(() => {
      removePromise = confirmButton.onPress?.();
    });

    expect(result.current.isBulkRemoving).toBe(true);
    expect(result.current.bulkRemoveProgress).toEqual({ processed: 0, total: 2 });

    await act(async () => {
      resolvers[0]?.();
      await Promise.resolve();
    });

    expect(result.current.bulkRemoveProgress).toEqual({ processed: 1, total: 2 });

    await act(async () => {
      resolvers[1]?.();
      await removePromise;
    });

    expect(result.current.isBulkRemoving).toBe(false);
    expect(result.current.bulkRemoveProgress).toBeNull();
    expect(showToast).toHaveBeenCalledWith('2 items removed');
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(removeItemFromSource).toHaveBeenCalledTimes(2);
    expect(removeItemFromSource).toHaveBeenNthCalledWith(1, 1);
    expect(removeItemFromSource).toHaveBeenNthCalledWith(2, 2);
  });

  it('continues on failures and shows failure summary toast', async () => {
    const removeItemFromSource = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('timeout'));
    const showToast = jest.fn();
    const clearSelection = jest.fn();

    const params = createParams({
      removeItemFromSource,
      showToast,
      clearSelection,
    });

    const { result } = renderHook(() => useListDetailMultiSelectActions(params));

    act(() => {
      result.current.handleRemoveSelectedItems();
    });

    const confirmButton = getConfirmButton();

    await act(async () => {
      await confirmButton.onPress?.();
    });

    expect(result.current.isBulkRemoving).toBe(false);
    expect(result.current.bulkRemoveProgress).toBeNull();
    expect(showToast).toHaveBeenCalledWith('Changes failed to save');
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(removeItemFromSource).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no items are selected or when already removing', () => {
    const noSelectionParams = createParams({
      selectedMediaItems: [],
      selectedCount: 0,
    });

    const { result: noSelectionResult } = renderHook(() =>
      useListDetailMultiSelectActions(noSelectionParams)
    );

    act(() => {
      noSelectionResult.current.handleRemoveSelectedItems();
    });

    expect(Alert.alert).not.toHaveBeenCalled();

    const alreadyRemovingParams = createParams({
      isRemoving: true,
    });

    const { result: alreadyRemovingResult } = renderHook(() =>
      useListDetailMultiSelectActions(alreadyRemovingParams)
    );

    act(() => {
      alreadyRemovingResult.current.handleRemoveSelectedItems();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

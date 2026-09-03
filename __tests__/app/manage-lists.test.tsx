import ManageListsScreen from '@/app/manage-lists';
import { fireEvent, render } from '@testing-library/react-native';
import { Trash2 } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator } from 'react-native';

const defaultList = {
  id: 'watchlist',
  name: 'Watchlist',
  items: {},
};

const customList1 = {
  id: 'custom-1',
  name: 'My Custom List',
  items: {},
};

const customList2 = {
  id: 'custom-2',
  name: 'Second Custom List',
  items: {},
};

const mockListsState = {
  data: [defaultList] as (typeof defaultList | typeof customList1 | typeof customList2)[],
  isLoading: false,
  isError: false,
};

const mockDeleteMutation = {
  mutateAsync: jest.fn(),
  isPending: false,
  variables: undefined as string | undefined,
};

const mockCreatePresent = jest.fn();

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockListsState,
  useDeleteList: () => mockDeleteMutation,
}));

jest.mock('@/src/components/RenameListModal', () => {
  const ReactModule = jest.requireActual('react');
  const MockModal = ReactModule.forwardRef(() => null);
  MockModal.displayName = 'RenameListModal';
  return {
    __esModule: true,
    default: MockModal,
    RenameListModalRef: {},
  };
});

jest.mock('@/src/components/CreateListModal', () => {
  const ReactModule = jest.requireActual('react');
  const MockModal = ReactModule.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    ReactModule.useImperativeHandle(ref, () => ({
      present: mockCreatePresent,
      dismiss: jest.fn(),
    }));
    return null;
  });
  MockModal.displayName = 'CreateListModal';
  return {
    __esModule: true,
    default: MockModal,
  };
});

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ManageListsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreatePresent.mockResolvedValue(undefined);
    mockListsState.data = [defaultList];
    mockListsState.isLoading = false;
    mockListsState.isError = false;
    mockDeleteMutation.isPending = false;
    mockDeleteMutation.variables = undefined;
  });

  it('does not render delete controls for default lists', () => {
    const { UNSAFE_queryAllByType } = render(<ManageListsScreen />);

    expect(UNSAFE_queryAllByType(Trash2)).toHaveLength(0);
  });

  it('renders enabled rename and trash actions for idle custom lists', () => {
    mockListsState.data = [defaultList, customList1];

    const { UNSAFE_queryAllByType, getByText, getByTestId } = render(<ManageListsScreen />);

    expect(UNSAFE_queryAllByType(Trash2)).toHaveLength(1);
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
    expect(getByText('My Custom List')).toBeTruthy();
    expect(getByTestId('rename-list-custom-1')).toBeEnabled();
    expect(getByTestId('delete-list-custom-1')).toBeEnabled();
    expect(getByTestId('manage-list-row-custom-1')).not.toHaveStyle({ opacity: 0.5 });
  });

  it('shows a spinner, dims the custom list, and disables actions while it is being deleted', () => {
    mockListsState.data = [defaultList, customList1];
    mockDeleteMutation.isPending = true;
    mockDeleteMutation.variables = customList1.id;

    const { UNSAFE_queryAllByType, getByTestId } = render(<ManageListsScreen />);

    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1);
    expect(UNSAFE_queryAllByType(Trash2)).toHaveLength(0);
    expect(getByTestId('manage-list-row-custom-1')).toHaveStyle({ opacity: 0.5 });
    expect(getByTestId('rename-list-custom-1')).toBeDisabled();
    expect(getByTestId('delete-list-custom-1')).toBeDisabled();
  });

  it('opens the create custom list sheet when the header button is pressed', () => {
    const { getByTestId } = render(<ManageListsScreen />);

    fireEvent.press(getByTestId('create-custom-list-button'));

    expect(mockCreatePresent).toHaveBeenCalledTimes(1);
  });

  it('disables actions across all custom lists while one custom list is deleting', () => {
    mockListsState.data = [defaultList, customList1, customList2];
    mockDeleteMutation.isPending = true;
    mockDeleteMutation.variables = customList1.id;

    const { UNSAFE_queryAllByType, getByTestId } = render(<ManageListsScreen />);

    // custom-1 is actively deleting: spinner, dimmed, actions disabled
    expect(getByTestId('manage-list-row-custom-1')).toHaveStyle({ opacity: 0.5 });
    expect(getByTestId('rename-list-custom-1')).toBeDisabled();
    expect(getByTestId('delete-list-custom-1')).toBeDisabled();

    // custom-2 is not deleting: not dimmed, actions disabled
    expect(getByTestId('manage-list-row-custom-2')).not.toHaveStyle({ opacity: 0.5 });
    expect(getByTestId('rename-list-custom-2')).toBeDisabled();
    expect(getByTestId('delete-list-custom-2')).toBeDisabled();

    // 1 spinner for custom-1 and 1 trash icon for custom-2
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1);
    expect(UNSAFE_queryAllByType(Trash2)).toHaveLength(1);
  });
});
